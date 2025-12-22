import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"

/**
 * POST /api/partner-invitations/accept - Accept a partner invitation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return apiError("Invitation token is required")
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return unauthorized("You must be logged in to accept an invitation")
    }

    const adminClient = createAdminClient()

    // Find the invitation
    const { data: invitation, error: inviteError } = await adminClient
      .from("partner_invitations")
      .select(`
        *,
        partner:partners!inner(
          id,
          name,
          slug
        )
      `)
      .eq("token", token)
      .eq("status", "pending")
      .single()

    if (inviteError || !invitation) {
      return apiError("Invalid or expired invitation", 404)
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      await adminClient
        .from("partner_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id)
      return apiError("This invitation has expired")
    }

    // Check if email matches
    if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
      return apiError("This invitation was sent to a different email address")
    }

    // Check if already a member
    const { data: existingMember } = await adminClient
      .from("partner_members")
      .select("id")
      .eq("partner_id", invitation.partner_id)
      .eq("user_id", user.id)
      .is("removed_at", null)
      .maybeSingle()

    if (existingMember) {
      // Mark invitation as accepted anyway
      await adminClient
        .from("partner_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invitation.id)
      
      return apiResponse({ 
        success: true, 
        partner_slug: (invitation.partner as any).slug,
        message: "You are already a member of this organization"
      })
    }

    // Ensure user exists in public.users
    const { error: upsertError } = await adminClient
      .from("users")
      .upsert({
        id: user.id,
        email: user.email!,
        first_name: user.user_metadata?.first_name || null,
        last_name: user.user_metadata?.last_name || null,
        role: "org_member",
        status: "active",
      }, {
        onConflict: "id"
      })

    if (upsertError) {
      console.error("Upsert user error:", upsertError)
    }

    // Add user as partner member
    const { error: memberError } = await adminClient
      .from("partner_members")
      .insert({
        partner_id: invitation.partner_id,
        user_id: user.id,
        role: invitation.role,
        invited_by: invitation.invited_by,
        joined_at: new Date().toISOString(),
      })

    if (memberError) {
      console.error("Create partner member error:", memberError)
      return serverError("Failed to add you to the organization")
    }

    // Mark invitation as accepted
    await adminClient
      .from("partner_invitations")
      .update({ 
        status: "accepted", 
        accepted_at: new Date().toISOString() 
      })
      .eq("id", invitation.id)

    return apiResponse({ 
      success: true, 
      partner_slug: (invitation.partner as any).slug,
      partner_name: (invitation.partner as any).name,
      role: invitation.role
    })
  } catch (error) {
    console.error("POST /api/partner-invitations/accept error:", error)
    return serverError()
  }
}

/**
 * GET /api/partner-invitations/accept - Get invitation details
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")

    if (!token) {
      return apiError("Invitation token is required")
    }

    const adminClient = createAdminClient()

    const { data: invitation, error } = await adminClient
      .from("partner_invitations")
      .select(`
        id,
        email,
        role,
        status,
        expires_at,
        partner:partners!inner(
          id,
          name,
          slug,
          branding
        ),
        inviter:users!invited_by(
          first_name,
          last_name,
          email
        )
      `)
      .eq("token", token)
      .single()

    if (error || !invitation) {
      return apiError("Invalid invitation", 404)
    }

    // Check if expired
    const isExpired = new Date(invitation.expires_at) < new Date()
    
    return apiResponse({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      is_expired: isExpired,
      partner: {
        name: (invitation.partner as any).name,
        slug: (invitation.partner as any).slug,
        branding: (invitation.partner as any).branding,
      },
      inviter: {
        name: (invitation.inviter as any)?.first_name 
          ? `${(invitation.inviter as any).first_name} ${(invitation.inviter as any).last_name || ""}`.trim()
          : (invitation.inviter as any)?.email,
      }
    })
  } catch (error) {
    console.error("GET /api/partner-invitations/accept error:", error)
    return serverError()
  }
}


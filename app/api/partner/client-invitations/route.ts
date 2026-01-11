/**
 * Partner Client Invitations API
 * 
 * This is for inviting CLIENTS who will get their own workspace.
 * Different from partner team invitations (partner_invitations) which adds team members.
 * 
 * Flow:
 * 1. Partner admin invites a client with a selected plan
 * 2. Client receives email with invitation link
 * 3. Client signs up/accepts invitation
 * 4. A new workspace is created for the client with the plan's limits
 * 5. Client becomes the owner of their workspace
 */

import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
import { sendClientInvitation } from "@/lib/email/send"
import { headers } from "next/headers"
import { z } from "zod"

const createClientInvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  plan_id: z.string().uuid("Invalid plan ID"),
  workspace_name: z.string().min(1).max(100).optional(),
  message: z.string().max(500).optional(),
})

/**
 * GET /api/partner/client-invitations - List all pending client invitations
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()

    if (!isPartnerAdmin(ctx)) {
      return forbidden("Only admins and owners can view client invitations")
    }

    // Get client invitations (where metadata.invitation_type = 'client')
    const { data: invitations, error } = await ctx.adminClient
      .from("partner_invitations")
      .select(`
        id,
        email,
        role,
        message,
        status,
        token,
        expires_at,
        created_at,
        metadata,
        inviter:users!invited_by(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("partner_id", ctx.partner.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("List client invitations error:", error)
      return serverError()
    }

    // Filter to only client invitations and enrich with plan info
    const clientInvitations = (invitations || []).filter(
      (inv) => (inv.metadata as Record<string, unknown>)?.invitation_type === "client"
    )

    // Get plan info for each invitation
    const planIds = clientInvitations
      .map((inv) => (inv.metadata as Record<string, unknown>)?.plan_id as string)
      .filter(Boolean)

    let plansMap = new Map<string, { name: string; includedMinutes: number; maxAgents: number | null }>()
    
    if (planIds.length > 0) {
      const { data: plans } = await ctx.adminClient
        .from("workspace_subscription_plans")
        .select("id, name, included_minutes, max_agents")
        .in("id", planIds)

      plans?.forEach((plan) => {
        plansMap.set(plan.id, {
          name: plan.name,
          includedMinutes: plan.included_minutes,
          maxAgents: plan.max_agents,
        })
      })
    }

    // Enrich invitations with plan info
    const enrichedInvitations = clientInvitations.map((inv) => {
      const metadata = inv.metadata as Record<string, unknown>
      const planId = metadata?.plan_id as string
      const plan = plansMap.get(planId)
      
      return {
        ...inv,
        plan: plan || null,
        workspace_name: metadata?.workspace_name || null,
      }
    })

    return apiResponse(enrichedInvitations)
  } catch (error) {
    console.error("GET /api/partner/client-invitations error:", error)
    return serverError()
  }
}

/**
 * POST /api/partner/client-invitations - Create a new client invitation
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()

    if (!isPartnerAdmin(ctx)) {
      return forbidden("Only admins and owners can invite clients")
    }

    const body = await request.json()
    const validation = createClientInvitationSchema.safeParse(body)

    if (!validation.success) {
      const errors = getValidationError(validation.error)
      return apiError(errors)
    }

    const { email, plan_id, workspace_name, message } = validation.data

    // Validate plan belongs to this partner
    const { data: plan, error: planError } = await ctx.adminClient
      .from("workspace_subscription_plans")
      .select("id, name, included_minutes, max_agents, max_conversations_per_month, is_active")
      .eq("id", plan_id)
      .eq("partner_id", ctx.partner.id)
      .single()

    if (planError || !plan) {
      return apiError("Invalid plan selected")
    }

    if (!plan.is_active) {
      return apiError("Selected plan is not active")
    }

    // Check if user is already a member of this partner
    const { data: { users } } = await ctx.adminClient.auth.admin.listUsers()
    const existingUser = users.find(u => u.email === email)

    if (existingUser) {
      const { data: existingMember } = await ctx.adminClient
        .from("partner_members")
        .select("id")
        .eq("partner_id", ctx.partner.id)
        .eq("user_id", existingUser.id)
        .is("removed_at", null)
        .maybeSingle()

      if (existingMember) {
        return apiError("This user is already associated with your organization")
      }
    }

    // Check if already invited (either as team member or client)
    const { data: existingInvitation } = await ctx.adminClient
      .from("partner_invitations")
      .select("id")
      .eq("partner_id", ctx.partner.id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle()

    if (existingInvitation) {
      return apiError("An invitation is already pending for this email")
    }

    // Create the client invitation
    const metadata = {
      invitation_type: "client",
      plan_id,
      workspace_name: workspace_name || null,
      plan_name: plan.name,
      plan_included_minutes: plan.included_minutes,
      plan_max_agents: plan.max_agents,
      plan_max_conversations: plan.max_conversations_per_month,
    }

    const { data: invitation, error } = await ctx.adminClient
      .from("partner_invitations")
      .insert({
        partner_id: ctx.partner.id,
        email,
        role: "member", // Client role in partner org
        message: message || null,
        invited_by: ctx.user.id,
        metadata,
      })
      .select()
      .single()

    if (error) {
      console.error("Create client invitation error:", error)
      return apiError("Failed to create invitation")
    }

    // Build invite link
    const headersList = await headers()
    const host = headersList.get("host") || "localhost:3000"
    const protocol = host.includes("localhost") ? "http" : "https"
    const inviteLink = `${protocol}://${host}/signup?token=${invitation.token}&email=${encodeURIComponent(email)}`

    // Send email invitation
    try {
      const inviterName = ctx.user.first_name
        ? `${ctx.user.first_name} ${ctx.user.last_name || ""}`.trim()
        : ctx.user.email

      await sendClientInvitation(
        email,
        ctx.partner.name,
        inviterName,
        inviteLink,
        plan.name,
        invitation.expires_at,
        message || undefined,
        ctx.partner.branding?.primary_color,
        ctx.partner.branding?.logo_url
      )

      console.log(`[Client Invitation] Email sent to: ${email}`)
    } catch (emailError) {
      console.error("Failed to send client invitation email:", emailError)
      // Don't fail the request if email fails - invitation is still created
    }

    return apiResponse({ 
      ...invitation, 
      invite_link: inviteLink,
      plan: {
        id: plan.id,
        name: plan.name,
      }
    }, 201)
  } catch (error) {
    console.error("POST /api/partner/client-invitations error:", error)
    return serverError()
  }
}


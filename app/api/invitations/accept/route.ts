import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"
import { z } from "zod"

const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Token is required"),
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Get the authenticated user
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return apiError("You must be signed in to accept an invitation", 401)
    }

    const body = await request.json()
    const validation = acceptInvitationSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    const { token, first_name, last_name } = validation.data

    // Get and validate invitation
    const { data: invitation, error: invError } = await adminClient
      .from("invitations")
      .select(
        `
        *,
        organization:organizations(*)
      `
      )
      .eq("token", token)
      .single()

    if (invError || !invitation) {
      return apiError("Invalid invitation token")
    }

    // Validate invitation status
    if (invitation.status !== "pending") {
      return apiError(`This invitation is ${invitation.status}`)
    }

    // Check expiry
    if (new Date(invitation.expires_at) < new Date()) {
      await adminClient.from("invitations").update({ status: "expired" }).eq("id", invitation.id)
      return apiError("This invitation has expired")
    }

    // Verify email matches (optional but recommended for org_owner)
    if (invitation.type === "org_owner" && invitation.email !== authUser.email) {
      return apiError("This invitation was sent to a different email address")
    }

    // Check if user already exists in this organization
    const { data: existingUser } = await adminClient
      .from("users")
      .select("id")
      .eq("id", authUser.id)
      .single()

    if (existingUser) {
      return apiError("You already have an account")
    }

    // Check if organization already has an owner (for org_owner invitations)
    if (invitation.type === "org_owner") {
      const { data: existingOwner } = await adminClient
        .from("users")
        .select("id")
        .eq("organization_id", invitation.organization_id)
        .eq("role", "org_owner")
        .single()

      if (existingOwner) {
        return apiError("This organization already has an owner")
      }
    }

    // Create user record
    const { error: userError } = await adminClient.from("users").insert({
      id: authUser.id,
      organization_id: invitation.organization_id,
      email: authUser.email!,
      first_name,
      last_name,
      role: invitation.role as any,
      status: "active",
      invitation_id: invitation.id,
      invitation_accepted_at: new Date().toISOString(),
    })

    if (userError) {
      console.error("Create user error:", userError)
      return apiError("Failed to create user account")
    }

    // Update invitation status
    await adminClient
      .from("invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)

    // Update organization status (for org_owner)
    if (invitation.type === "org_owner") {
      await adminClient
        .from("organizations")
        .update({
          status: "onboarding",
          activated_at: new Date().toISOString(),
          onboarding_step: 1,
        })
        .eq("id", invitation.organization_id)
    }

    return apiResponse({
      success: true,
      message: "Welcome! Your account has been created.",
      organization: invitation.organization,
      redirect: invitation.type === "org_owner" ? "/onboarding" : "/dashboard",
    })
  } catch (error) {
    console.error("POST /api/invitations/accept error:", error)
    return serverError()
  }
}

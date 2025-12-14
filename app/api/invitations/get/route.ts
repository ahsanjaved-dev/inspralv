import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiResponse, apiError, notFound, serverError } from "@/lib/api/helpers"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get("token")

    if (!token) {
      return apiError("Token is required")
    }

    const adminClient = createAdminClient()

    // Get invitation with organization details
    const { data: invitation, error } = await adminClient
      .from("invitations")
      .select(
        `
        *,
        organization:organizations(id, name, slug, plan_tier, status)
      `
      )
      .eq("token", token)
      .single()

    if (error || !invitation) {
      console.error("Invitation lookup error:", error)
      return notFound("Invitation")
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      await adminClient.from("invitations").update({ status: "expired" }).eq("id", invitation.id)

      return apiError("This invitation has expired", 410)
    }

    // Check if already accepted
    if (invitation.status === "accepted") {
      return apiError("This invitation has already been used", 410)
    }

    // Check if revoked
    if (invitation.status === "revoked") {
      return apiError("This invitation has been revoked", 410)
    }

    return apiResponse({
      id: invitation.id,
      type: invitation.type,
      email: invitation.email,
      role: invitation.role,
      message: invitation.message,
      expires_at: invitation.expires_at,
      organization: invitation.organization,
    })
  } catch (error) {
    console.error("GET /api/invitations/get error:", error)
    return serverError()
  }
}

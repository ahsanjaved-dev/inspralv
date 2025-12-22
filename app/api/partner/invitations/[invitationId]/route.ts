import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"

interface RouteContext {
  params: Promise<{ invitationId: string }>
}

/**
 * DELETE /api/partner/invitations/[invitationId] - Cancel an invitation
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { invitationId } = await params
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()

    if (!isPartnerAdmin(ctx)) {
      return forbidden("Only admins and owners can cancel invitations")
    }

    // Get the invitation
    const { data: invitation, error: fetchError } = await ctx.adminClient
      .from("partner_invitations")
      .select("id, status")
      .eq("id", invitationId)
      .eq("partner_id", ctx.partner.id)
      .single()

    if (fetchError || !invitation) {
      return apiError("Invitation not found", 404)
    }

    if (invitation.status !== "pending") {
      return apiError("Only pending invitations can be cancelled")
    }

    // Cancel the invitation
    const { error } = await ctx.adminClient
      .from("partner_invitations")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", invitationId)

    if (error) {
      console.error("Cancel invitation error:", error)
      return serverError()
    }

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/partner/invitations/[id] error:", error)
    return serverError()
  }
}

/**
 * POST /api/partner/invitations/[invitationId] - Resend invitation
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { invitationId } = await params
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()

    if (!isPartnerAdmin(ctx)) {
      return forbidden("Only admins and owners can resend invitations")
    }

    // Get the invitation
    const { data: invitation, error: fetchError } = await ctx.adminClient
      .from("partner_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("partner_id", ctx.partner.id)
      .single()

    if (fetchError || !invitation) {
      return apiError("Invitation not found", 404)
    }

    if (invitation.status !== "pending") {
      return apiError("Only pending invitations can be resent")
    }

    // Generate new token and extend expiry
    const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const { error } = await ctx.adminClient
      .from("partner_invitations")
      .update({
        token: newToken,
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", invitationId)

    if (error) {
      console.error("Resend invitation error:", error)
      return serverError()
    }

    // TODO: Send email with new link
    console.log(`[Partner Invitation Resent] Email: ${invitation.email}`)

    return apiResponse({ success: true })
  } catch (error) {
    console.error("POST /api/partner/invitations/[id] error:", error)
    return serverError()
  }
}


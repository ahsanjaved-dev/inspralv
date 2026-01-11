/**
 * Individual Client Invitation API
 * DELETE - Cancel/delete an invitation
 */

import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"

type RouteParams = { params: Promise<{ invitationId: string }> }

/**
 * DELETE /api/partner/client-invitations/[invitationId] - Cancel an invitation
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { invitationId } = await params
    
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()

    if (!isPartnerAdmin(ctx)) {
      return forbidden("Only admins and owners can cancel invitations")
    }

    // Check invitation exists, belongs to this partner, and is a client invitation
    const { data: invitation, error: findError } = await ctx.adminClient
      .from("partner_invitations")
      .select("id, status, metadata")
      .eq("id", invitationId)
      .eq("partner_id", ctx.partner.id)
      .single()

    if (findError || !invitation) {
      return notFound("Invitation not found")
    }

    // Verify it's a client invitation
    const metadata = invitation.metadata as Record<string, unknown>
    if (metadata?.invitation_type !== "client") {
      return apiError("This is not a client invitation")
    }

    if (invitation.status !== "pending") {
      return apiError("Only pending invitations can be canceled")
    }

    // Update status to canceled
    const { error: updateError } = await ctx.adminClient
      .from("partner_invitations")
      .update({ 
        status: "canceled",
        updated_at: new Date().toISOString()
      })
      .eq("id", invitationId)

    if (updateError) {
      console.error("Cancel invitation error:", updateError)
      return serverError()
    }

    return apiResponse({ message: "Invitation canceled successfully" })
  } catch (error) {
    console.error("DELETE /api/partner/client-invitations/[id] error:", error)
    return serverError()
  }
}


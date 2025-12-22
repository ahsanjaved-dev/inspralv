import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPartnerRejectionEmail } from "@/lib/email/send"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: partnerRequest, error } = await adminClient
      .from("partner_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    return apiResponse(partnerRequest)
  } catch (error) {
    console.error("GET /api/super-admin/partner-requests/[id] error:", error)
    return serverError()
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const body = await request.json()
    const { action, rejection_reason } = body

    if (!action || !["approve", "reject"].includes(action)) {
      return apiError("Invalid action. Must be 'approve' or 'reject'", 400)
    }

    const adminClient = createAdminClient()

    // Get the request
    const { data: partnerRequest, error: fetchError } = await adminClient
      .from("partner_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    if (partnerRequest.status !== "pending") {
      return apiError("Request has already been processed", 400)
    }

    if (action === "reject") {
      if (!rejection_reason) {
        return apiError("Rejection reason is required", 400)
      }

      // Update request status to rejected
      const { error: updateError } = await adminClient
        .from("partner_requests")
        .update({
          status: "rejected",
          rejection_reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: context.superAdmin.id,
        })
        .eq("id", id)

      if (updateError) {
        console.error("Update partner request error:", updateError)
        return serverError()
      }

      // Send rejection email
      try {
        await sendPartnerRejectionEmail(partnerRequest.contact_email, {
          company_name: partnerRequest.company_name,
          contact_name: partnerRequest.contact_name,
          reason: rejection_reason,
        })
      } catch (emailError) {
        console.error("Failed to send rejection email:", emailError)
      }

      return apiResponse({
        success: true,
        message: "Partner request rejected",
      })
    }

    if (action === "approve") {
      // Update status to provisioning
      const { error: updateError } = await adminClient
        .from("partner_requests")
        .update({
          status: "provisioning",
          reviewed_at: new Date().toISOString(),
          reviewed_by: context.superAdmin.id,
        })
        .eq("id", id)

      if (updateError) {
        console.error("Update partner request error:", updateError)
        return serverError()
      }

      return apiResponse({
        success: true,
        message: "Partner request approved. Ready for provisioning.",
        requestId: id,
      })
    }

    return serverError()
  } catch (error) {
    console.error("PATCH /api/super-admin/partner-requests/[id] error:", error)
    return serverError()
  }
}

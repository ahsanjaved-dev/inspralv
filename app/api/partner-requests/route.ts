import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"
import { createPartnerRequestSchema } from "@/types/database.types"
import { sendPartnerRequestNotification } from "@/lib/email/send"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate with Zod schema
    const validation = createPartnerRequestSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message, 400)
    }

    const data = validation.data
    const adminClient = createAdminClient()

    // Double-check domain availability
    const { data: existingRequest } = await adminClient
      .from("partner_requests")
      .select("id")
      .eq("custom_domain", data.custom_domain.toLowerCase())
      .in("status", ["pending", "provisioning"])
      .maybeSingle()

    if (existingRequest) {
      return apiError("This domain is already requested and pending approval", 409)
    }

    // Check if domain already exists in partner_domains
    const { data: existingDomain } = await adminClient
      .from("partner_domains")
      .select("id")
      .eq("hostname", data.custom_domain.toLowerCase())
      .maybeSingle()

    if (existingDomain) {
      return apiError("This domain is already registered to another partner", 409)
    }

    // Insert partner request
    const { data: partnerRequest, error: insertError } = await adminClient
      .from("partner_requests")
      .insert({
        company_name: data.company_name,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        phone: data.phone || null,
        custom_domain: data.custom_domain.toLowerCase(),
        desired_subdomain:
          data.desired_subdomain || data.company_name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        business_description: data.business_description,
        expected_users: data.expected_users || null,
        use_case: data.use_case,
        branding_data: data.branding_data || {},
        selected_plan: data.selected_plan || "enterprise",
        status: "pending",
        metadata: data.metadata || {},
      })
      .select()
      .single()

    if (insertError) {
      console.error("Partner request insert error:", insertError)
      return apiError("Failed to submit partner request", 500)
    }

    // Send email notification to super admin
    try {
      await sendPartnerRequestNotification({
        id: partnerRequest.id,
        company_name: partnerRequest.company_name,
        contact_name: partnerRequest.contact_name,
        contact_email: partnerRequest.contact_email,
        desired_subdomain: partnerRequest.custom_domain,
      })
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error("Failed to send notification email:", emailError)
    }

    return apiResponse(
      {
        success: true,
        requestId: partnerRequest.id,
        message: "Partner request submitted successfully",
      },
      201
    )
  } catch (error) {
    console.error("POST /api/partner-requests error:", error)
    return serverError()
  }
}

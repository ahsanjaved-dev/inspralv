import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiResponse, apiError, serverError, getValidationError } from "@/lib/api/helpers"
import { createPartnerRequestSchema } from "@/types/database.types"
import { sendPartnerRequestNotification } from "@/lib/email/send"
import {
  isSubdomainAvailable,
  generateSubdomainSlug,
  getFullSubdomainUrl,
} from "@/lib/utils/subdomain"
import { env } from "@/lib/env"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate with Zod schema
    const validation = createPartnerRequestSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error), 400)
    }

    const data = validation.data
    const adminClient = createAdminClient()

    // Generate subdomain if not provided
    const subdomain = data.desired_subdomain || generateSubdomainSlug(data.company_name)

    // Check subdomain availability
    const subdomainCheck = await isSubdomainAvailable(subdomain)
    if (!subdomainCheck.available) {
      return apiError(subdomainCheck.reason || "This subdomain is not available", 409)
    }

    // Insert partner request (custom_domain is now optional)
    const { data: partnerRequest, error: insertError } = await adminClient
      .from("partner_requests")
      .insert({
        company_name: data.company_name,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        phone: data.phone || null,
        // custom_domain is now optional - will be set during onboarding
        custom_domain: data.custom_domain?.toLowerCase() || null,
        desired_subdomain: subdomain,
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
        desired_subdomain: partnerRequest.desired_subdomain,
        // custom_domain is optional now
        custom_domain: partnerRequest.custom_domain || undefined,
      })
    } catch (emailError) {
      // Log email error but don't fail the request
      console.error("Failed to send notification email:", emailError)
    }

    // Get the full platform URL for the response
    const platformUrl = getFullSubdomainUrl(subdomain)

    return apiResponse(
      {
        success: true,
        requestId: partnerRequest.id,
        message: "Partner request submitted successfully",
        platformUrl: platformUrl,
      },
      201
    )
  } catch (error) {
    console.error("POST /api/partner-requests error:", error)
    return serverError()
  }
}

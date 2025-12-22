import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiResponse, serverError } from "@/lib/api/helpers"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const domain = searchParams.get("domain")

    if (!domain || domain.length < 4) {
      return apiResponse({ available: false, message: "Domain must be at least 4 characters" })
    }

    const adminClient = createAdminClient()
    const domainLower = domain.toLowerCase().trim()

    // Check if domain is already in a pending/provisioning request
    const { data: existingRequest } = await adminClient
      .from("partner_requests")
      .select("id")
      .eq("custom_domain", domainLower)
      .in("status", ["pending", "provisioning"])
      .maybeSingle()

    if (existingRequest) {
      return apiResponse({
        available: false,
        message: "This domain is already requested and pending approval",
      })
    }

    // Check if domain already exists in partner_domains
    const { data: existingDomain } = await adminClient
      .from("partner_domains")
      .select("id")
      .eq("hostname", domainLower)
      .maybeSingle()

    if (existingDomain) {
      return apiResponse({
        available: false,
        message: "This domain is already registered to another partner",
      })
    }

    // Domain is available
    return apiResponse({ available: true })
  } catch (error) {
    console.error("GET /api/partner-requests/check-domain error:", error)
    return serverError()
  }
}

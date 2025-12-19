import { NextRequest } from "next/server"
import { getPartnerFromHost, getHostname } from "@/lib/api/partner"
import { apiResponse, serverError } from "@/lib/api/helpers"

/**
 * GET /api/partner
 * Returns the resolved partner for the current hostname
 * Useful for debugging and testing partner resolution
 */
export async function GET(request: NextRequest) {
  try {
    const hostname = await getHostname()
    const partner = await getPartnerFromHost()

    return apiResponse({
      hostname,
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        branding: partner.branding,
        plan_tier: partner.plan_tier,
        is_platform_partner: partner.is_platform_partner,
      },
    })
  } catch (error) {
    console.error("GET /api/partner error:", error)
    return serverError((error as Error).message)
  }
}

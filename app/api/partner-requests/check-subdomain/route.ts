import { NextRequest } from "next/server"
import { apiResponse, serverError } from "@/lib/api/helpers"
import {
  isSubdomainAvailable,
  isValidSubdomainFormat,
  getFullSubdomainUrl,
} from "@/lib/utils/subdomain"

/**
 * Check if a subdomain is available for a new partner request
 * Used by the partner request form for real-time validation
 *
 * GET /api/partner-requests/check-subdomain?subdomain=acme-corp
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subdomain = searchParams.get("subdomain")

    if (!subdomain) {
      return apiResponse({
        available: false,
        message: "Subdomain is required",
      })
    }

    const normalizedSubdomain = subdomain.toLowerCase().trim()

    // Validate format first
    const formatCheck = isValidSubdomainFormat(normalizedSubdomain)
    if (!formatCheck.valid) {
      return apiResponse({
        available: false,
        message: formatCheck.message,
      })
    }

    // Check availability
    const availabilityCheck = await isSubdomainAvailable(normalizedSubdomain)

    return apiResponse({
      available: availabilityCheck.available,
      message: availabilityCheck.reason,
      preview: availabilityCheck.available ? getFullSubdomainUrl(normalizedSubdomain) : undefined,
    })
  } catch (error) {
    console.error("GET /api/partner-requests/check-subdomain error:", error)
    return serverError()
  }
}


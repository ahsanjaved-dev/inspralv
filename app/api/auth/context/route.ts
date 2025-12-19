import { NextRequest } from "next/server"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"

/**
 * GET /api/auth/context
 * Returns the current partner auth context
 * Useful for debugging and testing
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()

    if (!auth) {
      return unauthorized()
    }

    return apiResponse({
      user: {
        id: auth.user.id,
        email: auth.user.email,
        first_name: auth.user.first_name,
        last_name: auth.user.last_name,
      },
      partner: {
        id: auth.partner.id,
        name: auth.partner.name,
        slug: auth.partner.slug,
        branding: auth.partner.branding,
        is_platform_partner: auth.partner.is_platform_partner,
      },
      workspaces: auth.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        role: w.role,
      })),
      summary: {
        workspace_count: auth.workspaces.length,
        roles: [...new Set(auth.workspaces.map((w) => w.role))],
      },
    })
  } catch (error) {
    console.error("GET /api/auth/context error:", error)
    return serverError((error as Error).message)
  }
}

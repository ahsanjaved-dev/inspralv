import { NextRequest } from "next/server"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"

/**
 * POST /api/workspaces
 * 
 * DEPRECATED: Direct workspace creation is no longer allowed.
 * Workspaces are now created automatically based on subscription plans:
 * - Free/Pro plans: One workspace created on subscription activation
 * - Agency plans: Default workspace + client workspaces based on plan limits
 * 
 * Workspace creation is handled internally by:
 * - Stripe webhook handlers (on subscription.created/updated)
 * - Partner provisioning (for white-label partners)
 * 
 * @see /api/webhooks/stripe for subscription-based workspace creation
 * @see /lib/workspace/provisioning.ts for internal workspace creation logic
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth) return unauthorized()

    // Direct workspace creation is disabled
    // Workspaces are created automatically based on subscription plans
    return apiError(
      "Direct workspace creation is not available. Workspaces are automatically created based on your subscription plan.",
      403
    )
  } catch (error) {
    console.error("POST /api/workspaces error:", error)
    return serverError()
  }
}

/**
 * GET /api/workspaces
 * 
 * Returns the user's accessible workspaces with limit information.
 * Note: canCreateWorkspace is always false as direct creation is disabled.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth) return unauthorized()

    // Get workspace limit info
    const resourceLimits = auth.partner.resource_limits as { max_workspaces?: number } | null
    const maxWorkspaces = resourceLimits?.max_workspaces ?? -1
    const currentWorkspaceCount = auth.workspaces.length

    // Return user's accessible workspaces with limit info
    // canCreateWorkspace is always false - workspaces are created via subscription
    return apiResponse({
      workspaces: auth.workspaces,
      canCreateWorkspace: false, // Direct creation disabled - use subscription plans
      workspaceLimits: {
        max: maxWorkspaces,
        current: currentWorkspaceCount,
        remaining: maxWorkspaces === -1 ? -1 : Math.max(0, maxWorkspaces - currentWorkspaceCount),
        isUnlimited: maxWorkspaces === -1,
      },
    })
  } catch (error) {
    console.error("GET /api/workspaces error:", error)
    return serverError()
  }
}

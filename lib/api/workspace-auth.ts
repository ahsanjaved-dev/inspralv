import { NextRequest, NextResponse } from "next/server"
import { getPartnerAuthContext, getWorkspaceBySlug, type PartnerAuthContext } from "./auth"
import { apiResponse, unauthorized, forbidden, serverError } from "./helpers"
import type { AccessibleWorkspace, WorkspaceMemberRole } from "@/types/database.types"
import {
  getWorkspacePaywallStatus,
  createPaywallErrorResponse,
  isMutationMethod,
  type PaywallStatus,
} from "@/lib/billing/workspace-paywall"

export interface WorkspaceContext extends PartnerAuthContext {
  workspace: AccessibleWorkspace
  paywallStatus?: PaywallStatus
}

/**
 * Get workspace context from URL params
 * Validates that user has access to the workspace
 */
export async function getWorkspaceContext(
  workspaceSlug: string,
  requiredRoles?: WorkspaceMemberRole[]
): Promise<WorkspaceContext | null> {
  const auth = await getPartnerAuthContext()

  if (!auth) {
    return null
  }

  const workspace = getWorkspaceBySlug(auth, workspaceSlug)

  if (!workspace) {
    return null
  }

  // Check required roles if specified
  if (requiredRoles && !requiredRoles.includes(workspace.role)) {
    return null
  }

  return {
    ...auth,
    workspace,
  }
}

/**
 * Check if a workspace mutation should be blocked due to paywall.
 * Call this at the start of POST/PUT/PATCH/DELETE handlers.
 * Returns a paywall error response if blocked, or null if allowed.
 * 
 * @example
 * ```typescript
 * const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
 * if (paywallError) return paywallError
 * ```
 */
export async function checkWorkspacePaywall(
  workspaceId: string,
  workspaceSlug: string
): Promise<Response | null> {
  const paywallStatus = await getWorkspacePaywallStatus(workspaceId)
  if (paywallStatus.isPaywalled) {
    return createPaywallErrorResponse(workspaceSlug)
  }
  return null
}

export interface WithWorkspaceOptions {
  requiredRoles?: WorkspaceMemberRole[]
  /** Skip paywall check for billing recovery endpoints */
  skipPaywallCheck?: boolean
}

/**
 * Higher-order function for workspace-scoped API routes
 * Handles auth + workspace validation + paywall enforcement automatically
 * 
 * Paywall enforcement:
 * - For mutation methods (POST, PUT, PATCH, DELETE), blocks if workspace is paywalled
 * - GET requests are always allowed (read-only mode)
 * - Set skipPaywallCheck: true for billing/subscription endpoints
 */
export function withWorkspace<T extends { params: Promise<{ workspaceSlug: string }> }>(
  handler: (
    request: NextRequest,
    context: WorkspaceContext,
    routeContext: T
  ) => Promise<NextResponse>,
  options?: WithWorkspaceOptions
) {
  return async (request: NextRequest, routeContext: T): Promise<NextResponse> => {
    try {
      const { workspaceSlug } = await routeContext.params

      const auth = await getPartnerAuthContext()
      if (!auth) {
        return unauthorized()
      }

      const workspace = getWorkspaceBySlug(auth, workspaceSlug)
      if (!workspace) {
        return forbidden(`No access to workspace: ${workspaceSlug}`)
      }

      // Check required roles if specified
      if (options?.requiredRoles && !options.requiredRoles.includes(workspace.role)) {
        return forbidden(`Insufficient permissions. Required: ${options.requiredRoles.join(", ")}`)
      }

      // Check paywall status for mutation methods (unless explicitly skipped)
      let paywallStatus: PaywallStatus | undefined
      if (!options?.skipPaywallCheck && isMutationMethod(request.method)) {
        paywallStatus = await getWorkspacePaywallStatus(workspace.id)
        if (paywallStatus.isPaywalled) {
          return createPaywallErrorResponse(workspaceSlug) as unknown as NextResponse
        }
      }

      const wsContext: WorkspaceContext = { ...auth, workspace, paywallStatus }

      return handler(request, wsContext, routeContext)
    } catch (error) {
      console.error("Workspace API error:", error)
      return serverError()
    }
  }
}

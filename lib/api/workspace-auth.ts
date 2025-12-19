import { NextRequest, NextResponse } from "next/server"
import { getPartnerAuthContext, getWorkspaceBySlug, type PartnerAuthContext } from "./auth"
import { apiResponse, unauthorized, forbidden, serverError } from "./helpers"
import type { AccessibleWorkspace, WorkspaceMemberRole } from "@/types/database.types"

export interface WorkspaceContext extends PartnerAuthContext {
  workspace: AccessibleWorkspace
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
 * Higher-order function for workspace-scoped API routes
 * Handles auth + workspace validation automatically
 */
export function withWorkspace<T extends { params: Promise<{ workspaceSlug: string }> }>(
  handler: (
    request: NextRequest,
    context: WorkspaceContext,
    routeContext: T
  ) => Promise<NextResponse>,
  options?: { requiredRoles?: WorkspaceMemberRole[] }
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

      const wsContext: WorkspaceContext = { ...auth, workspace }

      return handler(request, wsContext, routeContext)
    } catch (error) {
      console.error("Workspace API error:", error)
      return serverError()
    }
  }
}

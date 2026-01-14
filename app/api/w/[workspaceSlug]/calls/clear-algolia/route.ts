import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { clearWorkspaceDataFromAlgolia } from "@/lib/algolia"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

/**
 * POST /api/w/[workspaceSlug]/calls/clear-algolia
 * Clears all Algolia data for the workspace (no resync)
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    console.log("[Clear Algolia API] Received clear request")
    console.log("[Clear Algolia API] Clearing data for workspace:", ctx.workspace.id)

    // Clear all Algolia data for this workspace
    const cleared = await clearWorkspaceDataFromAlgolia(ctx.workspace.id)

    if (cleared) {
      console.log("[Clear Algolia API] Successfully cleared all Algolia data")
      return apiResponse({
        success: true,
        message: "All Algolia data cleared successfully. New calls will be indexed with correct call types.",
      })
    } else {
      console.log("[Clear Algolia API] No data to clear or Algolia not configured")
      return apiResponse({
        success: true,
        message: "No data to clear or Algolia is not configured for this workspace.",
      })
    }
  } catch (error) {
    console.error("[Clear Algolia API] Error:", error)
    return serverError()
  }
}


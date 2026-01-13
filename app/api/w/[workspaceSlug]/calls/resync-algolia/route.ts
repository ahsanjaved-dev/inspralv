import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { clearWorkspaceDataFromAlgolia } from "@/lib/algolia/call-logs"
import { syncWorkspaceCallsToAlgolia } from "@/lib/algolia/sync"
import { isAlgoliaConfigured } from "@/lib/algolia/client"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// ============================================================================
// POST /api/w/[workspaceSlug]/calls/resync-algolia
// Clears all existing Algolia data for workspace and re-syncs from database
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  console.log("[Resync API] Received resync request")
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Check if Algolia is configured
    const configured = await isAlgoliaConfigured(ctx.workspace.id)
    if (!configured) {
      return apiError("Algolia not configured for this workspace", 400)
    }

    console.log("[Resync API] Starting resync for workspace:", ctx.workspace.id)

    // Step 1: Clear existing data
    console.log("[Resync API] Step 1: Clearing existing data...")
    const clearResult = await clearWorkspaceDataFromAlgolia(ctx.workspace.id)
    if (!clearResult.success) {
      console.error("[Resync API] Failed to clear existing data")
      // Continue anyway - new data will overwrite
    } else {
      console.log("[Resync API] Cleared existing data")
    }

    // Wait a moment for Algolia to process the delete
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Step 2: Re-sync all calls
    console.log("[Resync API] Step 2: Re-syncing all calls...")
    const syncResult = await syncWorkspaceCallsToAlgolia(
      ctx.workspace.id,
      ctx.workspace.partnerId
    )

    if (!syncResult.success) {
      console.error("[Resync API] Sync failed:", syncResult.error)
      return apiError(`Sync failed: ${syncResult.error}`, 500)
    }

    console.log("[Resync API] Resync completed:", syncResult.recordsIndexed, "records")

    return apiResponse({
      success: true,
      message: `Successfully re-synced ${syncResult.recordsIndexed} call records to Algolia`,
      recordsIndexed: syncResult.recordsIndexed,
    })
  } catch (error) {
    console.error("[Resync API] Error:", error)
    return serverError()
  }
}


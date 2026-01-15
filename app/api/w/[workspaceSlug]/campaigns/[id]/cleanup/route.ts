import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import { cleanupStaleCalls } from "@/lib/campaigns/stale-call-cleanup"

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/cleanup
 * 
 * Manually trigger cleanup of stale "calling" recipients for a campaign.
 * This marks recipients stuck in "calling" status for too long as "failed".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Verify campaign exists and belongs to this workspace
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, status, workspace_id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Only run cleanup on active campaigns
    if (campaign.status !== "active") {
      return apiError("Cleanup can only be run on active campaigns")
    }

    // Run the cleanup
    const result = await cleanupStaleCalls(id)

    if (!result.success) {
      return serverError(result.error || "Failed to cleanup stale calls")
    }

    return apiResponse({
      success: true,
      message: result.staleRecipientsUpdated > 0 
        ? `Cleaned up ${result.staleRecipientsUpdated} stale call(s)`
        : "No stale calls found",
      staleRecipientsFound: result.staleRecipientsFound,
      staleRecipientsUpdated: result.staleRecipientsUpdated,
      campaignCompleted: result.campaignCompleted,
    })
  } catch (error) {
    console.error("[CampaignCleanup] Exception:", error)
    return serverError("Internal server error")
  }
}


import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import {
  startNextCalls,
  getVapiConfigForCampaign,
  getActiveCampaignCallCount,
  calculateAvailableSlots,
  MAX_CONCURRENT_CALLS_PER_CAMPAIGN,
  MAX_CONCURRENT_CALLS_TOTAL,
} from "@/lib/campaigns/call-queue-manager"

// ============================================================================
// VERCEL CONFIG
// ============================================================================
export const maxDuration = 30

// ============================================================================
// POST /api/w/[workspaceSlug]/campaigns/[id]/process-calls
// ============================================================================
/**
 * Manually trigger processing of queued calls for a campaign
 * 
 * This endpoint can be called:
 * 1. By the frontend to manually trigger processing
 * 2. By a cron job for recovery/backup processing
 * 3. When resuming a paused campaign
 * 
 * It respects concurrency limits and will only start calls if slots are available.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    // Get campaign
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

    // Only process active campaigns
    if (campaign.status !== "active") {
      return apiError(`Campaign is not active (status: ${campaign.status})`)
    }

    // Get VAPI config
    const vapiConfig = await getVapiConfigForCampaign(id)
    if (!vapiConfig) {
      return apiError("VAPI integration not configured properly")
    }

    // Get current state
    const [activeCount, availableSlots] = await Promise.all([
      getActiveCampaignCallCount(id),
      calculateAvailableSlots(id, ctx.workspace.id),
    ])

    // Get pending count
    const { count: pendingCount } = await ctx.adminClient
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    // Start next batch of calls
    const result = await startNextCalls(id, ctx.workspace.id, vapiConfig)

    return apiResponse({
      success: true,
      campaignId: id,
      processing: {
        callsStarted: result.started,
        callsFailed: result.failed,
        callsRemaining: result.remaining,
        activeCallsBefore: activeCount,
        availableSlotsBefore: availableSlots,
        pendingCallsBefore: pendingCount || 0,
      },
      limits: {
        maxConcurrentPerCampaign: MAX_CONCURRENT_CALLS_PER_CAMPAIGN,
        maxConcurrentTotal: MAX_CONCURRENT_CALLS_TOTAL,
      },
      ...(result.errors.length > 0 && {
        errors: result.errors.slice(0, 10),
      }),
      message: result.started > 0 
        ? `Started ${result.started} calls, ${result.remaining} remaining in queue`
        : result.remaining > 0
          ? `No slots available (${activeCount} active calls). Will process when calls complete.`
          : "No pending calls to process",
    })
  } catch (error) {
    console.error("[ProcessCalls] Exception:", error)
    return serverError("Internal server error")
  }
}

// ============================================================================
// GET /api/w/[workspaceSlug]/campaigns/[id]/process-calls
// ============================================================================
/**
 * Get current processing status for a campaign
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Get campaign
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, status, workspace_id, total_recipients, completed_calls, successful_calls, failed_calls, pending_calls")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Get detailed recipient counts
    const { data: statusCounts } = await ctx.adminClient
      .from("call_recipients")
      .select("call_status")
      .eq("campaign_id", id)

    const counts = {
      pending: 0,
      calling: 0,
      completed: 0,
      failed: 0,
      queued: 0,
    }

    for (const r of statusCounts || []) {
      const status = r.call_status as keyof typeof counts
      if (status in counts) {
        counts[status]++
      }
    }

    // Get active call count (non-stale)
    const activeCount = await getActiveCampaignCallCount(id)
    const availableSlots = await calculateAvailableSlots(id, ctx.workspace.id)

    return apiResponse({
      success: true,
      campaignId: id,
      campaignStatus: campaign.status,
      recipients: {
        total: campaign.total_recipients,
        pending: counts.pending,
        calling: counts.calling,
        completed: counts.completed,
        failed: counts.failed,
        queued: counts.queued,
      },
      processing: {
        activeCallsNow: activeCount,
        availableSlots,
        canStartMore: availableSlots > 0 && counts.pending > 0,
      },
      limits: {
        maxConcurrentPerCampaign: MAX_CONCURRENT_CALLS_PER_CAMPAIGN,
        maxConcurrentTotal: MAX_CONCURRENT_CALLS_TOTAL,
      },
      progress: {
        percentComplete: campaign.total_recipients > 0 
          ? Math.round(((counts.completed + counts.failed) / campaign.total_recipients) * 100)
          : 0,
        callsProcessed: counts.completed + counts.failed,
        callsRemaining: counts.pending + counts.calling,
      },
    })
  } catch (error) {
    console.error("[ProcessCalls:GET] Exception:", error)
    return serverError("Internal server error")
  }
}


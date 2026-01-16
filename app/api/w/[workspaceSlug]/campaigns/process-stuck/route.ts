import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { startNextCalls, getVapiConfigForCampaign } from "@/lib/campaigns/call-queue-manager"
import { cleanupStaleCalls } from "@/lib/campaigns/stale-call-cleanup"

/**
 * POST /api/w/[workspaceSlug]/campaigns/process-stuck
 * 
 * Polling fallback endpoint to continue stuck campaigns.
 * 
 * WHY THIS IS NEEDED:
 * The webhook-driven flow can break if:
 * 1. VAPI returns a transient error (522, 503) and no webhook arrives
 * 2. A webhook gets lost or times out
 * 3. The server restarts during processing
 * 
 * This endpoint should be called:
 * - By a frontend interval (every 30 seconds while campaign is active)
 * - By a cron job (every minute) for background reliability
 */
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Find all active campaigns with pending recipients
    const { data: activeCampaigns, error: campaignsError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, name, pending_calls, status")
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .gt("pending_calls", 0) // Only campaigns with pending calls

    if (campaignsError) {
      console.error("[ProcessStuck] Error fetching campaigns:", campaignsError)
      return serverError("Failed to fetch active campaigns")
    }

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return apiResponse({
        success: true,
        message: "No stuck campaigns found",
        processed: 0,
      })
    }

    console.log(`[ProcessStuck] Found ${activeCampaigns.length} active campaigns with pending calls`)

    const results: Array<{
      campaignId: string
      campaignName: string
      started: number
      failed: number
      remaining: number
      staleCleaned?: number
      error?: string
    }> = []

    for (const campaign of activeCampaigns) {
      // Check if there are any calls currently "calling"
      const { count: callingCount } = await ctx.adminClient
        .from("call_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("call_status", "calling")

      // Only process if there are NO active calls (chain is broken)
      // If there are active calls, the webhook chain should be working
      if (callingCount && callingCount > 0) {
        console.log(`[ProcessStuck] Campaign ${campaign.id} has ${callingCount} active calls - skipping`)
        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          started: 0,
          failed: 0,
          remaining: campaign.pending_calls,
          error: `Has ${callingCount} active calls - webhook chain active`,
        })
        continue
      }

      // No active calls but pending recipients = STUCK - restart the chain
      console.log(`[ProcessStuck] Campaign ${campaign.id} is STUCK - cleaning up stale calls and restarting webhook chain`)

      try {
        // STEP 1: First, clean up any stale "calling" recipients
        // These are calls where VAPI never sent a webhook (might have been stuck due to 522, etc.)
        const cleanupResult = await cleanupStaleCalls(campaign.id)
        if (cleanupResult.staleRecipientsUpdated > 0) {
          console.log(`[ProcessStuck] Campaign ${campaign.id}: cleaned up ${cleanupResult.staleRecipientsUpdated} stale calls`)
        }

        // STEP 2: Get VAPI config and restart the chain
        const vapiConfig = await getVapiConfigForCampaign(campaign.id)
        if (!vapiConfig) {
          results.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            started: 0,
            failed: 0,
            remaining: campaign.pending_calls,
            error: "Could not get VAPI config",
          })
          continue
        }

        // Restart with isInitialStart=true to kick off a fresh batch
        const startResult = await startNextCalls(campaign.id, ctx.workspace.id, vapiConfig, { isInitialStart: true })

        console.log(`[ProcessStuck] Campaign ${campaign.id}: started ${startResult.started}, failed ${startResult.failed}`)

        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          started: startResult.started,
          failed: startResult.failed,
          remaining: startResult.remaining,
          staleCleaned: cleanupResult.staleRecipientsUpdated,
        })
      } catch (error) {
        console.error(`[ProcessStuck] Error processing campaign ${campaign.id}:`, error)
        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          started: 0,
          failed: 0,
          remaining: campaign.pending_calls,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    const totalStarted = results.reduce((sum, r) => sum + r.started, 0)
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0)

    return apiResponse({
      success: true,
      message: `Processed ${activeCampaigns.length} campaigns: ${totalStarted} calls started, ${totalFailed} failed`,
      processed: activeCampaigns.length,
      totalStarted,
      totalFailed,
      results,
    })
  } catch (error) {
    console.error("[ProcessStuck] Exception:", error)
    return serverError("Internal server error")
  }
}

/**
 * GET - Check status without processing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Find all active campaigns
    const { data: activeCampaigns, error } = await ctx.adminClient
      .from("call_campaigns")
      .select(`
        id,
        name,
        status,
        total_recipients,
        pending_calls,
        completed_calls,
        failed_calls
      `)
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "active")
      .is("deleted_at", null)

    if (error) {
      return serverError("Failed to fetch campaigns")
    }

    // For each campaign, count calling recipients
    const campaignStatuses = await Promise.all(
      (activeCampaigns || []).map(async (campaign) => {
        const { count: callingCount } = await ctx.adminClient
          .from("call_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("call_status", "calling")

        const isStuck = campaign.pending_calls > 0 && (callingCount || 0) === 0
        
        return {
          ...campaign,
          callingCount: callingCount || 0,
          isStuck,
          progress: campaign.total_recipients > 0 
            ? Math.round(((campaign.completed_calls + campaign.failed_calls) / campaign.total_recipients) * 100)
            : 0,
        }
      })
    )

    const stuckCampaigns = campaignStatuses.filter(c => c.isStuck)

    return apiResponse({
      success: true,
      activeCampaigns: campaignStatuses.length,
      stuckCampaigns: stuckCampaigns.length,
      campaigns: campaignStatuses,
    })
  } catch (error) {
    console.error("[ProcessStuck] GET Exception:", error)
    return serverError("Internal server error")
  }
}


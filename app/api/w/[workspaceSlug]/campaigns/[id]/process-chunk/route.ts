import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import {
  processQueueChunk,
  getCampaignQueueEntry,
} from "@/lib/campaigns/queue-processor"

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/process-chunk
 * 
 * Process the next chunk of recipients for an active campaign.
 * 
 * This endpoint is designed to be called repeatedly until the campaign is complete.
 * It can be triggered:
 * - By the frontend in a loop/interval
 * - By a cron job
 * - By a webhook/queue system
 * 
 * Response includes:
 * - hasMore: boolean - whether there are more chunks to process
 * - shouldContinue: boolean - whether processing should continue (false if paused/outside business hours)
 * - nextProcessAt: Date | null - suggested time for next processing (for business hours)
 * 
 * Features:
 * - Automatic business hours detection
 * - Campaign pause/cancel detection
 * - Progress tracking
 * - Auto-completion when all recipients processed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check paywall (but don't block if campaign already started)
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) {
      // Log but continue processing - don't leave campaigns half-done
      console.warn("[ProcessChunk] Paywall error but continuing:", paywallError)
    }

    // Verify campaign exists and belongs to workspace
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

    // Check campaign status
    if (campaign.status === "completed") {
      return apiResponse({
        success: true,
        message: "Campaign already completed",
        hasMore: false,
        shouldContinue: false,
      })
    }

    if (campaign.status === "cancelled") {
      return apiResponse({
        success: false,
        message: "Campaign was cancelled",
        hasMore: false,
        shouldContinue: false,
      })
    }

    if (campaign.status === "paused") {
      return apiResponse({
        success: true,
        message: "Campaign is paused",
        hasMore: true,
        shouldContinue: false,
        paused: true,
      })
    }

    if (campaign.status !== "active") {
      return apiError(`Campaign is not active (status: ${campaign.status}). Start the campaign first.`)
    }

    // Get queue entry
    const queueEntry = await getCampaignQueueEntry(id)
    if (!queueEntry) {
      return apiError("Campaign queue not initialized. Use start-optimized endpoint first.")
    }

    // Process next chunk
    const result = await processQueueChunk(id)

    if (!result.success && result.error !== "Outside business hours") {
      console.error("[ProcessChunk] Error:", result.error)
      return serverError(result.error || "Failed to process chunk")
    }

    // Build response
    const response: any = {
      success: result.success,
      campaignId: id,
      hasMore: result.hasMore,
      shouldContinue: result.shouldContinue,
      pendingCount: result.pendingCount,
    }

    if (result.chunkResult) {
      response.chunk = {
        index: result.chunkResult.chunkIndex,
        processed: result.chunkResult.successful + result.chunkResult.failed,
        successful: result.chunkResult.successful,
        failed: result.chunkResult.failed,
        processingTimeMs: result.chunkResult.processingTimeMs,
      }
    }

    if (result.queueEntry) {
      response.progress = {
        totalRecipients: result.queueEntry.total_recipients,
        processedCount: result.queueEntry.processed_count,
        successfulCount: result.queueEntry.successful_count,
        failedCount: result.queueEntry.failed_count,
        chunksProcessed: result.queueEntry.chunks_processed,
        totalChunks: result.queueEntry.total_chunks,
        percentComplete: result.queueEntry.total_recipients > 0
          ? Math.round((result.queueEntry.processed_count / result.queueEntry.total_recipients) * 100)
          : 0,
        status: result.queueEntry.status,
      }
    }

    if (result.nextProcessAt) {
      response.nextProcessAt = result.nextProcessAt.toISOString()
    }

    if (result.error === "Outside business hours") {
      response.message = "Outside business hours - processing paused"
      response.outsideBusinessHours = true
    } else if (!result.hasMore) {
      response.message = "Campaign processing complete"
    } else {
      response.message = `Chunk processed successfully. ${result.pendingCount} recipients remaining.`
    }

    // Add instruction for continuing
    if (result.hasMore && result.shouldContinue) {
      response.continueProcessing = {
        endpoint: `/api/w/${workspaceSlug}/campaigns/${id}/process-chunk`,
        method: "POST",
        suggestedDelay: 2000, // 2 seconds between chunks
      }
    }

    return apiResponse(response)

  } catch (error) {
    console.error("[ProcessChunk] Exception:", error)
    return serverError("Internal server error")
  }
}

/**
 * GET /api/w/[workspaceSlug]/campaigns/[id]/process-chunk
 * 
 * Get current queue/processing status without processing a chunk.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, status, name")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Get queue entry
    const queueEntry = await getCampaignQueueEntry(id)

    if (!queueEntry) {
      return apiResponse({
        campaignId: id,
        campaignName: campaign.name,
        campaignStatus: campaign.status,
        queueInitialized: false,
        message: "Campaign queue not initialized. Use start-optimized endpoint to begin.",
      })
    }

    return apiResponse({
      campaignId: id,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      queueInitialized: true,
      queue: {
        id: queueEntry.id,
        status: queueEntry.status,
        totalRecipients: queueEntry.total_recipients,
        processedCount: queueEntry.processed_count,
        successfulCount: queueEntry.successful_count,
        failedCount: queueEntry.failed_count,
        chunksProcessed: queueEntry.chunks_processed,
        totalChunks: queueEntry.total_chunks,
        percentComplete: queueEntry.total_recipients > 0
          ? Math.round((queueEntry.processed_count / queueEntry.total_recipients) * 100)
          : 0,
        lastChunkAt: queueEntry.last_chunk_at,
        startedAt: queueEntry.started_at,
        completedAt: queueEntry.completed_at,
        errorMessage: queueEntry.error_message,
      },
      hasMore: queueEntry.status === "processing" || queueEntry.status === "pending",
      shouldContinue: queueEntry.status === "processing" || queueEntry.status === "pending",
    })

  } catch (error) {
    console.error("[ProcessChunk GET] Exception:", error)
    return serverError("Internal server error")
  }
}


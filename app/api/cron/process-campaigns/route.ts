import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import {
  processQueueChunk,
  getCampaignQueueEntry,
  type CampaignQueueEntry,
} from "@/lib/campaigns/queue-processor"

/**
 * Campaign Chunk Processing Cron
 * 
 * This cron endpoint processes active campaign chunks in the background.
 * It should run frequently (every 1-5 minutes) to ensure campaigns progress.
 * 
 * Schedule recommendation: Every minute for production
 * - Vercel Hobby: Limited to 2 cron jobs/day - use manual triggering or upgrade
 * - Vercel Pro/Enterprise: Can run every minute
 * 
 * Alternative: Use an external cron service (cron-job.org, EasyCron, etc.)
 * to call this endpoint more frequently.
 * 
 * Features:
 * - Processes all active campaign queues
 * - Respects business hours per campaign
 * - Handles paused/cancelled campaigns
 * - Rate limiting to prevent overload
 * - Progress logging
 */

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Maximum campaigns to process per cron run
const MAX_CAMPAIGNS_PER_RUN = 5

// Maximum chunks to process per campaign per run
const MAX_CHUNKS_PER_CAMPAIGN = 3

// Maximum total processing time before yielding (40 seconds to leave buffer)
const MAX_PROCESSING_TIME_MS = 40000

// ============================================================================
// MAIN CRON HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // ========================================================================
    // SECURITY: Verify Cron Secret
    // ========================================================================
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET

    // Allow without secret in development
    const isDev = process.env.NODE_ENV === "development"
    
    if (!isDev && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      logger.warn("[CampaignCron] Unauthorized access attempt", {
        path: request.nextUrl.pathname,
      })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ========================================================================
    // INITIALIZE
    // ========================================================================
    const startTime = Date.now()
    const adminClient = getSupabaseAdmin()

    logger.info("[CampaignCron] Starting campaign chunk processing", {
      timestamp: new Date().toISOString(),
      maxCampaigns: MAX_CAMPAIGNS_PER_RUN,
      maxChunksPerCampaign: MAX_CHUNKS_PER_CAMPAIGN,
    })

    // ========================================================================
    // FIND ACTIVE CAMPAIGN QUEUES
    // ========================================================================
    
    const { data: activeQueues, error: queueError } = await adminClient
      .from("campaign_queue")
      .select("campaign_id, workspace_id, status, processed_count, total_recipients")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: true })
      .limit(MAX_CAMPAIGNS_PER_RUN)

    if (queueError) {
      logger.error("[CampaignCron] Error fetching active queues:", { error: queueError.message })
      return NextResponse.json({
        success: false,
        error: "Failed to fetch active queues",
        message: queueError.message,
      }, { status: 500 })
    }

    const results: Array<{
      campaignId: string
      chunksProcessed: number
      success: boolean
      error?: string
      completed?: boolean
      outsideBusinessHours?: boolean
    }> = []

    if (!activeQueues || activeQueues.length === 0) {
      logger.info("[CampaignCron] No active campaign queues to process")
      return NextResponse.json({
        success: true,
        message: "No active campaigns to process",
        campaignsProcessed: 0,
        timestamp: new Date().toISOString(),
      })
    }

    logger.info(`[CampaignCron] Found ${activeQueues.length} active campaign(s) to process`)

    // ========================================================================
    // PROCESS EACH CAMPAIGN
    // ========================================================================

    for (const queue of activeQueues) {
      // Check if we're running out of time
      if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
        logger.warn("[CampaignCron] Approaching timeout, stopping early")
        break
      }

      const campaignResult = {
        campaignId: queue.campaign_id,
        chunksProcessed: 0,
        success: true,
        error: undefined as string | undefined,
        completed: false,
        outsideBusinessHours: false,
      }

      try {
        logger.info(`[CampaignCron] Processing campaign ${queue.campaign_id}`, {
          progress: `${queue.processed_count}/${queue.total_recipients}`,
        })

        // Process up to MAX_CHUNKS_PER_CAMPAIGN chunks for this campaign
        for (let i = 0; i < MAX_CHUNKS_PER_CAMPAIGN; i++) {
          // Check time budget
          if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
            logger.info(`[CampaignCron] Time budget exhausted for campaign ${queue.campaign_id}`)
            break
          }

          const chunkResult = await processQueueChunk(queue.campaign_id)

          if (chunkResult.success && chunkResult.chunkResult) {
            campaignResult.chunksProcessed++
            logger.info(`[CampaignCron] Chunk ${i + 1} complete for campaign ${queue.campaign_id}:`, {
              successful: chunkResult.chunkResult.successful,
              failed: chunkResult.chunkResult.failed,
              pending: chunkResult.pendingCount,
            })
          }

          if (!chunkResult.hasMore) {
            campaignResult.completed = true
            logger.info(`[CampaignCron] Campaign ${queue.campaign_id} completed`)
            break
          }

          if (!chunkResult.shouldContinue) {
            if (chunkResult.error === "Outside business hours") {
              campaignResult.outsideBusinessHours = true
              logger.info(`[CampaignCron] Campaign ${queue.campaign_id} outside business hours`)
            } else {
              logger.info(`[CampaignCron] Campaign ${queue.campaign_id} paused or stopped`)
            }
            break
          }

          // Small delay between chunks to prevent rate limiting
          await sleep(500)
        }

      } catch (error) {
        campaignResult.success = false
        campaignResult.error = error instanceof Error ? error.message : "Unknown error"
        logger.error(`[CampaignCron] Error processing campaign ${queue.campaign_id}:`, { 
          error: error instanceof Error ? error.message : String(error) 
        })
      }

      results.push(campaignResult)
    }

    // ========================================================================
    // FINALIZE
    // ========================================================================

    const totalDuration = Date.now() - startTime
    const totalChunksProcessed = results.reduce((sum, r) => sum + r.chunksProcessed, 0)
    const completedCampaigns = results.filter(r => r.completed).length
    const errorCount = results.filter(r => !r.success).length

    logger.info("[CampaignCron] Processing complete", {
      campaignsProcessed: results.length,
      totalChunksProcessed,
      completedCampaigns,
      errorCount,
      durationMs: totalDuration,
    })

    return NextResponse.json({
      success: errorCount === 0,
      message: `Processed ${totalChunksProcessed} chunk(s) across ${results.length} campaign(s)`,
      campaignsProcessed: results.length,
      totalChunksProcessed,
      completedCampaigns,
      errorCount,
      durationMs: totalDuration,
      results,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined

    logger.error("[CampaignCron] Critical failure:", {
      message: errorMessage,
      stack: errorStack,
    })

    return NextResponse.json({
      success: false,
      error: errorMessage,
      message: "Campaign cron encountered an unexpected error",
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}

/**
 * GET endpoint for health check and documentation
 */
export async function GET() {
  const adminClient = getSupabaseAdmin()
  
  // Get current queue stats
  const { data: queueStats } = await adminClient
    .from("campaign_queue")
    .select("status")
    .in("status", ["pending", "processing", "paused"])

  const stats = {
    pending: queueStats?.filter(q => q.status === "pending").length || 0,
    processing: queueStats?.filter(q => q.status === "processing").length || 0,
    paused: queueStats?.filter(q => q.status === "paused").length || 0,
  }

  return NextResponse.json({
    endpoint: "/api/cron/process-campaigns",
    status: "ready",
    description: "Processes active campaign chunks in background",
    currentQueueStats: stats,
    configuration: {
      maxCampaignsPerRun: MAX_CAMPAIGNS_PER_RUN,
      maxChunksPerCampaign: MAX_CHUNKS_PER_CAMPAIGN,
      maxProcessingTimeMs: MAX_PROCESSING_TIME_MS,
    },
    scheduleRecommendation: {
      production: "Every minute (* * * * *)",
      development: "Manual trigger or every 5 minutes",
      vercelHobby: "Use external cron service (cron-job.org) for frequent execution",
      vercelPro: "Native cron with every-minute schedule supported",
    },
    usage: {
      authorization: "Bearer {CRON_SECRET} header required",
      method: "POST to process, GET for status",
      externalService: "Call this endpoint from cron-job.org or similar for frequent execution",
    },
    documentation: {
      response: {
        success: "boolean",
        campaignsProcessed: "number",
        totalChunksProcessed: "number",
        completedCampaigns: "number",
        results: "array of per-campaign results",
        durationMs: "processing time",
      },
    },
  })
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}


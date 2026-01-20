import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { cleanupExpiredCampaigns, cleanupOldIncompleteDrafts } from "@/lib/campaigns/cleanup-expired"

/**
 * Master Cron Job Orchestrator
 *
 * Consolidates all background tasks into a single cron endpoint
 * Runs every 12 hours (2x/day) to stay within Vercel Hobby plan limits
 *
 * Schedule: 0 0,12 * * * (UTC)
 * - Runs at 12:00 AM UTC and 12:00 PM UTC daily
 * - Total: 2 invocations per day (complies with Hobby plan)
 *
 * Tasks:
 * 1. Cleanup Expired Campaigns - Cancel campaigns past their expiry date
 * 2. Cleanup Old Incomplete Drafts - Delete abandoned drafts older than 24 hours
 * 3. (Future) Send Expiring Notifications - Notify users of expiring campaigns
 * 4. (Future) Sync Agents - Sync agent changes to providers
 */
export async function POST(request: NextRequest) {
  try {
    // ========================================================================
    // SECURITY: Verify Cron Secret
    // ========================================================================
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      logger.warn("[MasterCron] Unauthorized access attempt", {
        path: request.nextUrl.pathname,
      })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ========================================================================
    // INITIALIZE
    // ========================================================================
    const startTime = Date.now()
    const results: Record<string, unknown> = {}
    const errors: string[] = []

    logger.info("[MasterCron] Starting consolidated cron execution", {
      timestamp: new Date().toISOString(),
      schedule: "0 0,12 * * * (every 12 hours)",
    })

    // ========================================================================
    // TASK 1: Cleanup Expired Campaigns
    // ========================================================================
    try {
      logger.info("[MasterCron] Task 1/4: Cleanup Expired Campaigns - Starting")
      const taskStart = Date.now()

      const cleanupResult = await cleanupExpiredCampaigns()

      const taskDuration = Date.now() - taskStart
      results.cleanupExpiredCampaigns = {
        success: cleanupResult.success,
        cancelledCount: cleanupResult.cancelledCount,
        errorCount: cleanupResult.errors.length,
        errors: cleanupResult.errors.slice(0, 5), // First 5 errors for brevity
        durationMs: taskDuration,
      }

      if (cleanupResult.success) {
        logger.info("[MasterCron] Task 1/4: Cleanup Expired Campaigns - Complete", {
          cancelledCount: cleanupResult.cancelledCount,
          durationMs: taskDuration,
        })
      } else {
        logger.error("[MasterCron] Task 1/4: Cleanup Expired Campaigns - Partial failure", {
          cancelledCount: cleanupResult.cancelledCount,
          errorCount: cleanupResult.errors.length,
          durationMs: taskDuration,
        })
        errors.push(`Cleanup completed with ${cleanupResult.errors.length} errors`)
      }
    } catch (error) {
      const taskError = error instanceof Error ? error.message : String(error)
      logger.error("[MasterCron] Task 1/4: Cleanup Expired Campaigns - Failed", {
        message: taskError,
      })
      results.cleanupExpiredCampaigns = {
        success: false,
        error: taskError,
      }
      errors.push("Cleanup task failed")
    }

    // ========================================================================
    // TASK 2: Cleanup Old Incomplete Drafts (24h+)
    // ========================================================================
    try {
      logger.info("[MasterCron] Task 2/4: Cleanup Old Incomplete Drafts - Starting")
      const taskStart = Date.now()

      const draftCleanupResult = await cleanupOldIncompleteDrafts()

      const taskDuration = Date.now() - taskStart
      results.cleanupOldDrafts = {
        success: draftCleanupResult.success,
        deletedCount: draftCleanupResult.cancelledCount,
        errorCount: draftCleanupResult.errors.length,
        errors: draftCleanupResult.errors.slice(0, 5), // First 5 errors for brevity
        durationMs: taskDuration,
      }

      if (draftCleanupResult.success) {
        logger.info("[MasterCron] Task 2/4: Cleanup Old Incomplete Drafts - Complete", {
          deletedCount: draftCleanupResult.cancelledCount,
          durationMs: taskDuration,
        })
      } else {
        logger.error("[MasterCron] Task 2/4: Cleanup Old Incomplete Drafts - Partial failure", {
          deletedCount: draftCleanupResult.cancelledCount,
          errorCount: draftCleanupResult.errors.length,
          durationMs: taskDuration,
        })
        errors.push(`Draft cleanup completed with ${draftCleanupResult.errors.length} errors`)
      }
    } catch (error) {
      const taskError = error instanceof Error ? error.message : String(error)
      logger.error("[MasterCron] Task 2/4: Cleanup Old Incomplete Drafts - Failed", {
        message: taskError,
      })
      results.cleanupOldDrafts = {
        success: false,
        error: taskError,
      }
      errors.push("Draft cleanup task failed")
    }

    // ========================================================================
    // TASK 3: Send Expiring Campaign Notifications (PLACEHOLDER)
    // ========================================================================
    // Uncomment when implemented
    // try {
    //   logger.info("[MasterCron] Task 3/4: Send Expiring Notifications - Starting")
    //   const notifyResult = await sendCampaignExpiringNotifications()
    //   results.sendExpiringNotifications = notifyResult
    //   logger.info("[MasterCron] Task 3/4: Send Expiring Notifications - Complete")
    // } catch (error) {
    //   logger.error("[MasterCron] Task 3/4: Send Expiring Notifications - Failed", {
    //     message: error instanceof Error ? error.message : String(error),
    //   })
    //   results.sendExpiringNotifications = { success: false, error: String(error) }
    //   errors.push("Notification task failed")
    // }

    // ========================================================================
    // TASK 4: Sync Agents to Providers (PLACEHOLDER)
    // ========================================================================
    // Uncomment when implemented
    // Note: This is a heavy operation - consider running less frequently
    // try {
    //   logger.info("[MasterCron] Task 4/4: Sync Agents - Starting")
    //   const syncResult = await syncAgentsToProviders()
    //   results.syncAgentsToProviders = syncResult
    //   logger.info("[MasterCron] Task 4/4: Sync Agents - Complete")
    // } catch (error) {
    //   logger.error("[MasterCron] Task 4/4: Sync Agents - Failed", {
    //     message: error instanceof Error ? error.message : String(error),
    //   })
    //   results.syncAgentsToProviders = { success: false, error: String(error) }
    //   errors.push("Agent sync task failed")
    // }

    // ========================================================================
    // FINALIZE
    // ========================================================================
    const totalDuration = Date.now() - startTime
    const success = errors.length === 0

    logger.info("[MasterCron] All tasks completed", {
      success,
      totalDurationMs: totalDuration,
      tasksWithErrors: errors.length,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({
      success,
      message: success
        ? "All cron tasks completed successfully"
        : `Completed with ${errors.length} task(s) having errors`,
      totalDurationMs: totalDuration,
      results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined

    logger.error("[MasterCron] Critical failure - exception in cron handler", {
      message: errorMessage,
      stack: errorStack,
    })

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        message: "Cron handler encountered an unexpected error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint for health check and documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/cron/master",
    status: "ready",
    description: "Master cron orchestrator - runs all background tasks",
    schedule: "0 0,12 * * * (UTC)",
    frequency: "Every 12 hours (2x per day)",
    vercelPlan: "Hobby (compliant with 2 cron jobs/day limit)",
    tasks: [
      {
        name: "cleanupExpiredCampaigns",
        description: "Cancel campaigns that have passed their expiry date without being started",
        status: "enabled",
        frequency: "every 12 hours",
      },
      {
        name: "cleanupOldIncompleteDrafts",
        description: "Delete abandoned 'Untitled Campaign' drafts older than 24 hours with no recipients",
        status: "enabled",
        frequency: "every 12 hours",
      },
      {
        name: "sendExpiringNotifications",
        description: "Notify users of campaigns expiring within 24 hours",
        status: "disabled",
        note: "Implement when needed - uncomment in handler",
      },
      {
        name: "syncAgentsToProviders",
        description: "Sync agent configuration changes to VAPI/Retell",
        status: "disabled",
        note: "Heavy operation - consider alternative implementation or dedicated schedule",
      },
    ],
    documentation: {
      authorization: "Bearer {CRON_SECRET} header required",
      method: "POST",
      response: {
        success: "boolean",
        totalDurationMs: "number",
        results: "object with each task result",
        errors: "array of error messages",
        timestamp: "ISO timestamp",
      },
    },
  })
}


import { NextRequest, NextResponse } from "next/server"
import { cleanupExpiredCampaigns } from "@/lib/campaigns/cleanup-expired"
import { logger } from "@/lib/logger"

/**
 * Cron endpoint to cleanup expired campaigns
 *
 * This should be called periodically (e.g., every hour) by a cron service
 * like Vercel Cron, GitHub Actions, or external cron service.
 *
 * Security: Verify cron secret to prevent unauthorized access
 *
 * Usage:
 * - Vercel Cron: Add to vercel.json
 * - Manual: POST /api/cron/cleanup-expired-campaigns with Authorization header
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      logger.warn("[CleanupCron] Unauthorized cleanup attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    logger.info("[CleanupCron] Starting expired campaigns cleanup")

    const result = await cleanupExpiredCampaigns()

    if (result.success) {
      logger.info(`[CleanupCron] Cleanup successful. Cancelled ${result.cancelledCount} campaigns`)
      return NextResponse.json({
        success: true,
        message: `Successfully cancelled ${result.cancelledCount} expired campaigns`,
        cancelledCount: result.cancelledCount,
      })
    } else {
      logger.error(
        `[CleanupCron] Cleanup completed with errors. Cancelled: ${result.cancelledCount}, Errors: ${result.errors.length}`
      )
      return NextResponse.json(
        {
          success: false,
          message: "Cleanup completed with errors",
          cancelledCount: result.cancelledCount,
          errors: result.errors,
        },
        { status: 207 } // Multi-Status
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorContext =
      error instanceof Error
        ? { error: error.message, stack: error.stack }
        : { error: String(error) }

    logger.error("[CleanupCron] Unexpected error", errorContext)
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}

// Allow GET for health check
export async function GET() {
  return NextResponse.json({
    endpoint: "cleanup-expired-campaigns",
    status: "ready",
    description: "POST to trigger cleanup of expired campaigns",
  })
}

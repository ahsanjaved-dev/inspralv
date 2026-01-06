/**
 * Cleanup Expired Campaigns
 * 
 * This module handles automatic cancellation of campaigns that have expired
 * without being started. Should be run via a cron job or scheduled function.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"

export interface CleanupResult {
  success: boolean
  cancelledCount: number
  errors: string[]
}

/**
 * Cancel campaigns that have passed their expiry date
 * 
 * @returns CleanupResult with count of cancelled campaigns
 */
export async function cleanupExpiredCampaigns(): Promise<CleanupResult> {
  const adminClient = createAdminClient()
  const errors: string[] = []
  let cancelledCount = 0

  try {
    const now = new Date().toISOString()

    // Find campaigns that are:
    // 1. Status is 'draft' (not yet started)
    // 2. Have an expiry date set
    // 3. Expiry date is in the past
    const { data: expiredCampaigns, error: fetchError } = await adminClient
      .from("call_campaigns")
      .select("id, name, workspace_id, scheduled_expires_at")
      .eq("status", "draft")
      .not("scheduled_expires_at", "is", null)
      .lt("scheduled_expires_at", now)
      .is("deleted_at", null)

    if (fetchError) {
      logger.error("[CleanupExpired] Error fetching expired campaigns:", fetchError)
      errors.push(`Failed to fetch expired campaigns: ${fetchError.message}`)
      return { success: false, cancelledCount: 0, errors }
    }

    if (!expiredCampaigns || expiredCampaigns.length === 0) {
      logger.info("[CleanupExpired] No expired campaigns found")
      return { success: true, cancelledCount: 0, errors: [] }
    }

    logger.info(`[CleanupExpired] Found ${expiredCampaigns.length} expired campaigns`)

    // Cancel each expired campaign
    for (const campaign of expiredCampaigns) {
      try {
        const { error: updateError } = await adminClient
          .from("call_campaigns")
          .update({
            status: "cancelled",
            updated_at: now,
          })
          .eq("id", campaign.id)

        if (updateError) {
          logger.error(
            `[CleanupExpired] Failed to cancel campaign ${campaign.id}:`,
            updateError
          )
          errors.push(`Campaign ${campaign.name} (${campaign.id}): ${updateError.message}`)
        } else {
          cancelledCount++
          logger.info(
            `[CleanupExpired] Cancelled campaign: ${campaign.name} (${campaign.id})`
          )
        }
      } catch (err) {
        const error = err as Error
        logger.error(`[CleanupExpired] Exception cancelling campaign ${campaign.id}:`, error)
        errors.push(`Campaign ${campaign.name} (${campaign.id}): ${error.message}`)
      }
    }

    const success = errors.length === 0
    logger.info(
      `[CleanupExpired] Cleanup complete. Cancelled: ${cancelledCount}, Errors: ${errors.length}`
    )

    return { success, cancelledCount, errors }
  } catch (err) {
    const error = err as Error
    logger.error("[CleanupExpired] Unexpected error during cleanup:", error)
    errors.push(`Unexpected error: ${error.message}`)
    return { success: false, cancelledCount, errors }
  }
}

/**
 * Get campaigns that will expire soon (within the next 24 hours)
 * Useful for sending notification emails
 * 
 * @returns Array of campaigns expiring soon
 */
export async function getCampaignsExpiringSoon() {
  const adminClient = createAdminClient()

  try {
    const now = new Date()
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

    const { data: campaigns, error } = await adminClient
      .from("call_campaigns")
      .select(`
        id,
        name,
        workspace_id,
        scheduled_start_at,
        scheduled_expires_at,
        created_by,
        workspace:workspaces!inner(id, name, partner_id)
      `)
      .eq("status", "draft")
      .not("scheduled_expires_at", "is", null)
      .gte("scheduled_expires_at", now.toISOString())
      .lte("scheduled_expires_at", in24Hours)
      .is("deleted_at", null)

    if (error) {
      logger.error("[CleanupExpired] Error fetching campaigns expiring soon:", error)
      return []
    }

    return campaigns || []
  } catch (err) {
    logger.error("[CleanupExpired] Exception getting campaigns expiring soon:", err)
    return []
  }
}


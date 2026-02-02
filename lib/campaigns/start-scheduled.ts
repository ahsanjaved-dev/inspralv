/**
 * Start Scheduled Campaigns
 * 
 * This module handles automatic starting of campaigns that have reached
 * their scheduled start time. Should be run via a cron job.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"
import {
  startNextCalls,
  getProviderConfigForCampaign,
} from "@/lib/campaigns/call-queue-manager"
import { isWithinBusinessHours, getNextBusinessHoursInfo } from "@/lib/integrations/vapi/batch-calls"
import type { BusinessHoursConfig } from "@/types/database.types"

export interface StartScheduledResult {
  success: boolean
  startedCount: number
  skippedCount: number
  errors: string[]
  details: Array<{
    campaignId: string
    campaignName: string
    status: "started" | "skipped" | "error"
    reason?: string
    callsStarted?: number
  }>
}

/**
 * Find and start campaigns that have reached their scheduled start time
 * 
 * Finds campaigns where:
 * 1. Status is 'scheduled'
 * 2. scheduled_start_at is in the past (or now)
 * 3. Not deleted
 * 
 * For each campaign:
 * - Check business hours (if enabled)
 * - Validate agent and provider config
 * - Update status to 'active'
 * - Start initial batch of calls
 */
export async function startScheduledCampaigns(): Promise<StartScheduledResult> {
  const adminClient = createAdminClient()
  const errors: string[] = []
  const details: StartScheduledResult["details"] = []
  let startedCount = 0
  let skippedCount = 0

  try {
    const now = new Date().toISOString()

    // Find scheduled campaigns whose start time has passed
    const { data: scheduledCampaigns, error: fetchError } = await adminClient
      .from("call_campaigns")
      .select(`
        id,
        name,
        workspace_id,
        scheduled_start_at,
        schedule_type,
        business_hours_config,
        timezone,
        agent:ai_agents!agent_id(
          id,
          name,
          provider,
          is_active,
          external_agent_id,
          external_phone_number,
          assigned_phone_number_id
        )
      `)
      .eq("status", "scheduled")
      .lte("scheduled_start_at", now)
      .is("deleted_at", null)

    if (fetchError) {
      logger.error("[StartScheduled] Error fetching scheduled campaigns:", {
        message: fetchError.message,
        code: fetchError.code,
      })
      errors.push(`Failed to fetch scheduled campaigns: ${fetchError.message}`)
      return { success: false, startedCount: 0, skippedCount: 0, errors, details }
    }

    if (!scheduledCampaigns || scheduledCampaigns.length === 0) {
      logger.info("[StartScheduled] No scheduled campaigns ready to start")
      return { success: true, startedCount: 0, skippedCount: 0, errors: [], details }
    }

    logger.info(`[StartScheduled] Found ${scheduledCampaigns.length} scheduled campaign(s) ready to start`)

    // Process each campaign
    for (const campaign of scheduledCampaigns) {
      const campaignDetail: StartScheduledResult["details"][0] = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: "started",
      }

      try {
        const agent = campaign.agent as any

        // Validate agent
        if (!agent) {
          campaignDetail.status = "error"
          campaignDetail.reason = "Campaign has no associated agent"
          errors.push(`Campaign ${campaign.name} (${campaign.id}): No agent`)
          details.push(campaignDetail)
          continue
        }

        if (!agent.is_active) {
          campaignDetail.status = "skipped"
          campaignDetail.reason = "Agent is not active"
          skippedCount++
          logger.info(`[StartScheduled] Skipping campaign ${campaign.id}: Agent not active`)
          details.push(campaignDetail)
          continue
        }

        if (!agent.external_agent_id) {
          campaignDetail.status = "skipped"
          campaignDetail.reason = "Agent not synced with voice provider"
          skippedCount++
          logger.info(`[StartScheduled] Skipping campaign ${campaign.id}: Agent not synced`)
          details.push(campaignDetail)
          continue
        }

        // Check business hours if configured
        const businessHoursConfig = campaign.business_hours_config as BusinessHoursConfig | null
        const effectiveTimezone = (businessHoursConfig as any)?.timezone || campaign.timezone || "UTC"

        if (businessHoursConfig?.enabled) {
          if (!isWithinBusinessHours(businessHoursConfig, effectiveTimezone)) {
            const nextInfo = getNextBusinessHoursInfo(businessHoursConfig, effectiveTimezone)
            campaignDetail.status = "skipped"
            campaignDetail.reason = nextInfo
              ? `Outside business hours. Next window: ${nextInfo.dayName} at ${nextInfo.startTime}`
              : "Outside business hours"
            skippedCount++
            logger.info(`[StartScheduled] Skipping campaign ${campaign.id}: Outside business hours`)
            details.push(campaignDetail)
            continue
          }
        }

        // Get provider config
        const providerConfig = await getProviderConfigForCampaign(campaign.id)
        if (!providerConfig) {
          campaignDetail.status = "skipped"
          campaignDetail.reason = "Provider integration not configured"
          skippedCount++
          logger.info(`[StartScheduled] Skipping campaign ${campaign.id}: No provider config`)
          details.push(campaignDetail)
          continue
        }

        // Check if there are pending recipients
        const { count: recipientCount } = await adminClient
          .from("call_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("call_status", "pending")

        if (!recipientCount || recipientCount === 0) {
          campaignDetail.status = "skipped"
          campaignDetail.reason = "No pending recipients"
          skippedCount++
          logger.info(`[StartScheduled] Skipping campaign ${campaign.id}: No pending recipients`)
          details.push(campaignDetail)
          continue
        }

        // Update campaign status to active
        const { error: updateError } = await adminClient
          .from("call_campaigns")
          .update({
            status: "active",
            started_at: now,
            updated_at: now,
          })
          .eq("id", campaign.id)

        if (updateError) {
          campaignDetail.status = "error"
          campaignDetail.reason = `Failed to update status: ${updateError.message}`
          errors.push(`Campaign ${campaign.name} (${campaign.id}): ${updateError.message}`)
          details.push(campaignDetail)
          continue
        }

        // Start initial batch of calls
        const startResult = await startNextCalls(
          campaign.id,
          campaign.workspace_id,
          providerConfig,
          { isInitialStart: true }
        )

        startedCount++
        campaignDetail.status = "started"
        campaignDetail.callsStarted = startResult.started
        
        logger.info(`[StartScheduled] Started campaign ${campaign.name} (${campaign.id}):`, {
          callsStarted: startResult.started,
          callsFailed: startResult.failed,
          remaining: startResult.remaining,
        })

        details.push(campaignDetail)

      } catch (err) {
        const error = err as Error
        campaignDetail.status = "error"
        campaignDetail.reason = error.message
        errors.push(`Campaign ${campaign.name} (${campaign.id}): ${error.message}`)
        logger.error(`[StartScheduled] Error starting campaign ${campaign.id}:`, {
          message: error.message,
          name: error.name,
        })
        details.push(campaignDetail)
      }
    }

    const success = errors.length === 0
    logger.info(
      `[StartScheduled] Complete. Started: ${startedCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`
    )

    return { success, startedCount, skippedCount, errors, details }
  } catch (err) {
    const error = err as Error
    logger.error("[StartScheduled] Unexpected error:", {
      message: error.message,
      name: error.name,
    })
    errors.push(`Unexpected error: ${error.message}`)
    return { success: false, startedCount, skippedCount, errors, details }
  }
}


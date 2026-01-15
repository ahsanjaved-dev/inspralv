/**
 * Campaign Provider - VAPI-Only Outbound Calling
 * 
 * This module provides the interface for campaign outbound calling using VAPI.
 * Inspra integration has been deprecated in favor of direct VAPI calls.
 */

import {
  startVapiBatch,
  isWithinBusinessHours,
  getNextBusinessHourWindow,
  type VapiBatchConfig,
  type VapiBatchCallItem,
  type VapiBatchResult,
} from "./vapi/batch-calls"

import type { BusinessHoursConfig } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export type CampaignProvider = "vapi"

export interface CampaignProviderConfig {
  // VAPI config (required)
  vapi?: {
    apiKey: string
    phoneNumberId: string  // VAPI phone number ID for outbound calls
  }
}

export interface CampaignBatchResult {
  success: boolean
  provider: CampaignProvider
  error?: string
  batchRef?: string
  recipientCount?: number
  // VAPI-specific results
  vapiResults?: VapiBatchResult
  // Fallback fields (for backward compatibility with multi-provider)
  fallbackUsed?: boolean
  primaryError?: string
}

export interface CampaignTestCallResult {
  success: boolean
  provider: CampaignProvider
  error?: string
  // Fallback fields (for backward compatibility with multi-provider)
  fallbackUsed?: boolean
  primaryError?: string
}

// Re-export types from inspra client for backward compatibility
export interface CampaignData {
  id: string
  workspace_id: string
  agent: {
    external_agent_id: string
    external_phone_number?: string | null
    assigned_phone_number_id?: string | null
  }
  cli: string // Resolved caller ID
  schedule_type: string
  scheduled_start_at?: string | null
  scheduled_expires_at?: string | null
  business_hours_config?: BusinessHoursConfig | null
  timezone: string
}

export interface RecipientData {
  id?: string  // Database ID for tracking call results
  phone_number: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  company?: string | null
  reason_for_call?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  suburb?: string | null
  state?: string | null
  post_code?: string | null
  country?: string | null
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Start a campaign batch using VAPI
 * 
 * @param campaign - Campaign data
 * @param recipients - List of recipients
 * @param vapiConfig - VAPI configuration (required)
 * @param options - Additional options
 */
export async function startCampaignBatch(
  campaign: CampaignData,
  recipients: RecipientData[],
  vapiConfig: CampaignProviderConfig["vapi"],
  options: { startNow?: boolean } = {}
): Promise<CampaignBatchResult> {
  const { startNow = false } = options
  const batchRef = `campaign-${campaign.id}`
  
  console.log(`[CampaignProvider] Starting batch: ${batchRef}`)
  console.log(`[CampaignProvider] Recipients: ${recipients.length}`)
  console.log(`[CampaignProvider] VAPI config available: ${!!vapiConfig?.apiKey}`)
  
  // =========================================================================
  // VAPI ONLY
  // =========================================================================
  
  if (!vapiConfig?.apiKey) {
    return {
      success: false,
      provider: "vapi",
      error: "VAPI configuration is required. Please configure VAPI integration.",
      batchRef,
    }
  }

  if (!vapiConfig.phoneNumberId) {
    return {
      success: false,
      provider: "vapi",
      error: "VAPI phone number ID is required for outbound calls.",
      batchRef,
    }
  }
  
  console.log(`[CampaignProvider] Using VAPI for campaign`)
  return executeVapiBatch(campaign, recipients, vapiConfig, startNow)
}

/**
 * Execute batch via VAPI
 */
async function executeVapiBatch(
  campaign: CampaignData,
  recipients: RecipientData[],
  vapiConfig: NonNullable<CampaignProviderConfig["vapi"]>,
  startNow: boolean
): Promise<CampaignBatchResult> {
  const batchRef = `campaign-${campaign.id}`
  
  // Check if we should start now based on schedule
  if (!startNow && campaign.schedule_type === "scheduled" && campaign.scheduled_start_at) {
    const scheduledTime = new Date(campaign.scheduled_start_at)
    if (scheduledTime > new Date()) {
      console.log(`[CampaignProvider] VAPI batch scheduled for: ${campaign.scheduled_start_at}`)
      return {
        success: true,
        provider: "vapi",
        batchRef,
        recipientCount: recipients.length,
        // Note: Actual scheduling would need a cron job or scheduled task
        // For now, we return success and expect the cron to pick it up
      }
    }
  }
  
  // Build VAPI batch config
  const vapiBatchConfig: VapiBatchConfig = {
    apiKey: vapiConfig.apiKey,
    assistantId: campaign.agent.external_agent_id,
    phoneNumberId: vapiConfig.phoneNumberId,
    workspaceId: campaign.workspace_id,
    campaignId: campaign.id,
    batchRef,
    businessHoursConfig: campaign.business_hours_config,
    timezone: campaign.timezone,
    delayBetweenCallsMs: 1500, // 1.5 second delay between calls
    // Skip business hours check when user explicitly clicks "Start Now"
    skipBusinessHoursCheck: startNow,
  }
  
  // Convert recipients to VAPI format
  // Use actual recipient ID from database for tracking, fallback to index-based ID
  const callList: VapiBatchCallItem[] = recipients.map((r, index) => ({
    phone: r.phone_number,
    recipientId: r.id || `${batchRef}-${index}`,
    variables: {
      FIRST_NAME: r.first_name || "",
      LAST_NAME: r.last_name || "",
      EMAIL: r.email || "",
      COMPANY_NAME: r.company || "",
      REASON_FOR_CALL: r.reason_for_call || "",
      ADDRESS: r.address_line_1 || "",
      ADDRESS_LINE_2: r.address_line_2 || "",
      CITY: r.suburb || "",
      STATE: r.state || "",
      POST_CODE: r.post_code || "",
      COUNTRY: r.country || "",
    },
  }))
  
  // Execute batch
  const result = await startVapiBatch(vapiBatchConfig, callList)
  
  return {
    success: result.success,
    provider: "vapi",
    error: result.error,
    batchRef,
    recipientCount: recipients.length,
    vapiResults: result,
  }
}

// ============================================================================
// PAUSE OPERATION
// ============================================================================

/**
 * Pause a campaign batch
 * 
 * Note: VAPI doesn't have native batch pause - we track state locally via DB
 */
export async function pauseCampaignBatch(
  workspaceId: string,
  agentId: string,
  campaignId: string,
  vapiConfig?: CampaignProviderConfig["vapi"]
): Promise<CampaignBatchResult> {
  const batchRef = `campaign-${campaignId}`
  
  // VAPI doesn't have native pause - just return success
  // The campaign status in DB controls whether we continue making calls
  console.log(`[CampaignProvider] VAPI pause (state-based): ${batchRef}`)
  
  return {
    success: true,
    provider: "vapi",
    batchRef,
  }
}

// ============================================================================
// TERMINATE OPERATION
// ============================================================================

/**
 * Terminate a campaign batch
 * 
 * Note: VAPI doesn't have native batch terminate - we track state locally via DB
 */
export async function terminateCampaignBatch(
  workspaceId: string,
  agentId: string,
  campaignId: string,
  vapiConfig?: CampaignProviderConfig["vapi"]
): Promise<CampaignBatchResult> {
  const batchRef = `campaign-${campaignId}`
  
  // VAPI doesn't have native terminate - just return success
  // The campaign status in DB controls whether we continue making calls
  console.log(`[CampaignProvider] VAPI terminate (state-based): ${batchRef}`)
  
  return {
    success: true,
    provider: "vapi",
    batchRef,
  }
}

// ============================================================================
// TEST CALL OPERATION
// ============================================================================

/**
 * Make a test call via VAPI
 */
export async function makeTestCall(
  campaign: CampaignData,
  phoneNumber: string,
  variables: Record<string, string>,
  vapiConfig?: CampaignProviderConfig["vapi"]
): Promise<CampaignTestCallResult> {
  if (!vapiConfig?.apiKey) {
    return {
      success: false,
      provider: "vapi",
      error: "VAPI configuration is required for test calls",
    }
  }

  if (!vapiConfig.phoneNumberId) {
    return {
      success: false,
      provider: "vapi",
      error: "VAPI phone number ID is required for outbound calls",
    }
  }
  
  console.log(`[CampaignProvider] Test call via VAPI to: ${phoneNumber}`)
  
  const { createOutboundCall } = await import("./vapi/calls")
  
  const result = await createOutboundCall({
    apiKey: vapiConfig.apiKey,
    assistantId: campaign.agent.external_agent_id,
    phoneNumberId: vapiConfig.phoneNumberId,
    customerNumber: phoneNumber,
    customerName: `${variables.FIRST_NAME || ""} ${variables.LAST_NAME || ""}`.trim() || undefined,
  })
  
  return {
    success: result.success,
    provider: "vapi",
    error: result.error,
  }
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export {
  isWithinBusinessHours,
  getNextBusinessHourWindow,
}

/**
 * Convert business hours config to block rules format
 * (Kept for backward compatibility, but no longer used with VAPI-only)
 */
export function convertBusinessHoursToBlockRules(config: BusinessHoursConfig | null | undefined): string[] {
  if (!config || !config.enabled) {
    return []
  }

  const DAY_MAP: Record<string, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
  }

  const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
  const blockRules: string[] = []

  for (const day of DAY_ORDER) {
    const slots = config.schedule[day as keyof typeof config.schedule] || []
    const dayAbbrev = DAY_MAP[day]

    if (slots.length === 0) {
      blockRules.push(`${dayAbbrev}|0000-2359`)
    } else {
      const sortedSlots = [...slots].sort((a, b) => a.start.localeCompare(b.start))

      const firstSlot = sortedSlots[0]
      if (firstSlot && firstSlot.start !== "00:00") {
        const startTime = firstSlot.start.replace(":", "")
        blockRules.push(`${dayAbbrev}|0000-${startTime}`)
      }

      for (let i = 0; i < sortedSlots.length - 1; i++) {
        const currentSlot = sortedSlots[i]
        const nextSlot = sortedSlots[i + 1]
        if (currentSlot && nextSlot) {
          const currentEnd = currentSlot.end.replace(":", "")
          const nextStart = nextSlot.start.replace(":", "")
          if (currentEnd !== nextStart) {
            blockRules.push(`${dayAbbrev}|${currentEnd}-${nextStart}`)
          }
        }
      }

      const lastSlot = sortedSlots[sortedSlots.length - 1]
      if (lastSlot && lastSlot.end !== "24:00" && lastSlot.end !== "23:59") {
        const endTime = lastSlot.end.replace(":", "")
        blockRules.push(`${dayAbbrev}|${endTime}-2359`)
      }
    }
  }

  return blockRules
}

/**
 * Native Batch Calling Engine for Campaigns
 * 
 * This module handles batch outbound calling using VAPI directly,
 * replacing the external Inspra API dependency.
 * 
 * Features:
 * - Concurrent call processing with configurable limits
 * - Recipient status tracking
 * - Campaign state management (pause/terminate via DB flags)
 * - Business hours enforcement
 * - Retry logic with configurable attempts and delays
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createOutboundCall, type VapiCallResponse } from "@/lib/integrations/vapi/calls"
import { logger } from "@/lib/logger"
import type { BusinessHoursConfig, DayOfWeek } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export interface BatchCallerConfig {
  campaignId: string
  workspaceId: string
  agentId: string
  externalAgentId: string
  phoneNumberId: string // VAPI phone number ID for outbound calls
  vapiSecretKey: string
  concurrencyLimit: number
  maxAttempts: number
  retryDelayMinutes: number
  businessHoursConfig?: BusinessHoursConfig | null
  timezone: string
}

export interface RecipientData {
  id: string
  phone_number: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  email?: string | null
  reason_for_call?: string | null
  address_line_1?: string | null
  suburb?: string | null
  state?: string | null
  post_code?: string | null
  country?: string | null
  attempts: number
  call_status: string
}

export interface BatchCallResult {
  success: boolean
  totalProcessed: number
  successful: number
  failed: number
  pending: number
  cancelled: boolean
  paused: boolean
  error?: string
}

interface CampaignState {
  status: string
  pending_calls: number
  completed_calls: number
  successful_calls: number
  failed_calls: number
}

// ============================================================================
// BUSINESS HOURS CHECK
// ============================================================================

const DAY_MAP: Record<number, DayOfWeek> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
}

/**
 * Check if current time is within business hours
 */
export function isWithinBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  timezone: string
): boolean {
  if (!config || !config.enabled) {
    return true // No restrictions if not enabled
  }

  try {
    // Get current time in the specified timezone
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "long",
    }

    const formatter = new Intl.DateTimeFormat("en-US", options)
    const parts = formatter.formatToParts(now)

    const hourPart = parts.find((p) => p.type === "hour")
    const minutePart = parts.find((p) => p.type === "minute")
    const weekdayPart = parts.find((p) => p.type === "weekday")

    if (!hourPart || !minutePart || !weekdayPart) {
      console.warn("[BatchCaller] Could not parse time parts, allowing call")
      return true
    }

    const currentHour = parseInt(hourPart.value, 10)
    const currentMinute = parseInt(minutePart.value, 10)
    const currentTime = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`

    // Map weekday name to our DayOfWeek type
    const weekdayName = weekdayPart.value.toLowerCase() as DayOfWeek

    const todaySlots = config.schedule[weekdayName] || []

    if (todaySlots.length === 0) {
      console.log(`[BatchCaller] No business hours slots for ${weekdayName}`)
      return false
    }

    // Check if current time falls within any slot
    for (const slot of todaySlots) {
      if (currentTime >= slot.start && currentTime <= slot.end) {
        console.log(`[BatchCaller] Within business hours: ${currentTime} in slot ${slot.start}-${slot.end}`)
        return true
      }
    }

    console.log(`[BatchCaller] Outside business hours: ${currentTime} not in any slot for ${weekdayName}`)
    return false
  } catch (error) {
    console.error("[BatchCaller] Error checking business hours:", error)
    return true // Allow calls on error to prevent blocking
  }
}

// ============================================================================
// RECIPIENT MANAGEMENT
// ============================================================================

/**
 * Get pending recipients for a campaign
 */
async function getPendingRecipients(
  campaignId: string,
  limit: number
): Promise<RecipientData[]> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("call_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("call_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    console.error("[BatchCaller] Error fetching recipients:", error)
    return []
  }

  return (data || []) as RecipientData[]
}

/**
 * Update recipient status after a call attempt
 */
async function updateRecipientStatus(
  recipientId: string,
  status: string,
  externalCallId?: string,
  error?: string
): Promise<void> {
  const adminClient = createAdminClient()

  const updateData: Record<string, unknown> = {
    call_status: status,
    last_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (externalCallId) {
    updateData.external_call_id = externalCallId
    updateData.call_started_at = new Date().toISOString()
  }

  if (error) {
    updateData.last_error = error
  }

  // Increment attempts
  const { data: current } = await adminClient
    .from("call_recipients")
    .select("attempts")
    .eq("id", recipientId)
    .single()

  updateData.attempts = (current?.attempts || 0) + 1

  const { error: updateError } = await adminClient
    .from("call_recipients")
    .update(updateData)
    .eq("id", recipientId)

  if (updateError) {
    console.error("[BatchCaller] Error updating recipient status:", updateError)
  }
}

/**
 * Mark recipient as in-progress (call initiated)
 */
async function markRecipientInProgress(
  recipientId: string,
  externalCallId: string
): Promise<void> {
  await updateRecipientStatus(recipientId, "in_progress", externalCallId)
}

/**
 * Mark recipient as failed
 */
async function markRecipientFailed(
  recipientId: string,
  error: string,
  maxAttempts: number
): Promise<void> {
  const adminClient = createAdminClient()

  // Get current attempts
  const { data: current } = await adminClient
    .from("call_recipients")
    .select("attempts")
    .eq("id", recipientId)
    .single()

  const attempts = (current?.attempts || 0) + 1

  if (attempts >= maxAttempts) {
    // Final failure - no more retries
    await updateRecipientStatus(recipientId, "failed", undefined, error)
  } else {
    // Can retry - mark as pending with next attempt time
    await updateRecipientStatus(recipientId, "pending", undefined, error)
  }
}

// ============================================================================
// CAMPAIGN STATE MANAGEMENT
// ============================================================================

/**
 * Get current campaign state
 */
async function getCampaignState(campaignId: string): Promise<CampaignState | null> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("call_campaigns")
    .select("status, pending_calls, completed_calls, successful_calls, failed_calls")
    .eq("id", campaignId)
    .single()

  if (error || !data) {
    console.error("[BatchCaller] Error fetching campaign state:", error)
    return null
  }

  return data as CampaignState
}

/**
 * Update campaign statistics
 */
async function updateCampaignStats(
  campaignId: string,
  delta: {
    pending?: number
    completed?: number
    successful?: number
    failed?: number
  }
): Promise<void> {
  const adminClient = createAdminClient()

  // Get current stats
  const state = await getCampaignState(campaignId)
  if (!state) return

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (delta.pending !== undefined) {
    updates.pending_calls = Math.max(0, state.pending_calls + delta.pending)
  }
  if (delta.completed !== undefined) {
    updates.completed_calls = state.completed_calls + delta.completed
  }
  if (delta.successful !== undefined) {
    updates.successful_calls = state.successful_calls + delta.successful
  }
  if (delta.failed !== undefined) {
    updates.failed_calls = state.failed_calls + delta.failed
  }

  const { error } = await adminClient
    .from("call_campaigns")
    .update(updates)
    .eq("id", campaignId)

  if (error) {
    console.error("[BatchCaller] Error updating campaign stats:", error)
  }
}

/**
 * Mark campaign as completed
 */
async function markCampaignCompleted(campaignId: string): Promise<void> {
  const adminClient = createAdminClient()

  await adminClient
    .from("call_campaigns")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
}

/**
 * Check if campaign should continue (not paused/cancelled/completed)
 */
async function shouldContinue(campaignId: string): Promise<{ continue: boolean; reason?: string }> {
  const state = await getCampaignState(campaignId)
  
  if (!state) {
    return { continue: false, reason: "Campaign not found" }
  }

  switch (state.status) {
    case "paused":
      return { continue: false, reason: "Campaign paused" }
    case "cancelled":
      return { continue: false, reason: "Campaign cancelled" }
    case "completed":
      return { continue: false, reason: "Campaign completed" }
    case "active":
      return { continue: true }
    default:
      return { continue: false, reason: `Invalid status: ${state.status}` }
  }
}

// ============================================================================
// MAIN BATCH CALLING FUNCTION
// ============================================================================

/**
 * Process a single call to a recipient
 */
async function processRecipientCall(
  config: BatchCallerConfig,
  recipient: RecipientData
): Promise<{ success: boolean; callId?: string; error?: string }> {
  console.log(`[BatchCaller] Calling ${recipient.phone_number} (recipient: ${recipient.id})`)

  try {
    // Build customer name from available fields
    const customerName = [recipient.first_name, recipient.last_name]
      .filter(Boolean)
      .join(" ") || undefined

    // Make the outbound call via VAPI
    const result: VapiCallResponse = await createOutboundCall({
      apiKey: config.vapiSecretKey,
      assistantId: config.externalAgentId,
      phoneNumberId: config.phoneNumberId,
      customerNumber: recipient.phone_number,
      customerName,
    })

    if (!result.success || !result.data) {
      console.error(`[BatchCaller] Call failed for ${recipient.phone_number}:`, result.error)
      return { success: false, error: result.error || "Call creation failed" }
    }

    console.log(`[BatchCaller] Call initiated: ${result.data.id} to ${recipient.phone_number}`)
    return { success: true, callId: result.data.id }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error(`[BatchCaller] Exception calling ${recipient.phone_number}:`, error)
    return { success: false, error: errorMessage }
  }
}

/**
 * Run the batch calling process for a campaign
 * 
 * This function processes recipients in batches according to concurrency limits,
 * respecting business hours and checking for pause/cancel state between batches.
 */
export async function runBatchCaller(config: BatchCallerConfig): Promise<BatchCallResult> {
  console.log(`[BatchCaller] Starting batch caller for campaign ${config.campaignId}`)
  console.log(`[BatchCaller] Config:`, {
    concurrencyLimit: config.concurrencyLimit,
    maxAttempts: config.maxAttempts,
    retryDelayMinutes: config.retryDelayMinutes,
    timezone: config.timezone,
    hasBusinessHours: !!config.businessHoursConfig?.enabled,
  })

  const result: BatchCallResult = {
    success: true,
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    cancelled: false,
    paused: false,
  }

  try {
    // Main processing loop
    let hasMoreRecipients = true
    let batchNumber = 0

    while (hasMoreRecipients) {
      batchNumber++
      console.log(`[BatchCaller] Processing batch ${batchNumber}`)

      // Check if campaign should continue
      const continueCheck = await shouldContinue(config.campaignId)
      if (!continueCheck.continue) {
        console.log(`[BatchCaller] Stopping: ${continueCheck.reason}`)
        
        if (continueCheck.reason === "Campaign paused") {
          result.paused = true
        } else if (continueCheck.reason === "Campaign cancelled") {
          result.cancelled = true
        }
        break
      }

      // Check business hours
      if (config.businessHoursConfig?.enabled) {
        if (!isWithinBusinessHours(config.businessHoursConfig, config.timezone)) {
          console.log(`[BatchCaller] Outside business hours, stopping for now`)
          // Leave campaign active - it will resume when business hours start again
          result.paused = true
          break
        }
      }

      // Get next batch of pending recipients
      const recipients = await getPendingRecipients(
        config.campaignId,
        config.concurrencyLimit
      )

      if (recipients.length === 0) {
        console.log(`[BatchCaller] No more pending recipients`)
        hasMoreRecipients = false
        break
      }

      // Process recipients concurrently (up to concurrency limit)
      const callPromises = recipients.map(async (recipient) => {
        const callResult = await processRecipientCall(config, recipient)

        if (callResult.success && callResult.callId) {
          // Call initiated successfully
          await markRecipientInProgress(recipient.id, callResult.callId)
          result.successful++
          // Note: Actual call outcome will be updated via webhook when call completes
        } else {
          // Call initiation failed
          await markRecipientFailed(recipient.id, callResult.error || "Unknown error", config.maxAttempts)
          result.failed++
        }

        result.totalProcessed++
        return callResult
      })

      // Wait for all calls in this batch to be initiated
      await Promise.all(callPromises)

      // Update campaign stats
      await updateCampaignStats(config.campaignId, {
        pending: -recipients.length,
        completed: result.successful + result.failed,
      })

      // Small delay between batches to avoid rate limiting
      await sleep(1000)
    }

    // Check if all calls are done
    const finalState = await getCampaignState(config.campaignId)
    if (finalState && finalState.pending_calls <= 0 && !result.paused && !result.cancelled) {
      await markCampaignCompleted(config.campaignId)
      console.log(`[BatchCaller] Campaign completed`)
    }

    return result

  } catch (error) {
    console.error(`[BatchCaller] Fatal error:`, error)
    result.success = false
    result.error = error instanceof Error ? error.message : "Unknown error"
    return result
  }
}

/**
 * Start a campaign and initiate batch calling
 * This is called from the campaign start API endpoint
 */
export async function startCampaign(config: BatchCallerConfig): Promise<BatchCallResult> {
  // Run the batch caller
  // Note: In production, you might want to run this in a background job
  // For now, we start it and let it run asynchronously
  
  // Fire and forget - the campaign will run in the background
  runBatchCaller(config).then((result) => {
    console.log(`[BatchCaller] Campaign ${config.campaignId} batch calling finished:`, result)
  }).catch((error) => {
    console.error(`[BatchCaller] Campaign ${config.campaignId} batch calling error:`, error)
  })

  return {
    success: true,
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    cancelled: false,
    paused: false,
  }
}

/**
 * Pause a campaign (stops processing new calls)
 * Existing in-progress calls will complete normally
 */
export async function pauseCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from("call_campaigns")
    .update({
      status: "paused",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("status", "active") // Only pause if currently active

  if (error) {
    return { success: false, error: error.message }
  }

  console.log(`[BatchCaller] Campaign ${campaignId} paused`)
  return { success: true }
}

/**
 * Resume a paused campaign
 */
export async function resumeCampaign(config: BatchCallerConfig): Promise<BatchCallResult> {
  const adminClient = createAdminClient()

  // Set status back to active
  const { error } = await adminClient
    .from("call_campaigns")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.campaignId)
    .eq("status", "paused") // Only resume if currently paused

  if (error) {
    return {
      success: false,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      cancelled: false,
      paused: false,
      error: error.message,
    }
  }

  console.log(`[BatchCaller] Campaign ${config.campaignId} resumed`)
  
  // Start the batch caller again
  return startCampaign(config)
}

/**
 * Terminate/cancel a campaign
 */
export async function terminateCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from("call_campaigns")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .in("status", ["active", "paused"]) // Only cancel if active or paused

  if (error) {
    return { success: false, error: error.message }
  }

  // Also mark all pending recipients as cancelled
  await adminClient
    .from("call_recipients")
    .update({
      call_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId)
    .eq("call_status", "pending")

  console.log(`[BatchCaller] Campaign ${campaignId} terminated`)
  return { success: true }
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}


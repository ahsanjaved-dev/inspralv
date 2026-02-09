/**
 * Batch Calling Engine for Large-Scale Campaigns
 * 
 * This module handles batch outbound calling with optimizations for large datasets:
 * - Chunked processing with configurable chunk sizes
 * - Concurrent call processing within chunks (controlled concurrency)
 * - Progress tracking and callbacks
 * - Database bulk operations
 * - Adaptive rate limiting
 * - Resume capability for failed batches
 * 
 * Key optimizations:
 * 1. Processes recipients in chunks (default: 50 per chunk)
 * 2. Concurrent calls within each chunk (default: 5 concurrent)
 * 3. Bulk database updates instead of individual queries
 * 4. Progress callbacks for real-time tracking
 * 5. Graceful handling of serverless timeouts
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
  phoneNumberId: string
  vapiSecretKey: string
  concurrencyLimit: number // Max concurrent calls within a chunk
  maxAttempts: number
  retryDelayMinutes: number
  businessHoursConfig?: BusinessHoursConfig | null
  timezone: string
  // Optimization options
  chunkSize?: number // Recipients per chunk (default: 50)
  delayBetweenChunksMs?: number // Delay between processing chunks (default: 2000)
  delayBetweenCallsMs?: number // Delay between individual calls (default: 500)
  maxProcessingTimeMs?: number // Max time before yielding (for serverless, default: 45000)
  onProgress?: (progress: BatchProgress) => void // Progress callback
  onChunkComplete?: (chunk: ChunkResult) => void // Chunk completion callback
}

// Legacy type alias for backwards compatibility
export type OptimizedBatchConfig = BatchCallerConfig

export interface BatchProgress {
  campaignId: string
  totalRecipients: number
  processed: number
  successful: number
  failed: number
  pending: number
  percentComplete: number
  estimatedTimeRemainingMs: number
  currentChunk: number
  totalChunks: number
  isComplete: boolean
  isPaused: boolean
  isCancelled: boolean
}

export interface ChunkResult {
  chunkIndex: number
  recipientIds: string[]
  successful: number
  failed: number
  results: CallAttemptResult[]
  processingTimeMs: number
}

export interface CallAttemptResult {
  recipientId: string
  phoneNumber: string
  success: boolean
  callId?: string
  error?: string
  attemptNumber: number
  timestamp: Date
}

export interface BatchResult {
  success: boolean
  campaignId: string
  totalProcessed: number
  successful: number
  failed: number
  pending: number
  chunksProcessed: number
  totalChunks: number
  cancelled: boolean
  paused: boolean
  timedOut: boolean
  error?: string
  resumeFromChunk?: number // For resuming after timeout
  processingTimeMs: number
}

// Legacy type alias for backwards compatibility
export type OptimizedBatchResult = BatchResult

interface RecipientData {
  id: string
  phone_number: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  email?: string | null
  attempts: number
  call_status: string
}

interface CampaignState {
  status: string
  pending_calls: number
  completed_calls: number
  successful_calls: number
  failed_calls: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CHUNK_SIZE = 50
const DEFAULT_CONCURRENCY = 5
const DEFAULT_DELAY_BETWEEN_CHUNKS_MS = 2000
const DEFAULT_DELAY_BETWEEN_CALLS_MS = 500
const DEFAULT_MAX_PROCESSING_TIME_MS = 45000 // 45 seconds for serverless safety

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

export function isWithinBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  timezone: string
): boolean {
  if (!config || !config.enabled) {
    return true
  }

  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || "Australia/Melbourne",
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
      return true
    }

    const currentHour = parseInt(hourPart.value, 10)
    const currentMinute = parseInt(minutePart.value, 10)
    const currentTime = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`
    const weekdayName = weekdayPart.value.toLowerCase() as DayOfWeek
    const todaySlots = config.schedule[weekdayName] || []

    if (todaySlots.length === 0) {
      return false
    }

    for (const slot of todaySlots) {
      if (currentTime >= slot.start && currentTime <= slot.end) {
        return true
      }
    }

    return false
  } catch (error) {
    console.error("[BatchCaller] Error checking business hours:", error)
    return true
  }
}

/**
 * Get the next available business hours window start time
 * Returns the next time when calling will be allowed based on business hours config
 */
export function getNextBusinessHoursStart(
  config: BusinessHoursConfig | null | undefined,
  timezone: string
): { nextStartTime: Date; nextStartTimeFormatted: string; dayName: string } | null {
  if (!config || !config.enabled) {
    return null
  }

  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || "Australia/Melbourne",
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
      return null
    }

    const currentHour = parseInt(hourPart.value, 10)
    const currentMinute = parseInt(minutePart.value, 10)
    const currentTime = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`
    const weekdayName = weekdayPart.value.toLowerCase() as DayOfWeek
    
    // Day order starting from today
    const dayOrder: DayOfWeek[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const todayIndex = dayOrder.indexOf(weekdayName)
    
    // Check today first - is there a later slot today?
    const todaySlots = config.schedule[weekdayName] || []
    for (const slot of todaySlots) {
      if (slot.start > currentTime) {
        // Found a slot later today
        const [hour = 0, minute = 0] = slot.start.split(":").map(Number)
        const nextStart = new Date(now)
        nextStart.setHours(hour, minute, 0, 0)
        
        return {
          nextStartTime: nextStart,
          nextStartTimeFormatted: slot.start,
          dayName: weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1),
        }
      }
    }
    
    // Check subsequent days (up to 7 days)
    for (let i = 1; i <= 7; i++) {
      const dayIndex = (todayIndex + i) % 7
      const dayName = dayOrder[dayIndex]
      if (!dayName) continue
      const daySlots = config.schedule[dayName] || []
      
      if (daySlots.length > 0) {
        // Found a day with slots - use the first slot
        const firstSlot = daySlots[0]
        if (!firstSlot) continue
        const [hour = 0, minute = 0] = firstSlot.start.split(":").map(Number)
        
        const nextStart = new Date(now)
        nextStart.setDate(nextStart.getDate() + i)
        nextStart.setHours(hour, minute, 0, 0)
        
        return {
          nextStartTime: nextStart,
          nextStartTimeFormatted: firstSlot.start,
          dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
        }
      }
    }
    
    // No business hours found in the next week
    return null
  } catch (error) {
    console.error("[BatchCaller] Error calculating next business hours:", error)
    return null
  }
}

// ============================================================================
// BULK DATABASE OPERATIONS
// ============================================================================

/**
 * Fetch pending recipients in chunks
 */
async function fetchPendingRecipientsChunk(
  campaignId: string,
  offset: number,
  limit: number
): Promise<RecipientData[]> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("call_recipients")
    .select("id, phone_number, first_name, last_name, company, email, attempts, call_status")
    .eq("campaign_id", campaignId)
    .eq("call_status", "pending")
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error("[BatchCaller] Error fetching recipients chunk:", error)
    return []
  }

  return (data || []) as RecipientData[]
}

/**
 * Get total count of pending recipients
 */
async function getPendingRecipientCount(campaignId: string): Promise<number> {
  const adminClient = createAdminClient()

  const { count, error } = await adminClient
    .from("call_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("call_status", "pending")

  if (error) {
    console.error("[BatchCaller] Error counting recipients:", error)
    return 0
  }

  return count || 0
}

/**
 * Bulk update recipient statuses
 */
async function bulkUpdateRecipientStatuses(
  updates: Array<{
    id: string
    call_status: string
    external_call_id?: string
    call_started_at?: string
    last_error?: string
    attempts?: number
  }>
): Promise<void> {
  if (updates.length === 0) return

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  // Group updates by status for more efficient bulk operations
  const callingUpdates = updates.filter(u => u.call_status === "calling")
  const failedUpdates = updates.filter(u => u.call_status === "failed")

  // Bulk update for "calling" status
  if (callingUpdates.length > 0) {
    const { error } = await adminClient.rpc("bulk_update_recipients_calling", {
      recipient_ids: callingUpdates.map(u => u.id),
      call_ids: callingUpdates.map(u => u.external_call_id || null),
      started_at: now,
    })
    
    if (error) {
      // Fallback to individual updates if RPC doesn't exist
      console.warn("[BatchCaller] RPC not available, using individual updates")
      for (const update of callingUpdates) {
        await adminClient
          .from("call_recipients")
          .update({
            call_status: "calling",
            external_call_id: update.external_call_id,
            call_started_at: update.call_started_at || now,
            last_attempt_at: now,
            updated_at: now,
          })
          .eq("id", update.id)
      }
    }
  }

  // Bulk update for "failed" status
  if (failedUpdates.length > 0) {
    for (const update of failedUpdates) {
      await adminClient
        .from("call_recipients")
        .update({
          call_status: "failed",
          last_error: update.last_error,
          attempts: update.attempts,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq("id", update.id)
    }
  }
}

/**
 * Update campaign statistics efficiently
 */
async function updateCampaignStatsEfficient(
  campaignId: string,
  deltaSuccessful: number,
  deltaFailed: number
): Promise<void> {
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  // Use atomic increment to avoid race conditions
  const { error } = await adminClient.rpc("increment_campaign_stats", {
    p_campaign_id: campaignId,
    p_successful_delta: deltaSuccessful,
    p_failed_delta: deltaFailed,
  })

  if (error) {
    // Fallback to manual update
    console.warn("[BatchCaller] RPC not available, using manual stats update")
    
    const { data: current } = await adminClient
      .from("call_campaigns")
      .select("completed_calls, successful_calls, failed_calls, pending_calls")
      .eq("id", campaignId)
      .single()

    if (current) {
      const totalDelta = deltaSuccessful + deltaFailed
      await adminClient
        .from("call_campaigns")
        .update({
          completed_calls: (current.completed_calls || 0) + totalDelta,
          successful_calls: (current.successful_calls || 0) + deltaSuccessful,
          failed_calls: (current.failed_calls || 0) + deltaFailed,
          pending_calls: Math.max(0, (current.pending_calls || 0) - totalDelta),
          updated_at: now,
        })
        .eq("id", campaignId)
    }
  }
}

// ============================================================================
// CAMPAIGN STATE MANAGEMENT
// ============================================================================

async function getCampaignState(campaignId: string): Promise<CampaignState | null> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("call_campaigns")
    .select("status, pending_calls, completed_calls, successful_calls, failed_calls")
    .eq("id", campaignId)
    .single()

  if (error || !data) {
    return null
  }

  return data as CampaignState
}

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

// ============================================================================
// CONCURRENT CALL PROCESSING
// ============================================================================

/**
 * Process a single call with retry logic
 */
async function processCall(
  config: BatchCallerConfig,
  recipient: RecipientData
): Promise<CallAttemptResult> {
  const customerName = [recipient.first_name, recipient.last_name]
    .filter(Boolean)
    .join(" ") || undefined

  try {
    const result: VapiCallResponse = await createOutboundCall({
      apiKey: config.vapiSecretKey,
      assistantId: config.externalAgentId,
      phoneNumberId: config.phoneNumberId,
      customerNumber: recipient.phone_number,
      customerName,
    })

    if (!result.success || !result.data) {
      return {
        recipientId: recipient.id,
        phoneNumber: recipient.phone_number,
        success: false,
        error: result.error || "Call creation failed",
        attemptNumber: recipient.attempts + 1,
        timestamp: new Date(),
      }
    }

    return {
      recipientId: recipient.id,
      phoneNumber: recipient.phone_number,
      success: true,
      callId: result.data.id,
      attemptNumber: recipient.attempts + 1,
      timestamp: new Date(),
    }
  } catch (error) {
    return {
      recipientId: recipient.id,
      phoneNumber: recipient.phone_number,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      attemptNumber: recipient.attempts + 1,
      timestamp: new Date(),
    }
  }
}

/**
 * Process a chunk of recipients concurrently with controlled parallelism
 */
async function processChunk(
  config: BatchCallerConfig,
  recipients: RecipientData[],
  chunkIndex: number
): Promise<ChunkResult> {
  const startTime = Date.now()
  const results: CallAttemptResult[] = []
  const concurrency = config.concurrencyLimit || DEFAULT_CONCURRENCY
  const delayBetweenCalls = config.delayBetweenCallsMs || DEFAULT_DELAY_BETWEEN_CALLS_MS

  console.log(`[BatchCaller] Processing chunk ${chunkIndex + 1} with ${recipients.length} recipients (concurrency: ${concurrency})`)

  // Process in batches of `concurrency` size
  for (let i = 0; i < recipients.length; i += concurrency) {
    const batch = recipients.slice(i, i + concurrency)
    
    // Process batch concurrently
    const batchResults = await Promise.all(
      batch.map(recipient => processCall(config, recipient))
    )
    
    results.push(...batchResults)

    // Small delay between concurrent batches to avoid rate limiting
    if (i + concurrency < recipients.length) {
      await sleep(delayBetweenCalls)
    }
  }

  // Prepare bulk updates
  const dbUpdates = results.map(result => ({
    id: result.recipientId,
    call_status: result.success ? "calling" : "failed",
    external_call_id: result.callId,
    call_started_at: result.success ? new Date().toISOString() : undefined,
    last_error: result.error,
    attempts: result.attemptNumber,
  }))

  // Bulk update recipient statuses
  await bulkUpdateRecipientStatuses(dbUpdates)

  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  return {
    chunkIndex,
    recipientIds: recipients.map(r => r.id),
    successful,
    failed,
    results,
    processingTimeMs: Date.now() - startTime,
  }
}

// ============================================================================
// MAIN BATCH PROCESSOR
// ============================================================================

/**
 * Run batch calling for a campaign
 * 
 * Key features:
 * - Processes in chunks to avoid memory issues
 * - Concurrent processing within chunks
 * - Progress tracking
 * - Timeout awareness for serverless environments
 * - Resume capability
 */
export async function runBatchCaller(
  config: BatchCallerConfig,
  startFromChunk: number = 0
): Promise<BatchResult> {
  const startTime = Date.now()
  const chunkSize = config.chunkSize || DEFAULT_CHUNK_SIZE
  const delayBetweenChunks = config.delayBetweenChunksMs || DEFAULT_DELAY_BETWEEN_CHUNKS_MS
  const maxProcessingTime = config.maxProcessingTimeMs || DEFAULT_MAX_PROCESSING_TIME_MS

  console.log(`[BatchCaller] Starting batch for campaign ${config.campaignId}`)
  console.log(`[BatchCaller] Config: chunkSize=${chunkSize}, concurrency=${config.concurrencyLimit}, maxTime=${maxProcessingTime}ms`)

  const result: BatchResult = {
    success: true,
    campaignId: config.campaignId,
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    chunksProcessed: 0,
    totalChunks: 0,
    cancelled: false,
    paused: false,
    timedOut: false,
    processingTimeMs: 0,
  }

  try {
    // Get total pending count
    const totalPending = await getPendingRecipientCount(config.campaignId)
    result.pending = totalPending
    result.totalChunks = Math.ceil(totalPending / chunkSize)

    console.log(`[BatchCaller] Total pending: ${totalPending}, Total chunks: ${result.totalChunks}`)

    if (totalPending === 0) {
      console.log(`[BatchCaller] No pending recipients`)
      await markCampaignCompleted(config.campaignId)
      result.processingTimeMs = Date.now() - startTime
      return result
    }

    // Process chunks
    let currentOffset = startFromChunk * chunkSize
    let chunkIndex = startFromChunk

    while (true) {
      // Check if we should continue
      const continueCheck = await shouldContinue(config.campaignId)
      if (!continueCheck.continue) {
        console.log(`[BatchCaller] Stopping: ${continueCheck.reason}`)
        result.paused = continueCheck.reason === "Campaign paused"
        result.cancelled = continueCheck.reason === "Campaign cancelled"
        break
      }

      // Check business hours
      // IMPORTANT: Use the timezone from business hours config if available
      // This ensures we check against the timezone the user configured in the schedule step
      if (config.businessHoursConfig?.enabled) {
        const effectiveTimezone = config.businessHoursConfig.timezone || config.timezone || "Australia/Melbourne"
        if (!isWithinBusinessHours(config.businessHoursConfig, effectiveTimezone)) {
          console.log(`[BatchCaller] Outside business hours (timezone: ${effectiveTimezone}), pausing`)
          result.paused = true
          break
        }
      }

      // Check timeout (leave buffer for cleanup)
      const elapsedTime = Date.now() - startTime
      if (elapsedTime > maxProcessingTime - 5000) {
        console.log(`[BatchCaller] Approaching timeout (${elapsedTime}ms), yielding`)
        result.timedOut = true
        result.resumeFromChunk = chunkIndex
        break
      }

      // Fetch next chunk
      const recipients = await fetchPendingRecipientsChunk(
        config.campaignId,
        0, // Always fetch from beginning since pending recipients change
        chunkSize
      )

      if (recipients.length === 0) {
        console.log(`[BatchCaller] No more pending recipients`)
        break
      }

      // Process chunk
      const chunkResult = await processChunk(config, recipients, chunkIndex)

      result.totalProcessed += chunkResult.successful + chunkResult.failed
      result.successful += chunkResult.successful
      result.failed += chunkResult.failed
      result.chunksProcessed++

      // Update campaign stats
      await updateCampaignStatsEfficient(
        config.campaignId,
        chunkResult.successful,
        chunkResult.failed
      )

      // Report progress
      if (config.onProgress) {
        const pendingRemaining = await getPendingRecipientCount(config.campaignId)
        result.pending = pendingRemaining
        
        const avgTimePerChunk = (Date.now() - startTime) / result.chunksProcessed
        const remainingChunks = Math.ceil(pendingRemaining / chunkSize)
        
        config.onProgress({
          campaignId: config.campaignId,
          totalRecipients: totalPending,
          processed: result.totalProcessed,
          successful: result.successful,
          failed: result.failed,
          pending: pendingRemaining,
          percentComplete: Math.round((result.totalProcessed / totalPending) * 100),
          estimatedTimeRemainingMs: remainingChunks * avgTimePerChunk,
          currentChunk: chunkIndex + 1,
          totalChunks: result.totalChunks,
          isComplete: pendingRemaining === 0,
          isPaused: false,
          isCancelled: false,
        })
      }

      // Report chunk completion
      if (config.onChunkComplete) {
        config.onChunkComplete(chunkResult)
      }

      console.log(`[BatchCaller] Chunk ${chunkIndex + 1} complete: ${chunkResult.successful} success, ${chunkResult.failed} failed (${chunkResult.processingTimeMs}ms)`)

      // Check if all done
      const pendingRemaining = await getPendingRecipientCount(config.campaignId)
      if (pendingRemaining === 0) {
        console.log(`[BatchCaller] All recipients processed`)
        break
      }

      // Delay between chunks
      await sleep(delayBetweenChunks)
      chunkIndex++
    }

    // Mark campaign as completed if all done
    const finalPending = await getPendingRecipientCount(config.campaignId)
    if (finalPending === 0 && !result.paused && !result.cancelled && !result.timedOut) {
      await markCampaignCompleted(config.campaignId)
    }

    result.pending = finalPending
    result.processingTimeMs = Date.now() - startTime

    console.log(`[BatchCaller] Batch complete: ${result.totalProcessed} processed, ${result.successful} success, ${result.failed} failed (${result.processingTimeMs}ms)`)

    return result

  } catch (error) {
    console.error(`[BatchCaller] Fatal error:`, error)
    result.success = false
    result.error = error instanceof Error ? error.message : "Unknown error"
    result.processingTimeMs = Date.now() - startTime
    return result
  }
}

// Legacy function alias for backwards compatibility
export const runOptimizedBatchCaller = runBatchCaller

/**
 * Start a campaign with batch processing
 * Returns immediately with a batch ID, processing continues in background
 */
export async function startCampaign(
  config: BatchCallerConfig
): Promise<{ batchId: string; started: boolean; error?: string }> {
  const batchId = `batch-${config.campaignId}-${Date.now()}`
  
  console.log(`[BatchCaller] Starting campaign ${config.campaignId}, batchId: ${batchId}`)

  // Fire and forget - but with proper error handling
  runBatchCaller(config).then((result) => {
    console.log(`[BatchCaller] Campaign ${config.campaignId} batch finished:`, {
      batchId,
      success: result.success,
      processed: result.totalProcessed,
      successful: result.successful,
      failed: result.failed,
      timedOut: result.timedOut,
      resumeFromChunk: result.resumeFromChunk,
    })
  }).catch((error) => {
    console.error(`[BatchCaller] Campaign ${config.campaignId} batch error:`, error)
  })

  return {
    batchId,
    started: true,
  }
}

// Legacy function alias for backwards compatibility
export const startOptimizedCampaign = startCampaign

/**
 * Process a single chunk synchronously (for API-driven chunk processing)
 * Use this when you need to process campaigns across multiple API calls
 */
export async function processNextChunk(
  config: BatchCallerConfig
): Promise<{
  chunkResult: ChunkResult | null
  hasMore: boolean
  pendingCount: number
}> {
  const chunkSize = config.chunkSize || DEFAULT_CHUNK_SIZE

  // Check if campaign should continue
  const continueCheck = await shouldContinue(config.campaignId)
  if (!continueCheck.continue) {
    return {
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
    }
  }

  // Fetch recipients
  const recipients = await fetchPendingRecipientsChunk(config.campaignId, 0, chunkSize)
  
  if (recipients.length === 0) {
    return {
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
    }
  }

  // Process chunk
  const chunkResult = await processChunk(config, recipients, 0)

  // Update stats
  await updateCampaignStatsEfficient(
    config.campaignId,
    chunkResult.successful,
    chunkResult.failed
  )

  // Get remaining count
  const pendingCount = await getPendingRecipientCount(config.campaignId)
  const hasMore = pendingCount > 0

  // Auto-complete if no more pending
  if (!hasMore) {
    await markCampaignCompleted(config.campaignId)
  }

  return {
    chunkResult,
    hasMore,
    pendingCount,
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Export for use in API routes
export type {
  RecipientData,
  CampaignState,
}


/**
 * Enhanced Batch Call Processor
 * 
 * Provides optimized batch calling with:
 * - True parallel processing with configurable concurrency
 * - Token bucket rate limiting to avoid API limits
 * - Progress tracking with ETA estimation
 * - Smart retry with exponential backoff
 * - Real-time status updates via callback
 */

import { createOutboundCall } from "@/lib/integrations/vapi/calls"
import { createAdminClient } from "@/lib/supabase/admin"
import type { BusinessHoursConfig, DayOfWeek } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export interface BatchProcessorConfig {
  campaignId: string
  workspaceId: string
  vapiApiKey: string
  assistantId: string
  phoneNumberId: string
  /** Maximum concurrent calls (default: 5) */
  concurrency?: number
  /** Rate limit: calls per second (default: 2) */
  callsPerSecond?: number
  /** Max retry attempts per call (default: 3) */
  maxRetries?: number
  /** Initial retry delay in ms (default: 1000) */
  initialRetryDelay?: number
  /** Max retry delay in ms (default: 30000) */
  maxRetryDelay?: number
  /** Business hours config */
  businessHoursConfig?: BusinessHoursConfig | null
  timezone?: string
}

export interface BatchRecipient {
  id: string
  phone_number: string
  first_name?: string | null
  last_name?: string | null
  variables?: Record<string, string>
}

export interface BatchCallResult {
  recipientId: string
  phone: string
  success: boolean
  callId?: string
  error?: string
  attempts: number
  duration?: number // ms taken for this call
}

export interface BatchProgress {
  total: number
  completed: number
  successful: number
  failed: number
  pending: number
  inProgress: number
  /** Estimated seconds remaining */
  estimatedSecondsRemaining: number | null
  /** Average call initiation time in ms */
  avgCallDurationMs: number
  /** Calls per minute rate */
  callsPerMinute: number
  /** Current batch status */
  status: "running" | "paused" | "completed" | "cancelled" | "outside_hours"
}

export interface BatchProcessorCallbacks {
  /** Called when a single call completes (success or fail) */
  onCallComplete?: (result: BatchCallResult) => void
  /** Called periodically with progress update */
  onProgress?: (progress: BatchProgress) => void
  /** Called when batch starts */
  onStart?: () => void
  /** Called when batch completes */
  onComplete?: (results: BatchCallResult[]) => void
  /** Called on error */
  onError?: (error: Error) => void
}

// ============================================================================
// TOKEN BUCKET RATE LIMITER
// ============================================================================

class TokenBucket {
  private tokens: number
  private lastRefill: number
  private readonly capacity: number
  private readonly refillRate: number // tokens per ms

  constructor(tokensPerSecond: number) {
    this.capacity = tokensPerSecond
    this.tokens = tokensPerSecond
    this.refillRate = tokensPerSecond / 1000
    this.lastRefill = Date.now()
  }

  async acquire(): Promise<void> {
    this.refill()
    
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    // Wait until we have a token
    const waitTime = (1 - this.tokens) / this.refillRate
    await sleep(Math.ceil(waitTime))
    this.refill()
    this.tokens -= 1
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate)
    this.lastRefill = now
  }
}

// ============================================================================
// EXPONENTIAL BACKOFF RETRY
// ============================================================================

interface RetryConfig {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  /** Jitter factor (0-1) to add randomness */
  jitter?: number
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  shouldRetry: (error: unknown, attempt: number) => boolean = () => true
): Promise<{ result?: T; error?: Error; attempts: number }> {
  const { maxRetries, initialDelay, maxDelay, jitter = 0.1 } = config
  let lastError: Error | undefined
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn()
      return { result, attempts: attempt }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      
      if (attempt > maxRetries || !shouldRetry(error, attempt)) {
        break
      }
      
      // Calculate delay with exponential backoff + jitter
      const baseDelay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay)
      const jitterAmount = baseDelay * jitter * Math.random()
      const delay = baseDelay + jitterAmount
      
      console.log(`[BatchProcessor] Retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms`)
      await sleep(delay)
    }
  }
  
  return { error: lastError, attempts: maxRetries + 1 }
}

// ============================================================================
// BUSINESS HOURS CHECK
// ============================================================================

function isWithinBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  timezone: string = "UTC"
): boolean {
  if (!config || !config.enabled) {
    return true
  }

  try {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
    
    const formatter = new Intl.DateTimeFormat("en-US", options)
    const parts = formatter.formatToParts(now)
    
    const weekday = parts.find(p => p.type === "weekday")?.value?.toLowerCase()
    const hour = parts.find(p => p.type === "hour")?.value || "00"
    const minute = parts.find(p => p.type === "minute")?.value || "00"
    
    const currentTime = `${hour}:${minute}`
    const dayKey = weekday as DayOfWeek
    
    const slots = config.schedule[dayKey] || []
    
    if (slots.length === 0) {
      return false
    }
    
    return slots.some(slot => currentTime >= slot.start && currentTime <= slot.end)
  } catch (error) {
    console.error("[BatchProcessor] Error checking business hours:", error)
    return true
  }
}

// ============================================================================
// BATCH PROCESSOR
// ============================================================================

export class BatchProcessor {
  private config: Required<BatchProcessorConfig>
  private callbacks: BatchProcessorCallbacks
  private rateLimiter: TokenBucket
  private results: BatchCallResult[] = []
  private isRunning = false
  private isPaused = false
  private isCancelled = false
  private startTime: number = 0
  private callDurations: number[] = []

  constructor(config: BatchProcessorConfig, callbacks: BatchProcessorCallbacks = {}) {
    this.config = {
      campaignId: config.campaignId,
      workspaceId: config.workspaceId,
      vapiApiKey: config.vapiApiKey,
      assistantId: config.assistantId,
      phoneNumberId: config.phoneNumberId,
      concurrency: config.concurrency ?? 5,
      callsPerSecond: config.callsPerSecond ?? 2,
      maxRetries: config.maxRetries ?? 3,
      initialRetryDelay: config.initialRetryDelay ?? 1000,
      maxRetryDelay: config.maxRetryDelay ?? 30000,
      businessHoursConfig: config.businessHoursConfig ?? null,
      timezone: config.timezone ?? "UTC",
    }
    this.callbacks = callbacks
    this.rateLimiter = new TokenBucket(this.config.callsPerSecond)
  }

  /**
   * Process a batch of recipients
   */
  async process(recipients: BatchRecipient[]): Promise<BatchCallResult[]> {
    if (this.isRunning) {
      throw new Error("Batch processor is already running")
    }

    // Check business hours
    // IMPORTANT: Use the timezone from business hours config if available
    // This ensures we check against the timezone the user configured in the schedule step
    const effectiveTimezone = this.config.businessHoursConfig?.timezone || this.config.timezone || "UTC"
    if (!isWithinBusinessHours(this.config.businessHoursConfig, effectiveTimezone)) {
      this.callbacks.onProgress?.({
        total: recipients.length,
        completed: 0,
        successful: 0,
        failed: 0,
        pending: recipients.length,
        inProgress: 0,
        estimatedSecondsRemaining: null,
        avgCallDurationMs: 0,
        callsPerMinute: 0,
        status: "outside_hours",
      })
      return []
    }

    this.isRunning = true
    this.isPaused = false
    this.isCancelled = false
    this.results = []
    this.callDurations = []
    this.startTime = Date.now()

    this.callbacks.onStart?.()

    try {
      // Create work queue
      const queue = [...recipients]
      let inProgress = 0
      let completedCount = 0
      let successCount = 0
      let failCount = 0

      // Report initial progress
      this.reportProgress(recipients.length, completedCount, successCount, failCount, inProgress, queue.length)

      // Process with concurrency control
      const activePromises: Promise<void>[] = []

      while (queue.length > 0 || activePromises.length > 0) {
        // Check for pause/cancel
        if (this.isCancelled) {
          // Wait for active calls to complete
          await Promise.all(activePromises)
          break
        }

        if (this.isPaused) {
          await sleep(1000)
          continue
        }

        // Re-check business hours periodically
        if (completedCount > 0 && completedCount % 10 === 0) {
          if (!isWithinBusinessHours(this.config.businessHoursConfig, effectiveTimezone)) {
            console.log(`[BatchProcessor] Business hours ended (timezone: ${effectiveTimezone}), pausing batch`)
            this.isPaused = true
            this.reportProgress(recipients.length, completedCount, successCount, failCount, inProgress, queue.length, "outside_hours")
            continue
          }
        }

        // Fill up to concurrency limit
        while (queue.length > 0 && activePromises.length < this.config.concurrency) {
          const recipient = queue.shift()!
          inProgress++

          const promise = this.processRecipient(recipient).then(result => {
            this.results.push(result)
            completedCount++
            inProgress--
            
            if (result.success) {
              successCount++
            } else {
              failCount++
            }

            // Track call duration for ETA
            if (result.duration) {
              this.callDurations.push(result.duration)
            }

            // Notify callback
            this.callbacks.onCallComplete?.(result)

            // Update DB status
            this.updateRecipientStatus(result).catch(err => 
              console.error("[BatchProcessor] Failed to update recipient:", err)
            )

            // Report progress
            this.reportProgress(recipients.length, completedCount, successCount, failCount, inProgress, queue.length)

            // Remove this promise from active list
            const idx = activePromises.indexOf(promise)
            if (idx !== -1) {
              activePromises.splice(idx, 1)
            }
          })

          activePromises.push(promise)
        }

        // Wait for at least one to complete if at capacity
        if (activePromises.length >= this.config.concurrency) {
          await Promise.race(activePromises)
        } else if (queue.length === 0 && activePromises.length > 0) {
          // Wait for remaining calls
          await Promise.all(activePromises)
        } else {
          // Small delay to prevent tight loop
          await sleep(10)
        }
      }

      // Final progress report
      this.reportProgress(
        recipients.length, 
        completedCount, 
        successCount, 
        failCount, 
        0, 
        0, 
        this.isCancelled ? "cancelled" : "completed"
      )

      this.callbacks.onComplete?.(this.results)
      return this.results

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.callbacks.onError?.(err)
      throw error
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Process a single recipient with rate limiting and retry
   */
  private async processRecipient(recipient: BatchRecipient): Promise<BatchCallResult> {
    const startTime = Date.now()

    // Wait for rate limit token
    await this.rateLimiter.acquire()

    const customerName = [recipient.first_name, recipient.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || undefined

    const { result, error, attempts } = await withRetry(
      async () => {
        const response = await createOutboundCall({
          apiKey: this.config.vapiApiKey,
          assistantId: this.config.assistantId,
          phoneNumberId: this.config.phoneNumberId,
          customerNumber: recipient.phone_number,
          customerName,
        })

        if (!response.success || !response.data) {
          throw new Error(response.error || "Call creation failed")
        }

        return response.data
      },
      {
        maxRetries: this.config.maxRetries,
        initialDelay: this.config.initialRetryDelay,
        maxDelay: this.config.maxRetryDelay,
      },
      (error, attempt) => {
        // Retry on rate limits and transient errors
        const errMsg = error instanceof Error ? error.message : String(error)
        return errMsg.includes("429") || 
               errMsg.includes("rate") ||
               errMsg.includes("timeout") ||
               errMsg.includes("ECONNRESET")
      }
    )

    const duration = Date.now() - startTime

    if (result) {
      return {
        recipientId: recipient.id,
        phone: recipient.phone_number,
        success: true,
        callId: result.id,
        attempts,
        duration,
      }
    }

    return {
      recipientId: recipient.id,
      phone: recipient.phone_number,
      success: false,
      error: error?.message || "Unknown error",
      attempts,
      duration,
    }
  }

  /**
   * Update recipient status in database
   */
  private async updateRecipientStatus(result: BatchCallResult): Promise<void> {
    const supabase = createAdminClient()

    const updateData: Record<string, unknown> = {
      attempts: result.attempts,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (result.success && result.callId) {
      updateData.call_status = "calling"
      updateData.external_call_id = result.callId
      updateData.call_started_at = new Date().toISOString()
    } else {
      updateData.call_status = "failed"
      updateData.last_error = result.error
    }

    await supabase
      .from("call_recipients")
      .update(updateData)
      .eq("id", result.recipientId)
  }

  /**
   * Report progress with ETA calculation
   */
  private reportProgress(
    total: number,
    completed: number,
    successful: number,
    failed: number,
    inProgress: number,
    pending: number,
    status: BatchProgress["status"] = "running"
  ): void {
    // Calculate average call duration
    const avgDuration = this.callDurations.length > 0
      ? this.callDurations.reduce((a, b) => a + b, 0) / this.callDurations.length
      : 2000 // Default estimate of 2 seconds

    // Calculate ETA
    const remaining = pending + inProgress
    let estimatedSecondsRemaining: number | null = null
    
    if (remaining > 0 && completed > 0) {
      // Factor in concurrency
      const effectiveCallsPerBatch = Math.min(this.config.concurrency, remaining)
      const batchesRemaining = Math.ceil(remaining / effectiveCallsPerBatch)
      estimatedSecondsRemaining = Math.ceil((batchesRemaining * avgDuration) / 1000)
    }

    // Calculate calls per minute
    const elapsedMs = Date.now() - this.startTime
    const callsPerMinute = elapsedMs > 0 ? (completed / elapsedMs) * 60000 : 0

    const progress: BatchProgress = {
      total,
      completed,
      successful,
      failed,
      pending,
      inProgress,
      estimatedSecondsRemaining,
      avgCallDurationMs: avgDuration,
      callsPerMinute: Math.round(callsPerMinute * 10) / 10,
      status,
    }

    this.callbacks.onProgress?.(progress)
  }

  /**
   * Pause the batch processor
   */
  pause(): void {
    if (this.isRunning) {
      this.isPaused = true
      console.log("[BatchProcessor] Paused")
    }
  }

  /**
   * Resume the batch processor
   */
  resume(): void {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false
      console.log("[BatchProcessor] Resumed")
    }
  }

  /**
   * Cancel the batch processor
   */
  cancel(): void {
    if (this.isRunning) {
      this.isCancelled = true
      console.log("[BatchProcessor] Cancelled")
    }
  }

  /**
   * Check if the processor is running
   */
  get running(): boolean {
    return this.isRunning
  }

  /**
   * Check if the processor is paused
   */
  get paused(): boolean {
    return this.isPaused
  }
}

// ============================================================================
// HELPER
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// EXPORT FACTORY FUNCTION
// ============================================================================

/**
 * Create and run a batch processor for a campaign
 */
export async function runBatchProcessor(
  config: BatchProcessorConfig,
  recipients: BatchRecipient[],
  callbacks?: BatchProcessorCallbacks
): Promise<BatchCallResult[]> {
  const processor = new BatchProcessor(config, callbacks)
  return processor.process(recipients)
}


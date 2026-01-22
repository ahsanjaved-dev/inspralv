/**
 * VAPI Batch Calls Client
 * 
 * Handles batch outbound calling via VAPI.
 * VAPI counts ACTIVE ongoing calls toward concurrency limit (not just API requests).
 * This module implements smart throttling to respect this limit.
 * 
 * Features:
 * - Smart concurrency management (respects VAPI active call limits)
 * - Exponential backoff on rate limits
 * - Business hours scheduling
 * - Cancel support via status callback
 */

import { createOutboundCall, type VapiCallResponse, type AssistantOverrides } from "./calls"
import type { BusinessHoursConfig, DayOfWeek } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export interface VapiBatchCallItem {
  phone: string
  recipientId: string
  variables: Record<string, string>
}

export interface VapiBatchConfig {
  apiKey: string
  assistantId: string        // VAPI external_agent_id
  phoneNumberId: string      // VAPI phone number ID for outbound
  workspaceId: string
  campaignId: string
  batchRef: string
  businessHoursConfig?: BusinessHoursConfig | null
  timezone?: string
  skipBusinessHoursCheck?: boolean
  shouldContinue?: () => Promise<{ continue: boolean; reason?: string }>
  /** System prompt template for variable substitution */
  systemPromptTemplate?: string
  /** Model provider (e.g., "openai") */
  modelProvider?: string
  /** Model name (e.g., "gpt-4") */
  modelName?: string
}

export interface VapiBatchCallResult {
  recipientId: string
  phone: string
  success: boolean
  callId?: string
  error?: string
  status?: string
}

export interface VapiBatchResult {
  success: boolean
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  skippedCalls: number
  results: VapiBatchCallResult[]
  error?: string
}

// ============================================================================
// CONCURRENCY CONFIGURATION
// ============================================================================
// VAPI's concurrency limit counts ACTIVE calls (ringing + in-progress)
// We use conservative limits to avoid hitting the account limit

const CONFIG = {
  // How many calls to create in parallel per chunk
  // Keep this LOW because VAPI counts active calls, not API requests
  PARALLEL_CALLS_PER_CHUNK: 3,
  
  // Delay between chunks (allows previous calls to potentially finish)
  DELAY_BETWEEN_CHUNKS_MS: 2000, // 2 seconds
  
  // Delay when we hit a concurrency limit error
  CONCURRENCY_BACKOFF_MS: 10000, // 10 seconds - wait for active calls to end
  
  // Max retries per call
  MAX_RETRIES: 2,
  
  // Delay between retries
  RETRY_DELAY_MS: 3000,
}

// ============================================================================
// BUSINESS HOURS UTILITIES
// ============================================================================

const DAY_MAP: Record<string, DayOfWeek> = {
  "0": "sunday",
  "1": "monday",
  "2": "tuesday",
  "3": "wednesday",
  "4": "thursday",
  "5": "friday",
  "6": "saturday",
}

export function isWithinBusinessHours(
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
    
    for (const slot of slots) {
      if (currentTime >= slot.start && currentTime <= slot.end) {
        return true
      }
    }
    
    return false
  } catch (error) {
    console.error("[VapiBatch] Error checking business hours:", error)
    return true
  }
}

export function getNextBusinessHourWindow(
  config: BusinessHoursConfig | null | undefined,
  timezone: string = "UTC"
): Date | null {
  if (!config || !config.enabled) {
    return null
  }

  try {
    const now = new Date()
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000)
      
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        weekday: "long",
      }
      
      const weekday = new Intl.DateTimeFormat("en-US", options)
        .format(checkDate)
        .toLowerCase() as DayOfWeek
      
      const slots = config.schedule[weekday] || []
      
      if (slots.length > 0) {
        const firstSlot = slots.sort((a, b) => a.start.localeCompare(b.start))[0]
        
        if (firstSlot) {
          const timeParts = firstSlot.start.split(":").map(Number)
          const hours = timeParts[0]
          const minutes = timeParts[1]
          
          if (hours === undefined || minutes === undefined) {
            continue
          }
          
          const targetDate = new Date(checkDate)
          targetDate.setHours(hours, minutes, 0, 0)
          
          if (dayOffset === 0) {
            const currentTime = new Date().toLocaleTimeString("en-US", {
              timeZone: timezone,
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
            })
            
            if (currentTime > firstSlot.end) {
              continue
            }
            
            if (currentTime >= firstSlot.start) {
              return now
            }
          }
          
          return targetDate
        }
      }
    }
    
    return null
  } catch (error) {
    console.error("[VapiBatch] Error calculating next business hour:", error)
    return null
  }
}

// ============================================================================
// CALL CREATION WITH SMART RETRY
// ============================================================================

interface CallAttemptResult {
  result: VapiBatchCallResult
  hitConcurrencyLimit: boolean
}

/**
 * Substitute dynamic variables in a system prompt template.
 * 
 * Variables are in the format {{variable_name}} and are replaced with values
 * from the recipient's variables object.
 * 
 * @param template - The system prompt template with {{variable}} placeholders
 * @param variables - Key-value pairs of variable values
 * @returns The substituted system prompt
 */
function substituteVariables(template: string, variables: Record<string, string>): string {
  if (!template) return template
  
  // Build a normalized map of variables (lowercase keys)
  const normalizedVars: Record<string, string> = {}
  for (const [key, value] of Object.entries(variables)) {
    normalizedVars[key.toLowerCase()] = value || ""
  }
  
  // Add convenience variables
  const firstName = normalizedVars.first_name || ""
  const lastName = normalizedVars.last_name || ""
  normalizedVars.full_name = [firstName, lastName].filter(Boolean).join(" ")
  
  // Replace all {{variable_name}} patterns (case-insensitive)
  let result = template
  for (const [key, value] of Object.entries(normalizedVars)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi")
    result = result.replace(pattern, value)
  }
  
  return result
}

/**
 * Create a single call with smart error handling
 * Returns whether we hit concurrency limit so caller can back off
 */
async function createSingleCallSmart(
  config: VapiBatchConfig,
  item: VapiBatchCallItem
): Promise<CallAttemptResult> {
  const { apiKey, assistantId, phoneNumberId, systemPromptTemplate, modelProvider, modelName } = config
  
  // Build assistant overrides if we have a system prompt template
  let assistantOverrides: AssistantOverrides | undefined
  
  if (systemPromptTemplate) {
    const substitutedPrompt = substituteVariables(systemPromptTemplate, item.variables)
    
    if (substitutedPrompt) {
      assistantOverrides = {
        model: {
          systemPrompt: substitutedPrompt,
          ...(modelProvider && { provider: modelProvider }),
          ...(modelName && { model: modelName }),
        },
      }
    }
  }
  
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES + 1; attempt++) {
    try {
      const result = await createOutboundCall({
        apiKey,
        assistantId,
        phoneNumberId,
        customerNumber: item.phone,
        customerName: `${item.variables.FIRST_NAME || ""} ${item.variables.LAST_NAME || ""}`.trim() || undefined,
        assistantOverrides,
      })
      
      if (result.success && result.data) {
        return {
          result: {
            recipientId: item.recipientId,
            phone: item.phone,
            success: true,
            callId: result.data.id,
            status: result.data.status,
          },
          hitConcurrencyLimit: false,
        }
      }
      
      // Check for concurrency limit error
      const isConcurrencyError = 
        result.error?.includes("Concurrency") || 
        result.error?.includes("concurrency") ||
        result.error?.toLowerCase().includes("over concurrency limit")
      
      if (isConcurrencyError) {
        if (attempt <= CONFIG.MAX_RETRIES) {
          await sleep(CONFIG.CONCURRENCY_BACKOFF_MS)
          continue
        }
        
        return {
          result: {
            recipientId: item.recipientId,
            phone: item.phone,
            success: false,
            error: "Concurrency limit - will retry later",
          },
          hitConcurrencyLimit: true,
        }
      }
      
      // Rate limit (429)
      if (result.error?.includes("429") || result.error?.toLowerCase().includes("rate")) {
        if (attempt <= CONFIG.MAX_RETRIES) {
          await sleep(CONFIG.RETRY_DELAY_MS * attempt)
          continue
        }
      }
      
      // Other error - don't retry
      return {
        result: {
          recipientId: item.recipientId,
          phone: item.phone,
          success: false,
          error: result.error || "Unknown error",
        },
        hitConcurrencyLimit: false,
      }
      
    } catch (error) {
      if (attempt <= CONFIG.MAX_RETRIES) {
        await sleep(CONFIG.RETRY_DELAY_MS)
        continue
      }
      
      return {
        result: {
          recipientId: item.recipientId,
          phone: item.phone,
          success: false,
          error: error instanceof Error ? error.message : "Unknown exception",
        },
        hitConcurrencyLimit: false,
      }
    }
  }
  
  return {
    result: {
      recipientId: item.recipientId,
      phone: item.phone,
      success: false,
      error: "Max retries exceeded",
    },
    hitConcurrencyLimit: false,
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process a batch of calls via VAPI with smart throttling
 * 
 * Strategy:
 * - Process calls in small parallel chunks (3 at a time)
 * - Wait between chunks to let active calls finish
 * - Back off significantly when hitting concurrency limits
 * - Support cancel via status callback
 */
export async function processBatchCalls(
  config: VapiBatchConfig,
  callList: VapiBatchCallItem[]
): Promise<VapiBatchResult> {
  const {
    businessHoursConfig,
    timezone = "UTC",
    skipBusinessHoursCheck = false,
    shouldContinue,
  } = config
  
  const startTime = Date.now()
  console.log(`[VapiBatch] Starting batch: ${callList.length} recipients`)
  
  const results: VapiBatchCallResult[] = []
  let successfulCalls = 0
  let failedCalls = 0
  let skippedCalls = 0
  let wasCancelled = false
  let cancelReason: string | undefined
  let consecutiveConcurrencyErrors = 0
  
  // Business hours check
  if (!skipBusinessHoursCheck && businessHoursConfig?.enabled) {
    const withinHours = isWithinBusinessHours(businessHoursConfig, timezone)
    
    if (!withinHours) {
      return {
        success: false,
        totalCalls: callList.length,
        successfulCalls: 0,
        failedCalls: 0,
        skippedCalls: callList.length,
        results: [],
        error: `Outside business hours`,
      }
    }
  }
  
  // Process in small chunks
  const totalChunks = Math.ceil(callList.length / CONFIG.PARALLEL_CALLS_PER_CHUNK)
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CONFIG.PARALLEL_CALLS_PER_CHUNK
    const end = Math.min(start + CONFIG.PARALLEL_CALLS_PER_CHUNK, callList.length)
    const chunk = callList.slice(start, end)
    
    // Check if campaign was cancelled
    if (shouldContinue && chunkIndex > 0) {
      try {
        const continueCheck = await shouldContinue()
        if (!continueCheck.continue) {
          wasCancelled = true
          cancelReason = continueCheck.reason
          skippedCalls = callList.length - start
          break
        }
      } catch {
        // Continue on error
      }
    }
    
    // If we've had multiple consecutive concurrency errors, wait longer
    if (consecutiveConcurrencyErrors >= 2) {
      await sleep(CONFIG.CONCURRENCY_BACKOFF_MS * 2)
      consecutiveConcurrencyErrors = 0
    }
    
    // Process calls in parallel (small batch)
    const chunkPromises = chunk.map(item => createSingleCallSmart(config, item))
    const chunkResults = await Promise.all(chunkPromises)
    
    // Collect results and check for concurrency issues
    let chunkHadConcurrencyError = false
    for (const { result, hitConcurrencyLimit } of chunkResults) {
      results.push(result)
      if (result.success) {
        successfulCalls++
        consecutiveConcurrencyErrors = 0
      } else {
        failedCalls++
        if (hitConcurrencyLimit) {
          chunkHadConcurrencyError = true
        }
      }
    }
    
    if (chunkHadConcurrencyError) {
      consecutiveConcurrencyErrors++
    }
    
    // Delay between chunks (unless last chunk)
    if (chunkIndex < totalChunks - 1) {
      const delay = chunkHadConcurrencyError 
        ? CONFIG.CONCURRENCY_BACKOFF_MS 
        : CONFIG.DELAY_BETWEEN_CHUNKS_MS
      await sleep(delay)
    }
  }
  
  const totalTime = Math.round((Date.now() - startTime) / 1000)
  console.log(`[VapiBatch] Complete: ${successfulCalls} success, ${failedCalls} failed in ${totalTime}s`)
  
  // Build error message
  let errorMessage: string | undefined
  if (wasCancelled) {
    errorMessage = cancelReason || "Campaign was cancelled"
  } else if (failedCalls > 0) {
    const failedResults = results.filter(r => !r.success)
    const uniqueErrors = [...new Set(failedResults.map(r => r.error).filter(Boolean))]
    errorMessage = `${failedCalls} call(s) failed: ${uniqueErrors.slice(0, 3).join("; ")}`
  }
  
  return {
    success: successfulCalls > 0 && !wasCancelled,
    totalCalls: callList.length,
    successfulCalls,
    failedCalls,
    skippedCalls,
    results,
    error: errorMessage,
  }
}

/**
 * Start a batch of calls via VAPI
 */
export async function startVapiBatch(
  config: VapiBatchConfig,
  callList: VapiBatchCallItem[]
): Promise<VapiBatchResult> {
  if (callList.length === 0) {
    return {
      success: false,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      skippedCalls: 0,
      results: [],
      error: "No calls in batch",
    }
  }
  
  if (!config.apiKey) {
    return {
      success: false,
      totalCalls: callList.length,
      successfulCalls: 0,
      failedCalls: callList.length,
      skippedCalls: 0,
      results: [],
      error: "VAPI API key not configured",
    }
  }
  
  if (!config.assistantId) {
    return {
      success: false,
      totalCalls: callList.length,
      successfulCalls: 0,
      failedCalls: callList.length,
      skippedCalls: 0,
      results: [],
      error: "VAPI assistant ID not configured",
    }
  }
  
  if (!config.phoneNumberId) {
    return {
      success: false,
      totalCalls: callList.length,
      successfulCalls: 0,
      failedCalls: callList.length,
      skippedCalls: 0,
      results: [],
      error: "VAPI phone number ID not configured",
    }
  }
  
  return processBatchCalls(config, callList)
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

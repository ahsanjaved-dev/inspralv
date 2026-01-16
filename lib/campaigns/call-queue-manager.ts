/**
 * Call Queue Manager
 * 
 * A scalable, webhook-driven approach to managing campaign calls.
 * 
 * KEY INSIGHT: VAPI's concurrency limit counts ACTIVE calls (ringing + in-progress),
 * not API requests. This means we need to:
 * 
 * 1. Queue all calls in the database
 * 2. Start only a few calls at a time (respecting concurrency)
 * 3. When a call ENDS (via webhook), automatically start the next queued call
 * 
 * This creates a self-regulating flow that never exceeds concurrency limits
 * and doesn't require long-running serverless functions.
 * 
 * Flow:
 * ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
 * │ Start       │────▶│ Queue all   │────▶│ Start first │
 * │ Campaign    │     │ recipients  │     │ N calls     │
 * └─────────────┘     └─────────────┘     └─────────────┘
 *                                                │
 *                     ┌──────────────────────────┘
 *                     ▼
 *              ┌─────────────┐
 *              │ Call ends   │◀─────────┐
 *              │ (webhook)   │          │
 *              └─────────────┘          │
 *                     │                 │
 *                     ▼                 │
 *              ┌─────────────┐          │
 *              │ Start next  │──────────┘
 *              │ queued call │
 *              └─────────────┘
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { createOutboundCall } from "@/lib/integrations/vapi/calls"

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * STRICT MODE: Only start 1 call at a time when triggered by webhook
 * This prevents overwhelming VAPI's concurrency limit
 * 
 * Why? VAPI's remainingConcurrentCalls is unreliable and often returns -1
 * even when there are free slots. By starting only 1 call per webhook,
 * we ensure a 1-for-1 replacement that never exceeds actual capacity.
 */
const CALLS_TO_START_ON_WEBHOOK = 1

/**
 * Initial calls to start when campaign begins
 * This is the "seed" that gets the webhook chain going
 */
const INITIAL_CONCURRENT_CALLS = 3

/**
 * Maximum concurrent active calls per campaign (used for initial start only)
 */
const MAX_CONCURRENT_CALLS_PER_CAMPAIGN = 3

/**
 * Maximum concurrent active calls across all campaigns (account-wide)
 */
const MAX_CONCURRENT_CALLS_TOTAL = 5

/**
 * Delay between starting calls in a batch (ms)
 */
const DELAY_BETWEEN_CALLS_MS = 500

/**
 * How long to wait before considering a "calling" status as stale (minutes)
 */
const STALE_CALL_THRESHOLD_MINUTES = 10

/**
 * Cooldown period after hitting concurrency limit (ms)
 */
const CONCURRENCY_COOLDOWN_MS = 10000 // Increased to 10 seconds

/**
 * Maximum retries for concurrency limit before giving up on a webhook trigger
 */
const MAX_CONCURRENCY_RETRIES = 3

/**
 * Delay between concurrency retries (ms)
 */
const RETRY_DELAY_MS = 2000

// In-memory cooldown tracking (per campaign)
const campaignCooldowns: Map<string, number> = new Map()

// Track if this is an initial start vs webhook trigger
const isInitialStart: Map<string, boolean> = new Map()

// ============================================================================
// TYPES
// ============================================================================

export interface QueuedCall {
  recipientId: string
  campaignId: string
  workspaceId: string
  phone: string
  firstName?: string
  lastName?: string
}

export interface VapiConfig {
  apiKey: string
  assistantId: string
  phoneNumberId: string
}

export interface StartCallsResult {
  started: number
  failed: number
  remaining: number
  errors: string[]
  concurrencyHit?: boolean // True if we stopped due to VAPI concurrency limit
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get the count of currently active calls for a campaign
 * Active = "calling" status that isn't stale
 */
export async function getActiveCampaignCallCount(campaignId: string): Promise<number> {
  const adminClient = createAdminClient()
  
  // Calculate stale threshold
  const staleThreshold = new Date(Date.now() - STALE_CALL_THRESHOLD_MINUTES * 60 * 1000).toISOString()
  
  const { count, error } = await adminClient
    .from("call_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("call_status", "calling")
    .gt("call_started_at", staleThreshold)
  
  if (error) {
    console.error("[CallQueue] Error getting active call count:", error)
    return 0
  }
  
  return count || 0
}

/**
 * Get the count of currently active calls across ALL campaigns in a workspace
 */
export async function getActiveWorkspaceCallCount(workspaceId: string): Promise<number> {
  const adminClient = createAdminClient()
  
  const staleThreshold = new Date(Date.now() - STALE_CALL_THRESHOLD_MINUTES * 60 * 1000).toISOString()
  
  const { count, error } = await adminClient
    .from("call_recipients")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("call_status", "calling")
    .gt("call_started_at", staleThreshold)
  
  if (error) {
    console.error("[CallQueue] Error getting workspace call count:", error)
    return 0
  }
  
  return count || 0
}

/**
 * Get the next batch of pending recipients to call
 */
export async function getNextPendingRecipients(
  campaignId: string,
  limit: number
): Promise<QueuedCall[]> {
  const adminClient = createAdminClient()
  
  const { data, error } = await adminClient
    .from("call_recipients")
    .select(`
      id,
      campaign_id,
      workspace_id,
      phone_number,
      first_name,
      last_name
    `)
    .eq("campaign_id", campaignId)
    .eq("call_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)
  
  if (error) {
    console.error("[CallQueue] Error fetching pending recipients:", error)
    return []
  }
  
  return (data || []).map(r => ({
    recipientId: r.id,
    campaignId: r.campaign_id,
    workspaceId: r.workspace_id,
    phone: r.phone_number,
    firstName: r.first_name || undefined,
    lastName: r.last_name || undefined,
  }))
}

/**
 * Calculate how many new calls we can start for a campaign
 */
export async function calculateAvailableSlots(
  campaignId: string,
  workspaceId: string
): Promise<number> {
  const [campaignActive, workspaceActive] = await Promise.all([
    getActiveCampaignCallCount(campaignId),
    getActiveWorkspaceCallCount(workspaceId),
  ])
  
  // Calculate available slots based on both limits
  const campaignSlots = MAX_CONCURRENT_CALLS_PER_CAMPAIGN - campaignActive
  const workspaceSlots = MAX_CONCURRENT_CALLS_TOTAL - workspaceActive
  
  // Return the minimum of both (most restrictive)
  return Math.max(0, Math.min(campaignSlots, workspaceSlots))
}

/**
 * Check if an error is TRANSIENT and should be retried
 * 
 * Transient errors include:
 * - Concurrency limit (VAPI returns 429 or "Over Concurrency Limit")
 * - Server errors (5xx - 500, 502, 503, 522, etc.)
 * - Timeout errors
 * - Network errors
 */
function isTransientError(error: string | undefined): boolean {
  if (!error) return false
  const lowerError = error.toLowerCase()
  
  // Concurrency/rate limit errors
  if (lowerError.includes("concurrency") || 
      lowerError.includes("rate limit") || 
      lowerError.includes("too many requests") ||
      lowerError.includes("429")) {
    return true
  }
  
  // Server errors (5xx) - these are VAPI-side issues, should retry
  if (lowerError.includes("500") ||
      lowerError.includes("502") ||
      lowerError.includes("503") ||
      lowerError.includes("504") ||
      lowerError.includes("522") || // Cloudflare connection timeout
      lowerError.includes("server error") ||
      lowerError.includes("internal error")) {
    return true
  }
  
  // Timeout/network errors
  if (lowerError.includes("timeout") ||
      lowerError.includes("timed out") ||
      lowerError.includes("network") ||
      lowerError.includes("econnrefused") ||
      lowerError.includes("econnreset") ||
      lowerError.includes("fetch failed")) {
    return true
  }
  
  return false
}

// Legacy alias for backwards compatibility
function isConcurrencyLimitError(error: string | undefined): boolean {
  return isTransientError(error)
}

/**
 * Start a single call and update recipient status
 */
async function startSingleCall(
  call: QueuedCall,
  vapiConfig: VapiConfig
): Promise<{ success: boolean; callId?: string; error?: string; shouldRetry?: boolean }> {
  const adminClient = createAdminClient()
  const now = new Date().toISOString()
  
  try {
    // Create the call via VAPI
    console.log(`[CallQueue] Starting call for ${call.phone} (recipient: ${call.recipientId})`)
    
    const result = await createOutboundCall({
      apiKey: vapiConfig.apiKey,
      assistantId: vapiConfig.assistantId,
      phoneNumberId: vapiConfig.phoneNumberId,
      customerNumber: call.phone,
      customerName: [call.firstName, call.lastName].filter(Boolean).join(" ") || undefined,
    })
    
    if (!result.success || !result.data) {
      const errorMsg = result.error || "Failed to create call"
      console.error(`[CallQueue] VAPI call creation FAILED for ${call.phone}: ${errorMsg}`)
      
      // Check if this is a TRANSIENT error - DON'T mark as failed, keep pending for retry
      // Transient errors include: concurrency limits, 5xx errors, timeouts, network issues
      if (isTransientError(errorMsg)) {
        console.log(`[CallQueue] Transient error for ${call.phone} - keeping as pending for retry: ${errorMsg}`)
        // Don't update status - leave as "pending" for retry
        return { success: false, error: errorMsg, shouldRetry: true }
      }
      
      // For PERMANENT errors (invalid number, auth error, etc.), mark as failed
      console.log(`[CallQueue] Permanent error for ${call.phone} - marking as failed: ${errorMsg}`)
      await adminClient
        .from("call_recipients")
        .update({
          call_status: "failed",
          last_error: errorMsg,
          attempts: 1,
          last_attempt_at: now,
          updated_at: now,
        })
        .eq("id", call.recipientId)
      
      return { success: false, error: errorMsg, shouldRetry: false }
    }
    
    // Update recipient with call ID and "calling" status
    await adminClient
      .from("call_recipients")
      .update({
        call_status: "calling",
        external_call_id: result.data.id,
        call_started_at: now,
        attempts: 1,
        last_attempt_at: now,
        updated_at: now,
      })
      .eq("id", call.recipientId)
    
    console.log(`[CallQueue] Call STARTED for ${call.phone}: callId=${result.data.id}`)
    return { success: true, callId: result.data.id }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    // Update recipient as failed
    await adminClient
      .from("call_recipients")
      .update({
        call_status: "failed",
        last_error: errorMessage,
        attempts: 1,
        last_attempt_at: now,
        updated_at: now,
      })
      .eq("id", call.recipientId)
    
    return { success: false, error: errorMessage }
  }
}

/**
 * Start the next batch of calls for a campaign
 * 
 * This is the main function to call when:
 * 1. A campaign is first started
 * 2. A call completes (via webhook)
 * 3. A cron job runs to check for stuck campaigns
 */
/**
 * Start the next call(s) for a campaign - WEBHOOK TRIGGERED VERSION
 * 
 * STRICT MODE: Only starts 1 call per invocation (1-for-1 replacement)
 * This prevents overwhelming VAPI's concurrency limit.
 * 
 * The flow:
 * 1. Campaign starts → Initial batch of 3 calls
 * 2. Call ends → Webhook triggers → Start 1 new call (replacement)
 * 3. Repeat until all recipients processed
 */
export async function startNextCalls(
  campaignId: string,
  workspaceId: string,
  vapiConfig: VapiConfig,
  options?: { isInitialStart?: boolean }
): Promise<StartCallsResult> {
  const adminClient = createAdminClient()
  const errors: string[] = []
  const isInitial = options?.isInitialStart || false
  
  // Determine how many calls to start
  const callsToStart = isInitial ? INITIAL_CONCURRENT_CALLS : CALLS_TO_START_ON_WEBHOOK
  
  console.log(`[CallQueue] startNextCalls: campaign=${campaignId}, isInitial=${isInitial}, targetCalls=${callsToStart}`)
  
  // Check cooldown - if we recently hit concurrency limit, wait
  // BUT only for webhook triggers, not initial starts
  if (!isInitial) {
    const cooldownUntil = campaignCooldowns.get(campaignId)
    if (cooldownUntil && Date.now() < cooldownUntil) {
      const remainingMs = cooldownUntil - Date.now()
      console.log(`[CallQueue] Campaign ${campaignId} is in cooldown for ${remainingMs}ms - skipping`)
      
      // Get pending count for the return value
      const { count: pendingCount } = await adminClient
        .from("call_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("call_status", "pending")
      
      return {
        started: 0,
        failed: 0,
        remaining: pendingCount || 0,
        errors: [`In cooldown for ${Math.ceil(remainingMs / 1000)}s after concurrency limit`],
        concurrencyHit: true,
      }
    }
  }
  
  console.log(`[CallQueue] VAPI config: assistantId=${vapiConfig.assistantId}, phoneNumberId=${vapiConfig.phoneNumberId}`)
  
  // Check if campaign is still active
  const { data: campaign } = await adminClient
    .from("call_campaigns")
    .select("status")
    .eq("id", campaignId)
    .single()
  
  if (!campaign || campaign.status !== "active") {
    console.log(`[CallQueue] Campaign ${campaignId} is not active (status: ${campaign?.status})`)
    return {
      started: 0,
      failed: 0,
      remaining: 0,
      errors: ["Campaign is not active"],
    }
  }
  
  // For initial start, check available slots
  // For webhook triggers, we always try to start 1 call (1-for-1 replacement)
  let actualCallsToStart = callsToStart
  
  if (isInitial) {
    const availableSlots = await calculateAvailableSlots(campaignId, workspaceId)
    console.log(`[CallQueue] Initial start: ${availableSlots} slots available`)
    actualCallsToStart = Math.min(callsToStart, availableSlots)
    
    if (actualCallsToStart <= 0) {
      const { count: pendingCount } = await adminClient
        .from("call_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("call_status", "pending")
      
      return {
        started: 0,
        failed: 0,
        remaining: pendingCount || 0,
        errors: ["No slots available for initial start"],
      }
    }
  } else {
    console.log(`[CallQueue] Webhook trigger: attempting to start ${actualCallsToStart} call(s)`)
  }
  
  // Get next batch of pending recipients
  const pendingCalls = await getNextPendingRecipients(campaignId, actualCallsToStart)
  
  if (pendingCalls.length === 0) {
    // No more pending calls - check if campaign should be completed
    const { count: callingCount } = await adminClient
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("call_status", "calling")
    
    if (callingCount === 0) {
      // No pending and no calling = campaign complete
      await adminClient
        .from("call_campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId)
      
      console.log(`[CallQueue] Campaign ${campaignId} completed - no more recipients`)
    }
    
    return {
      started: 0,
      failed: 0,
      remaining: 0,
      errors: [],
    }
  }
  
  // Start calls sequentially with retries for webhook triggers
  let started = 0
  let failed = 0
  let concurrencyHit = false
  
  for (const call of pendingCalls) {
    let callStarted = false
    let retries = 0
    
    // For webhook triggers (1 call), retry a few times if we hit concurrency
    const maxRetries = isInitial ? 0 : MAX_CONCURRENCY_RETRIES
    
    while (!callStarted && retries <= maxRetries) {
      if (retries > 0) {
        console.log(`[CallQueue] Retry ${retries}/${maxRetries} for ${call.phone} after ${RETRY_DELAY_MS}ms`)
        await sleep(RETRY_DELAY_MS)
      }
      
      const result = await startSingleCall(call, vapiConfig)
      
      if (result.success) {
        started++
        callStarted = true
        // Clear any existing cooldown since we successfully started a call
        campaignCooldowns.delete(campaignId)
      } else if (result.shouldRetry) {
        retries++
        if (retries > maxRetries) {
          // Exhausted retries - go into cooldown
          console.log(`[CallQueue] Exhausted ${maxRetries} retries for ${call.phone} - entering cooldown`)
          concurrencyHit = true
          campaignCooldowns.set(campaignId, Date.now() + CONCURRENCY_COOLDOWN_MS)
          errors.push(`${call.phone}: ${result.error} (will retry after ${CONCURRENCY_COOLDOWN_MS/1000}s cooldown)`)
        }
      } else {
        // Actual failure (not concurrency) - mark as failed and move on
        failed++
        callStarted = true // Don't retry, just move to next call
        if (result.error) {
          errors.push(`${call.phone}: ${result.error}`)
        }
      }
    }
    
    // If we hit concurrency limit on any call, stop the batch
    if (concurrencyHit) {
      break
    }
    
    // Small delay between calls (only for initial batch with multiple calls)
    if (pendingCalls.indexOf(call) < pendingCalls.length - 1) {
      await sleep(DELAY_BETWEEN_CALLS_MS)
    }
  }
  
  // Log result
  if (concurrencyHit) {
    console.log(`[CallQueue] Campaign ${campaignId}: concurrency limit after retries, ${started} started`)
  }
  
  // Get remaining count
  const { count: remainingCount } = await adminClient
    .from("call_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("call_status", "pending")
  
  // Update campaign stats - only count actual failures, not concurrency-limited retries
  if (failed > 0) {
    await adminClient.rpc("increment_campaign_stats", {
      p_campaign_id: campaignId,
      p_completed: 0,
      p_successful: 0,
      p_failed: failed,
    })
  }
  
  console.log(`[CallQueue] Campaign ${campaignId}: started ${started}, failed ${failed}, remaining ${remainingCount || 0}${concurrencyHit ? ' (concurrency limit hit)' : ''}`)
  
  return {
    started,
    failed,
    remaining: remainingCount || 0,
    errors,
    concurrencyHit, // New field to indicate if we stopped due to concurrency
  }
}

/**
 * Called when a call ends (from webhook)
 * This triggers the next call to start
 */
export async function onCallEnded(
  campaignId: string,
  workspaceId: string,
  vapiConfig: VapiConfig
): Promise<void> {
  // Start next calls (will respect concurrency limits)
  await startNextCalls(campaignId, workspaceId, vapiConfig)
}

/**
 * Get VAPI config for a campaign
 */
export async function getVapiConfigForCampaign(
  campaignId: string
): Promise<VapiConfig | null> {
  const adminClient = createAdminClient()
  
  console.log(`[CallQueue] Getting VAPI config for campaign: ${campaignId}`)
  
  // Get campaign with agent
  const { data: campaign, error: campaignError } = await adminClient
    .from("call_campaigns")
    .select(`
      workspace_id,
      agent:ai_agents!agent_id(
        external_agent_id,
        assigned_phone_number_id
      )
    `)
    .eq("id", campaignId)
    .single()
  
  if (campaignError) {
    console.error(`[CallQueue] Error fetching campaign: ${campaignError.message}`)
    return null
  }
  
  if (!campaign?.agent) {
    console.error(`[CallQueue] Campaign ${campaignId} has no agent`)
    return null
  }
  
  const agent = campaign.agent as any
  
  // Get workspace's VAPI integration
  const { data: workspace } = await adminClient
    .from("workspaces")
    .select("partner_id")
    .eq("id", campaign.workspace_id)
    .single()
  
  if (!workspace?.partner_id) {
    return null
  }
  
  // Get VAPI integration config
  const { data: assignment } = await adminClient
    .from("workspace_integration_assignments")
    .select(`
      partner_integration:partner_integrations (
        api_keys,
        config,
        is_active
      )
    `)
    .eq("workspace_id", campaign.workspace_id)
    .eq("provider", "vapi")
    .single()
  
  if (!assignment?.partner_integration) {
    return null
  }
  
  const integration = assignment.partner_integration as any
  if (!integration.is_active) {
    return null
  }
  
  const apiKeys = integration.api_keys as any
  const config = integration.config || {}
  
  if (!apiKeys?.default_secret_key) {
    return null
  }
  
  // Get phone number ID
  let phoneNumberId = config.shared_outbound_phone_number_id
  
  if (!phoneNumberId && agent.assigned_phone_number_id) {
    const { data: phoneNumber } = await adminClient
      .from("phone_numbers")
      .select("external_id")
      .eq("id", agent.assigned_phone_number_id)
      .single()
    
    phoneNumberId = phoneNumber?.external_id
  }
  
  if (!phoneNumberId) {
    console.error(`[CallQueue] No phone number ID found for campaign ${campaignId}`)
    return null
  }
  
  console.log(`[CallQueue] VAPI config resolved: assistantId=${agent.external_agent_id}, phoneNumberId=${phoneNumberId}`)
  
  return {
    apiKey: apiKeys.default_secret_key,
    assistantId: agent.external_agent_id,
    phoneNumberId,
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  MAX_CONCURRENT_CALLS_PER_CAMPAIGN,
  MAX_CONCURRENT_CALLS_TOTAL,
  STALE_CALL_THRESHOLD_MINUTES,
}


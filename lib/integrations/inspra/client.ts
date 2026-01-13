/**
 * Inspra Outbound API Client
 * 
 * Handles communication with Inspra's batch calling API.
 * For testing, set INSPRA_OUTBOUND_API_URL to your webhook.site URL.
 * 
 * API Endpoints:
 * - POST /load-json - Load a batch of outbound calls
 * - POST /pause-batch - Pause an existing batch
 * - POST /terminate-batch - Terminate a running batch
 * - POST /test-call - Queue a single test call
 */

import type { BusinessHoursConfig, DayOfWeek } from "@/types/database.types"

// ============================================================================
// CONFIGURATION
// ============================================================================

// Default to webhook.site for testing - replace with actual Inspra URL in production
const INSPRA_API_BASE_URL = process.env.INSPRA_OUTBOUND_API_URL || "https://webhook.site/your-uuid-here"
const INSPRA_API_KEY = process.env.INSPRA_API_KEY || ""

// ============================================================================
// TYPES
// ============================================================================

export interface InspraCallListItem {
  phone: string
  variables: Record<string, string>
}

export interface InspraLoadJsonPayload {
  agentId: string           // VAPI external_agent_id
  workspaceId: string       // Our workspace ID
  batchRef: string          // Unique batch reference (campaign-{id})
  cli: string               // Caller ID (outbound phone number)
  callList: InspraCallListItem[]
  nbf: string               // Not before (ISO date) - when calls can start
  exp: string               // Expiry (ISO date) - when batch expires
  blockRules: string[]      // Business hours block rules ["Mon-Fri|0800-1800"]
}

export interface InspraBatchPayload {
  workspaceId: string
  agentId: string
  batchRef: string
}

export interface InspraTestCallPayload {
  agentId: string
  workspaceId: string
  batchRef: string
  cli: string
  nbf: string
  exp: string
  blockRules: string[]
  phone: string
  variables: Record<string, string>
}

export interface InspraApiResponse {
  success: boolean
  error?: string
  statusCode?: number
  data?: unknown
}

// ============================================================================
// BUSINESS HOURS CONVERSION
// ============================================================================

const DAY_MAP: Record<DayOfWeek, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
}

const DAY_ORDER: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
]

/**
 * Convert business hours config to Inspra block rules format
 * Block rules define when calls CANNOT be made
 * Format: "Day|HHMM-HHMM" or "Day-Day|HHMM-HHMM"
 * 
 * Example: If business hours are Mon-Fri 9AM-5PM:
 * - Block Mon|0000-0900 (before 9AM)
 * - Block Mon|1700-2359 (after 5PM)
 * - Block Sat|0000-2359 (all day)
 * - Block Sun|0000-2359 (all day)
 */
export function convertBusinessHoursToBlockRules(config: BusinessHoursConfig | null | undefined): string[] {
  if (!config || !config.enabled) {
    return [] // No restrictions
  }

  const blockRules: string[] = []

  for (const day of DAY_ORDER) {
    const slots = config.schedule[day] || []
    const dayAbbrev = DAY_MAP[day]

    if (slots.length === 0) {
      // Block entire day
      blockRules.push(`${dayAbbrev}|0000-2359`)
    } else {
      // Sort slots by start time
      const sortedSlots = [...slots].sort((a, b) => a.start.localeCompare(b.start))

      // Block from midnight to first slot start
      const firstSlot = sortedSlots[0]
      if (firstSlot && firstSlot.start !== "00:00") {
        const startTime = firstSlot.start.replace(":", "")
        blockRules.push(`${dayAbbrev}|0000-${startTime}`)
      }

      // Block gaps between slots
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

      // Block from last slot end to midnight
      const lastSlot = sortedSlots[sortedSlots.length - 1]
      if (lastSlot && lastSlot.end !== "24:00" && lastSlot.end !== "23:59") {
        const endTime = lastSlot.end.replace(":", "")
        blockRules.push(`${dayAbbrev}|${endTime}-2359`)
      }
    }
  }

  return blockRules
}

// ============================================================================
// API CLIENT
// ============================================================================

async function callInspraApi(
  endpoint: string,
  payload: unknown
): Promise<InspraApiResponse> {
  const url = `${INSPRA_API_BASE_URL}${endpoint}`
  
  console.log(`[InspraClient] Calling ${endpoint}`)
  console.log(`[InspraClient] URL: ${url}`)
  console.log(`[InspraClient] Payload:`, JSON.stringify(payload, null, 2))

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    // Add API key if configured
    if (INSPRA_API_KEY) {
      headers["Authorization"] = `Bearer ${INSPRA_API_KEY}`
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })

    console.log(`[InspraClient] Response status: ${response.status}`)

    // Try to parse response body
    let responseData: unknown = null
    const contentType = response.headers.get("content-type")
    
    if (contentType?.includes("application/json")) {
      try {
        responseData = await response.json()
        console.log(`[InspraClient] Response data:`, responseData)
      } catch {
        // No JSON body
      }
    } else {
      const text = await response.text()
      if (text) {
        console.log(`[InspraClient] Response text:`, text)
        responseData = { text }
      }
    }

    if (!response.ok) {
      return {
        success: false,
        error: `Inspra API error: ${response.status} ${response.statusText}`,
        statusCode: response.status,
        data: responseData,
      }
    }

    return {
      success: true,
      statusCode: response.status,
      data: responseData,
    }
  } catch (error) {
    console.error(`[InspraClient] Error calling ${endpoint}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// PUBLIC API METHODS
// ============================================================================

/**
 * Load a batch of outbound calls to Inspra
 * Called when campaign is CREATED
 */
export async function loadJsonBatch(payload: InspraLoadJsonPayload): Promise<InspraApiResponse> {
  console.log(`[InspraClient] Loading batch: ${payload.batchRef}`)
  console.log(`[InspraClient] Recipients: ${payload.callList.length}`)
  console.log(`[InspraClient] Agent ID: ${payload.agentId}`)
  console.log(`[InspraClient] CLI: ${payload.cli}`)
  console.log(`[InspraClient] NBF: ${payload.nbf}`)
  console.log(`[InspraClient] EXP: ${payload.exp}`)
  console.log(`[InspraClient] Block Rules: ${payload.blockRules.length}`)

  return callInspraApi("/load-json", payload)
}

/**
 * Pause an existing batch
 * Called when user pauses a campaign
 */
export async function pauseBatch(payload: InspraBatchPayload): Promise<InspraApiResponse> {
  console.log(`[InspraClient] Pausing batch: ${payload.batchRef}`)
  return callInspraApi("/pause-batch", payload)
}

/**
 * Terminate a running batch
 * Called when user terminates/cancels a campaign
 */
export async function terminateBatch(payload: InspraBatchPayload): Promise<InspraApiResponse> {
  console.log(`[InspraClient] Terminating batch: ${payload.batchRef}`)
  return callInspraApi("/terminate-batch", payload)
}

/**
 * Queue a single test call
 * Called for campaign test calls
 */
export async function queueTestCall(payload: InspraTestCallPayload): Promise<InspraApiResponse> {
  console.log(`[InspraClient] Queueing test call to: ${payload.phone}`)
  return callInspraApi("/test-call", payload)
}

// ============================================================================
// HELPER: Build payload from campaign data
// ============================================================================

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

/**
 * Build Inspra /load-json payload from campaign and recipients
 */
export function buildLoadJsonPayload(
  campaign: CampaignData,
  recipients: RecipientData[]
): InspraLoadJsonPayload {
  // Calculate NBF (not before) and EXP (expiry)
  const now = new Date()
  let nbf: Date
  let exp: Date

  if (campaign.schedule_type === "scheduled" && campaign.scheduled_start_at) {
    nbf = new Date(campaign.scheduled_start_at)
  } else {
    // For immediate campaigns, NBF is now
    // But since we're sending on CREATE, set NBF to far future
    // User will update NBF when they START the campaign
    nbf = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year from now (placeholder)
  }

  if (campaign.scheduled_expires_at) {
    exp = new Date(campaign.scheduled_expires_at)
  } else {
    // Default: 30 days from NBF
    exp = new Date(nbf.getTime() + 30 * 24 * 60 * 60 * 1000)
  }

  // Convert business hours to block rules
  const blockRules = convertBusinessHoursToBlockRules(campaign.business_hours_config)

  // Build call list
  const callList: InspraCallListItem[] = recipients.map((r) => ({
    phone: r.phone_number,
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

  return {
    agentId: campaign.agent.external_agent_id,
    workspaceId: campaign.workspace_id,
    batchRef: `campaign-${campaign.id}`,
    cli: campaign.cli,
    callList,
    nbf: nbf.toISOString(),
    exp: exp.toISOString(),
    blockRules,
  }
}

/**
 * Build payload for starting a campaign (updating NBF to now)
 * This would be used if Inspra has an endpoint to update batch timing
 */
export function buildStartPayload(
  campaign: CampaignData
): { batchRef: string; nbf: string } {
  return {
    batchRef: `campaign-${campaign.id}`,
    nbf: new Date().toISOString(), // Start now
  }
}


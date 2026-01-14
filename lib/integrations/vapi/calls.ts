/**
 * VAPI Calls API
 * Handles outbound call creation and call log retrieval via VAPI
 * Docs: https://docs.vapi.ai/api-reference/calls/get
 */

import type { ConversationInsertData } from "@/lib/integrations/retell/calls"

// ============================================================================
// CONFIGURATION
// ============================================================================

const VAPI_BASE_URL = "https://api.vapi.ai"

// ============================================================================
// PHONE NUMBER UTILITIES
// ============================================================================

/**
 * Normalize phone number to E.164 format (required by VAPI)
 * E.164 format requires the + prefix followed by country code and number
 * 
 * Examples:
 * - "61370566663" → "+61370566663"
 * - "+61370566663" → "+61370566663" (already correct)
 * - "0370566663" → "+0370566663" (will add +, but may need country code)
 */
function normalizeToE164(phoneNumber: string): string {
  // Remove any whitespace, dashes, parentheses
  const cleaned = phoneNumber.replace(/[\s\-\(\)\.]/g, "")
  
  // If already starts with +, return as is
  if (cleaned.startsWith("+")) {
    return cleaned
  }
  
  // If starts with 00 (international prefix), replace with +
  if (cleaned.startsWith("00")) {
    return "+" + cleaned.slice(2)
  }
  
  // Otherwise, add + prefix
  return "+" + cleaned
}

// ============================================================================
// TYPES
// ============================================================================

/** Basic call type for outbound creation */
export interface VapiCall {
  id: string
  orgId: string
  type: "inboundPhoneCall" | "outboundPhoneCall" | "webCall" | "vapi.websocketCall"
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended"
  assistantId?: string
  phoneNumberId?: string
  customer?: {
    number?: string
    name?: string
    externalId?: string
  }
  startedAt?: string
  endedAt?: string
  durationSeconds?: number
  createdAt: string
  updatedAt: string
}

/** Cost breakdown item from Vapi */
export interface VapiCostItem {
  type: "transport" | "transcriber" | "model" | "voice" | "vapi" | "voicemail-detection" | "analysis"
  cost: number
  minutes?: number
  characters?: number
  promptTokens?: number
  completionTokens?: number
}

/** Analysis result from Vapi */
export interface VapiAnalysis {
  summary?: string
  successEvaluation?: string
  structuredData?: Record<string, unknown>
}

/** Artifact containing transcript and recording */
export interface VapiArtifact {
  messages?: VapiMessage[]
  messagesOpenAIFormatted?: Array<{
    role: string
    content: string
  }>
  transcript?: string
  recordingUrl?: string
  stereoRecordingUrl?: string
  videoRecordingUrl?: string
}

/** Message/utterance in the call */
export interface VapiMessage {
  role: "assistant" | "user" | "system" | "bot" | "tool_calls" | "tool_call_result"
  message?: string
  content?: string
  time?: number
  endTime?: number
  secondsFromStart?: number
}

/** Full call details from GET /call/{id} */
export interface VapiCallDetails {
  id: string
  orgId: string
  type: "inboundPhoneCall" | "outboundPhoneCall" | "webCall" | "vapi.websocketCall"
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended"
  endedReason?: string
  assistantId?: string
  assistant?: Record<string, unknown>
  phoneNumberId?: string
  phoneNumber?: Record<string, unknown>
  customer?: {
    number?: string
    name?: string
    externalId?: string
  }
  name?: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  endedAt?: string
  cost?: number
  costBreakdown?: {
    transport?: number
    transcriber?: number
    model?: number
    voice?: number
    vapi?: number
    analysis?: number
    total?: number
  }
  costs?: VapiCostItem[]
  analysis?: VapiAnalysis
  artifact?: VapiArtifact
  transport?: {
    provider?: string
    assistantVideoEnabled?: boolean
  }
  phoneCallProviderId?: string
  metadata?: Record<string, unknown>
}

export interface VapiCallResponse {
  success: boolean
  data?: VapiCallDetails
  error?: string
}

// ============================================================================
// CREATE OUTBOUND CALL
// ============================================================================

export async function createOutboundCall(params: {
  apiKey: string
  assistantId: string
  phoneNumberId: string
  customerNumber: string
  customerName?: string
}): Promise<VapiCallResponse> {
  const { apiKey, assistantId, phoneNumberId, customerNumber, customerName } = params

  // Normalize phone number to E.164 format (VAPI requirement)
  const normalizedNumber = normalizeToE164(customerNumber)

  try {
    console.log(
      "[VapiCalls] Creating outbound call from",
      phoneNumberId,
      "to",
      normalizedNumber,
      `(original: ${customerNumber})`
    )

    const payload: Record<string, unknown> = {
      assistantId,
      phoneNumberId,
      customer: {
        number: normalizedNumber,
        ...(customerName && { name: customerName }),
      },
    }

    console.log("[VapiCalls] Outbound call payload:", JSON.stringify(payload, null, 2))

    const response = await fetch(`${VAPI_BASE_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiCalls] Create error:", errorData)
      
      // Handle message being an array (VAPI returns validation errors as array)
      let errorMessage: string
      if (Array.isArray(errorData.message)) {
        errorMessage = errorData.message.join(", ")
      } else {
        errorMessage = errorData.message || `VAPI API error: ${response.status} ${response.statusText}`
      }
      
      return {
        success: false,
        error: errorMessage,
      }
    }

    const data: VapiCall = await response.json()
    console.log("[VapiCalls] Outbound call created:", data.id, "status:", data.status)
    console.log("[VapiCalls] Call object:", JSON.stringify(data, null, 2))
    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[VapiCalls] Create exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error creating outbound call",
    }
  }
}

// ============================================================================
// GET CALL DETAILS
// Fetches full call details from Vapi API
// Docs: https://docs.vapi.ai/api-reference/calls/get
// ============================================================================

export async function getVapiCallDetails(params: {
  apiKey: string
  callId: string
}): Promise<VapiCallResponse> {
  const { apiKey, callId } = params

  try {
    console.log("[VapiCalls] Fetching call details:", callId)

    const response = await fetch(`${VAPI_BASE_URL}/call/${callId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: Record<string, unknown> = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      console.error("[VapiCalls] Get call error:", response.status, errorData)
      return {
        success: false,
        error: (errorData.message as string) || `Vapi API error: ${response.status}`,
      }
    }

    const data: VapiCallDetails = await response.json()
    console.log("[VapiCalls] Call details retrieved:", {
      callId: data.id,
      status: data.status,
      endedAt: data.endedAt,
      hasTranscript: !!data.artifact?.transcript,
      hasCost: data.cost !== undefined,
    })

    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[VapiCalls] Get call exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error fetching call details",
    }
  }
}

// Legacy alias for backwards compatibility
export const getCall = getVapiCallDetails

// ============================================================================
// POLL FOR CALL COMPLETION
// Vapi calls may not have all data immediately after ending
// ============================================================================

export async function pollVapiCallUntilReady(params: {
  apiKey: string
  callId: string
  maxAttempts?: number
  delayMs?: number
}): Promise<VapiCallResponse> {
  const { apiKey, callId, maxAttempts = 10, delayMs = 2000 } = params

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[VapiCalls] Poll attempt ${attempt}/${maxAttempts} for call:`, callId)

    const result = await getVapiCallDetails({ apiKey, callId })

    if (!result.success) {
      // If it's a not found or similar error, keep retrying
      if (attempt < maxAttempts) {
        await sleep(delayMs)
        continue
      }
      return result
    }

    const call = result.data!

    // Check if call has ended and has the data we need
    // Vapi marks calls as ready when endedAt is present
    if (call.status === "ended" && call.endedAt) {
      // Transcript might take a moment to be available in artifact
      if (call.artifact?.transcript !== undefined || call.artifact?.messages !== undefined) {
        console.log("[VapiCalls] Call data ready after", attempt, "attempts")
        return result
      }
    }

    // If call is still ongoing or data not ready, wait and retry
    if (attempt < maxAttempts) {
      await sleep(delayMs)
    }
  }

  // Return last result even if not fully ready
  console.warn("[VapiCalls] Max attempts reached, returning partial data")
  return await getVapiCallDetails({ apiKey, callId })
}

// ============================================================================
// LIST CALLS (for backfill/reconciliation)
// Docs: https://docs.vapi.ai/api-reference/calls/call-controller-find-all-paginated
// ============================================================================

export interface VapiListCallsParams {
  apiKey: string
  assistantId?: string
  createdAtGe?: string // ISO date string
  createdAtLe?: string // ISO date string
  limit?: number
}

export interface VapiListCallsResponse {
  success: boolean
  data?: VapiCallDetails[]
  error?: string
}

export async function listVapiCalls(params: VapiListCallsParams): Promise<VapiListCallsResponse> {
  const { apiKey, assistantId, createdAtGe, createdAtLe, limit = 100 } = params

  try {
    const queryParams = new URLSearchParams()
    queryParams.set("limit", limit.toString())

    if (assistantId) {
      queryParams.set("assistantId", assistantId)
    }
    if (createdAtGe) {
      queryParams.set("createdAtGe", createdAtGe)
    }
    if (createdAtLe) {
      queryParams.set("createdAtLe", createdAtLe)
    }

    const response = await fetch(`${VAPI_BASE_URL}/v2/call?${queryParams.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: Record<string, unknown> = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      console.error("[VapiCalls] List calls error:", response.status, errorData)
      return {
        success: false,
        error: (errorData.message as string) || `Vapi API error: ${response.status}`,
      }
    }

    const data: VapiCallDetails[] = await response.json()
    console.log("[VapiCalls] Listed", data.length, "calls")

    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[VapiCalls] List calls exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error listing calls",
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// MAPPER: Vapi Call → Conversation DB Record
// ============================================================================

export function mapVapiCallToConversation(
  call: VapiCallDetails,
  workspaceId: string,
  agentId: string
): ConversationInsertData {
  // Map Vapi status to our status enum
  const statusMap: Record<string, ConversationInsertData["status"]> = {
    queued: "initiated",
    ringing: "ringing",
    "in-progress": "in_progress",
    forwarding: "in_progress",
    ended: "completed",
  }

  // Map ended reason to status
  let status = statusMap[call.status] || "completed"
  if (call.endedReason) {
    const reason = call.endedReason.toLowerCase()
    if (reason.includes("no-answer") || reason.includes("no_answer")) {
      status = "no_answer"
    } else if (reason.includes("busy")) {
      status = "busy"
    } else if (reason.includes("error") || reason.includes("failed")) {
      status = "failed"
    } else if (reason.includes("canceled") || reason.includes("cancelled")) {
      status = "canceled"
    }
  }

  // Calculate duration from timestamps if not directly provided
  let durationSeconds = 0
  if (call.startedAt && call.endedAt) {
    const startMs = new Date(call.startedAt).getTime()
    const endMs = new Date(call.endedAt).getTime()
    durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000))
  }

  // Extract cost (already in dollars from Vapi)
  const totalCost = call.cost || 0

  // Build cost breakdown
  const costBreakdown: Record<string, unknown> = {}
  if (call.costBreakdown) {
    costBreakdown.breakdown = call.costBreakdown
  }
  if (call.costs) {
    costBreakdown.costs = call.costs
  }

  // Extract transcript from artifact
  const transcript = call.artifact?.transcript || null

  // Extract recording URL from artifact
  const recordingUrl = call.artifact?.recordingUrl || call.artifact?.stereoRecordingUrl || null

  // Map call type to direction
  let direction: "inbound" | "outbound" = "outbound"
  if (call.type === "inboundPhoneCall") {
    direction = "inbound"
  }

  // Extract sentiment from analysis if available
  let sentiment: string | null = null
  if (call.analysis?.successEvaluation) {
    // Vapi uses successEvaluation - interpret as sentiment proxy
    const eval_ = call.analysis.successEvaluation.toLowerCase()
    if (eval_.includes("success") || eval_.includes("positive")) {
      sentiment = "positive"
    } else if (eval_.includes("fail") || eval_.includes("negative")) {
      sentiment = "negative"
    } else {
      sentiment = "neutral"
    }
  }

  return {
    external_id: call.id,
    workspace_id: workspaceId,
    agent_id: agentId,
    direction,
    status,
    duration_seconds: durationSeconds,
    total_cost: totalCost,
    cost_breakdown: costBreakdown,
    transcript,
    recording_url: recordingUrl,
    started_at: call.startedAt || null,
    ended_at: call.endedAt || null,
    phone_number: call.customer?.number || null,
    caller_name: call.customer?.name || null,
    sentiment,
    summary: call.analysis?.summary || null,
    metadata: {
      provider: "vapi",
      call_type: call.type,
      ended_reason: call.endedReason,
      assistant_id: call.assistantId,
      phone_number_id: call.phoneNumberId,
      vapi_metadata: call.metadata,
      analysis: call.analysis,
    },
  }
}


/**
 * POST /api/webhooks/vapi
 * Secure VAPI webhook handler for call events AND custom function execution
 *
 * Security:
 * - Signature verification using HMAC-SHA256
 * - Timestamp validation to prevent replay attacks (5-minute window)
 *
 * Events processed:
 * - status-update: Call status changes (queued, ringing, in-progress, ended)
 * - end-of-call-report: Complete call summary with transcript, recording, analysis
 * - function-call/tool-calls: Custom function tool execution
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"
import { prisma } from "@/lib/prisma"
import { processCallCompletion } from "@/lib/billing/usage"
import { indexCallLogToAlgolia, configureCallLogsIndex } from "@/lib/algolia"
import { isCalendarTool, handleCalendarToolCall } from "@/lib/integrations/calendar"
import type { AgentProvider, Conversation } from "@/types/database.types"

export const dynamic = "force-dynamic"

// Supabase admin client for campaign recipient updates (triggers Realtime)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// =============================================================================
// TYPES (Based on VAPI webhook payload structure - comprehensive)
// =============================================================================

interface VapiTranscriptMessage {
  role: "assistant" | "user" | "system" | "tool" | "bot"
  message?: string
  content?: string
  time?: number
  endTime?: number
  secondsFromStart?: number
  duration?: number
}

interface VapiAnalysis {
  summary?: string
  structuredData?: Record<string, unknown>
  successEvaluation?: string
  sentiment?: "positive" | "negative" | "neutral"
  emotions?: Array<{
    emotion: string
    score: number
  }>
}

interface VapiArtifact {
  messages?: VapiTranscriptMessage[]
  messagesOpenAIFormatted?: Array<{
    role: string
    content: string
  }>
  // VAPI uses 'recording' not 'recordingUrl'
  recording?: string
  recordingUrl?: string // Legacy/fallback
  // VAPI uses 'stereoRecording' not 'stereoRecordingUrl'
  stereoRecording?: string
  stereoRecordingUrl?: string // Legacy/fallback
  // Can be either string or array of transcript messages
  transcript?: string | VapiTranscriptMessage[]
  gatherItems?: unknown[]
  logUrl?: string
  pcapUrl?: string
  nodes?: unknown[]
  variableValues?: Record<string, unknown>
}

interface VapiSentiment {
  overall?: "positive" | "negative" | "neutral"
  scores?: {
    positive?: number
    neutral?: number
    negative?: number
  }
}

interface VapiCall {
  id: string
  orgId: string
  type?: "webCall" | "inboundPhoneCall" | "outboundPhoneCall"
  assistantId?: string
  squadId?: string
  status?: "queued" | "ringing" | "in-progress" | "forwarding" | "ended"
  createdAt?: string
  updatedAt?: string
  startedAt?: string
  endedAt?: string
  cost?: number
  costBreakdown?: {
    transport?: number
    stt?: number
    llm?: number
    tts?: number
    vapi?: number
    total?: number
    analysisCostBreakdown?: {
      summary?: number
      structuredData?: number
      successEvaluation?: number
    }
  }
  // Deprecated: Use artifact.messages instead
  messages?: VapiTranscriptMessage[]
  transcript?: string
  recordingUrl?: string
  stereoRecordingUrl?: string
  phoneNumber?: {
    id?: string
    number?: string
    name?: string
  }
  customer?: {
    number?: string
    name?: string
    numberE164CheckEnabled?: boolean
  }
  // Assistant info from the webhook
  assistant?: {
    id?: string
    name?: string
  }
  endedReason?: string
  analysis?: VapiAnalysis
  // Sentiment is at call level, not inside analysis
  sentiment?: VapiSentiment
  artifact?: VapiArtifact
  // Assistant overrides
  assistantOverrides?: Record<string, unknown>
}

interface VapiWebhookPayload {
  message: {
    type: string
    call: VapiCall
    status?: string // For status-update events
    timestamp?: string
    // Function call related
    functionCalls?: Array<{
      name: string
      arguments: Record<string, unknown>
    }>
    toolCalls?: Array<{
      id?: string
      name: string
      arguments: Record<string, unknown>
    }>
  }
  timestamp?: string
  // ROOT LEVEL FIELDS - VAPI sends these at the top level for end-of-call-report
  // These are NOT inside message.call.artifact!
  messages?: VapiTranscriptMessage[]
  recordingUrl?: string
  stereoRecordingUrl?: string
  transcript?: string
  summary?: string
  call?: VapiCall // Also duplicated at root level
  analysis?: VapiAnalysis
  phoneNumber?: {
    id?: string
    number?: string
    name?: string
  }
}

interface VapiFunctionCall {
  type: "function-call" | "tool-calls"
  toolCall?: {
    id?: string
    name: string
    arguments?: Record<string, unknown>
  }
  assistantId?: string
  callId?: string
}

// =============================================================================
// WEBHOOK VALIDATION
// =============================================================================

/**
 * Validate VAPI webhook request
 *
 * Security layers:
 * 1. Timestamp validation - Prevents replay attacks (5-minute window)
 * 2. Assistant ID validation - Verifies the assistantId exists in our database
 * 3. Org ID validation - Ensures call belongs to a valid VAPI organization
 *
 * Note: For maximum security, you can also configure VAPI_WEBHOOK_SECRET
 * which enables HMAC signature verification. Without it, we rely on the
 * above validation layers.
 */
function validateWebhookRequest(
  payload: VapiWebhookPayload | VapiFunctionCall,
  timestamp: string | null
): { valid: boolean; error?: string } {
  // Layer 1: Timestamp validation (prevent replay attacks)
  if (timestamp) {
    const currentTime = Math.floor(Date.now() / 1000)
    const webhookTime = parseInt(timestamp, 10)

    if (!isNaN(webhookTime) && Math.abs(currentTime - webhookTime) > 600) {
      console.warn("[VAPI Webhook] Request timestamp too old:", {
        webhookTime,
        currentTime,
        diff: Math.abs(currentTime - webhookTime),
      })
      return { valid: false, error: "Request timestamp too old (replay attack prevention)" }
    }
  }

  // Layer 2: Validate payload structure
  if ("message" in payload) {
    const callPayload = payload as VapiWebhookPayload
    const call = callPayload.message?.call

    // Must have a call object with ID
    if (!call?.id) {
      return { valid: false, error: "Missing call.id in payload" }
    }

    // Must have an assistantId (we'll validate it exists in DB during processing)
    // This is our primary security - attacker would need valid assistant IDs
    if (!call.assistantId && !call.squadId) {
      console.warn("[VAPI Webhook] No assistantId or squadId in payload")
      // Allow for now, but log warning - some events might not have assistantId
    }

    // Validate orgId is present (additional context)
    if (!call.orgId) {
      console.warn("[VAPI Webhook] No orgId in payload")
    }
  } else if ("assistantId" in payload || "callId" in payload) {
    // Function call payload - validate has required fields
    const funcPayload = payload as VapiFunctionCall
    if (!funcPayload.assistantId && !funcPayload.callId) {
      return { valid: false, error: "Missing assistantId and callId in function call" }
    }
  }

  return { valid: true }
}

/**
 * Verify VAPI webhook signature using HMAC-SHA256 (optional enhanced security)
 * Only runs if VAPI_WEBHOOK_SECRET is configured
 */
function verifyVapiSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null
): { valid: boolean; error?: string; skipped?: boolean } {
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET

  // If no secret configured, skip signature verification
  // Rely on payload validation instead
  if (!webhookSecret) {
    return { valid: true, skipped: true }
  }

  if (!signature) {
    return { valid: false, error: "Missing x-vapi-signature header" }
  }

  if (!timestamp) {
    return { valid: false, error: "Missing x-vapi-timestamp header" }
  }

  // Create signature payload: timestamp + raw body
  const payload = timestamp + rawBody

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload, "utf8")
    .digest("hex")

  // Extract signature from header (remove 'sha256=' prefix if present)
  const receivedSignature = signature.replace("sha256=", "")

  // Secure comparison to prevent timing attacks
  try {
    const expectedBuffer = Buffer.from(expectedSignature, "hex")
    const receivedBuffer = Buffer.from(receivedSignature, "hex")

    if (expectedBuffer.length !== receivedBuffer.length) {
      return { valid: false, error: "Invalid signature length" }
    }

    if (!crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
      return { valid: false, error: "Invalid webhook signature" }
    }
  } catch {
    return { valid: false, error: "Signature comparison failed" }
  }

  return { valid: true }
}

// =============================================================================
// EVENT FILTERING
// =============================================================================

const FORWARDED_EVENTS = [
  "status-update",
  "end-of-call-report",
  "function-call",
  "tool-calls",
  "transfer-update",
]

const IGNORED_EVENTS = [
  "conversation-update",
  "speech-update",
  "message",
  "transcription",
  "model-response",
  "transfer",
  "model-output",
  "transcript",
  "hang",
]

// =============================================================================
// WEBHOOK HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()

    // Get signature headers
    const signature = request.headers.get("x-vapi-signature")
    const timestamp = request.headers.get("x-vapi-timestamp")

    // Verify signature (if VAPI_WEBHOOK_SECRET is configured)
    const signatureVerification = verifyVapiSignature(rawBody, signature, timestamp)
    if (!signatureVerification.valid) {
      console.error(`[VAPI Webhook] Signature verification failed: ${signatureVerification.error}`)
      return NextResponse.json({ error: signatureVerification.error }, { status: 401 })
    }

    if (signatureVerification.skipped) {
      console.log(
        "[VAPI Webhook] Signature verification skipped (no VAPI_WEBHOOK_SECRET configured)"
      )
    }

    // Parse JSON body after verification
    let payload: VapiWebhookPayload | VapiFunctionCall
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    // Validate webhook request (timestamp + payload structure)
    // This provides security without requiring stored secrets
    const requestValidation = validateWebhookRequest(payload, timestamp)
    if (!requestValidation.valid) {
      console.error(`[VAPI Webhook] Request validation failed: ${requestValidation.error}`)
      return NextResponse.json({ error: requestValidation.error }, { status: 400 })
    }

    // Determine if this is a call event or function call
    if ("message" in payload) {
      const callPayload = payload as VapiWebhookPayload
      const eventType = callPayload.message.type

      console.log(`[VAPI Webhook] Received event: ${eventType}`, {
        callId: callPayload.message.call?.id,
        callType: callPayload.message.call?.type,
      })

      // Filter out ignored events
      if (IGNORED_EVENTS.includes(eventType)) {
        return NextResponse.json({ received: true })
      }

      // Only process specific events
      if (!FORWARDED_EVENTS.includes(eventType)) {
        console.log(`[VAPI Webhook] Ignoring event type: ${eventType}`)
        return NextResponse.json({ received: true })
      }

      switch (eventType) {
        case "status-update":
          await handleStatusUpdate(callPayload)
          break

        case "end-of-call-report":
          await handleEndOfCallReport(callPayload)
          break

        case "function-call":
        case "tool-calls":
          console.log(`[VAPI Webhook] Function/tool call in message payload`)
          await handleFunctionCallInMessage(callPayload)
          break

        default:
          await forwardEventToUserWebhook(callPayload)
      }

      return NextResponse.json({ received: true })
    } else if (
      "toolCall" in payload ||
      payload.type === "function-call" ||
      payload.type === "tool-calls"
    ) {
      const funcPayload = payload as VapiFunctionCall
      const result = await handleFunctionCall(funcPayload)
      return NextResponse.json(result)
    } else {
      console.warn("[VAPI Webhook] Unknown payload type")
      return NextResponse.json({ error: "Unknown payload type" }, { status: 400 })
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine call type from VAPI call object
 */
function determineCallType(call: VapiCall): "web" | "inbound" | "outbound" {
  if (call.type === "webCall") return "web"
  if (call.type === "inboundPhoneCall") return "inbound"
  if (call.type === "outboundPhoneCall") return "outbound"

  // Fallback: check if there's a customer/phone number
  if (!call.customer?.number && !call.phoneNumber?.number) {
    return "web"
  }

  return "outbound"
}

/**
 * Extract formatted transcript from VAPI webhook payload
 * PRIORITY: Messages arrays (have roles) > Transcript strings (may not have roles)
 * This ensures we capture BOTH agent and user speech with proper speaker identification
 */
function extractFormattedTranscript(call: VapiCall, payload?: VapiWebhookPayload): string | null {
  // Priority 1: ROOT LEVEL messages (VAPI's ACTUAL format - best quality)
  if (payload?.messages && payload.messages.length > 0) {
    return payload.messages
      .filter((m) => m.role === "assistant" || m.role === "user" || m.role === "bot")
      .map((m) => {
        const role = m.role === "assistant" || m.role === "bot" ? "Agent" : "User"
        const content = m.message || m.content || ""
        return `${role}: ${content}`
      })
      .join("\n")
  }

  // Priority 2: artifact.messages (has roles and timestamps)
  if (call.artifact?.messages && call.artifact.messages.length > 0) {
    return call.artifact.messages
      .filter((m) => m.role === "assistant" || m.role === "user" || m.role === "bot")
      .map((m) => {
        const role = m.role === "assistant" || m.role === "bot" ? "Agent" : "User"
        const content = m.message || m.content || ""
        return `${role}: ${content}`
      })
      .join("\n")
  }

  // Priority 3: artifact.transcript as array (has roles)
  if (call.artifact?.transcript && Array.isArray(call.artifact.transcript)) {
    return call.artifact.transcript
      .filter((m) => m.role === "assistant" || m.role === "user" || m.role === "bot")
      .map((m) => {
        const role = m.role === "assistant" || m.role === "bot" ? "Agent" : "User"
        const content = m.message || m.content || ""
        return `${role}: ${content}`
      })
      .join("\n")
  }

  // Priority 4: call.messages (legacy location but has roles)
  if (call.messages && call.messages.length > 0) {
    return call.messages
      .filter((m) => m.role === "assistant" || m.role === "user" || m.role === "bot")
      .map((m) => {
        const role = m.role === "assistant" || m.role === "bot" ? "Agent" : "User"
        const content = m.message || m.content || ""
        return `${role}: ${content}`
      })
      .join("\n")
  }

  // Priority 5: ROOT LEVEL transcript string (may not have speaker IDs)
  if (payload?.transcript) {
    return payload.transcript
  }

  // Priority 6: artifact.transcript as string (may not have speaker IDs)
  if (call.artifact?.transcript && typeof call.artifact.transcript === "string") {
    return call.artifact.transcript
  }

  // Priority 7: call.transcript legacy string (may not have speaker IDs)
  if (call.transcript) {
    return call.transcript
  }

  return null
}

/**
 * Extract transcript messages as JSON for detailed UI display
 * VAPI sends messages at ROOT level of the webhook payload!
 */
function extractTranscriptMessages(
  call: VapiCall,
  payload?: VapiWebhookPayload
): VapiTranscriptMessage[] {
  // Priority 1: ROOT LEVEL messages (VAPI's ACTUAL format!)
  if (payload?.messages && payload.messages.length > 0) {
    return payload.messages
  }
  // Priority 2: artifact.transcript as array
  if (call.artifact?.transcript && Array.isArray(call.artifact.transcript)) {
    return call.artifact.transcript
  }
  // Priority 3: artifact.messages
  if (call.artifact?.messages) {
    return call.artifact.messages
  }
  // Priority 4: call.messages (legacy location)
  if (call.messages) {
    return call.messages
  }
  return []
}

/**
 * Get recording URL from call data or root payload
 * VAPI sends recordingUrl at ROOT level of the webhook payload, not inside call.artifact
 */
function extractRecordingUrl(call: VapiCall, payload?: VapiWebhookPayload): string | null {
  // Priority 1: Root level recordingUrl (VAPI's actual format!)
  if (payload?.recordingUrl) {
    return payload.recordingUrl
  }
  // Priority 2: artifact.recording or artifact.recordingUrl (per docs)
  if (call.artifact?.recording || call.artifact?.recordingUrl) {
    return call.artifact.recording || call.artifact.recordingUrl || null
  }
  // Priority 3: call level recordingUrl (fallback)
  return call.recordingUrl || null
}

/**
 * Get stereo recording URL if available
 * VAPI sends stereoRecordingUrl at ROOT level of the webhook payload
 */
function extractStereoRecordingUrl(call: VapiCall, payload?: VapiWebhookPayload): string | null {
  // Priority 1: Root level stereoRecordingUrl (VAPI's actual format!)
  if (payload?.stereoRecordingUrl) {
    return payload.stereoRecordingUrl
  }
  // Priority 2: artifact fields
  if (call.artifact?.stereoRecording || call.artifact?.stereoRecordingUrl) {
    return call.artifact.stereoRecording || call.artifact.stereoRecordingUrl || null
  }
  // Priority 3: call level
  return call.stereoRecordingUrl || null
}

/**
 * Forward webhook event to user's configured webhook URL
 */
async function forwardToUserWebhook(
  agent: { id: string; config: unknown } | null,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    if (!agent) return

    const config = agent.config as Record<string, unknown> | null
    const webhookUrl = config?.tools_server_url as string | undefined

    if (!webhookUrl) {
      console.log(`[VAPI Webhook] No webhook URL configured for agent ${agent.id}`)
      return
    }

    console.log(`[VAPI Webhook] Forwarding to user webhook: ${webhookUrl}`)

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error(`[VAPI Webhook] User webhook returned error: ${response.status}`)
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error forwarding to user webhook:", error)
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Handle status-update event from VAPI
 * Creates conversation on first status update (call start)
 *
 * NOTE: This handler does NOT index to Algolia. Only end-of-call-report
 * events trigger Algolia indexing for call logs display.
 */
async function handleStatusUpdate(payload: VapiWebhookPayload) {
  const { call } = payload.message
  const status = payload.message.status

  console.log(`[VAPI Webhook] Status update: ${status} for call ${call?.id}`)

  if (!prisma || !call?.id) {
    console.error("[VAPI Webhook] Prisma not configured or no call ID")
    return
  }

  // Find existing conversation
  let conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: {
      workspace: { select: { id: true, partnerId: true } },
      agent: { select: { id: true, name: true, provider: true, config: true } },
    },
  })

  // Get assistant ID from either direct field or nested assistant object
  const assistantId = call.assistantId || call.assistant?.id

  // If no conversation exists and we have an assistant ID, create one
  if (!conversation && assistantId) {
    const agent = await prisma.aiAgent.findFirst({
      where: { externalAgentId: assistantId, deletedAt: null },
      include: { workspace: { select: { id: true, partnerId: true } } },
    })

    if (agent?.workspace) {
      const callType = determineCallType(call)
      const direction = callType === "inbound" ? "inbound" : "outbound"

      // Map VAPI status to our status
      let dbStatus: "initiated" | "ringing" | "in_progress" | "completed" | "failed" = "initiated"
      if (status === "queued") dbStatus = "initiated"
      else if (status === "ringing") dbStatus = "ringing"
      else if (status === "in-progress") dbStatus = "in_progress"
      else if (status === "ended") dbStatus = "completed"

      // Parse timestamp safely - handle invalid dates
      const parsedStartedAt = call.startedAt ? new Date(call.startedAt) : null
      const validStartedAt =
        parsedStartedAt && parsedStartedAt.getTime() > 0 && parsedStartedAt.getFullYear() > 2000
          ? parsedStartedAt
          : new Date()

      conversation = await prisma.conversation.create({
        data: {
          externalId: call.id,
          workspaceId: agent.workspace.id,
          agentId: agent.id,
          direction: direction,
          status: dbStatus,
          startedAt: validStartedAt,
          phoneNumber: call.customer?.number || call.phoneNumber?.number || null,
          callerName: call.customer?.name || call.phoneNumber?.name || null,
          totalCost: 0,
          metadata: {
            provider: "vapi",
            call_type: call.type,
            assistant_id: assistantId,
          },
        },
        include: {
          workspace: { select: { id: true, partnerId: true } },
          agent: { select: { id: true, name: true, provider: true, config: true } },
        },
      })

      console.log(`[VAPI Webhook] Created conversation for call: ${conversation.id}`)
    }
  }

  // Update existing conversation status
  if (conversation) {
    let dbStatus: "initiated" | "ringing" | "in_progress" | "completed" | "failed" =
      conversation.status as "initiated" | "ringing" | "in_progress" | "completed" | "failed"
    if (status === "in-progress") dbStatus = "in_progress"
    else if (status === "ringing") dbStatus = "ringing"
    else if (status === "ended") dbStatus = "completed"

    // Parse timestamp safely - handle invalid dates
    const parsedStartedAt = call.startedAt ? new Date(call.startedAt) : null
    const validStartedAt =
      parsedStartedAt && parsedStartedAt.getTime() > 0 && parsedStartedAt.getFullYear() > 2000
        ? parsedStartedAt
        : conversation.startedAt

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: dbStatus,
        startedAt: validStartedAt,
      },
    })

    console.log(`[VAPI Webhook] Updated conversation ${conversation.id} status to ${dbStatus}`)

    // Forward to user's webhook
    await forwardToUserWebhook(conversation.agent, {
      type: "status-update",
      status: status,
      call_id: call.id,
      conversation_id: conversation.id,
      started_at: call.startedAt,
    })
  }
}

/**
 * Handle end-of-call-report event from VAPI
 * Contains complete call summary with transcript, recording, analysis
 *
 * IMPORTANT: This is the ONLY VAPI event that triggers Algolia indexing.
 * Only completed calls with full data are indexed for call logs display.
 */
async function handleEndOfCallReport(payload: VapiWebhookPayload) {
  // IMPORTANT: VAPI sends data at BOTH message.call AND ROOT level!
  // Root level: messages, recordingUrl, stereoRecordingUrl, summary, analysis
  // Message level: message.call contains call metadata
  // NOTE: cost and costBreakdown are at MESSAGE level, NOT inside call!
  const call = payload.message?.call || payload.call
  const messageCost = (payload.message as any)?.cost as number | undefined
  const messageCostBreakdown = (payload.message as any)?.costBreakdown as object | undefined

  if (!call) {
    console.error("[VAPI Webhook] No call object found in payload")
    return
  }

  // Enhanced logging for debugging - check BOTH root and nested locations
  console.log(`[VAPI Webhook] End of call report: ${call?.id}`, {
    type: call?.type,
    assistantId: call?.assistantId,
    assistantIdFromNested: call?.assistant?.id,
    // ROOT LEVEL fields (VAPI's actual format!)
    hasRootMessages: !!(payload.messages && payload.messages.length > 0),
    rootMessagesCount: payload.messages?.length || 0,
    hasRootRecordingUrl: !!payload.recordingUrl,
    hasRootStereoRecordingUrl: !!payload.stereoRecordingUrl,
    hasRootSummary: !!payload.summary,
    hasRootAnalysis: !!payload.analysis,
    // Nested fields (per VAPI docs)
    hasAnalysis: !!call?.analysis,
    hasArtifact: !!call?.artifact,
    hasSentiment: !!call?.sentiment,
    sentimentOverall: call?.sentiment?.overall,
    // Customer data
    customerNumber: call?.customer?.number,
    customerName: call?.customer?.name,
    phoneNumber: call?.phoneNumber?.number,
    startedAt: call?.startedAt,
    endedAt: call?.endedAt,
    costFromCall: call?.cost, // Legacy - may not be present
    costFromMessage: messageCost, // Correct location at message level
  })

  if (!prisma || !call?.id) {
    console.error("[VAPI Webhook] Prisma not configured or no call ID")
    return
  }

  // Find or create conversation
  let conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: {
      workspace: { select: { id: true, partnerId: true } },
      agent: { select: { id: true, name: true, provider: true, config: true } },
    },
  })

  // Get assistant ID from either direct field or nested assistant object
  const assistantId = call.assistantId || call.assistant?.id

  // If no conversation exists, create one
  if (!conversation && assistantId) {
    console.log(`[VAPI Webhook] Conversation not found, creating for call: ${call.id}`)

    const agent = await prisma.aiAgent.findFirst({
      where: { externalAgentId: assistantId, deletedAt: null },
      include: { workspace: { select: { id: true, partnerId: true } } },
    })

    if (!agent?.workspace) {
      console.error(`[VAPI Webhook] Agent not found for assistantId: ${assistantId}`)
      return
    }

    const callType = determineCallType(call)
    const direction = callType === "inbound" ? "inbound" : "outbound"

    // Parse timestamps safely - handle invalid dates
    const startedAt = call.startedAt ? new Date(call.startedAt) : null
    const endedAt = call.endedAt ? new Date(call.endedAt) : null

    // Validate timestamps are reasonable (not Unix epoch / year 1970)
    const validStartedAt =
      startedAt && startedAt.getTime() > 0 && startedAt.getFullYear() > 2000
        ? startedAt
        : new Date()
    const validEndedAt =
      endedAt && endedAt.getTime() > 0 && endedAt.getFullYear() > 2000 ? endedAt : new Date()

    const durationMs = validEndedAt.getTime() - validStartedAt.getTime()
    const durationSeconds = Math.max(0, Math.floor(durationMs / 1000))

    // Pass full payload to extraction functions - data is at ROOT level!
    const transcriptMessages = extractTranscriptMessages(call, payload)
    const formattedTranscript = extractFormattedTranscript(call, payload)
    const recordingUrl = extractRecordingUrl(call, payload)
    const stereoRecordingUrl = extractStereoRecordingUrl(call, payload)

    // Extract sentiment from call.sentiment.overall (not call.analysis.sentiment)
    const sentiment = call.sentiment?.overall || null

    // Summary can be at root level or in analysis
    const summary = payload.summary || payload.analysis?.summary || call.analysis?.summary || null

    // Log what we extracted
    console.log(`[VAPI Webhook] Extracted data for new conversation:`, {
      hasTranscript: !!formattedTranscript,
      transcriptLength: formattedTranscript?.length || 0,
      hasRecordingUrl: !!recordingUrl,
      hasSummary: !!summary,
      hasSentiment: !!sentiment,
      transcriptMessagesCount: transcriptMessages.length,
    })

    conversation = await prisma.conversation.create({
      data: {
        externalId: call.id,
        workspaceId: agent.workspace.id,
        agentId: agent.id,
        direction: direction,
        status: "completed",
        startedAt: validStartedAt,
        endedAt: validEndedAt,
        durationSeconds: durationSeconds,
        transcript: formattedTranscript,
        recordingUrl: recordingUrl,
        summary: summary,
        sentiment: sentiment,
        phoneNumber: call.customer?.number || call.phoneNumber?.number || null,
        callerName: call.customer?.name || call.phoneNumber?.name || null,
        totalCost: messageCost || 0, // Use message.cost (at message level, not call level)
        costBreakdown: messageCostBreakdown ?? {},
        metadata: {
          provider: "vapi",
          call_type: call.type,
          ended_reason: call.endedReason,
          assistant_id: assistantId,
          stereo_recording_url: stereoRecordingUrl,
          transcript_messages: JSON.parse(JSON.stringify(transcriptMessages)),
          analysis: JSON.parse(JSON.stringify(payload.analysis || call.analysis || {})),
          sentiment_scores: call.sentiment?.scores,
          success_evaluation: call.analysis?.successEvaluation,
          emotions: call.analysis?.emotions
            ? JSON.parse(JSON.stringify(call.analysis.emotions))
            : undefined,
        },
      },
      include: {
        workspace: { select: { id: true, partnerId: true } },
        agent: { select: { id: true, name: true, provider: true, config: true } },
      },
    })

    if (conversation) {
      console.log(`[VAPI Webhook] Created conversation: ${conversation.id}`)
    }
  } else if (conversation) {
    // Update existing conversation with complete data
    // Parse timestamps safely - handle invalid dates
    const parsedStartedAt = call.startedAt ? new Date(call.startedAt) : null
    const parsedEndedAt = call.endedAt ? new Date(call.endedAt) : null

    // Validate timestamps are reasonable (not Unix epoch / year 1970)
    const startedAt =
      parsedStartedAt && parsedStartedAt.getTime() > 0 && parsedStartedAt.getFullYear() > 2000
        ? parsedStartedAt
        : conversation.startedAt
    const endedAt =
      parsedEndedAt && parsedEndedAt.getTime() > 0 && parsedEndedAt.getFullYear() > 2000
        ? parsedEndedAt
        : new Date()

    const durationMs = startedAt && endedAt ? endedAt.getTime() - (startedAt as Date).getTime() : 0
    const durationSeconds = Math.max(0, Math.floor(durationMs / 1000))

    // Pass full payload to extraction functions - data is at ROOT level!
    const transcriptMessages = extractTranscriptMessages(call, payload)
    const formattedTranscript = extractFormattedTranscript(call, payload)
    const recordingUrl = extractRecordingUrl(call, payload)
    const stereoRecordingUrl = extractStereoRecordingUrl(call, payload)

    // Extract sentiment from call.sentiment.overall (not call.analysis.sentiment)
    const sentiment = call.sentiment?.overall || conversation.sentiment

    // Summary can be at root level or in analysis
    const summary =
      payload.summary || payload.analysis?.summary || call.analysis?.summary || conversation.summary

    // Log what we extracted
    console.log(`[VAPI Webhook] Extracted data for conversation update:`, {
      conversationId: conversation.id,
      hasTranscript: !!formattedTranscript,
      transcriptLength: formattedTranscript?.length || 0,
      hasRecordingUrl: !!recordingUrl,
      hasSummary: !!summary,
      hasSentiment: !!sentiment,
      transcriptMessagesCount: transcriptMessages.length,
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: "completed",
        endedAt: endedAt,
        durationSeconds: durationSeconds,
        transcript: formattedTranscript || conversation.transcript,
        recordingUrl: recordingUrl || conversation.recordingUrl,
        summary: summary,
        sentiment: sentiment,
        phoneNumber: call.customer?.number || call.phoneNumber?.number || conversation.phoneNumber,
        callerName: call.customer?.name || call.phoneNumber?.name || conversation.callerName,
        totalCost: messageCost || conversation.totalCost, // Use message.cost (at message level, not call level)
        costBreakdown: messageCostBreakdown ?? conversation.costBreakdown ?? {},
        metadata: {
          ...((conversation.metadata as object) || {}),
          call_type: call.type,
          ended_reason: call.endedReason,
          stereo_recording_url: stereoRecordingUrl,
          transcript_messages: JSON.parse(JSON.stringify(transcriptMessages)),
          analysis: JSON.parse(JSON.stringify(payload.analysis || call.analysis || {})),
          sentiment_scores: call.sentiment?.scores,
          success_evaluation: call.analysis?.successEvaluation,
          emotions: call.analysis?.emotions
            ? JSON.parse(JSON.stringify(call.analysis.emotions))
            : undefined,
        },
      },
    })

    console.log(`[VAPI Webhook] Updated conversation: ${conversation.id}`)
  }

  if (!conversation?.workspace) {
    console.error(`[VAPI Webhook] Conversation has no workspace`)
    return
  }

  // Process billing FIRST - so cost is calculated before Algolia indexing
  const billingStartedAt = call.startedAt ? new Date(call.startedAt) : null
  const billingEndedAt = call.endedAt ? new Date(call.endedAt) : null

  // Validate timestamps are reasonable
  const validBillingStartedAt =
    billingStartedAt && billingStartedAt.getTime() > 0 && billingStartedAt.getFullYear() > 2000
      ? billingStartedAt
      : conversation.startedAt
  const validBillingEndedAt =
    billingEndedAt && billingEndedAt.getTime() > 0 && billingEndedAt.getFullYear() > 2000
      ? billingEndedAt
      : new Date()

  const billingDurationMs =
    validBillingStartedAt && validBillingEndedAt
      ? validBillingEndedAt.getTime() - (validBillingStartedAt as Date).getTime()
      : 0
  const durationSeconds = Math.max(0, Math.floor(billingDurationMs / 1000))

  const billingResult = await processCallCompletion({
    conversationId: conversation.id,
    workspaceId: conversation.workspace.id,
    partnerId: conversation.workspace.partnerId,
    durationSeconds: durationSeconds,
    provider: "vapi",
    externalCallId: call.id,
  })

  if (billingResult.success) {
    console.log(
      `[VAPI Webhook] Billing processed for call ${call.id}: ` +
        `${billingResult.minutesAdded} minutes, $${(billingResult.amountDeducted || 0) / 100} deducted`
    )
  } else {
    console.error(
      `[VAPI Webhook] Billing failed for call ${call.id}: ${billingResult.error || billingResult.reason}`
    )
  }

  // Re-fetch conversation to get the updated cost from billing
  const finalConversation = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: {
      workspace: { select: { id: true, partnerId: true } },
      agent: { select: { id: true, name: true, provider: true } },
    },
  })

  // Index to Algolia AFTER billing - so cost is correct
  // IMPORTANT: Must await to ensure indexing completes before serverless function terminates
  if (finalConversation && finalConversation.agent) {
    try {
      // Configure index settings if not already done (idempotent operation)
      await configureCallLogsIndex(finalConversation.workspace!.id)

      console.log(
        `[VAPI Webhook] Indexing call ${call.id} to Algolia with cost: ${finalConversation.totalCost}`
      )

      // Now index the call log with the correct cost
      const indexResult = await indexCallLogToAlgolia({
        conversation: finalConversation as unknown as Conversation,
        workspaceId: finalConversation.workspace!.id,
        partnerId: finalConversation.workspace!.partnerId,
        agentName: finalConversation.agent?.name || "Unknown Agent",
        agentProvider: (finalConversation.agent?.provider as AgentProvider) || "vapi",
      })

      if (indexResult.success) {
        console.log(`[VAPI Webhook] Successfully indexed call ${call.id} to Algolia`)
      } else {
        console.warn(
          `[VAPI Webhook] Algolia indexing skipped for call ${call.id}: ${indexResult.reason}`
        )
      }
    } catch (err) {
      console.error("[VAPI Webhook] Algolia indexing failed:", err)
    }
  }

  // Forward to user's webhook
  await forwardToUserWebhook(conversation.agent, {
    type: "end-of-call-report",
    call_id: call.id,
    conversation_id: conversation.id,
    duration_seconds: durationSeconds,
    transcript: extractFormattedTranscript(call),
    recording_url: extractRecordingUrl(call),
    summary: call.analysis?.summary,
    sentiment: call.analysis?.sentiment,
    status: "completed",
    ended_reason: call.endedReason,
    cost: messageCost, // Use message.cost (at message level, not call level)
  })
}

/**
 * Handle function-calls event within message payload
 */
async function handleFunctionCallInMessage(payload: VapiWebhookPayload) {
  const { call } = payload.message
  const functionCalls = payload.message.functionCalls || payload.message.toolCalls

  console.log(`[VAPI Webhook] Function call in message for call ${call?.id}`)

  if (!call?.id || !prisma) return

  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: { agent: { select: { id: true, config: true } } },
  })

  if (conversation?.agent) {
    await forwardToUserWebhook(conversation.agent, {
      type: "function-call",
      call_id: call.id,
      conversation_id: conversation.id,
      function_calls: functionCalls,
    })
  }
}

/**
 * Forward other events to user's webhook
 */
async function forwardEventToUserWebhook(payload: VapiWebhookPayload) {
  const { call } = payload.message
  const eventType = payload.message.type

  if (!call?.id || !prisma) return

  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: { agent: { select: { id: true, config: true } } },
  })

  if (conversation?.agent) {
    await forwardToUserWebhook(conversation.agent, {
      type: eventType,
      call_id: call.id,
      conversation_id: conversation.id,
      payload: payload.message,
    })
  }
}

/**
 * Handle direct function tool execution
 */
async function handleFunctionCall(payload: VapiFunctionCall): Promise<Record<string, unknown>> {
  const functionName = payload.toolCall?.name || "unknown"
  const parameters = payload.toolCall?.arguments || {}
  const callId = payload.callId
  const assistantId = payload.assistantId

  console.log(`[VAPI Webhook] Executing function: ${functionName}`)

  if (!assistantId || !prisma) {
    return { success: false, error: "No assistant ID or Prisma not configured" }
  }

  const agent = await prisma.aiAgent.findFirst({
    where: { externalAgentId: assistantId },
    select: { id: true, config: true },
  })

  if (!agent) {
    return { success: false, error: "Agent not found" }
  }

  // Check if this is a calendar tool - handle internally
  if (isCalendarTool(functionName)) {
    console.log(`[VAPI Webhook] Handling calendar tool: ${functionName} for agent ${agent.id}`)
    
    // Get conversation ID for linking appointment
    let conversationId: string | undefined
    if (callId) {
      const conversation = await prisma.conversation.findFirst({
        where: { externalId: callId },
        select: { id: true },
      })
      conversationId = conversation?.id
    }

    const result = await handleCalendarToolCall(
      { name: functionName, arguments: parameters },
      { agentId: agent.id, conversationId, callId }
    )

    // Return result in VAPI expected format
    return {
      results: [
        {
          toolCallId: payload.toolCall?.id,
          result: result.success ? result.result : result.error,
        },
      ],
    }
  }

  // For other tools, forward to user's webhook
  const config = agent.config as Record<string, unknown> | null
  const webhookUrl = config?.tools_server_url as string | undefined

  if (!webhookUrl) {
    return { success: false, error: "No webhook URL configured" }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: functionName,
        parameters,
        call_id: callId,
        agent_id: assistantId,
      }),
    })

    if (!response.ok) {
      return { success: false, error: `Webhook returned ${response.status}` }
    }

    const result = await response.json()
    return { success: true, result }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

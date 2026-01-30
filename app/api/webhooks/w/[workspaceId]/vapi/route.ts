/**
 * POST /api/webhooks/w/[workspaceId]/vapi
 *
 * Workspace-level VAPI webhook handler for call events.
 * This endpoint receives webhooks from VAPI for all agents in a workspace.
 *
 * Events handled:
 * - status-update: Call status changes (queued, ringing, in-progress, ended)
 * - end-of-call-report: Complete call summary with transcript and recording
 * - function-call/tool-calls: When agent executes custom function tools
 * - transfer-update: When call transfers occur
 *
 * Flow:
 * 1. VAPI sends webhook with assistantId in payload
 * 2. Handler looks up agent by external_agent_id + workspace_id
 * 3. Creates/updates conversation record
 * 4. Processes billing if call ended
 * 5. Indexes to Algolia
 * 6. Supabase Realtime notifies frontend subscribers
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { processCallCompletion } from "@/lib/billing/usage"
import { indexCallLogToAlgolia } from "@/lib/algolia"
import type { AgentProvider, Conversation } from "@/types/database.types"
import { createClient } from "@supabase/supabase-js"
import { handleCalendarToolCall, isCalendarConfigured } from "@/lib/integrations/calendar"
import { isCalendarTool } from "@/lib/integrations/calendar/vapi-tools"

export const dynamic = "force-dynamic"

// =============================================================================
// DATABASE CLIENT
// =============================================================================

/**
 * Get Supabase admin client for webhook handler
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials not configured")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// =============================================================================
// TYPES
// =============================================================================

interface VapiTranscriptMessage {
  role: string
  message?: string
  content?: string
  time?: number
}

/**
 * VAPI Webhook Payload Structure
 *
 * Expected end-of-call-report structure:
 * {
 *   "message": {
 *     "type": "end-of-call-report",
 *     "call": {
 *       "artifact": {
 *         "recording": "https://api.vapi.ai/recordings/...",
 *         "transcript": "Full conversation text..." OR [...messages],
 *         "messages": [{ role, message, time }]
 *       },
 *       "analysis": {
 *         "summary": "Call summary...",
 *         "structuredData": {...}
 *       }
 *     }
 *   }
 * }
 */
interface VapiWebhookPayload {
  message: {
    type: string
    timestamp?: number
    // ARTIFACT - VAPI sends at message level (NOT message.call.artifact!)
    artifact?: {
      // Recording can be a string URL OR an object with stereoUrl/mono properties
      recording?:
        | string
        | {
            stereoUrl?: string
            mono?: {
              combinedUrl?: string
              assistantUrl?: string
              customerUrl?: string
            }
          }
      stereoRecording?: string // Stereo recording URL (may also be object)
      transcript?: string | VapiTranscriptMessage[] // Can be string or array
      messages?: VapiTranscriptMessage[] // Transcript messages
      logUrl?: string
    }
    // ANALYSIS - VAPI sends at message level (NOT message.call.analysis!)
    analysis?: {
      summary?: string
      structuredData?: Record<string, unknown>
      successEvaluation?: string
    }
    call: {
      id: string
      orgId: string
      type?: "webCall" | "inboundPhoneCall" | "outboundPhoneCall"
      assistantId?: string
      assistant?: { id?: string; name?: string }
      startedAt: string
      endedAt?: string
      cost?: number
      costBreakdown?: {
        transport?: number
        stt?: number
        llm?: number
        tts?: number
        vapi?: number
        total?: number
      }
      // Legacy fields (may still be present)
      messages?: VapiTranscriptMessage[]
      transcript?: string
      recordingUrl?: string
      // Phone/customer info
      phoneNumber?: {
        number: string
      }
      customer?: {
        number: string
        name?: string
      }
      endedReason?: string
      sentiment?: {
        overall?: string
        scores?: {
          positive?: number
          neutral?: number
          negative?: number
        }
      }
    }
    // For status-update events
    status?: string
    // For function-call events
    functionCalls?: unknown[]
    toolCalls?: unknown[]
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

interface RouteContext {
  params: Promise<{ workspaceId: string }>
}

// =============================================================================
// WEBHOOK CONFIGURATION
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
// WEBHOOK VALIDATION
// =============================================================================

/**
 * Validate VAPI webhook request
 *
 * Security layers:
 * 1. Timestamp validation - Prevents replay attacks (5-minute window)
 * 2. Payload structure validation - Ensures required fields are present
 * 3. Workspace ID in URL - Request must target a valid workspace
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
      return { valid: false, error: "Request timestamp too old (replay attack prevention)" }
    }
  }

  // Layer 2: Validate payload structure
  if ("message" in payload) {
    const callPayload = payload as VapiWebhookPayload
    const call = callPayload.message?.call

    if (!call?.id) {
      return { valid: false, error: "Missing call.id in payload" }
    }
  } else if ("assistantId" in payload || "callId" in payload) {
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

  if (!webhookSecret) {
    return { valid: true, skipped: true }
  }

  if (!signature) {
    return { valid: false, error: "Missing x-vapi-signature header" }
  }

  if (!timestamp) {
    return { valid: false, error: "Missing x-vapi-timestamp header" }
  }

  const signaturePayload = timestamp + rawBody
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signaturePayload, "utf8")
    .digest("hex")

  const receivedSignature = signature.replace("sha256=", "")

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
// MAIN HANDLER
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { workspaceId } = await params

  console.log(`[VAPI Webhook W/${workspaceId}] ===== WEBHOOK RECEIVED =====`)
  console.log(`[VAPI Webhook W/${workspaceId}] URL: ${request.url}`)
  console.log(`[VAPI Webhook W/${workspaceId}] Headers:`, {
    signature: request.headers.get("x-vapi-signature"),
    timestamp: request.headers.get("x-vapi-timestamp"),
  })

  try {
    // Get raw body for signature verification
    const rawBody = await request.text()

    console.log(`[VAPI Webhook W/${workspaceId}] Raw body length: ${rawBody.length}`)
    if (rawBody.length < 500) {
      console.log(`[VAPI Webhook W/${workspaceId}] Raw body:`, rawBody)
    }

    // Get signature headers
    const signature = request.headers.get("x-vapi-signature")
    const timestamp = request.headers.get("x-vapi-timestamp")

    // Verify signature (if VAPI_WEBHOOK_SECRET is configured)
    const signatureVerification = verifyVapiSignature(rawBody, signature, timestamp)
    if (!signatureVerification.valid) {
      console.error(
        `[VAPI Webhook W/${workspaceId}] Signature verification failed: ${signatureVerification.error}`
      )
      return NextResponse.json({ error: signatureVerification.error }, { status: 401 })
    }

    // Parse JSON body
    let payload: VapiWebhookPayload | VapiFunctionCall
    try {
      payload = JSON.parse(rawBody)
    } catch (e) {
      console.error(`[VAPI Webhook W/${workspaceId}] JSON parse error:`, e)
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    // Validate webhook request (timestamp + payload structure)
    const requestValidation = validateWebhookRequest(payload, timestamp)
    if (!requestValidation.valid) {
      console.error(
        `[VAPI Webhook W/${workspaceId}] Request validation failed: ${requestValidation.error}`
      )
      return NextResponse.json({ error: requestValidation.error }, { status: 400 })
    }

    console.log(`[VAPI Webhook W/${workspaceId}] Received webhook`)

    // Validate workspace exists using Supabase (more reliable than Prisma for webhooks)
    const supabase = getSupabaseAdmin()
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, partner_id")
      .eq("id", workspaceId)
      .single()

    if (workspaceError || !workspace) {
      console.error(`[VAPI Webhook] Workspace not found: ${workspaceId}`, workspaceError)
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }

    // Determine if this is a call event or function call
    if ("message" in payload) {
      const callPayload = payload as VapiWebhookPayload
      const eventType = callPayload.message.type

      console.log(`[VAPI Webhook W/${workspaceId}] Event Type: ${eventType}`)
      console.log(`[VAPI Webhook W/${workspaceId}] Call ID: ${callPayload.message.call?.id}`)
      console.log(`[VAPI Webhook W/${workspaceId}] Call Type: ${callPayload.message.call?.type}`)
      console.log(
        `[VAPI Webhook W/${workspaceId}] Assistant ID: ${callPayload.message.call?.assistantId}`
      )

      // Filter ignored events
      if (IGNORED_EVENTS.includes(eventType)) {
        console.log(`[VAPI Webhook W/${workspaceId}] Ignoring event: ${eventType}`)
        return NextResponse.json({ received: true })
      }

      // Only process forwarded events
      if (!FORWARDED_EVENTS.includes(eventType)) {
        console.log(`[VAPI Webhook W/${workspaceId}] Event not in FORWARDED_EVENTS: ${eventType}`)
        return NextResponse.json({ received: true })
      }

      switch (eventType) {
        case "status-update":
          await handleStatusUpdate(callPayload, workspaceId, workspace.partner_id)
          break

        case "end-of-call-report":
          await handleEndOfCallReport(callPayload, workspaceId, workspace.partner_id)
          break

        case "function-call":
        case "tool-calls": {
          // Execute tools and return results to VAPI
          const toolResults = await handleFunctionCall(callPayload, workspaceId)
          if (toolResults) {
            console.log(`[VAPI Webhook W/${workspaceId}] Returning tool results:`, toolResults)
            return NextResponse.json(toolResults)
          }
          break
        }

        default:
          console.log(`[VAPI Webhook W/${workspaceId}] Unhandled event: ${eventType}`)
      }

      return NextResponse.json({ received: true })
    } else if (
      "toolCall" in payload ||
      payload.type === "function-call" ||
      payload.type === "tool-calls"
    ) {
      // Direct function call
      const funcPayload = payload as VapiFunctionCall
      const result = await handleDirectFunctionCall(funcPayload, workspaceId)
      return NextResponse.json(result)
    } else {
      console.warn(`[VAPI Webhook W/${workspaceId}] Unknown payload type`)
      return NextResponse.json({ error: "Unknown payload type" }, { status: 400 })
    }
  } catch (error) {
    console.error(`[VAPI Webhook W/${workspaceId}] Error:`, error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleStatusUpdate(
  payload: VapiWebhookPayload,
  workspaceId: string,
  partnerId: string
) {
  const { call, status } = payload.message

  if (!call?.id) return

  console.log(`[VAPI Webhook] Status update: ${status} for call ${call.id}`)

  const supabase = getSupabaseAdmin()

  // Find existing conversation (don't filter by workspace - externalId is unique)
  const { data: conversation, error: findError } = await supabase
    .from("conversations")
    .select("*")
    .eq("external_id", call.id)
    .single()

  // If no conversation exists and status is starting, create one
  if ((findError || !conversation) && (status === "in-progress" || status === "ringing")) {
    const agent = await findAgentByAssistantId(call.assistantId, workspaceId)

    if (agent) {
      // Use agent's actual workspace_id (not the one from URL - could be mismatched!)
      const agentWorkspaceId = agent.workspace_id || workspaceId
      if (agentWorkspaceId !== workspaceId) {
        console.warn(
          `[VAPI Webhook] StatusUpdate: Workspace ID mismatch! URL: ${workspaceId}, Agent: ${agentWorkspaceId}`
        )
      }

      const { data: newConversation, error: createError } = await supabase
        .from("conversations")
        .insert({
          external_id: call.id,
          workspace_id: agentWorkspaceId, // Use agent's actual workspace
          agent_id: agent.id,
          direction: mapCallDirection(call.type),
          status: mapVapiStatus(status),
          started_at: call.startedAt ? new Date(call.startedAt).toISOString() : new Date().toISOString(),
          phone_number: call.customer?.number || null,
          caller_name: call.customer?.name || null,
          metadata: {
            provider: "vapi",
            call_type: call.type,
            assistant_id: call.assistantId,
          },
        })
        .select()
        .single()

      if (createError) {
        console.error(`[VAPI Webhook] Error creating conversation:`, createError)
        return
      }

      console.log(
        `[VAPI Webhook] Created conversation: ${newConversation?.id} in workspace: ${agentWorkspaceId}`
      )
      return
    }
  }

  // Update existing conversation status
  if (conversation) {
    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        status: mapVapiStatus(status),
        started_at:
          status === "in-progress" && !conversation.started_at
            ? new Date(call.startedAt || Date.now()).toISOString()
            : undefined,
      })
      .eq("id", conversation.id)

    if (updateError) {
      console.error(`[VAPI Webhook] Error updating conversation:`, updateError)
      return
    }
    console.log(`[VAPI Webhook] Updated conversation ${conversation.id} to status: ${status}`)
  }
}

async function handleEndOfCallReport(
  payload: VapiWebhookPayload,
  workspaceId: string,
  partnerId: string
) {
  // DEBUG: Log raw payload keys to see exactly what VAPI sends
  console.log("[VAPI Webhook] RAW PAYLOAD KEYS:", Object.keys(payload))
  console.log("[VAPI Webhook] MESSAGE KEYS:", Object.keys(payload.message || {}))

  // Extract from message - note: cost/costBreakdown are at MESSAGE level, not inside call!
  const message = payload.message
  const { call, artifact, analysis } = message
  const messageCost = (message as any).cost as number | undefined
  const messageCostBreakdown = (message as any).costBreakdown as object | undefined

  if (!call?.id) {
    console.error("[VAPI Webhook] No call ID")
    return
  }

  const supabase = getSupabaseAdmin()

  // Get assistantId from either direct field or nested assistant object
  const assistantId = call.assistantId || call.assistant?.id

  // endedReason can be at message level or call level - check both
  const endedReason = call.endedReason || (message as any).endedReason

  console.log(`[VAPI Webhook] End of call report: ${call.id}`, {
    type: call.type,
    assistantId: assistantId,
    endedReason: endedReason || "NOT PROVIDED",
    cost: messageCost,
  })

  // Log message.artifact data (CORRECT location per VAPI docs!)
  console.log("[VAPI Webhook] message.artifact data:", {
    hasArtifact: !!artifact,
    artifactRecording: artifact?.recording || "NOT PRESENT",
    artifactStereoRecording: artifact?.stereoRecording || "NOT PRESENT",
    artifactTranscript: artifact?.transcript
      ? typeof artifact.transcript === "string"
        ? "string"
        : "array"
      : "NOT PRESENT",
    artifactMessagesCount: artifact?.messages?.length || 0,
  })

  // Log message.analysis data (CORRECT location per VAPI docs!)
  console.log("[VAPI Webhook] message.analysis data:", {
    hasAnalysis: !!analysis,
    analysisSummary: analysis?.summary || "NOT PRESENT",
    hasStructuredData: !!analysis?.structuredData,
    successEvaluation: analysis?.successEvaluation || "NOT PRESENT",
  })

  // Log customer/phone data
  console.log("[VAPI Webhook] Customer data:")
  console.log("  - phoneNumber:", call.phoneNumber?.number)
  console.log("  - customer.number:", call.customer?.number)
  console.log("  - customer.name:", call.customer?.name)

  // Find existing conversation (don't filter by workspace - externalId is unique)
  // This allows us to find the conversation even if webhook URL has wrong workspace_id
  const { data: conversation, error: findConvError } = await supabase
    .from("conversations")
    .select(`
      *,
      agent:ai_agents(id, name, provider, config, workspace_id),
      workspace:workspaces(id, partner_id)
    `)
    .eq("external_id", call.id)
    .single()

  // If no conversation exists, create one (for phone calls that bypassed status-update)
  let conversationData = conversation
  let agentData = conversation?.agent

  if ((findConvError || !conversation) && assistantId) {
    const agent = await findAgentByAssistantId(assistantId, workspaceId)

    if (!agent) {
      console.error(`[VAPI Webhook] Agent not found for assistantId: ${assistantId}`)
      return
    }

    // Use agent's actual workspace_id (not the one from URL - could be mismatched!)
    const actualWorkspaceId = agent.workspace_id || workspaceId
    if (actualWorkspaceId !== workspaceId) {
      console.warn(
        `[VAPI Webhook] Workspace ID mismatch! URL: ${workspaceId}, Agent: ${actualWorkspaceId}. Using agent's workspace.`
      )
    }

    // Calculate duration with timestamp validation
    const parsedStartedAt = call.startedAt ? new Date(call.startedAt) : null
    const parsedEndedAt = call.endedAt ? new Date(call.endedAt) : null
    const startedAt =
      parsedStartedAt && parsedStartedAt.getFullYear() > 2000 ? parsedStartedAt : new Date()
    const endedAt = parsedEndedAt && parsedEndedAt.getFullYear() > 2000 ? parsedEndedAt : new Date()
    const durationMs = endedAt.getTime() - startedAt.getTime()
    const durationSeconds = Math.max(0, Math.floor(durationMs / 1000))

    // Extract recording from message.artifact (VAPI's actual structure!)
    // Recording can be a string URL or an object with stereoUrl/mono properties
    let recordingUrl: string | null = null
    if (artifact?.recording) {
      if (typeof artifact.recording === "string") {
        recordingUrl = artifact.recording
      } else if (typeof artifact.recording === "object") {
        // New VAPI format: { stereoUrl: "...", mono: { combinedUrl: "...", ... } }
        const rec = artifact.recording as { stereoUrl?: string; mono?: { combinedUrl?: string } }
        recordingUrl = rec.stereoUrl || rec.mono?.combinedUrl || null
      }
    }
    if (!recordingUrl && artifact?.stereoRecording) {
      recordingUrl = typeof artifact.stereoRecording === "string" ? artifact.stereoRecording : null
    }
    if (!recordingUrl && call.recordingUrl) {
      recordingUrl = call.recordingUrl
    }

    // Extract transcript from message.artifact
    // PRIORITY: artifact.messages (has roles) > artifact.transcript array > artifact.transcript string > call.transcript
    // This ensures we capture BOTH agent and user speech with proper speaker identification
    let transcript: string | null = null
    
    // Priority 1: Use artifact.messages array (best quality - has roles and timestamps)
    if (artifact?.messages && artifact.messages.length > 0) {
      transcript = artifact.messages
        .filter((m: any) => m.role === "assistant" || m.role === "user" || m.role === "bot")
        .map((m: any) => {
          const role = m.role === "assistant" || m.role === "bot" ? "Agent" : "User"
          return `${role}: ${m.message || m.content || ""}`
        })
        .join("\n")
    }
    // Priority 2: Use artifact.transcript if it's an array with role info
    else if (artifact?.transcript && Array.isArray(artifact.transcript)) {
      transcript = artifact.transcript
        .filter((t: any) => t.role === "assistant" || t.role === "user" || t.role === "bot")
        .map((t: any) => {
          const role = t.role === "assistant" || t.role === "bot" ? "Agent" : "User"
          return `${role}: ${t.message || t.content || ""}`
        })
        .join("\n")
    }
    // Priority 3: Use artifact.transcript string (may not have speaker IDs)
    else if (artifact?.transcript && typeof artifact.transcript === "string") {
      transcript = artifact.transcript
    }
    // Priority 4: Legacy fallback
    else if (call.transcript) {
      transcript = call.transcript
    }

    // Extract summary from message.analysis (VAPI's actual structure!)
    const summary = analysis?.summary || null

    // Extract sentiment
    const sentiment = call.sentiment?.overall || null

    const { data: newConversation, error: createError } = await supabase
      .from("conversations")
      .insert({
        external_id: call.id,
        workspace_id: actualWorkspaceId, // Use agent's actual workspace
        agent_id: agent.id,
        direction: mapCallDirection(call.type),
        status: "completed",
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
        transcript: transcript,
        recording_url: recordingUrl,
        summary: summary,
        sentiment: sentiment,
        phone_number: call.customer?.number || null,
        caller_name: call.customer?.name || null, // VAPI uses customer.name, not caller_name
        total_cost: messageCost || 0, // Use message.cost (at message level, not call level)
        metadata: {
          provider: "vapi",
          call_type: call.type,
          ended_reason: call.endedReason,
          vapi_cost_breakdown: messageCostBreakdown
            ? JSON.parse(JSON.stringify(messageCostBreakdown))
            : undefined,
          vapi_analysis: analysis ? JSON.parse(JSON.stringify(analysis)) : undefined,
          assistant_id: assistantId,
          stereo_recording_url:
            typeof artifact?.stereoRecording === "string" ? artifact.stereoRecording : undefined,
          artifact_messages: artifact?.messages
            ? JSON.parse(JSON.stringify(artifact.messages))
            : undefined,
        },
      })
      .select(`
        *,
        workspace:workspaces(id, partner_id),
        agent:ai_agents(id, name, provider, config, workspace_id)
      `)
      .single()

    if (createError) {
      console.error(`[VAPI Webhook] Error creating conversation:`, createError)
      return
    }

    conversationData = newConversation
    agentData = newConversation?.agent

    if (newConversation) {
      console.log(`[VAPI Webhook] Created conversation: ${newConversation.id}`)
      console.log(`[VAPI Webhook] Recording URL: ${recordingUrl || "NOT PROVIDED"}`)
      console.log(`[VAPI Webhook] Transcript length: ${transcript?.length || 0} chars`)
      console.log(`[VAPI Webhook] Summary: ${summary || "NOT PROVIDED"}`)
      console.log(`[VAPI Webhook] Sentiment: ${sentiment || "NOT PROVIDED"}`)
      // Note: Algolia indexing will happen AFTER billing is processed (below)
      // This ensures the cost is calculated before indexing
    }
  }

  if (!conversationData) {
    console.error(`[VAPI Webhook] Could not find or create conversation for call: ${call.id}`)
    return
  }

  // Calculate duration for existing conversations with timestamp validation
  const parsedStartedAt = call.startedAt ? new Date(call.startedAt) : null
  const parsedEndedAt = call.endedAt ? new Date(call.endedAt) : null
  const existingStartedAt = conversationData.started_at ? new Date(conversationData.started_at) : null
  const startedAt =
    parsedStartedAt && parsedStartedAt.getFullYear() > 2000
      ? parsedStartedAt
      : existingStartedAt
  const endedAt = parsedEndedAt && parsedEndedAt.getFullYear() > 2000 ? parsedEndedAt : new Date()
  const durationMs = startedAt && endedAt ? endedAt.getTime() - (startedAt as Date).getTime() : 0
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000))

  // Extract recording from message.artifact (VAPI's actual structure!)
  // Recording can be a string URL or an object with stereoUrl/mono properties
  let recordingUrl: string | null = null
  if (artifact?.recording) {
    if (typeof artifact.recording === "string") {
      recordingUrl = artifact.recording
    } else if (typeof artifact.recording === "object") {
      // New VAPI format: { stereoUrl: "...", mono: { combinedUrl: "...", ... } }
      const rec = artifact.recording as { stereoUrl?: string; mono?: { combinedUrl?: string } }
      recordingUrl = rec.stereoUrl || rec.mono?.combinedUrl || null
    }
  }
  if (!recordingUrl && artifact?.stereoRecording) {
    recordingUrl = typeof artifact.stereoRecording === "string" ? artifact.stereoRecording : null
  }
  if (!recordingUrl && call.recordingUrl) {
    recordingUrl = call.recordingUrl
  }

  // Extract transcript from message.artifact
  // PRIORITY: artifact.messages (has roles) > artifact.transcript array > artifact.transcript string > call.transcript
  // This ensures we capture BOTH agent and user speech with proper speaker identification
  let transcript: string | null = null
  
  // Priority 1: Use artifact.messages array (best quality - has roles and timestamps)
  if (artifact?.messages && artifact.messages.length > 0) {
    transcript = artifact.messages
      .filter((m: any) => m.role === "assistant" || m.role === "user" || m.role === "bot")
      .map((m: any) => {
        const role = m.role === "assistant" || m.role === "bot" ? "Agent" : "User"
        return `${role}: ${m.message || m.content || ""}`
      })
      .join("\n")
    console.log(`[VAPI Webhook] Built transcript from artifact.messages (${artifact.messages.length} messages)`)
  }
  // Priority 2: Use artifact.transcript if it's an array with role info
  else if (artifact?.transcript && Array.isArray(artifact.transcript)) {
    transcript = artifact.transcript
      .filter((t: any) => t.role === "assistant" || t.role === "user" || t.role === "bot")
      .map((t: any) => {
        const role = t.role === "assistant" || t.role === "bot" ? "Agent" : "User"
        return `${role}: ${t.message || t.content || ""}`
      })
      .join("\n")
    console.log(`[VAPI Webhook] Built transcript from artifact.transcript array`)
  }
  // Priority 3: Use artifact.transcript string (may not have speaker IDs)
  else if (artifact?.transcript && typeof artifact.transcript === "string") {
    transcript = artifact.transcript
    console.log(`[VAPI Webhook] Using artifact.transcript string (no role info)`)
  }
  // Priority 4: Legacy fallback
  else if (call.transcript) {
    transcript = call.transcript
    console.log(`[VAPI Webhook] Using legacy call.transcript fallback`)
  }

  // Extract summary from message.analysis (VAPI's actual structure!)
  const summary = analysis?.summary || null

  // Extract sentiment
  const sentiment = call.sentiment?.overall || null

  const { data: updatedConversation, error: updateError } = await supabase
    .from("conversations")
    .update({
      status: "completed",
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      transcript: transcript || conversationData.transcript,
      recording_url: recordingUrl || conversationData.recording_url,
      phone_number: call.customer?.number || conversationData.phone_number,
      caller_name: call.customer?.name || conversationData.caller_name,
      total_cost: messageCost || conversationData.total_cost, // Use message.cost (at message level, not call level)
      summary: summary || conversationData.summary,
      sentiment: sentiment || conversationData.sentiment,
      metadata: {
        ...((conversationData.metadata as object) || {}),
        call_type: call.type,
        vapi_ended_reason: call.endedReason,
        vapi_cost_breakdown: messageCostBreakdown
          ? JSON.parse(JSON.stringify(messageCostBreakdown))
          : undefined,
        vapi_analysis: analysis ? JSON.parse(JSON.stringify(analysis)) : undefined,
        stereo_recording_url:
          typeof artifact?.stereoRecording === "string" ? artifact.stereoRecording : undefined,
        artifact_messages: artifact?.messages
          ? JSON.parse(JSON.stringify(artifact.messages))
          : undefined,
      },
    })
    .eq("id", conversationData.id)
    .select()
    .single()

  if (updateError) {
    console.error(`[VAPI Webhook] Error updating conversation:`, updateError)
    return
  }

  console.log(`[VAPI Webhook] Updated conversation: ${conversationData.id}`)
  console.log(`[VAPI Webhook] Recording URL: ${recordingUrl || "NOT PROVIDED"}`)
  console.log(`[VAPI Webhook] Transcript length: ${transcript?.length || 0} chars`)
  console.log(`[VAPI Webhook] Summary: ${summary || "NOT PROVIDED"}`)
  console.log(`[VAPI Webhook] Sentiment: ${sentiment || "NOT PROVIDED"}`)

  // Get actual workspace info for billing and indexing
  const actualConversationWorkspaceId = conversationData.workspace?.id || conversationData.workspace_id || workspaceId
  const actualConversationPartnerId = conversationData.workspace?.partner_id || partnerId

  if (actualConversationWorkspaceId !== workspaceId) {
    console.warn(
      `[VAPI Webhook] Workspace mismatch detected! URL: ${workspaceId}, Conversation: ${actualConversationWorkspaceId}`
    )
  }

  // Process billing FIRST (so cost is calculated before indexing)
  const billingResult = await processCallCompletion({
    conversationId: conversationData.id,
    workspaceId: actualConversationWorkspaceId,
    partnerId: actualConversationPartnerId,
    durationSeconds: durationSeconds,
    provider: "vapi",
    externalCallId: call.id,
  })

  if (billingResult.success) {
    console.log(`[VAPI Webhook] Billing processed: ${billingResult.minutesAdded} minutes`)
  } else {
    console.error(`[VAPI Webhook] Billing failed: ${billingResult.error || billingResult.reason}`)
  }

  // Re-fetch conversation to get the updated cost from billing
  const { data: finalConversation, error: fetchFinalError } = await supabase
    .from("conversations")
    .select(`
      *,
      agent:ai_agents(id, name, provider)
    `)
    .eq("id", conversationData.id)
    .single()

  // Index to Algolia AFTER billing (so cost is correct)
  // IMPORTANT: Must await to ensure indexing completes before serverless function terminates
  if (finalConversation && agentData) {
    console.log(
      `[VAPI Webhook] Indexing UPDATED conversation to Algolia: ${conversationData.id}, workspace: ${actualConversationWorkspaceId}, cost: ${finalConversation.total_cost}`
    )
    try {
      const indexResult = await indexCallLogToAlgolia({
        conversation: finalConversation,
        workspaceId: actualConversationWorkspaceId, // Use conversation's actual workspace
        partnerId: actualConversationPartnerId,
        agentName: agentData.name || "Unknown Agent",
        agentProvider: (agentData.provider as AgentProvider) || "vapi",
      })
      if (indexResult.success) {
        console.log(`[VAPI Webhook] Algolia index SUCCESS for UPDATED: ${conversationData.id}`)
      } else {
        console.warn(
          `[VAPI Webhook] Algolia indexing SKIPPED for UPDATED: ${conversationData.id} - ${indexResult.reason}`
        )
      }
    } catch (err) {
      console.error(`[VAPI Webhook] Algolia indexing FAILED for UPDATED: ${conversationData.id}`, err)
    }
  } else {
    console.warn(
      `[VAPI Webhook] Skipping Algolia index - no agent or conversation not found: ${conversationData.id}`
    )
  }

  // =========================================================================
  // UPDATE CAMPAIGN RECIPIENT STATUS (for real-time UI updates)
  // This updates call_recipients table which triggers Supabase Realtime events
  // =========================================================================
  // Determine if there was a transcript (indicates actual conversation happened)
  const hasTranscript = !!(transcript && transcript.length > 0)
  const callOutcome = mapEndedReasonToOutcome(endedReason, durationSeconds, hasTranscript)
  await updateCampaignRecipientStatus(call.id, callOutcome, durationSeconds, messageCost)
}

async function handleFunctionCall(
  payload: VapiWebhookPayload,
  workspaceId: string
): Promise<{ results: Array<{ toolCallId: string; result: string }> } | null> {
  const { call, functionCalls, toolCalls } = payload.message
  // VAPI can send tool calls in multiple formats
  const functions = functionCalls || toolCalls || (payload.message as any).toolCallList

  if (!call?.id) return null

  console.log(`[VAPI Webhook] Function call for call ${call.id}`)

  // Find agent to get webhook URL
  const agent = await findAgentByAssistantId(call.assistantId, workspaceId)

  if (!agent) {
    console.error(`[VAPI Webhook] Agent not found for call: ${call.id}`)
    return null
  }

  const results: Array<{ toolCallId: string; result: string }> = []

  // Process function calls - execute calendar tools directly
  if (functions && Array.isArray(functions)) {
    for (const func of functions) {
      // VAPI sends tool calls in format: { id, function: { name, arguments } } OR { id, name, arguments }
      const toolCallId = (func as any)?.id || (func as any)?.toolCallId || "unknown"
      const toolName = (func as any)?.function?.name || (func as any)?.name
      const toolArgs = (func as any)?.function?.arguments || (func as any)?.arguments || {}

      // Parse arguments if they're a string (VAPI sometimes sends JSON string)
      const parsedArgs = typeof toolArgs === "string" ? JSON.parse(toolArgs) : toolArgs

      console.log(`[VAPI Webhook] Processing tool: ${toolName}, args:`, parsedArgs)

      if (toolName && isCalendarTool(toolName)) {
        console.log(`[VAPI Webhook] Executing calendar tool: ${toolName} for agent ${agent.id}`)

        // Check if calendar is configured
        const hasCalendar = await isCalendarConfigured(agent.id)
        if (!hasCalendar) {
          console.error(`[VAPI Webhook] Calendar not configured for agent ${agent.id}`)
          results.push({
            toolCallId,
            result: "Calendar is not configured for this agent. Please set up Google Calendar integration first.",
          })
          continue
        }

        try {
          const calendarResult = await handleCalendarToolCall(
            { name: toolName, arguments: parsedArgs },
            { agentId: agent.id, conversationId: undefined, callId: call.id }
          )

          console.log(`[VAPI Webhook] Calendar tool result:`, calendarResult)

          results.push({
            toolCallId,
            result: calendarResult.success ? calendarResult.result || "Operation completed successfully" : calendarResult.error || "Operation failed",
          })
        } catch (error) {
          console.error(`[VAPI Webhook] Calendar tool error:`, error)
          results.push({
            toolCallId,
            result: error instanceof Error ? error.message : "An error occurred while processing the request",
          })
        }
      } else {
        // Non-calendar tool - forward to user's webhook if configured
        const config = agent.config as any
        const webhookUrl = config?.tools_server_url

        if (webhookUrl) {
          try {
            const response = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "function-call",
                call_id: call.id,
                tool_call_id: toolCallId,
                function_name: toolName,
                arguments: parsedArgs,
              }),
            })
            const responseData = await response.json()
            console.log(`[VAPI Webhook] Forwarded to webhook, response:`, responseData)

            results.push({
              toolCallId,
              result: responseData?.result || JSON.stringify(responseData),
            })
          } catch (error) {
            console.error("[VAPI Webhook] Failed to forward function call:", error)
            results.push({
              toolCallId,
              result: "Failed to execute function",
            })
          }
        } else {
          console.warn(`[VAPI Webhook] No webhook URL configured for non-calendar tool: ${toolName}`)
          results.push({
            toolCallId,
            result: "No webhook configured for this tool",
          })
        }
      }
    }
  }

  // Return results if we processed any tools
  if (results.length > 0) {
    console.log(`[VAPI Webhook] Returning ${results.length} tool results`)
    return { results }
  }

  return null
}

async function handleDirectFunctionCall(
  payload: VapiFunctionCall,
  workspaceId: string
): Promise<Record<string, unknown>> {
  const { assistantId, toolCall, callId } = payload

  if (!assistantId) {
    return { success: false, error: "Missing assistantId" }
  }

  // Find agent
  const agent = await findAgentByAssistantId(assistantId, workspaceId)

  if (!agent) {
    return { success: false, error: "Agent not found" }
  }

  const toolName = toolCall?.name

  // Check if this is a calendar tool
  if (toolName && isCalendarTool(toolName)) {
    console.log(`[VAPI Webhook] Processing calendar tool: ${toolName} for agent ${agent.id}`)
    
    // Check if calendar is configured for this agent
    const hasCalendar = await isCalendarConfigured(agent.id)
    if (!hasCalendar) {
      return {
        success: false,
        error: "Calendar is not configured for this agent. Please set up calendar integration first.",
      }
    }

    try {
      const result = await handleCalendarToolCall(
        {
          name: toolName,
          arguments: toolCall?.arguments || {},
        },
        {
          agentId: agent.id,
          conversationId: undefined, // Will be linked later if needed
          callId: callId,
        }
      )

      // Return in VAPI's expected format
      return {
        results: [{
          toolCallId: (payload as any).toolCall?.id || toolName,
          result: result.success ? result.result : result.error,
        }]
      }
    } catch (error) {
      console.error(`[VAPI Webhook] Calendar tool error:`, error)
      return {
        results: [{
          toolCallId: (payload as any).toolCall?.id || toolName,
          result: error instanceof Error ? error.message : "Calendar operation failed",
        }]
      }
    }
  }

  // Forward non-calendar tools to user's webhook
  const config = agent.config as any
  const webhookUrl = config?.tools_server_url

  if (!webhookUrl) {
    return { success: false, error: "No webhook URL configured" }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: toolCall?.name,
        parameters: toolCall?.arguments,
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
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

async function findAgentByAssistantId(assistantId: string | undefined, workspaceIdFromUrl: string) {
  if (!assistantId) {
    console.log(`[VAPI Webhook] findAgentByAssistantId: Missing assistantId`)
    return null
  }

  console.log(
    `[VAPI Webhook] Looking for agent with assistantId: ${assistantId}, workspaceIdFromUrl: ${workspaceIdFromUrl}`
  )

  try {
    const supabase = getSupabaseAdmin()

    // First try to find agent in the specified workspace
    let { data: agent, error } = await supabase
      .from("ai_agents")
      .select("id, name, provider, config, workspace_id")
      .eq("external_agent_id", assistantId)
      .eq("workspace_id", workspaceIdFromUrl)
      .is("deleted_at", null)
      .single()

    // If not found, try to find agent in ANY workspace (fallback for mismatched URLs)
    if (error || !agent) {
      console.log(
        `[VAPI Webhook] Agent not found in workspace ${workspaceIdFromUrl}, searching all workspaces...`
      )
      const fallbackResult = await supabase
        .from("ai_agents")
        .select("id, name, provider, config, workspace_id")
        .eq("external_agent_id", assistantId)
        .is("deleted_at", null)
        .single()

      if (!fallbackResult.error && fallbackResult.data) {
        agent = fallbackResult.data
        console.log(
          `[VAPI Webhook] Found agent in DIFFERENT workspace: ${agent.workspace_id} (URL had: ${workspaceIdFromUrl})`
        )
      }
    }

    if (error && !agent) {
      console.error(`[VAPI Webhook] Agent lookup error:`, error)
      return null
    }

    if (agent) {
      console.log(
        `[VAPI Webhook] Found agent: ${agent.id}, name: ${agent.name}, workspace: ${agent.workspace_id}`
      )
    } else {
      console.error(`[VAPI Webhook] Agent NOT found for assistantId: ${assistantId}`)
    }

    return agent
  } catch (error) {
    console.error(`[VAPI Webhook] Error finding agent:`, error)
    return null
  }
}

function mapCallDirection(callType: string | undefined): "inbound" | "outbound" {
  if (callType === "inboundPhoneCall") return "inbound"
  return "outbound"
}

function mapVapiStatus(
  status: string | undefined
):
  | "initiated"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "busy"
  | "canceled" {
  const statusMap: Record<
    string,
    | "initiated"
    | "ringing"
    | "in_progress"
    | "completed"
    | "failed"
    | "no_answer"
    | "busy"
    | "canceled"
  > = {
    queued: "initiated",
    ringing: "ringing",
    "in-progress": "in_progress",
    forwarding: "in_progress",
    ended: "completed",
  }
  return statusMap[status || ""] || "initiated"
}

/**
 * Map VAPI ended reason to call outcome
 *
 * VAPI endedReason values:
 * - assistant-ended-call: Assistant ended the call (answered)
 * - customer-ended-call: Customer hung up (answered)
 * - silence-timed-out: No speech detected after answer
 * - customer-did-not-answer: No answer
 * - voicemail-reached: Went to voicemail
 * - customer-busy: Line busy
 * - assistant-error: Error occurred
 * - dial-busy-or-failed: Couldn't connect
 * - phone-call-provider-closed-websocket: Provider issue
 * - pipeline-error: System error
 * - max-duration-reached: Hit time limit (was answered)
 * - exceeded-max-cost: Cost limit hit
 *
 * @param endedReason - VAPI's endedReason string
 * @param durationSeconds - Call duration to help determine if answered
 * @param hasTranscript - Whether there was a transcript (indicates conversation happened)
 */
function mapEndedReasonToOutcome(
  endedReason?: string,
  durationSeconds?: number,
  hasTranscript?: boolean
): string {
  console.log(
    `[VAPI Webhook] Mapping endedReason: "${endedReason}", duration: ${durationSeconds}s, hasTranscript: ${hasTranscript}`
  )

  if (!endedReason) {
    // No ended reason - check duration to guess
    if (durationSeconds && durationSeconds > 10) {
      return "answered"
    }
    return "no_answer"
  }

  const reason = endedReason.toLowerCase()

  // Definitely answered - conversation happened
  if (
    reason.includes("customer-ended-call") ||
    reason.includes("assistant-ended-call") ||
    reason.includes("max-duration-reached") ||
    reason.includes("exceeded-max-cost")
  ) {
    return "answered"
  }

  // Definitely not answered
  if (
    reason.includes("customer-did-not-answer") ||
    reason.includes("no-answer") ||
    reason.includes("no_answer")
  ) {
    return "no_answer"
  }

  // Busy signal
  if (reason.includes("customer-busy") || reason.includes("busy") || reason.includes("dial-busy")) {
    return "busy"
  }

  // Voicemail
  if (
    reason.includes("voicemail") ||
    reason.includes("machine-detected") ||
    reason.includes("answering-machine")
  ) {
    return "voicemail"
  }

  // Errors and failures
  if (
    reason.includes("failed") ||
    reason.includes("error") ||
    reason.includes("pipeline-error") ||
    reason.includes("websocket")
  ) {
    return "error"
  }

  // Cancelled
  if (reason.includes("cancelled") || reason.includes("canceled")) {
    return "declined"
  }

  // Silence timeout - call was answered but no conversation
  if (reason.includes("silence-timed-out")) {
    // If there's a transcript or significant duration, count as answered
    if (hasTranscript || (durationSeconds && durationSeconds > 15)) {
      return "answered"
    }
    return "no_answer"
  }

  // Unknown reason - use duration and transcript to determine
  // If call lasted more than 10 seconds or has transcript, likely answered
  if (hasTranscript || (durationSeconds && durationSeconds > 10)) {
    console.log(
      `[VAPI Webhook] Unknown endedReason "${endedReason}" - assuming answered based on duration/transcript`
    )
    return "answered"
  }

  // Default to no_answer for short calls with unknown reasons
  console.log(
    `[VAPI Webhook] Unknown endedReason "${endedReason}" - assuming no_answer (short duration, no transcript)`
  )
  return "no_answer"
}

/**
 * Update campaign recipient status when a call completes
 * Uses Supabase client to ensure Realtime events are triggered for UI updates
 */
async function updateCampaignRecipientStatus(
  externalCallId: string,
  callOutcome: string,
  durationSeconds: number,
  cost?: number
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()

    // Find recipient by external_call_id
    const { data: recipient, error: findError } = await supabase
      .from("call_recipients")
      .select("id, campaign_id")
      .eq("external_call_id", externalCallId)
      .single()

    if (findError || !recipient) {
      // Not a campaign call or not found - this is normal for non-campaign calls
      if (findError?.code !== "PGRST116") {
        // PGRST116 = no rows returned
        console.log(`[VAPI Webhook] No campaign recipient found for call ${externalCallId}`)
      }
      return
    }

    console.log(
      `[VAPI Webhook] Updating campaign recipient ${recipient.id} with outcome: ${callOutcome}`
    )

    // Determine final status based on outcome
    // "answered" means successful call, anything else depends on outcome
    const isSuccessful = callOutcome === "answered"
    const finalStatus = isSuccessful ? "completed" : "failed"

    // Update recipient status - this triggers Supabase Realtime!
    const { error: updateError } = await supabase
      .from("call_recipients")
      .update({
        call_status: finalStatus,
        call_outcome: callOutcome,
        call_ended_at: new Date().toISOString(),
        call_duration_seconds: durationSeconds,
        call_cost: cost || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipient.id)

    if (updateError) {
      console.error("[VAPI Webhook] Error updating recipient:", updateError)
      return
    }

    console.log(
      `[VAPI Webhook] Campaign recipient ${recipient.id} updated: status=${finalStatus}, outcome=${callOutcome}`
    )

    // Update campaign statistics
    const { data: campaign, error: campaignError } = await supabase
      .from("call_campaigns")
      .select(
        "completed_calls, successful_calls, failed_calls, pending_calls, total_recipients, status"
      )
      .eq("id", recipient.campaign_id)
      .single()

    if (campaignError || !campaign) {
      console.error("[VAPI Webhook] Error fetching campaign:", campaignError)
      return
    }

    // Calculate new stats
    const newCompletedCalls = (campaign.completed_calls || 0) + 1
    const newSuccessfulCalls = isSuccessful
      ? (campaign.successful_calls || 0) + 1
      : campaign.successful_calls || 0
    const newFailedCalls = !isSuccessful
      ? (campaign.failed_calls || 0) + 1
      : campaign.failed_calls || 0

    // Note: pending_calls is decremented when calls START, not when they end
    // So we don't change it here

    // Update campaign stats
    const { error: statsError } = await supabase
      .from("call_campaigns")
      .update({
        completed_calls: newCompletedCalls,
        successful_calls: newSuccessfulCalls,
        failed_calls: newFailedCalls,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipient.campaign_id)

    if (statsError) {
      console.error("[VAPI Webhook] Error updating campaign stats:", statsError)
    } else {
      console.log(
        `[VAPI Webhook] Campaign stats updated: completed=${newCompletedCalls}, successful=${newSuccessfulCalls}, failed=${newFailedCalls}`
      )
    }

    // Check if campaign is complete (all recipients processed)
    const { count: remainingCount, error: countError } = await supabase
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", recipient.campaign_id)
      .in("call_status", ["pending", "calling", "queued"])

    if (countError) {
      console.error("[VAPI Webhook] Error counting remaining recipients:", countError)
      return
    }

    console.log(`[VAPI Webhook] Remaining recipients to process: ${remainingCount}`)

    if (remainingCount === 0 && campaign.status === "active") {
      console.log(
        `[VAPI Webhook] Campaign ${recipient.campaign_id} completed - all recipients processed`
      )

      // Mark campaign as completed
      const { error: completeError } = await supabase
        .from("call_campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", recipient.campaign_id)
        .eq("status", "active") // Only if still active

      if (completeError) {
        console.error("[VAPI Webhook] Error marking campaign complete:", completeError)
      } else {
        console.log(`[VAPI Webhook] Campaign ${recipient.campaign_id} marked as completed`)
      }
    } else if (campaign.status === "active") {
      // =========================================================================
      // SCALABLE CAMPAIGN PROCESSING: Trigger next batch of calls
      // =========================================================================
      // When a call ends, we have a free slot - start the next queued call
      // This creates a self-regulating flow that respects VAPI concurrency limits

      try {
        const { startNextCalls, getVapiConfigForCampaign } =
          await import("@/lib/campaigns/call-queue-manager")

        // Get workspace ID from campaign
        const { data: campaignData } = await supabase
          .from("call_campaigns")
          .select("workspace_id")
          .eq("id", recipient.campaign_id)
          .single()

        if (campaignData?.workspace_id) {
          // For VAPI webhooks, we know the provider is VAPI
          const vapiConfig = await getVapiConfigForCampaign(recipient.campaign_id)

          if (vapiConfig) {
            // Start next calls (fire-and-forget, don't await)
            console.log(
              `[VAPI Webhook] Triggering next batch for campaign ${recipient.campaign_id}...`
            )
            startNextCalls(recipient.campaign_id, campaignData.workspace_id, vapiConfig)
              .then((result) => {
                if (result.concurrencyHit) {
                  console.log(
                    `[VAPI Webhook] Next batch: CONCURRENCY LIMIT - in cooldown, ${result.remaining} pending`
                  )
                } else {
                  console.log(
                    `[VAPI Webhook] Next batch result: started=${result.started}, failed=${result.failed}, remaining=${result.remaining}`
                  )
                }
                if (result.errors.length > 0 && !result.concurrencyHit) {
                  console.error(`[VAPI Webhook] Next batch errors:`, result.errors)
                }
              })
              .catch((err) => {
                console.error("[VAPI Webhook] Error starting next calls:", err)
              })
          } else {
            console.error(
              `[VAPI Webhook] Could not get VAPI config for campaign ${recipient.campaign_id}`
            )
          }
        }
      } catch (err) {
        console.error("[VAPI Webhook] Error importing call-queue-manager:", err)
      }
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error updating campaign recipient:", error)
    // Don't throw - this is a secondary operation
  }
}

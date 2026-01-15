/**
 * POST /api/webhooks/vapi
 * VAPI webhook handler for call events AND custom function execution
 *
 * **FILTERED EVENTS** - Only forwards essential events to user's webhook:
 * 1. call.started - When call begins
 * 2. call.ended - When call completes
 * 3. function-call - When agent executes a custom function tool
 *
 * Other VAPI events (transcription, messages, etc.) are ignored
 * to prevent webhook spam during calls.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { processCallCompletion } from "@/lib/billing/usage"

// Disable body parsing - we need the raw body for signature verification
export const dynamic = "force-dynamic"

// =============================================================================
// TYPES (Based on VAPI webhook payload structure)
// =============================================================================

interface VapiWebhookPayload {
  message: {
    type: string // "call.ended", "call.started", "function-call", etc.
    call: {
      id: string
      orgId: string
      assistantId?: string
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
      messages?: Array<{
        role: string
        message: string
        time: number
      }>
      transcript?: string
      phoneNumber?: {
        number: string
      }
      customer?: {
        number: string
      }
      endedReason?: string
      recordingUrl?: string
    }
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
// WEBHOOK HANDLER
// =============================================================================

// Only these events are forwarded to the user's webhook
// Valid VAPI event names (from API error message)
const FORWARDED_EVENTS = [
  "status-update",        // Call status changes
  "end-of-call-report",   // Complete call summary
  "function-call",        // When functions are called (singular!)
  "tool-calls",           // When tools are called (plural!)
  "transfer-update",      // When transfers occur
]

// These events are ignored (not forwarded)
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

export async function POST(request: NextRequest) {
  try {
    // 1. Parse webhook payload
    const body = await request.json()
    const payload = body as VapiWebhookPayload | VapiFunctionCall

    // Determine if this is a call event or function call
    if ("message" in payload) {
      // Call event
      const callPayload = payload as VapiWebhookPayload
      const eventType = callPayload.message.type

      console.log(`[VAPI Webhook] Received event: ${eventType}`)

      // Filter out ignored events first
      if (IGNORED_EVENTS.includes(eventType)) {
        console.log(
          `[VAPI Webhook] Ignoring event type: ${eventType} (in ignored events list)`
        )
        return NextResponse.json({ received: true })
      }

      // Only process and forward specific events
      if (!FORWARDED_EVENTS.includes(eventType)) {
        console.log(
          `[VAPI Webhook] Ignoring event type: ${eventType} (not in forwarded events list)`
        )
        return NextResponse.json({ received: true })
      }

      switch (eventType) {
        case "status-update":
          // Status update contains status field: "queued", "ringing", "in-progress", "ended"
          await handleStatusUpdate(callPayload)
          break

        case "end-of-call-report":
          await handleEndOfCallReport(callPayload)
          break

        case "function-call":
        case "tool-calls":
          // Function/tool calls within message payload
          console.log(`[VAPI Webhook] Function/tool call in message payload: ${eventType}`)
          await handleFunctionCallInMessage(callPayload)
          break

        default:
          console.log(`[VAPI Webhook] Forwarding event type: ${eventType}`)
          // Forward any other allowed events
          await forwardEventToUserWebhook(callPayload)
      }

      return NextResponse.json({ received: true })
    } else if ("toolCall" in payload || payload.type === "function-call" || payload.type === "tool-calls") {
      // Function/tool call - always forward these
      const funcPayload = payload as VapiFunctionCall
      console.log(`[VAPI Webhook] Function/tool call received`, funcPayload)

      const result = await handleFunctionCall(funcPayload)
      return NextResponse.json(result)
    } else {
      console.warn("[VAPI Webhook] Unknown payload type")
      return NextResponse.json({ error: "Unknown payload type" }, { status: 400 })
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error processing webhook:", error)
    // Return 200 to prevent VAPI from retrying (we've logged the error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Forward webhook event to user's configured webhook URL
 * If agent has tools_server_url configured, forward the event
 */
async function forwardToUserWebhook(
  agent: any,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    if (!agent) {
      console.log("[VAPI Webhook] No agent found, skipping user webhook forward")
      return
    }

    console.log("[VAPI Webhook] Agent object:", JSON.stringify(agent))

    const config = agent.config as any
    console.log("[VAPI Webhook] Agent config:", JSON.stringify(config))

    const webhookUrl = config?.tools_server_url
    console.log("[VAPI Webhook] Extracted webhook URL:", webhookUrl)

    if (!webhookUrl) {
      console.log(`[VAPI Webhook] No webhook URL configured for agent ${agent.id}, skipping forward`)
      console.log("[VAPI Webhook] Config keys:", config ? Object.keys(config) : "no config")
      return
    }

    console.log(`[VAPI Webhook] Forwarding to user webhook: ${webhookUrl}`)
    console.log("[VAPI Webhook] Payload:", JSON.stringify(payload))

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `[VAPI Webhook] User webhook returned error: ${response.status}`,
        errorText
      )
      return
    }

    // Try to parse as JSON, but handle HTML responses
    let responseData
    try {
      responseData = await response.json()
      console.log(`[VAPI Webhook] Successfully forwarded to user webhook`)
    } catch (parseError) {
      const responseText = await response.text()
      console.warn(
        `[VAPI Webhook] User webhook returned non-JSON response (${response.status}):`,
        responseText.substring(0, 500) // First 500 chars
      )
      return
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error forwarding to user webhook:", error)
  }
}

/**
 * Handle status-update event from VAPI
 * Status can be: queued, ringing, in-progress, ended
 */
async function handleStatusUpdate(payload: VapiWebhookPayload) {
  const { call } = payload.message
  const status = (payload.message as any).status

  console.log(`[VAPI Webhook] Status update: ${status} for call ${call?.id}`)

  if (!prisma || !call?.id) {
    console.error("[VAPI Webhook] Prisma not configured or no call ID")
    return
  }

  // Find conversation
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: {
      agent: {
        select: {
          id: true,
          config: true,
        },
      },
    },
  })

  if (!conversation) {
    console.log(`[VAPI Webhook] Conversation not found for call: ${call.id}`)
    return
  }

  // Handle different statuses
  if (status === "in-progress") {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: "in_progress",
        startedAt: call.startedAt ? new Date(call.startedAt) : new Date(),
      },
    })
    console.log(`[VAPI Webhook] Conversation ${conversation.id} marked as in_progress`)
  }

  // Forward to user's webhook
  await forwardToUserWebhook(
    conversation.agent,
    {
      type: "status-update",
      status: status,
      call_id: call.id,
      started_at: call.startedAt,
    }
  )
}

/**
 * Handle end-of-call-report event from VAPI
 * This contains the complete call summary with transcript and recording
 */
async function handleEndOfCallReport(payload: VapiWebhookPayload) {
  const { call } = payload.message

  console.log(`[VAPI Webhook] End of call report: ${call?.id}`)

  if (!prisma || !call?.id) {
    console.error("[VAPI Webhook] Prisma not configured or no call ID")
    return
  }

  // Find conversation with workspace for billing
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: {
      workspace: {
        select: {
          id: true,
          partnerId: true,
        },
      },
      agent: {
        select: {
          id: true,
          config: true,
        },
      },
    },
  })

  if (!conversation) {
    console.error(`[VAPI Webhook] Conversation not found for call: ${call.id}`)
    return
  }

  if (!conversation.workspace) {
    console.error(`[VAPI Webhook] Conversation ${conversation.id} has no workspace`)
    return
  }

  // Calculate duration
  const startedAt = call.startedAt ? new Date(call.startedAt) : conversation.startedAt
  const endedAt = call.endedAt ? new Date(call.endedAt) : new Date()
  const durationMs = startedAt && endedAt ? endedAt.getTime() - startedAt.getTime() : 0
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000))

  // Determine call outcome based on ended reason
  const callOutcome = mapEndedReasonToOutcome(call.endedReason)
  const callStatus = callOutcome === "completed" ? "completed" : "failed"

  // Update conversation with call details
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: callStatus,
      endedAt: endedAt,
      durationSeconds: durationSeconds,
      transcript: call.transcript || conversation.transcript,
      recordingUrl: call.recordingUrl || conversation.recordingUrl,
      metadata: {
        ...(conversation.metadata as object),
        vapi_ended_reason: call.endedReason,
        vapi_cost_breakdown: call.costBreakdown,
      },
    },
  })

  // Update campaign recipient status if this call was part of a campaign
  await updateCampaignRecipientStatus(call.id, callOutcome, durationSeconds, call.cost)

  // Process billing
  const result = await processCallCompletion({
    conversationId: conversation.id,
    workspaceId: conversation.workspace.id,
    partnerId: conversation.workspace.partnerId,
    durationSeconds: durationSeconds,
    provider: "vapi",
    externalCallId: call.id,
  })

  if (result.success) {
    console.log(
      `[VAPI Webhook] Billing processed for call ${call.id}: ` +
        `${result.minutesAdded} minutes, $${(result.amountDeducted || 0) / 100} deducted`
    )
  } else {
    console.error(
      `[VAPI Webhook] Billing failed for call ${call.id}: ${result.error || result.reason}`
    )
  }

  // Forward to user's webhook
  await forwardToUserWebhook(
    conversation.agent,
    {
      type: "end-of-call-report",
      call_id: call.id,
      duration_seconds: durationSeconds,
      transcript: call.transcript,
      recording_url: call.recordingUrl,
      status: callStatus,
      ended_reason: call.endedReason,
      cost: call.cost,
    }
  )
}

/**
 * Map VAPI ended reason to call outcome
 */
function mapEndedReasonToOutcome(endedReason?: string): string {
  if (!endedReason) return "completed"

  const reason = endedReason.toLowerCase()

  if (reason.includes("customer-ended") || reason.includes("assistant-ended")) {
    return "completed"
  }
  if (reason.includes("no-answer") || reason.includes("no_answer")) {
    return "no_answer"
  }
  if (reason.includes("busy")) {
    return "busy"
  }
  if (reason.includes("voicemail")) {
    return "voicemail"
  }
  if (reason.includes("failed") || reason.includes("error")) {
    return "failed"
  }
  if (reason.includes("cancelled") || reason.includes("canceled")) {
    return "cancelled"
  }

  return "completed"
}

/**
 * Update campaign recipient status when a call completes
 */
async function updateCampaignRecipientStatus(
  externalCallId: string,
  callOutcome: string,
  durationSeconds: number,
  cost?: number
): Promise<void> {
  if (!prisma) return

  try {
    // Find recipient by external_call_id
    const recipient = await prisma.$queryRaw<Array<{ id: string; campaign_id: string }>>`
      SELECT id, campaign_id FROM call_recipients 
      WHERE external_call_id = ${externalCallId}
      LIMIT 1
    `

    if (!recipient || recipient.length === 0) {
      // Not a campaign call, skip
      return
    }

    const recipientData = recipient[0]
    if (!recipientData) {
      // Should never happen after length check, but TypeScript needs this
      return
    }
    console.log(`[VAPI Webhook] Updating campaign recipient ${recipientData.id} with outcome: ${callOutcome}`)

    // Update recipient status
    await prisma.$executeRaw`
      UPDATE call_recipients 
      SET 
        call_status = ${callOutcome === "completed" ? "completed" : "failed"},
        call_outcome = ${callOutcome},
        call_ended_at = NOW(),
        call_duration_seconds = ${durationSeconds},
        call_cost = ${cost || 0},
        updated_at = NOW()
      WHERE id = ${recipientData.id}
    `

    // Update campaign statistics
    if (callOutcome === "completed") {
      await prisma.$executeRaw`
        UPDATE call_campaigns 
        SET 
          completed_calls = completed_calls + 1,
          successful_calls = successful_calls + 1,
          updated_at = NOW()
        WHERE id = ${recipientData.campaign_id}
      `
    } else {
      await prisma.$executeRaw`
        UPDATE call_campaigns 
        SET 
          completed_calls = completed_calls + 1,
          failed_calls = failed_calls + 1,
          updated_at = NOW()
        WHERE id = ${recipientData.campaign_id}
      `
    }

    // Check if campaign is complete (no more pending or in_progress recipients)
    const pendingCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM call_recipients 
      WHERE campaign_id = ${recipientData.campaign_id}
      AND call_status IN ('pending', 'in_progress')
    `

    if (pendingCount && pendingCount[0] && pendingCount[0].count === BigInt(0)) {
      console.log(`[VAPI Webhook] Campaign ${recipientData.campaign_id} completed - all recipients processed`)
      await prisma.$executeRaw`
        UPDATE call_campaigns 
        SET 
          status = 'completed',
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${recipientData.campaign_id}
        AND status = 'active'
      `
    }

    console.log(`[VAPI Webhook] Campaign recipient ${recipientData.id} updated successfully`)
  } catch (error) {
    console.error("[VAPI Webhook] Error updating campaign recipient:", error)
    // Don't throw - this is a secondary operation
  }
}

/**
 * Handle function-calls event that comes via message payload
 */
async function handleFunctionCallInMessage(payload: VapiWebhookPayload) {
  const { call } = payload.message
  const functionCalls = (payload.message as any).functionCalls || (payload.message as any).toolCalls

  console.log(`[VAPI Webhook] Function call in message for call ${call?.id}`)

  if (!call?.id || !prisma) {
    console.error("[VAPI Webhook] No call ID or Prisma not configured")
    return
  }

  // Find agent
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: {
      agent: {
        select: {
          id: true,
          config: true,
        },
      },
    },
  })

  if (!conversation?.agent) {
    console.error(`[VAPI Webhook] Agent not found for call: ${call.id}`)
    return
  }

  // Forward to user's webhook
  await forwardToUserWebhook(
    conversation.agent,
    {
      type: "function-call",
      call_id: call.id,
      function_calls: functionCalls,
    }
  )
}

/**
 * Forward any other event to user's webhook
 */
async function forwardEventToUserWebhook(payload: VapiWebhookPayload) {
  const { call } = payload.message
  const eventType = payload.message.type

  console.log(`[VAPI Webhook] Forwarding event: ${eventType} for call ${call?.id}`)

  if (!call?.id || !prisma) {
    console.error("[VAPI Webhook] No call ID or Prisma not configured")
    return
  }

  // Find agent
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
    include: {
      agent: {
        select: {
          id: true,
          config: true,
        },
      },
    },
  })

  if (!conversation?.agent) {
    console.log(`[VAPI Webhook] No agent found for call: ${call.id}`)
    return
  }

  // Forward to user's webhook
  await forwardToUserWebhook(
    conversation.agent,
    {
      type: eventType,
      call_id: call.id,
      payload: payload.message,
    }
  )
}

/**
 * Handle custom function tool execution
 * Called when VAPI agent needs to execute a custom function
 * Forwards the request to the agent's configured webhook URL
 */
async function handleFunctionCall(payload: VapiFunctionCall): Promise<Record<string, unknown>> {
  const functionName = payload.toolCall?.name || "unknown"
  const parameters = payload.toolCall?.arguments || {}
  const callId = payload.callId
  const assistantId = payload.assistantId

  console.log(`[VAPI Webhook] Executing function: ${functionName}`)
  console.log(`[VAPI Webhook] Parameters:`, parameters)
  console.log(`[VAPI Webhook] Call ID:`, callId)
  console.log(`[VAPI Webhook] Assistant ID:`, assistantId)

  try {
    // If no assistant ID or call ID, we can't find the agent config
    if (!assistantId) {
      console.error("[VAPI Webhook] No assistant ID provided, cannot find agent webhook URL")
      return {
        success: false,
        error: "No assistant ID provided",
      }
    }

    // Find the agent by externalAgentId to get the webhook URL
    if (!prisma) {
      console.error("[VAPI Webhook] Prisma not configured")
      return {
        success: false,
        error: "Prisma not configured",
      }
    }

    const agent = await prisma.aiAgent.findFirst({
      where: {
        externalAgentId: assistantId,
      },
      select: {
        id: true,
        config: true,
      },
    })

    if (!agent) {
      console.error(`[VAPI Webhook] Agent not found for VAPI assistant: ${assistantId}`)
      return {
        success: false,
        error: "Agent not found",
      }
    }

    // Get the webhook URL from agent config
    const config = agent.config as any
    const webhookUrl = config?.tools_server_url

    if (!webhookUrl) {
      console.warn(`[VAPI Webhook] No webhook URL configured for agent ${agent.id}`)
      return {
        success: false,
        error: "No webhook URL configured for this agent",
      }
    }

    // Forward the function call to the user's webhook
    console.log(`[VAPI Webhook] Forwarding to user webhook: ${webhookUrl}`)

    const forwardPayload = {
      function: functionName,
      parameters,
      call_id: callId,
      agent_id: assistantId,
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(forwardPayload),
    })

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text()
      console.error(
        `[VAPI Webhook] User webhook returned error: ${webhookResponse.status}`,
        errorText
      )
      return {
        success: false,
        error: `User webhook returned ${webhookResponse.status}`,
      }
    }

    const result = await webhookResponse.json()
    console.log(`[VAPI Webhook] User webhook returned:`, result)

    return {
      success: true,
      result,
    }
  } catch (error) {
    console.error("[VAPI Webhook] Error in function call handler:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}


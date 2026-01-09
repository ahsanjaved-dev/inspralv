/**
 * POST /api/webhooks/retell
 * Retell AI webhook handler for call events AND custom function execution
 *
 * Handles two types of requests:
 * 1. Call Events (call_started, call_ended, call_analyzed)
 *    - Processes usage billing
 *
 * 2. Custom Function Execution (function/tool calls)
 *    - When agent needs to execute a custom function tool
 *    - Payload has 'function' field with function name and parameters
 *    - We execute it and return the result
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { processCallCompletion } from "@/lib/billing/usage"
import { Prisma } from "@/lib/generated/prisma"

// Disable body parsing - we need the raw body for signature verification
export const dynamic = "force-dynamic"

// =============================================================================
// TYPES (Based on Retell webhook payload structure)
// =============================================================================

interface RetellCallEvent {
  event: string // "call_started", "call_ended", "call_analyzed"
  call: {
    call_id: string
    agent_id: string
    call_type: "web_call" | "phone_call"
    call_status: "registered" | "ongoing" | "ended" | "error"
    start_timestamp: number // Unix timestamp in milliseconds
    end_timestamp?: number // Unix timestamp in milliseconds
    transcript?: string
    transcript_object?: Array<{
      role: "agent" | "user"
      content: string
      words: Array<{
        word: string
        start: number
        end: number
      }>
    }>
    recording_url?: string
    public_log_url?: string
    from_number?: string
    to_number?: string
    direction?: "inbound" | "outbound"
    disconnection_reason?: string
    call_analysis?: {
      call_summary?: string
      call_successful?: boolean
      user_sentiment?: string
      in_voicemail?: boolean
      custom_analysis_data?: Record<string, unknown>
    }
  }
}

interface RetellFunctionCall {
  function: string
  call_id?: string
  agent_id?: string
  parameters?: Record<string, unknown>
}

type RetellWebhookPayload = RetellCallEvent | RetellFunctionCall

// =============================================================================
// WEBHOOK HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Parse webhook payload
    const body = await request.json()
    const payload = body as RetellWebhookPayload

    console.log("[Retell Webhook] ========================================")
    console.log("[Retell Webhook] 🔔 WEBHOOK RECEIVED AT:", new Date().toISOString())
    console.log("[Retell Webhook] Payload:", JSON.stringify(payload, null, 2))
    console.log("[Retell Webhook] ========================================")

    // 2. Determine request type: Call Event or Function Call
    if ("event" in payload) {
      // Call Event
      const callPayload = payload as RetellCallEvent
      console.log(`[Retell Webhook] Call event: ${callPayload.event}`)

      switch (callPayload.event) {
        case "call_ended":
          await handleCallEnded(callPayload)
          break

        case "call_started":
          await handleCallStarted(callPayload)
          break

        case "call_analyzed":
          await handleCallAnalyzed(callPayload)
          break

        default:
          console.log(`[Retell Webhook] Unhandled event type: ${callPayload.event}`)
      }

      return NextResponse.json({ received: true })
    } else if ("function" in payload) {
      // Function Call
      const funcPayload = payload as RetellFunctionCall
      console.log(`[Retell Webhook] Function call: ${funcPayload.function}`)

      const result = await handleFunctionCall(funcPayload)
      return NextResponse.json(result)
    } else {
      console.warn("[Retell Webhook] Unknown payload type")
      return NextResponse.json({ error: "Unknown payload type" }, { status: 400 })
    }
  } catch (error) {
    console.error("[Retell Webhook] Error processing webhook:", error)
    // Return 200 to prevent Retell from retrying (we've logged the error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Handle custom function tool execution
 * Called when Retell agent needs to execute a custom function
 */
async function handleFunctionCall(payload: RetellFunctionCall): Promise<Record<string, unknown>> {
  const { function: functionName, parameters = {} } = payload

  console.log(`[Retell Webhook] Executing function: ${functionName}`)
  console.log(`[Retell Webhook] Parameters:`, parameters)

  try {
    // Here you would implement your custom function logic
    // For now, we'll return a mock response to prevent Retell errors

    // TODO: Implement custom function execution based on functionName
    // Examples:
    // - "create_support_ticket": Create a ticket in your system
    // - "book_appointment": Book an appointment in your calendar
    // - Any other custom function your agent needs

    // Mock response structure (adjust based on your actual needs)
    const result = {
      success: true,
      function: functionName,
      result: `Function '${functionName}' executed successfully`,
      // Return any data the agent needs
      data: {}
    }

    console.log(`[Retell Webhook] Function result:`, result)
    return result
  } catch (error) {
    console.error(`[Retell Webhook] Function execution error for '${functionName}':`, error)
    return {
      success: false,
      function: functionName,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function handleCallEnded(payload: RetellCallEvent) {
  const { call } = payload

  console.log(`[Retell Webhook] ========================================`)
  console.log(`[Retell Webhook] CALL ENDED EVENT RECEIVED`)
  console.log(`[Retell Webhook] ========================================`)
  console.log(`[Retell Webhook] Call ID: ${call.call_id}`)
  console.log(`[Retell Webhook] Agent ID: ${call.agent_id}`)
  console.log(`[Retell Webhook] Duration: ${call.end_timestamp && call.start_timestamp ? (call.end_timestamp - call.start_timestamp) / 1000 : 'N/A'}s`)
  console.log(`[Retell Webhook] Transcript Preview: ${call.transcript?.substring(0, 100)}...`)
  console.log(`[Retell Webhook] ========================================`)

  if (!prisma) {
    console.error("[Retell Webhook] Prisma not configured")
    return
  }

  // 1. Find the conversation by externalId (Retell call ID)
  const conversation = await prisma.conversation.findFirst({
    where: {
      externalId: call.call_id,
    },
    include: {
      workspace: {
        select: {
          id: true,
          partnerId: true,
        },
      },
    },
  })

  if (!conversation) {
    console.error(`[Retell Webhook] Conversation not found for Retell call: ${call.call_id}`)
    return
  }

  if (!conversation.workspace) {
    console.error(`[Retell Webhook] Conversation ${conversation.id} has no workspace`)
    return
  }

  // 2. Calculate duration from timestamps
  const durationMs = call.end_timestamp
    ? call.end_timestamp - call.start_timestamp
    : 0
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000))

  // 3. Update conversation with call details
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: "completed",
      endedAt: call.end_timestamp ? new Date(call.end_timestamp) : new Date(),
      durationSeconds: durationSeconds,
      transcript: call.transcript || conversation.transcript,
      recordingUrl: call.recording_url || conversation.recordingUrl,
      metadata: {
        ...(conversation.metadata as object),
        retell_disconnection_reason: call.disconnection_reason,
        retell_public_log_url: call.public_log_url,
      },
    },
  })

  // 4. Process billing
  const result = await processCallCompletion({
    conversationId: conversation.id,
    workspaceId: conversation.workspace.id,
    partnerId: conversation.workspace.partnerId,
    durationSeconds: durationSeconds,
    provider: "retell",
    externalCallId: call.call_id,
  })

  if (result.success) {
    console.log(
      `[Retell Webhook] ✅ Billing processed for call ${call.call_id}: ` +
        `${result.minutesAdded} minutes, $${(result.amountDeducted || 0) / 100} deducted`
    )
  } else {
    console.error(
      `[Retell Webhook] ❌ Billing failed for call ${call.call_id}: ${result.error || result.reason}`
    )
  }
}

async function handleCallStarted(payload: RetellCallEvent) {
  const { call } = payload

  console.log(`[Retell Webhook] Call started: ${call.call_id}`)

  if (!prisma) {
    console.error("[Retell Webhook] Prisma not configured")
    return
  }

  // Find conversation and update status
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.call_id },
  })

  if (conversation) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: "in_progress",
        startedAt: new Date(call.start_timestamp),
      },
    })

    console.log(`[Retell Webhook] Conversation ${conversation.id} marked as in_progress`)
  }
}

async function handleCallAnalyzed(payload: RetellCallEvent) {
  const { call } = payload

  console.log(`[Retell Webhook] Call analyzed: ${call.call_id}`)

  if (!prisma) {
    console.error("[Retell Webhook] Prisma not configured")
    return
  }

  // Find conversation and update with analysis data
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.call_id },
  })

  if (conversation && call.call_analysis) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        summary: call.call_analysis.call_summary || conversation.summary,
        sentiment: call.call_analysis.user_sentiment || conversation.sentiment,
        metadata: {
          ...(conversation.metadata as object),
          retell_analysis: {
            call_successful: call.call_analysis.call_successful,
            in_voicemail: call.call_analysis.in_voicemail,
            custom_data: call.call_analysis.custom_analysis_data as Prisma.InputJsonValue | undefined,
          },
        } as Prisma.InputJsonValue,
      },
    })

    console.log(`[Retell Webhook] Conversation ${conversation.id} updated with analysis`)
  }
}

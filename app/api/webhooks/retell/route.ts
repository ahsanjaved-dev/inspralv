/**
 * POST /api/webhooks/retell
 * Retell AI webhook handler for call events
 *
 * Handles call completion events and processes usage billing.
 * Called by Retell when calls start, end, or are analyzed.
 *
 * Important events:
 * - call_ended: Call completed, process billing
 * - call_started: Call started (optional tracking)
 * - call_analyzed: Call analysis completed (optional)
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

interface RetellWebhookPayload {
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

// =============================================================================
// WEBHOOK HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Parse webhook payload
    const body = await request.json()
    const payload = body as RetellWebhookPayload

    console.log(`[Retell Webhook] Received event: ${payload.event}`)

    // 2. Handle different event types
    switch (payload.event) {
      case "call_ended":
        await handleCallEnded(payload)
        break

      case "call_started":
        await handleCallStarted(payload)
        break

      case "call_analyzed":
        await handleCallAnalyzed(payload)
        break

      default:
        console.log(`[Retell Webhook] Unhandled event type: ${payload.event}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Retell Webhook] Error processing webhook:", error)
    // Return 200 to prevent Retell from retrying (we've logged the error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleCallEnded(payload: RetellWebhookPayload) {
  const { call } = payload

  console.log(`[Retell Webhook] Call ended: ${call.call_id}`)

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
      `[Retell Webhook] Billing processed for call ${call.call_id}: ` +
        `${result.minutesAdded} minutes, $${(result.amountDeducted || 0) / 100} deducted`
    )
  } else {
    console.error(
      `[Retell Webhook] Billing failed for call ${call.call_id}: ${result.error || result.reason}`
    )
  }
}

async function handleCallStarted(payload: RetellWebhookPayload) {
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

async function handleCallAnalyzed(payload: RetellWebhookPayload) {
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

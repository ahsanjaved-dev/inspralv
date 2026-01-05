/**
 * POST /api/webhooks/vapi
 * VAPI webhook handler for call events
 *
 * Handles call completion events and processes usage billing.
 * Called by VAPI when calls start, end, or have other events.
 *
 * Important events:
 * - call.ended: Call completed, process billing
 * - call.started: Call started (optional tracking)
 * - function-call: Agent function was called (optional)
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
    type: string // "call.ended", "call.started", etc.
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

// =============================================================================
// WEBHOOK HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Parse webhook payload
    const body = await request.json()
    const payload = body as VapiWebhookPayload

    console.log(`[VAPI Webhook] Received event: ${payload.message.type}`)

    // 2. Handle different event types
    switch (payload.message.type) {
      case "call.ended":
        await handleCallEnded(payload)
        break

      case "call.started":
        await handleCallStarted(payload)
        break

      default:
        console.log(`[VAPI Webhook] Unhandled event type: ${payload.message.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[VAPI Webhook] Error processing webhook:", error)
    // Return 200 to prevent VAPI from retrying (we've logged the error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleCallEnded(payload: VapiWebhookPayload) {
  const { call } = payload.message

  console.log(`[VAPI Webhook] Call ended: ${call.id}`)

  if (!prisma) {
    console.error("[VAPI Webhook] Prisma not configured")
    return
  }

  // 1. Find the conversation by externalId (VAPI call ID)
  const conversation = await prisma.conversation.findFirst({
    where: {
      externalId: call.id,
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
    console.error(`[VAPI Webhook] Conversation not found for VAPI call: ${call.id}`)
    return
  }

  if (!conversation.workspace) {
    console.error(`[VAPI Webhook] Conversation ${conversation.id} has no workspace`)
    return
  }

  // 2. Calculate duration
  const startedAt = call.startedAt ? new Date(call.startedAt) : conversation.startedAt
  const endedAt = call.endedAt ? new Date(call.endedAt) : new Date()
  const durationMs = startedAt && endedAt ? endedAt.getTime() - startedAt.getTime() : 0
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000))

  // 3. Update conversation with call details
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: "completed",
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

  // 4. Process billing
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
}

async function handleCallStarted(payload: VapiWebhookPayload) {
  const { call } = payload.message

  console.log(`[VAPI Webhook] Call started: ${call.id}`)

  if (!prisma) {
    console.error("[VAPI Webhook] Prisma not configured")
    return
  }

  // Find conversation and update status
  const conversation = await prisma.conversation.findFirst({
    where: { externalId: call.id },
  })

  if (conversation) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: "in_progress",
        startedAt: call.startedAt ? new Date(call.startedAt) : new Date(),
      },
    })

    console.log(`[VAPI Webhook] Conversation ${conversation.id} marked as in_progress`)
  }
}

/**
 * POST /api/webhooks/w/[workspaceId]/retell
 * 
 * Workspace-level Retell webhook handler for call events.
 * This endpoint receives webhooks from Retell for all agents in a workspace.
 * 
 * Events handled:
 * - call_started: Call has started
 * - call_ended: Call has ended with final data
 * - call_analyzed: Post-call analysis complete (sentiment, summary)
 * 
 * Flow:
 * 1. Retell sends webhook with agent_id in payload
 * 2. Handler looks up agent by external_agent_id + workspace_id
 * 3. Creates/updates conversation record
 * 4. Processes billing if call ended
 * 5. Indexes to Algolia
 * 6. Supabase Realtime notifies frontend subscribers
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { processCallCompletion } from "@/lib/billing/usage"
import { indexCallLogToAlgolia } from "@/lib/algolia"
import type { AgentProvider, Conversation } from "@/types/database.types"
import { Prisma } from "@/lib/generated/prisma"

export const dynamic = "force-dynamic"

// =============================================================================
// TYPES
// =============================================================================

interface RetellCallEvent {
  event: "call_started" | "call_ended" | "call_analyzed"
  call: {
    call_id: string
    agent_id: string
    call_type: "web_call" | "phone_call"
    call_status: "registered" | "ongoing" | "ended" | "error"
    start_timestamp: number
    end_timestamp?: number
    transcript?: string
    transcript_object?: Array<{
      role: "agent" | "user"
      content: string
      words?: Array<{
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

interface RouteContext {
  params: Promise<{ workspaceId: string }>
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { workspaceId } = await params

  try {
    const body = await request.json()
    const payload = body as RetellWebhookPayload

    console.log(`[Retell Webhook W/${workspaceId}] Received webhook`)
    console.log(`[Retell Webhook] Payload:`, JSON.stringify(payload, null, 2))

    // Validate workspace exists
    if (!prisma) {
      console.error("[Retell Webhook] Prisma not configured")
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, partnerId: true },
    })

    if (!workspace) {
      console.error(`[Retell Webhook] Workspace not found: ${workspaceId}`)
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }

    // Determine if this is a call event or function call
    if ("event" in payload) {
      const callPayload = payload as RetellCallEvent
      console.log(`[Retell Webhook W/${workspaceId}] Event: ${callPayload.event}`)

      switch (callPayload.event) {
        case "call_started":
          await handleCallStarted(callPayload, workspaceId, workspace.partnerId)
          break

        case "call_ended":
          await handleCallEnded(callPayload, workspaceId, workspace.partnerId)
          break

        case "call_analyzed":
          await handleCallAnalyzed(callPayload, workspaceId)
          break

        default:
          console.log(`[Retell Webhook] Unhandled event: ${callPayload.event}`)
      }

      return NextResponse.json({ received: true })
    } else if ("function" in payload) {
      const funcPayload = payload as RetellFunctionCall
      console.log(`[Retell Webhook W/${workspaceId}] Function call: ${funcPayload.function}`)

      const result = await handleFunctionCall(funcPayload, workspaceId)
      return NextResponse.json(result)
    } else {
      console.warn(`[Retell Webhook W/${workspaceId}] Unknown payload type`)
      return NextResponse.json({ error: "Unknown payload type" }, { status: 400 })
    }
  } catch (error) {
    console.error(`[Retell Webhook W/${workspaceId}] Error:`, error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleCallStarted(
  payload: RetellCallEvent,
  workspaceId: string,
  partnerId: string
) {
  const { call } = payload

  if (!prisma) return

  console.log(`[Retell Webhook] Call started: ${call.call_id}`)

  // Find agent by Retell agent_id
  const agent = await findAgentByRetellId(call.agent_id, workspaceId)

  if (!agent) {
    console.error(`[Retell Webhook] Agent not found for Retell agent_id: ${call.agent_id}`)
    return
  }

  // Check if conversation already exists
  let conversation = await prisma.conversation.findFirst({
    where: {
      externalId: call.call_id,
      workspaceId: workspaceId,
    },
  })

  if (!conversation) {
    // Create new conversation
    conversation = await prisma.conversation.create({
      data: {
        externalId: call.call_id,
        workspaceId: workspaceId,
        agentId: agent.id,
        direction: call.direction || "outbound",
        status: "in_progress",
        startedAt: new Date(call.start_timestamp),
        phoneNumber: call.from_number || call.to_number || null,
        metadata: {
          provider: "retell",
          call_type: call.call_type,
          retell_agent_id: call.agent_id,
        },
      },
    })
    console.log(`[Retell Webhook] Created conversation: ${conversation.id}`)
  } else {
    // Update existing conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: "in_progress",
        startedAt: new Date(call.start_timestamp),
      },
    })
    console.log(`[Retell Webhook] Updated conversation ${conversation.id} to in_progress`)
  }
}

async function handleCallEnded(
  payload: RetellCallEvent,
  workspaceId: string,
  partnerId: string
) {
  const { call } = payload

  if (!prisma) {
    console.error("[Retell Webhook] Prisma not configured")
    return
  }

  console.log(`[Retell Webhook] Call ended: ${call.call_id}`)

  // Find existing conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      externalId: call.call_id,
      workspaceId: workspaceId,
    },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          provider: true,
        },
      },
    },
  })

  // If no conversation exists, create one
  if (!conversation) {
    const agent = await findAgentByRetellId(call.agent_id, workspaceId)

    if (!agent) {
      console.error(`[Retell Webhook] Agent not found for Retell agent_id: ${call.agent_id}`)
      return
    }

    conversation = await prisma.conversation.create({
      data: {
        externalId: call.call_id,
        workspaceId: workspaceId,
        agentId: agent.id,
        direction: call.direction || "outbound",
        status: "completed",
        startedAt: new Date(call.start_timestamp),
        endedAt: call.end_timestamp ? new Date(call.end_timestamp) : new Date(),
        durationSeconds: calculateDuration(call.start_timestamp, call.end_timestamp),
        transcript: buildTranscript(call.transcript, call.transcript_object),
        recordingUrl: call.recording_url || null,
        phoneNumber: call.from_number || call.to_number || null,
        metadata: {
          provider: "retell",
          call_type: call.call_type,
          retell_agent_id: call.agent_id,
          disconnection_reason: call.disconnection_reason,
          public_log_url: call.public_log_url,
        },
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            provider: true,
          },
        },
      },
    })
    console.log(`[Retell Webhook] Created conversation: ${conversation.id}`)
  }

  // Calculate duration
  const durationSeconds = calculateDuration(call.start_timestamp, call.end_timestamp)

  // Map status from disconnection reason
  const status = mapRetellStatus(call.call_status, call.disconnection_reason)

  // Update conversation with final call data
  const updatedConversation = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: status,
      endedAt: call.end_timestamp ? new Date(call.end_timestamp) : new Date(),
      durationSeconds: durationSeconds,
      transcript: buildTranscript(call.transcript, call.transcript_object) || conversation.transcript,
      recordingUrl: call.recording_url || conversation.recordingUrl,
      metadata: {
        ...(conversation.metadata as object || {}),
        retell_disconnection_reason: call.disconnection_reason,
        retell_public_log_url: call.public_log_url,
      },
    },
  })

  console.log(`[Retell Webhook] Updated conversation: ${conversation.id}`)

  // Index to Algolia
  if (conversation.agent) {
    indexCallLogToAlgolia({
      conversation: updatedConversation as unknown as Conversation,
      workspaceId: workspaceId,
      partnerId: partnerId,
      agentName: conversation.agent.name || "Unknown Agent",
      agentProvider: (conversation.agent.provider as AgentProvider) || "retell",
    }).catch((err) => {
      console.error("[Retell Webhook] Algolia indexing failed:", err)
    })
  }

  // Process billing
  const billingResult = await processCallCompletion({
    conversationId: conversation.id,
    workspaceId: workspaceId,
    partnerId: partnerId,
    durationSeconds: durationSeconds,
    provider: "retell",
    externalCallId: call.call_id,
  })

  if (billingResult.success) {
    console.log(`[Retell Webhook] ✅ Billing processed: ${billingResult.minutesAdded} minutes`)
  } else {
    console.error(`[Retell Webhook] ❌ Billing failed: ${billingResult.error || billingResult.reason}`)
  }
}

async function handleCallAnalyzed(payload: RetellCallEvent, workspaceId: string) {
  const { call } = payload

  if (!prisma || !call.call_analysis) return

  console.log(`[Retell Webhook] Call analyzed: ${call.call_id}`)

  // Find conversation
  const conversation = await prisma.conversation.findFirst({
    where: {
      externalId: call.call_id,
      workspaceId: workspaceId,
    },
  })

  if (!conversation) {
    console.error(`[Retell Webhook] Conversation not found for call: ${call.call_id}`)
    return
  }

  // Map sentiment
  const sentimentMap: Record<string, string> = {
    Positive: "positive",
    Negative: "negative",
    Neutral: "neutral",
    Unknown: "neutral",
  }
  const sentiment = call.call_analysis.user_sentiment
    ? sentimentMap[call.call_analysis.user_sentiment] || "neutral"
    : null

  // Update conversation with analysis
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      summary: call.call_analysis.call_summary || conversation.summary,
      sentiment: sentiment,
      metadata: {
        ...(conversation.metadata as object || {}),
        retell_analysis: {
          call_successful: call.call_analysis.call_successful,
          in_voicemail: call.call_analysis.in_voicemail,
          custom_data: call.call_analysis.custom_analysis_data as Prisma.InputJsonValue | undefined,
        },
      } as Prisma.InputJsonValue,
    },
  })

  console.log(`[Retell Webhook] Updated conversation ${conversation.id} with analysis`)
}

async function handleFunctionCall(
  payload: RetellFunctionCall,
  workspaceId: string
): Promise<Record<string, unknown>> {
  const { function: functionName, parameters = {}, agent_id } = payload

  console.log(`[Retell Webhook] Function call: ${functionName}`)

  if (!agent_id || !prisma) {
    return { success: false, error: "Missing agent_id" }
  }

  // Find agent
  const agent = await findAgentByRetellId(agent_id, workspaceId)

  if (!agent) {
    return { success: false, error: "Agent not found" }
  }

  // Forward to user's webhook
  const config = agent.config as any
  const webhookUrl = config?.tools_server_url

  if (!webhookUrl) {
    // Return mock response if no webhook configured
    return {
      success: true,
      function: functionName,
      result: `Function '${functionName}' executed successfully`,
      data: {},
    }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: functionName,
        parameters,
        agent_id: agent_id,
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
      function: functionName,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

async function findAgentByRetellId(retellAgentId: string, workspaceId: string) {
  if (!prisma) return null

  return prisma.aiAgent.findFirst({
    where: {
      externalAgentId: retellAgentId,
      workspaceId: workspaceId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      provider: true,
      config: true,
    },
  })
}

function calculateDuration(startTimestamp: number, endTimestamp?: number): number {
  if (!endTimestamp) return 0
  return Math.max(0, Math.floor((endTimestamp - startTimestamp) / 1000))
}

function buildTranscript(
  transcript?: string,
  transcriptObject?: Array<{ role: string; content: string }>
): string | null {
  if (transcript && transcript.trim().length > 0) {
    return transcript
  }

  if (Array.isArray(transcriptObject) && transcriptObject.length > 0) {
    return transcriptObject
      .map((u) => {
        const role = u.role ? `${u.role}: ` : ""
        const content = typeof u.content === "string" ? u.content : ""
        return `${role}${content}`.trim()
      })
      .filter(Boolean)
      .join("\n")
  }

  return null
}

function mapRetellStatus(
  callStatus: string,
  disconnectionReason?: string
): "initiated" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer" | "busy" | "canceled" {
  if (disconnectionReason === "dial_no_answer") return "no_answer"
  if (disconnectionReason === "dial_busy") return "busy"
  if (disconnectionReason?.startsWith("error_")) return "failed"

  const statusMap: Record<string, "initiated" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer" | "busy" | "canceled"> = {
    registered: "initiated",
    ongoing: "in_progress",
    ended: "completed",
    error: "failed",
  }

  return statusMap[callStatus] || "completed"
}


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

  // Process billing FIRST (so partner cost is calculated before indexing)
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

  // Re-fetch conversation to get updated cost from billing (partner cost, not provider cost)
  const finalConversation = await prisma.conversation.findUnique({
    where: { id: conversation.id },
  })

  // Index to Algolia AFTER billing (so cost reflects partner pricing)
  // IMPORTANT: Must await to ensure indexing completes before serverless function terminates
  if (conversation.agent && finalConversation) {
    console.log(`[Retell Webhook] Indexing conversation to Algolia with updated cost: ${finalConversation.totalCost}`)
    try {
      const indexResult = await indexCallLogToAlgolia({
        conversation: finalConversation as unknown as Conversation,
        workspaceId: workspaceId,
        partnerId: partnerId,
        agentName: conversation.agent.name || "Unknown Agent",
        agentProvider: (conversation.agent.provider as AgentProvider) || "retell",
      })
      if (indexResult.success) {
        console.log(`[Retell Webhook] Algolia index SUCCESS for call: ${call.call_id}`)
      } else {
        console.warn(`[Retell Webhook] Algolia indexing SKIPPED for call: ${call.call_id} - ${indexResult.reason}`)
      }
    } catch (err) {
      console.error("[Retell Webhook] Algolia indexing failed:", err)
    }
  }

  // Check if this is a campaign call and trigger next batch
  // Pass call outcome data for proper success/failure tracking
  await handleCampaignCallEnded(call.call_id, workspaceId, {
    callStatus: call.call_status,
    disconnectionReason: call.disconnection_reason,
    durationSeconds: durationSeconds,
  })
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
// CAMPAIGN CONTINUATION
// =============================================================================

/**
 * Determine if a Retell call was successful based on call status and disconnection reason
 */
function isRetellCallSuccessful(callStatus: string, disconnectionReason?: string): boolean {
  // Call is successful if it ended normally and was connected
  if (callStatus === "ended") {
    // These disconnection reasons indicate a successful, connected call
    const successfulReasons = [
      "agent_hangup",
      "user_hangup", 
      "end_call_function_called",
      "voicemail_reached",
      "max_duration_reached",
    ]
    return !disconnectionReason || successfulReasons.includes(disconnectionReason)
  }
  
  // "not_connected" means the call never connected (failure)
  // "error" means something went wrong (failure)
  return false
}

/**
 * Map Retell call outcome to a string similar to VAPI's outcome format
 */
function getRetellCallOutcome(callStatus: string, disconnectionReason?: string): string {
  if (callStatus === "not_connected") {
    // Map disconnection reasons to outcomes
    if (disconnectionReason === "invalid_destination") return "invalid_number"
    if (disconnectionReason === "dial_no_answer") return "no_answer"
    if (disconnectionReason === "dial_busy") return "busy"
    if (disconnectionReason === "dial_rejected") return "rejected"
    return "not_connected"
  }
  
  if (callStatus === "ended") {
    if (disconnectionReason === "user_hangup" || disconnectionReason === "agent_hangup") {
      return "answered"
    }
    if (disconnectionReason === "voicemail_reached") return "voicemail"
    return "answered" // Default for ended calls
  }
  
  if (callStatus === "error") {
    return "error"
  }
  
  return disconnectionReason || "unknown"
}

interface CampaignCallOutcome {
  callStatus: string
  disconnectionReason?: string
  durationSeconds: number
}

/**
 * Handle campaign call continuation when a Retell call ends
 * Triggers the next batch of calls if this was a campaign call
 * Uses Supabase client (not Prisma) since call_recipients/call_campaigns aren't in Prisma schema
 */
async function handleCampaignCallEnded(
  callId: string, 
  workspaceId: string,
  outcome: CampaignCallOutcome
) {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const supabase = createAdminClient()

    // Find the campaign recipient by external_call_id
    const { data: recipient, error: findError } = await supabase
      .from("call_recipients")
      .select("id, campaign_id")
      .eq("external_call_id", callId)
      .single()

    if (findError || !recipient) {
      // Not a campaign call - this is normal for non-campaign calls
      if (findError?.code !== "PGRST116") {
        // PGRST116 = no rows returned
        console.log(`[Retell Webhook] No campaign recipient found for call ${callId}`)
      }
      return
    }

    // Determine success/failure based on Retell call outcome
    const isSuccessful = isRetellCallSuccessful(outcome.callStatus, outcome.disconnectionReason)
    const callOutcome = getRetellCallOutcome(outcome.callStatus, outcome.disconnectionReason)
    const finalStatus = isSuccessful ? "completed" : "failed"

    console.log(`[Retell Webhook] Campaign call ended: ${callId}, campaign: ${recipient.campaign_id}, outcome: ${callOutcome}, successful: ${isSuccessful}`)

    // Get campaign info
    const { data: campaign, error: campaignError } = await supabase
      .from("call_campaigns")
      .select("id, status, completed_calls, successful_calls, failed_calls, pending_calls")
      .eq("id", recipient.campaign_id)
      .single()

    if (campaignError || !campaign) {
      console.error(`[Retell Webhook] Campaign not found: ${recipient.campaign_id}`)
      return
    }

    // Update recipient status with outcome - this triggers Supabase Realtime!
    const { error: updateError } = await supabase
      .from("call_recipients")
      .update({
        call_status: finalStatus,
        call_outcome: callOutcome,
        call_ended_at: new Date().toISOString(),
        call_duration_seconds: outcome.durationSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipient.id)

    if (updateError) {
      console.error("[Retell Webhook] Error updating recipient:", updateError)
    }

    console.log(`[Retell Webhook] Campaign recipient ${recipient.id} updated: status=${finalStatus}, outcome=${callOutcome}`)

    // Calculate new campaign stats
    const newCompletedCalls = (campaign.completed_calls || 0) + 1
    const newSuccessfulCalls = isSuccessful
      ? (campaign.successful_calls || 0) + 1
      : campaign.successful_calls || 0
    const newFailedCalls = !isSuccessful
      ? (campaign.failed_calls || 0) + 1
      : campaign.failed_calls || 0

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
      console.error("[Retell Webhook] Error updating campaign stats:", statsError)
    } else {
      console.log(`[Retell Webhook] Campaign stats updated: completed=${newCompletedCalls}, successful=${newSuccessfulCalls}, failed=${newFailedCalls}`)
    }

    // Check if campaign is still active
    if (campaign.status !== "active") {
      console.log(`[Retell Webhook] Campaign ${recipient.campaign_id} is not active, skipping next batch`)
      return
    }

    // Check remaining recipients
    const { count: remainingCount } = await supabase
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", recipient.campaign_id)
      .eq("call_status", "pending")

    console.log(`[Retell Webhook] Remaining recipients to process: ${remainingCount}`)

    if (!remainingCount || remainingCount === 0) {
      // Check if there are any calls still in progress
      const { count: callingCount } = await supabase
        .from("call_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", recipient.campaign_id)
        .eq("call_status", "calling")

      if (!callingCount || callingCount === 0) {
        // All calls done - mark campaign as completed
        console.log(`[Retell Webhook] Campaign ${recipient.campaign_id} completed - all recipients processed`)
        await supabase
          .from("call_campaigns")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", recipient.campaign_id)
      }
    } else {
      // Trigger next batch of calls
      try {
        const { startNextCalls, getRetellConfigForCampaign } =
          await import("@/lib/campaigns/call-queue-manager")

        const retellConfig = await getRetellConfigForCampaign(recipient.campaign_id)

        if (retellConfig) {
          console.log(`[Retell Webhook] Triggering next batch for campaign ${recipient.campaign_id}...`)
          
          // Fire-and-forget to not block the webhook response
          startNextCalls(recipient.campaign_id, workspaceId, retellConfig)
            .then((result) => {
              if (result.concurrencyHit) {
                console.log(
                  `[Retell Webhook] Next batch: CONCURRENCY LIMIT - in cooldown, ${result.remaining} pending`
                )
              } else {
                console.log(
                  `[Retell Webhook] Next batch result: started=${result.started}, failed=${result.failed}, remaining=${result.remaining}`
                )
              }
              if (result.errors.length > 0 && !result.concurrencyHit) {
                console.error(`[Retell Webhook] Next batch errors:`, result.errors)
              }
            })
            .catch((err) => {
              console.error("[Retell Webhook] Error starting next calls:", err)
            })
        } else {
          console.error(`[Retell Webhook] Could not get Retell config for campaign ${recipient.campaign_id}`)
        }
      } catch (err) {
        console.error("[Retell Webhook] Error importing call-queue-manager:", err)
      }
    }
  } catch (error) {
    console.error("[Retell Webhook] Error handling campaign call ended:", error)
    // Don't throw - this is a secondary operation
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


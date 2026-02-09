/**
 * POST /api/w/[workspaceSlug]/calls/ingest
 * 
 * BACKUP/FALLBACK call ingestion endpoint.
 * 
 * Primary call data now comes through webhooks:
 * - VAPI webhook creates/updates conversations on call events
 * - Retell webhook creates/updates conversations on call events
 * 
 * This endpoint is used as a BACKUP for:
 * 1. Web calls initiated from the UI (test calls) where webhook might be delayed
 * 2. Manual ingestion requests
 * 3. Cases where webhook delivery fails
 * 
 * The endpoint is idempotent - if the conversation already exists from the
 * webhook, it will either:
 * - Skip if data is complete
 * - Update with additional data (e.g., backfill transcript)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import {
  pollRetellCallUntilReady,
  mapRetellCallToConversation,
  type ConversationInsertData,
} from "@/lib/integrations/retell/calls"
import {
  pollVapiCallUntilReady,
  mapVapiCallToConversation,
} from "@/lib/integrations/vapi/calls"
import { fetchCallSentiment } from "@/lib/integrations/sentiment"
import { indexCallLogToAlgolia } from "@/lib/algolia/call-logs"
import { processCallCompletion } from "@/lib/billing/usage"
import type { AIAgent } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

const ingestCallSchema = z.object({
  call_id: z.string().min(1, "Call ID is required"),
  agent_id: z.string().uuid("Invalid agent ID"),
  provider: z.enum(["retell", "vapi"]).default("retell"),
})

// ============================================================================
// POST /api/w/[workspaceSlug]/calls/ingest
// Backup ingestion for web calls and failed webhook deliveries
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Parse request body
    const body = await request.json()
    const validation = ingestCallSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message || "Invalid request", 400)
    }

    const { call_id, agent_id, provider } = validation.data

    // Check if call already exists (idempotency)
    // Webhooks now create conversations automatically, so this is often already done
    const { data: existingCall } = await ctx.adminClient
      .from("conversations")
      .select("id, transcript, status, recording_url, duration_seconds")
      .eq("external_id", call_id)
      .eq("workspace_id", ctx.workspace.id)
      .single()
    
    // If the call already exists and has complete data, skip polling but still
    // run billing + recalculate agent stats to handle the race condition where
    // the webhook's end-of-call-report handler hasn't finished processing yet.
    if (existingCall && existingCall.transcript && existingCall.status === "completed") {
      console.log("[CallIngest] Call already fully ingested via webhook:", call_id)
      
      // Run billing first (idempotent) — ensures conversation.total_cost is set
      // to partner cost before we recalculate agent stats
      await processCallCompletion({
        conversationId: existingCall.id,
        workspaceId: ctx.workspace.id,
        partnerId: ctx.partner.id,
        durationSeconds: existingCall.duration_seconds || 0,
        provider,
        externalCallId: call_id,
      }).catch((err) => {
        console.error("[CallIngest] Billing failed (will be retried by webhook):", err)
      })

      // Recalculate agent stats from conversations (now with correct partner cost)
      await recalculateAgentStats(ctx.adminClient, agent_id)
      
      return apiResponse({
        success: true,
        message: "Call already ingested via webhook",
        conversation_id: existingCall.id,
        source: "webhook",
      })
    }

    // Get agent to verify it belongs to this workspace
    const { data: agent, error: agentError } = await ctx.adminClient
      .from("ai_agents")
      .select("*")
      .eq("id", agent_id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (agentError || !agent) {
      return apiError("Agent not found in this workspace", 404)
    }

    const typedAgent = agent as AIAgent

    // Validate provider matches agent
    if (typedAgent.provider !== provider) {
      return apiError(
        `Provider mismatch: agent is ${typedAgent.provider} but request specified ${provider}`,
        400
      )
    }

    // Only support Retell and Vapi
    if (provider !== "retell" && provider !== "vapi") {
      return apiError("Only Retell and Vapi providers are supported for call ingestion", 400)
    }

    // Get API key for the agent's provider
    const apiKey = await getApiKeyForAgent(typedAgent, ctx.adminClient)

    if (!apiKey) {
      return apiError("No API key configured for this agent's provider", 400)
    }

    // Fetch call details from provider (with polling for data readiness)
    let conversationData: ConversationInsertData

    if (provider === "retell") {
      console.log("[CallIngest] Fetching call from Retell:", call_id)
      const callResult = await pollRetellCallUntilReady({
        apiKey,
        callId: call_id,
        maxAttempts: 5,
        delayMs: 2000,
      })

      if (!callResult.success || !callResult.data) {
        console.error("[CallIngest] Failed to fetch call from Retell:", callResult.error)
        return apiError(callResult.error || "Failed to fetch call from Retell", 500)
      }

      conversationData = mapRetellCallToConversation(
        callResult.data,
        ctx.workspace.id,
        agent_id
      )
    } else {
      // provider === "vapi"
      console.log("[CallIngest] Fetching call from Vapi:", call_id)
      const callResult = await pollVapiCallUntilReady({
        apiKey,
        callId: call_id,
        maxAttempts: 5,
        delayMs: 2000,
      })

      if (!callResult.success || !callResult.data) {
        console.error("[CallIngest] Failed to fetch call from Vapi:", callResult.error)
        return apiError(callResult.error || "Failed to fetch call from Vapi", 500)
      }

      conversationData = mapVapiCallToConversation(
        callResult.data,
        ctx.workspace.id,
        agent_id
      )
    }

    // Fetch sentiment analysis from provider (async, don't block response)
    const sentimentResult = await fetchCallSentiment(call_id, provider as "retell" | "vapi", apiKey).catch(
      (err) => {
        console.error("[CallIngest] Failed to fetch sentiment:", err)
        return null
      }
    )

    if (sentimentResult) {
      conversationData.sentiment = sentimentResult.sentiment
      // Store raw sentiment and score for analytics
      conversationData.metadata = {
        ...(conversationData.metadata || {}),
        sentiment_score: sentimentResult.score,
        raw_sentiment: sentimentResult.raw_sentiment,
        sentiment_summary: sentimentResult.summary,
      }

      console.log("[CallIngest] Sentiment extracted:", {
        call_id,
        sentiment: sentimentResult.sentiment,
        score: sentimentResult.score,
      })
    }

    // If a conversation already exists but transcript is missing, update it (idempotent backfill).
    if (existingCall) {
      if (!existingCall.transcript && conversationData.transcript) {
        console.log("[CallIngest] Call exists but transcript is null, updating:", call_id)

        const { data: updatedConversation, error: updateError } = await ctx.adminClient
          .from("conversations")
          .update(conversationData)
          .eq("id", existingCall.id)
          .eq("workspace_id", ctx.workspace.id)
          .select()
          .single()

        if (updateError || !updatedConversation) {
          console.error("[CallIngest] Update error:", updateError)
          return serverError()
        }

        // Re-index to Algolia (async, don't block response)
        indexCallLogToAlgolia({
          conversation: updatedConversation,
          workspaceId: ctx.workspace.id,
          partnerId: ctx.partner.id,
          agentName: typedAgent.name,
          agentProvider: typedAgent.provider,
        }).then((result) => {
          if (result.success) {
            console.log(`[CallIngest] Algolia index SUCCESS (update): ${updatedConversation.id}`)
          } else {
            console.warn(`[CallIngest] Algolia indexing SKIPPED (update): ${updatedConversation.id} - ${result.reason}`)
          }
        }).catch((err) => {
          console.error("[CallIngest] Algolia indexing failed (update):", err)
        })

        // Run billing (idempotent) then recalculate agent stats
        await processCallCompletion({
          conversationId: updatedConversation.id,
          workspaceId: ctx.workspace.id,
          partnerId: ctx.partner.id,
          durationSeconds: conversationData.duration_seconds || 0,
          provider,
          externalCallId: call_id,
        }).catch((err) => {
          console.error("[CallIngest] Billing failed (will be retried by webhook):", err)
        })
        await recalculateAgentStats(ctx.adminClient, agent_id)

        return apiResponse({
          success: true,
          message: "Call updated successfully",
          conversation_id: updatedConversation.id,
          data: {
            duration_seconds: conversationData.duration_seconds,
            total_cost: conversationData.total_cost,
            status: conversationData.status,
            has_transcript: !!conversationData.transcript,
            has_recording: !!conversationData.recording_url,
          },
        })
      }

      // Call exists but no backfill needed — still run billing + recalculate stats
      await processCallCompletion({
        conversationId: existingCall.id,
        workspaceId: ctx.workspace.id,
        partnerId: ctx.partner.id,
        durationSeconds: existingCall.duration_seconds || 0,
        provider,
        externalCallId: call_id,
      }).catch((err) => {
        console.error("[CallIngest] Billing failed (will be retried by webhook):", err)
      })
      await recalculateAgentStats(ctx.adminClient, agent_id)

      console.log("[CallIngest] Call already exists:", call_id)
      return apiResponse({
        success: true,
        message: "Call already ingested",
        conversation_id: existingCall.id,
      })
    }

    // Insert into database
    const { data: conversation, error: insertError } = await ctx.adminClient
      .from("conversations")
      .insert(conversationData)
      .select()
      .single()

    if (insertError) {
      console.error("[CallIngest] Insert error:", insertError)
      return serverError()
    }

    console.log("[CallIngest] Call ingested successfully:", {
      conversation_id: conversation.id,
      external_id: call_id,
      duration: conversationData.duration_seconds,
      cost: conversationData.total_cost,
    })

    // Process billing (idempotent) — sets conversation cost to partner rate
    // and updates workspace monthly usage. This replaces updateWorkspaceUsage
    // since processCallCompletion handles workspace usage tracking too.
    await processCallCompletion({
      conversationId: conversation.id,
      workspaceId: ctx.workspace.id,
      partnerId: ctx.partner.id,
      durationSeconds: conversationData.duration_seconds || 0,
      provider,
      externalCallId: call_id,
    }).catch((err) => {
      console.error("[CallIngest] Billing failed, falling back to manual usage update:", err)
      // Fallback: update workspace usage directly if billing fails
      updateWorkspaceUsage(ctx.adminClient, ctx.workspace.id, conversationData, provider)
    })

    // Recalculate agent stats from conversations (source of truth, now with partner cost)
    await recalculateAgentStats(ctx.adminClient, agent_id)

    // Index to Algolia (async, don't block response)
    indexCallLogToAlgolia({
      conversation,
      workspaceId: ctx.workspace.id,
      partnerId: ctx.partner.id,
      agentName: typedAgent.name,
      agentProvider: typedAgent.provider,
    }).then((result) => {
      if (result.success) {
        console.log(`[CallIngest] Algolia index SUCCESS: ${conversation.id}`)
      } else {
        console.warn(`[CallIngest] Algolia indexing SKIPPED: ${conversation.id} - ${result.reason}`)
      }
    }).catch((err) => {
      console.error("[CallIngest] Algolia indexing failed:", err)
    })

    return apiResponse({
      success: true,
      message: "Call ingested successfully",
      conversation_id: conversation.id,
      data: {
        duration_seconds: conversationData.duration_seconds,
        total_cost: conversationData.total_cost,
        status: conversationData.status,
        has_transcript: !!conversationData.transcript,
        has_recording: !!conversationData.recording_url,
      },
    })
  } catch (error) {
    console.error("POST /api/w/[slug]/calls/ingest error:", error)
    return serverError()
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getApiKeyForAgent(
  agent: AIAgent,
  adminClient: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>
): Promise<string | null> {
  // Check legacy keys first (agent-level keys)
  const legacySecretKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === agent.provider && key.is_active
  )

  if (legacySecretKey?.key) {
    console.log("[CallIngest] Using legacy agent-level key")
    return legacySecretKey.key
  }

  // NEW ORG-LEVEL FLOW: Fetch from workspace_integration_assignments -> partner_integrations
  if (!agent.workspace_id) {
    console.error("[CallIngest] Agent has no workspace_id")
    return null
  }

  // Get workspace to find partner_id
  const { data: workspace, error: workspaceError } = await adminClient
    .from("workspaces")
    .select("partner_id")
    .eq("id", agent.workspace_id)
    .single()

  if (workspaceError || !workspace?.partner_id) {
    console.error("[CallIngest] Failed to fetch workspace:", workspaceError)
    return null
  }

  // Check for assigned integration
  const { data: assignment, error: assignmentError } = await adminClient
    .from("workspace_integration_assignments")
    .select(`
      partner_integration:partner_integrations (
        id,
        api_keys,
        is_active
      )
    `)
    .eq("workspace_id", agent.workspace_id)
    .eq("provider", agent.provider)
    .single()

  if (!assignmentError && assignment?.partner_integration) {
    const partnerIntegration = assignment.partner_integration as any
    if (partnerIntegration.is_active) {
      const apiKeys = partnerIntegration.api_keys as any
      console.log(`[CallIngest] Using assigned org-level integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}`)
      return apiKeys?.default_secret_key || null
    }
  }

  // If no assignment, try to find the default integration
  console.log("[CallIngest] No assignment found, checking for default integration...")
  const { data: defaultIntegration, error: defaultError } = await adminClient
    .from("partner_integrations")
    .select("id, api_keys, is_active")
    .eq("partner_id", workspace.partner_id)
    .eq("provider", agent.provider)
    .eq("is_default", true)
    .eq("is_active", true)
    .single()

  if (!defaultError && defaultIntegration) {
    // Auto-create the assignment for future calls
    await adminClient
      .from("workspace_integration_assignments")
      .insert({
        workspace_id: agent.workspace_id,
        provider: agent.provider,
        partner_integration_id: defaultIntegration.id,
      })
      .select()
      .single()

    const apiKeys = defaultIntegration.api_keys as any
    console.log(`[CallIngest] Using default org-level integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}`)
    return apiKeys?.default_secret_key || null
  }

  console.log("[CallIngest] No integration found for agent")
  return null
}

/**
 * Recalculate agent stats from conversations table (source of truth).
 * This replaces the old incremental approach which was prone to double-counting
 * when both webhooks and the ingest endpoint updated stats for the same call.
 *
 * By computing from conversations, this function is IDEMPOTENT — calling it
 * multiple times produces the same correct result.
 */
async function recalculateAgentStats(
  adminClient: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  agentId: string
) {
  try {
    // Compute stats from conversations (the source of truth)
    const { data: stats, error: statsError } = await adminClient
      .from("conversations")
      .select("duration_seconds, total_cost, started_at")
      .eq("agent_id", agentId)
      .eq("status", "completed")

    if (statsError) {
      console.error("[CallIngest] Failed to query conversations for stats:", statsError)
      return
    }

    const rows = stats || []
    const totalConversations = rows.length
    const totalMinutes = rows.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / 60
    const totalCost = rows.reduce((sum, r) => sum + (r.total_cost || 0), 0)

    // Find the most recent conversation timestamp
    const lastConversationAt = rows.length > 0
      ? rows
          .map((r) => r.started_at)
          .filter(Boolean)
          .sort()
          .pop() || new Date().toISOString()
      : undefined

    // Update agent with recalculated stats
    const updatePayload: Record<string, unknown> = {
      total_conversations: totalConversations,
      total_minutes: totalMinutes,
      total_cost: totalCost,
    }
    if (lastConversationAt) {
      updatePayload.last_conversation_at = lastConversationAt
    }

    await adminClient
      .from("ai_agents")
      .update(updatePayload)
      .eq("id", agentId)

    console.log(`[CallIngest] Agent stats recalculated: ${totalConversations} calls, ${totalMinutes.toFixed(2)} min, $${totalCost.toFixed(4)}`)
  } catch (error) {
    console.error("[CallIngest] Failed to recalculate agent stats:", error)
  }
}

async function updateWorkspaceUsage(
  adminClient: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  workspaceId: string,
  conversationData: ConversationInsertData,
  provider: "retell" | "vapi"
) {
  try {
    // Get current workspace usage
    const { data: workspace } = await adminClient
      .from("workspaces")
      .select("current_month_minutes, current_month_cost")
      .eq("id", workspaceId)
      .single()

    if (!workspace) return

    // Update usage
    const newMinutes = conversationData.duration_seconds / 60
    await adminClient
      .from("workspaces")
      .update({
        current_month_minutes: (workspace.current_month_minutes || 0) + newMinutes,
        current_month_cost: (workspace.current_month_cost || 0) + conversationData.total_cost,
      })
      .eq("id", workspaceId)

    // Also insert into usage_tracking for detailed records
    await adminClient.from("usage_tracking").insert({
      workspace_id: workspaceId,
      conversation_id: null, // Will be updated separately if needed
      resource_type: "voice_minutes",
      quantity: newMinutes,
      total_cost: conversationData.total_cost,
      resource_provider: provider,
      is_billable: true,
      metadata: {
        external_call_id: conversationData.external_id,
      },
    })
  } catch (error) {
    console.error("[CallIngest] Failed to update workspace usage:", error)
  }
}


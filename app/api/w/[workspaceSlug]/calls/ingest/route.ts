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
import type { AIAgent, IntegrationApiKeys } from "@/types/database.types"

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
// Ingest call data from provider after call ends
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
    const { data: existingCall } = await ctx.adminClient
      .from("conversations")
      .select("id, transcript")
      .eq("external_id", call_id)
      .eq("workspace_id", ctx.workspace.id)
      .single()

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
        }).catch((err) => {
          console.error("[CallIngest] Algolia indexing failed (update):", err)
        })

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

    // Update agent stats
    await updateAgentStats(ctx.adminClient, agent_id, conversationData)

    // Update workspace usage
    await updateWorkspaceUsage(ctx.adminClient, ctx.workspace.id, conversationData, provider)

    // Index to Algolia (async, don't block response)
    indexCallLogToAlgolia({
      conversation,
      workspaceId: ctx.workspace.id,
      partnerId: ctx.partner.id,
      agentName: typedAgent.name,
      agentProvider: typedAgent.provider,
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
  // Check legacy keys first
  const legacySecretKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === agent.provider && key.is_active
  )

  if (legacySecretKey?.key) {
    return legacySecretKey.key
  }

  // Fetch from workspace_integrations
  if (!agent.workspace_id) {
    return null
  }

  const { data: integration, error } = await adminClient
    .from("workspace_integrations")
    .select("api_keys")
    .eq("workspace_id", agent.workspace_id)
    .eq("provider", agent.provider)
    .eq("is_active", true)
    .single()

  if (error || !integration) {
    return null
  }

  const apiKeys = integration.api_keys as IntegrationApiKeys
  const apiKeyConfig = agent.config?.api_key_config

  // NEW FLOW: Check assigned_key_id first
  if (apiKeyConfig?.assigned_key_id) {
    const keyId = apiKeyConfig.assigned_key_id

    if (keyId === "default") {
      return apiKeys.default_secret_key || null
    } else {
      const additionalKey = apiKeys.additional_keys?.find((k) => k.id === keyId)
      return additionalKey?.secret_key || null
    }
  }

  // Default fallback
  return apiKeys.default_secret_key || null
}

async function updateAgentStats(
  adminClient: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  agentId: string,
  conversationData: ConversationInsertData
) {
  try {
    // Get current agent stats
    const { data: agent } = await adminClient
      .from("ai_agents")
      .select("total_conversations, total_minutes, total_cost")
      .eq("id", agentId)
      .single()

    if (!agent) return

    // Update stats
    const newMinutes = conversationData.duration_seconds / 60
    await adminClient
      .from("ai_agents")
      .update({
        total_conversations: (agent.total_conversations || 0) + 1,
        total_minutes: (agent.total_minutes || 0) + newMinutes,
        total_cost: (agent.total_cost || 0) + conversationData.total_cost,
        last_conversation_at: new Date().toISOString(),
      })
      .eq("id", agentId)
  } catch (error) {
    console.error("[CallIngest] Failed to update agent stats:", error)
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


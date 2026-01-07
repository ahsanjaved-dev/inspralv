import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import type { AIAgent, IntegrationApiKeys } from "@/types/database.types"
import { createVapiWebCall } from "@/lib/integrations/vapi/web-call"
import { createRetellWebCall } from "@/lib/integrations/retell/web-call"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; id: string }>
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============================================================================
// GET API KEYS FOR AGENT
// ============================================================================

async function getApiKeysForAgent(
  agent: AIAgent
): Promise<{ secretKey?: string; publicKey?: string } | null> {
  // Check legacy keys first
  const legacySecretKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === agent.provider && key.is_active
  )
  const legacyPublicKey = agent.agent_public_api_key?.find(
    (key) => key.provider === agent.provider && key.is_active
  )

  if (legacySecretKey?.key || legacyPublicKey?.key) {
    return {
      secretKey: legacySecretKey?.key,
      publicKey: legacyPublicKey?.key,
    }
  }

  // Need to fetch from workspace_integrations
  if (!agent.workspace_id) {
    console.error("Agent has no workspace_id")
    return null
  }

  try {
    const supabase = getSupabaseAdmin()

    const { data: integration, error } = await supabase
      .from("workspace_integrations")
      .select("api_keys")
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", agent.provider)
      .eq("is_active", true)
      .single()

    if (error || !integration) {
      console.error("Failed to fetch integration:", error)
      return null
    }

    const apiKeys = integration.api_keys as IntegrationApiKeys
    const apiKeyConfig = agent.config?.api_key_config

    let secretKey: string | undefined
    let publicKey: string | undefined

    // NEW FLOW: Check assigned_key_id first
    if (apiKeyConfig?.assigned_key_id) {
      const keyId = apiKeyConfig.assigned_key_id
      
      if (keyId === "default") {
        secretKey = apiKeys.default_secret_key
        publicKey = apiKeys.default_public_key
      } else {
        // Find in additional keys
        const additionalKey = apiKeys.additional_keys?.find((k) => k.id === keyId)
        if (additionalKey) {
          secretKey = additionalKey.secret_key
          publicKey = additionalKey.public_key
        }
      }
      
      console.log(`[TestCall] Using assigned_key_id: ${keyId}, secretKey: ${secretKey ? 'found' : 'not found'}, publicKey: ${publicKey ? 'found' : 'not found'}`)
      return { secretKey, publicKey }
    }

    // LEGACY FLOW: Check secret_key.type
    // Get secret key - Handle "none" or undefined by falling back to default
    if (!apiKeyConfig?.secret_key || apiKeyConfig.secret_key.type === "none") {
      // Fall back to default secret key
      secretKey = apiKeys.default_secret_key
    } else if (apiKeyConfig.secret_key.type === "default") {
      secretKey = apiKeys.default_secret_key
    } else if (apiKeyConfig.secret_key.type === "additional") {
      const additionalKey = apiKeys.additional_keys?.find(
        (k) => k.id === apiKeyConfig.secret_key?.additional_key_id
      )
      secretKey = additionalKey?.secret_key
    }

    // Get public key - Handle "none" or undefined by falling back to default
    if (!apiKeyConfig?.public_key || apiKeyConfig.public_key.type === "none") {
      // Fall back to default public key
      publicKey = apiKeys.default_public_key
    } else if (apiKeyConfig.public_key.type === "default") {
      publicKey = apiKeys.default_public_key
    } else if (apiKeyConfig.public_key.type === "additional") {
      const additionalKey = apiKeys.additional_keys?.find(
        (k) => k.id === apiKeyConfig.public_key?.additional_key_id
      )
      publicKey = additionalKey?.public_key
    }

    return { secretKey, publicKey }
  } catch (error) {
    console.error("Error fetching API keys:", error)
    return null
  }
}

// ============================================================================
// POST /api/w/[workspaceSlug]/agents/[id]/test-call
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Get agent
    const { data: agent, error: agentError } = await ctx.adminClient
      .from("ai_agents")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (agentError || !agent) {
      return apiError("Agent not found", 404)
    }

    const typedAgent = agent as AIAgent

    // Check if agent is synced
    if (!typedAgent.external_agent_id) {
      return apiError(
        "Agent not synced with provider. Save the agent to sync first.",
        400
      )
    }

    // Get API keys
    const keys = await getApiKeysForAgent(typedAgent)

    if (!keys) {
      return apiError(
        "No API keys configured. Add keys in integration settings.",
        400
      )
    }

    // Create call session based on provider
    if (typedAgent.provider === "vapi") {
      if (!keys.publicKey) {
        return apiError(
          "VAPI requires a public API key for test calls. Add one in the integration settings.",
          400
        )
      }

      const session = await createVapiWebCall(
        typedAgent.external_agent_id,
        keys.publicKey
      )

      if (!session.success) {
        return apiError(session.error || "Failed to create VAPI call session", 500)
      }

      return apiResponse({
        provider: "vapi",
        callId: `vapi-${Date.now()}`,
        token: session.token,
        externalAgentId: typedAgent.external_agent_id,
        agentName: typedAgent.name,
      })
    }

    if (typedAgent.provider === "retell") {
      if (!keys.secretKey) {
        return apiError(
          "Retell requires a secret API key for test calls. Add one in the integration settings.",
          400
        )
      }

      const session = await createRetellWebCall(
        typedAgent.external_agent_id,
        keys.secretKey
      )

      if (!session.success) {
        return apiError(session.error || "Failed to create Retell call session", 500)
      }

      return apiResponse({
        provider: "retell",
        callId: session.callId,
        accessToken: session.accessToken,
        externalAgentId: typedAgent.external_agent_id,
        agentName: typedAgent.name,
      })
    }

    return apiError(`Provider ${typedAgent.provider} does not support test calls`, 400)
  } catch (error) {
    console.error("POST /api/w/[slug]/agents/[id]/test-call error:", error)
    return serverError()
  }
}

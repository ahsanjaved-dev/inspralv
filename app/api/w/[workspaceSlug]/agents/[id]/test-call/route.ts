import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import type { AIAgent } from "@/types/database.types"
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
// GET API KEYS FOR AGENT (NEW ORG-LEVEL FLOW)
// ============================================================================

async function getApiKeysForAgent(
  agent: AIAgent
): Promise<{ secretKey?: string; publicKey?: string } | null> {
  // Check legacy keys first (agent-level keys)
  const legacySecretKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === agent.provider && key.is_active
  )
  const legacyPublicKey = agent.agent_public_api_key?.find(
    (key) => key.provider === agent.provider && key.is_active
  )

  if (legacySecretKey?.key || legacyPublicKey?.key) {
    console.log("[TestCall] Using legacy agent-level keys")
    return {
      secretKey: legacySecretKey?.key,
      publicKey: legacyPublicKey?.key,
    }
  }

  // NEW ORG-LEVEL FLOW: Fetch from workspace_integration_assignments -> partner_integrations
  if (!agent.workspace_id) {
    console.error("[TestCall] Agent has no workspace_id")
    return null
  }

  try {
    const supabase = getSupabaseAdmin()

    // Get workspace to find partner_id
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("partner_id")
      .eq("id", agent.workspace_id)
      .single()

    if (workspaceError || !workspace?.partner_id) {
      console.error("[TestCall] Failed to fetch workspace:", workspaceError)
      return null
    }

    // Check for assigned integration first
    const { data: assignment, error: assignmentError } = await supabase
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
        console.log(`[TestCall] Using assigned org-level integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}, publicKey: ${apiKeys?.default_public_key ? 'found' : 'not found'}`)
        return {
          secretKey: apiKeys?.default_secret_key,
          publicKey: apiKeys?.default_public_key,
        }
      }
    }

    // If no assignment, try to find and auto-assign the default integration
    console.log("[TestCall] No assignment found, checking for default integration...")
    const { data: defaultIntegration, error: defaultError } = await supabase
      .from("partner_integrations")
      .select("id, api_keys, is_active")
      .eq("partner_id", workspace.partner_id)
      .eq("provider", agent.provider)
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (!defaultError && defaultIntegration) {
      // Auto-create the assignment
      console.log(`[TestCall] Found default integration, auto-assigning to workspace`)
      const { error: createError } = await supabase
        .from("workspace_integration_assignments")
        .insert({
          workspace_id: agent.workspace_id,
          provider: agent.provider,
          partner_integration_id: defaultIntegration.id,
        })

      if (!createError) {
        const apiKeys = defaultIntegration.api_keys as any
        console.log(`[TestCall] Auto-assigned default integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}, publicKey: ${apiKeys?.default_public_key ? 'found' : 'not found'}`)
        return {
          secretKey: apiKeys?.default_secret_key,
          publicKey: apiKeys?.default_public_key,
        }
      }
    }

    console.log("[TestCall] No integration found for agent")
    return null
  } catch (error) {
    console.error("[TestCall] Error fetching API keys:", error)
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

    // Check paywall - block test calls if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

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

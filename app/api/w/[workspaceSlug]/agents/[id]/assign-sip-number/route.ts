import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, forbidden, serverError } from "@/lib/api/helpers"
import type { AIAgent, IntegrationApiKeys, AgentConfig, VapiIntegrationConfig } from "@/types/database.types"
import {
  createByoPhoneNumber,
  attachPhoneNumberToAssistant,
} from "@/lib/integrations/vapi/phone-numbers"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; id: string }>
}

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

const assignSipNumberSchema = z.object({
  // The phone number in E.164 format (e.g., +15551234567)
  phoneNumber: z.string().min(1, "Phone number is required"),
  // Optional friendly name
  name: z.string().optional(),
})

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
// GET VAPI INTEGRATION DETAILS
// ============================================================================

interface VapiIntegrationDetails {
  secretKey: string
  config: VapiIntegrationConfig
}

async function getVapiIntegrationDetails(agent: AIAgent): Promise<VapiIntegrationDetails | null> {
  const legacySecretKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === "vapi" && key.is_active
  )

  if (!agent.workspace_id) {
    return null
  }

  try {
    const supabase = getSupabaseAdmin()

    const { data: integration, error } = await supabase
      .from("workspace_integrations")
      .select("api_keys, config")
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", "vapi")
      .eq("is_active", true)
      .single()

    if (error || !integration) {
      if (legacySecretKey?.key) {
        return { secretKey: legacySecretKey.key, config: {} }
      }
      return null
    }

    const apiKeys = integration.api_keys as IntegrationApiKeys
    const vapiConfig = (integration.config as VapiIntegrationConfig) || {}
    const apiKeyConfig = agent.config?.api_key_config

    let secretKey: string | null = null

    if (legacySecretKey?.key) {
      secretKey = legacySecretKey.key
    } else if (apiKeyConfig?.assigned_key_id) {
      const keyId = apiKeyConfig.assigned_key_id
      if (keyId === "default") {
        secretKey = apiKeys.default_secret_key || null
      } else {
        const additionalKey = apiKeys.additional_keys?.find((k) => k.id === keyId)
        secretKey = additionalKey?.secret_key || null
      }
    } else if (!apiKeyConfig?.secret_key || apiKeyConfig.secret_key.type === "none") {
      secretKey = apiKeys.default_secret_key || null
    } else if (apiKeyConfig.secret_key.type === "default") {
      secretKey = apiKeys.default_secret_key || null
    } else if (apiKeyConfig.secret_key.type === "additional") {
      const additionalKey = apiKeys.additional_keys?.find(
        (k) => k.id === apiKeyConfig.secret_key?.additional_key_id
      )
      secretKey = additionalKey?.secret_key || null
    }

    if (!secretKey) {
      return null
    }

    return { secretKey, config: vapiConfig }
  } catch (error) {
    console.error("[AssignSipNumber] Error fetching integration details:", error)
    return null
  }
}

// ============================================================================
// POST /api/w/[workspaceSlug]/agents/[id]/assign-sip-number
// Assign a BYO SIP phone number to an agent for inbound calls
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to manage phone numbers")
    }

    // Parse request body
    const body = await request.json()
    const validation = assignSipNumberSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message || "Invalid request", 400)
    }

    const { phoneNumber, name } = validation.data

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

    // Must be a Vapi agent
    if (typedAgent.provider !== "vapi") {
      return apiError("SIP numbers are only supported for Vapi agents", 400)
    }

    // Agent must be synced with Vapi
    if (!typedAgent.external_agent_id) {
      return apiError(
        "Agent must be synced with Vapi first. Save the agent with an API key assigned.",
        400
      )
    }

    // Get Vapi integration details
    const integrationDetails = await getVapiIntegrationDetails(typedAgent)
    if (!integrationDetails) {
      return apiError(
        "No Vapi integration configured. Add your Vapi API key in integration settings.",
        400
      )
    }

    const { secretKey, config: vapiConfig } = integrationDetails
    const sipTrunkCredentialId = vapiConfig.sip_trunk_credential_id

    if (!sipTrunkCredentialId) {
      return apiError(
        "No SIP trunk configured. Add a SIP trunk credential ID in the Vapi integration settings first.",
        400
      )
    }

    // Create BYO phone number in Vapi
    console.log("[AssignSipNumber] Creating BYO phone number:", {
      phoneNumber,
      credentialId: sipTrunkCredentialId,
      agentId: typedAgent.id,
    })

    const createResult = await createByoPhoneNumber({
      apiKey: secretKey,
      number: phoneNumber,
      credentialId: sipTrunkCredentialId,
      name: name || `Agent: ${typedAgent.name}`,
      numberE164CheckEnabled: false,
    })

    if (!createResult.success || !createResult.data) {
      return apiError(
        createResult.error || "Failed to create phone number in Vapi",
        500
      )
    }

    const phoneNumberId = createResult.data.id
    console.log("[AssignSipNumber] Phone number created:", phoneNumberId)

    // Attach the phone number to the agent's assistant (for inbound routing)
    const attachResult = await attachPhoneNumberToAssistant({
      apiKey: secretKey,
      phoneNumberId,
      assistantId: typedAgent.external_agent_id,
    })

    if (!attachResult.success) {
      console.error("[AssignSipNumber] Failed to attach:", attachResult.error)
      // Continue - the number is created, just not auto-attached
    }

    // Update agent in database
    const updatedConfig: AgentConfig = {
      ...typedAgent.config,
      telephony: {
        ...typedAgent.config?.telephony,
        vapi_phone_number_id: phoneNumberId,
      },
    }

    const { error: updateError } = await ctx.adminClient
      .from("ai_agents")
      .update({
        external_phone_number: phoneNumber,
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("[AssignSipNumber] Failed to update agent:", updateError)
      return apiError("Phone number created but failed to save to agent", 500)
    }

    // Build the SIP URI for calling this agent
    const sipUri = `sip:${phoneNumber}@${sipTrunkCredentialId}.sip.vapi.ai`

    return apiResponse({
      success: true,
      phoneNumber,
      phoneNumberId,
      sipUri,
      sipTrunkCredentialId,
      instructions: `To call this agent, dial: ${sipUri} from your SIP client/webphone`,
      message: "SIP phone number assigned successfully",
    })
  } catch (error) {
    console.error("POST /api/w/[slug]/agents/[id]/assign-sip-number error:", error)
    return serverError()
  }
}









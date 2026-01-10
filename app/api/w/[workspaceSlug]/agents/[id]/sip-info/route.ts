import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import type { AIAgent, VapiIntegrationConfig } from "@/types/database.types"
import { getPhoneNumber } from "@/lib/integrations/vapi/phone-numbers"

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

  if (legacySecretKey?.key) {
    return { secretKey: legacySecretKey.key, config: {} }
  }

  if (!agent.workspace_id) {
    return null
  }

  try {
    const supabase = getSupabaseAdmin()

    // Get workspace to find partner_id
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("partner_id")
      .eq("id", agent.workspace_id)
      .single()

    if (!workspace?.partner_id) {
      return null
    }

    // Check for assigned integration
    const { data: assignment } = await supabase
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id, api_keys, config, is_active
        )
      `)
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", "vapi")
      .single()

    if (assignment?.partner_integration) {
      const pi = assignment.partner_integration as any
      if (pi.is_active && pi.api_keys?.default_secret_key) {
        return { secretKey: pi.api_keys.default_secret_key, config: pi.config || {} }
      }
    }

    // Try default integration
    const { data: defaultInt } = await supabase
      .from("partner_integrations")
      .select("id, api_keys, config")
      .eq("partner_id", workspace.partner_id)
      .eq("provider", "vapi")
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (defaultInt?.api_keys?.default_secret_key) {
      await supabase.from("workspace_integration_assignments").insert({
        workspace_id: agent.workspace_id,
        provider: "vapi",
        partner_integration_id: defaultInt.id,
      })
      return { secretKey: (defaultInt.api_keys as any).default_secret_key, config: defaultInt.config || {} }
    }

    return null
  } catch (error) {
    console.error("[SipInfo] Error fetching integration details:", error)
    return null
  }
}

// ============================================================================
// GET /api/w/[workspaceSlug]/agents/[id]/sip-info
// Returns SIP dial information for calling this agent
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteContext) {
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

    // Must be a Vapi agent
    if (typedAgent.provider !== "vapi") {
      return apiError("SIP info is only available for Vapi agents", 400)
    }

    // Get integration details
    const integrationDetails = await getVapiIntegrationDetails(typedAgent)
    if (!integrationDetails) {
      return apiError("No Vapi integration configured", 400)
    }

    const { secretKey, config: vapiConfig } = integrationDetails
    const sipTrunkCredentialId = vapiConfig.sip_trunk_credential_id

    if (!sipTrunkCredentialId) {
      return apiError(
        "No SIP trunk configured. Add a SIP trunk credential ID in the Vapi integration settings.",
        400
      )
    }

    // Check if agent has a phone number assigned
    const vapiPhoneNumberId = typedAgent.config?.telephony?.vapi_phone_number_id
    let phoneNumber = typedAgent.external_phone_number
    let sipUri: string | null = null

    if (vapiPhoneNumberId) {
      // Fetch latest phone number info from Vapi
      const phoneResult = await getPhoneNumber({
        apiKey: secretKey,
        phoneNumberId: vapiPhoneNumberId,
      })

      if (phoneResult.success && phoneResult.data) {
        phoneNumber = phoneResult.data.number || phoneResult.data.sipUri || phoneNumber
      }

      // Construct the SIP dial URI for inbound calls
      // Format: sip:{number}@{credentialId}.sip.vapi.ai
      if (phoneNumber) {
        // Remove any existing sip: prefix for clean construction
        const cleanNumber = phoneNumber.replace(/^sip:/, "").split("@")[0]
        sipUri = `sip:${cleanNumber}@${sipTrunkCredentialId}.sip.vapi.ai`
      }
    }

    // Also provide the shared outbound info
    const sharedOutbound = vapiConfig.shared_outbound_phone_number_id
      ? {
          phoneNumberId: vapiConfig.shared_outbound_phone_number_id,
          phoneNumber: vapiConfig.shared_outbound_phone_number,
        }
      : null

    return apiResponse({
      agent: {
        id: typedAgent.id,
        name: typedAgent.name,
        externalAgentId: typedAgent.external_agent_id,
      },
      inbound: {
        configured: !!vapiPhoneNumberId,
        phoneNumberId: vapiPhoneNumberId || null,
        phoneNumber: phoneNumber || null,
        sipUri: sipUri,
        sipTrunkCredentialId,
        instructions: sipUri
          ? `To call this agent, dial: ${sipUri} from your SIP client/webphone`
          : "Assign a phone number to this agent to enable inbound SIP calls",
      },
      outbound: {
        configured: !!sharedOutbound,
        ...sharedOutbound,
        note: sharedOutbound
          ? "Outbound calls from this agent will use the shared outbound number"
          : "Configure a shared outbound number in integration settings",
      },
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/agents/[id]/sip-info error:", error)
    return serverError()
  }
}









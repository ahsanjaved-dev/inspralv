import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import type { AIAgent, IntegrationApiKeys, AgentConfig, VapiIntegrationConfig } from "@/types/database.types"
import {
  listPhoneNumbers,
  createFreeUsPhoneNumber,
  attachPhoneNumberToAssistant,
  getPhoneNumber,
  createByoPhoneNumber,
  listByoPhoneNumbers,
} from "@/lib/integrations/vapi/phone-numbers"
import { z } from "zod"

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
// VAPI INTEGRATION DETAILS
// ============================================================================

interface VapiIntegrationDetails {
  secretKey: string
  config: VapiIntegrationConfig
}

async function getVapiIntegrationDetails(agent: AIAgent): Promise<VapiIntegrationDetails | null> {
  // Check legacy keys first
  const legacySecretKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === "vapi" && key.is_active
  )

  // Need to fetch from workspace_integrations
  if (!agent.workspace_id) {
    console.error("[PhoneNumber] Agent has no workspace_id")
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
      console.error("[PhoneNumber] Failed to fetch VAPI integration:", error)
      // If we have a legacy key, return it without config
      if (legacySecretKey?.key) {
        return { secretKey: legacySecretKey.key, config: {} }
      }
      return null
    }

    const apiKeys = integration.api_keys as IntegrationApiKeys
    const vapiConfig = (integration.config as VapiIntegrationConfig) || {}
    const apiKeyConfig = agent.config?.api_key_config

    // Determine the secret key to use
    let secretKey: string | null = null

    // If legacy key exists, use it
    if (legacySecretKey?.key) {
      secretKey = legacySecretKey.key
    }
    // NEW FLOW: Check assigned_key_id first
    else if (apiKeyConfig?.assigned_key_id) {
      const keyId = apiKeyConfig.assigned_key_id

      if (keyId === "default") {
        secretKey = apiKeys.default_secret_key || null
      } else {
        const additionalKey = apiKeys.additional_keys?.find((k) => k.id === keyId)
        secretKey = additionalKey?.secret_key || null
      }
    }
    // LEGACY FLOW: Check secret_key.type
    else if (!apiKeyConfig?.secret_key || apiKeyConfig.secret_key.type === "none") {
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
    console.error("[PhoneNumber] Error fetching integration details:", error)
    return null
  }
}

// Helper to get just the secret key (backward compatibility)
async function getVapiSecretKeyForAgent(agent: AIAgent): Promise<string | null> {
  const details = await getVapiIntegrationDetails(agent)
  return details?.secretKey || null
}

// ============================================================================
// GET /api/w/[workspaceSlug]/agents/[id]/phone-number
// Returns current phone number assignment and list of available numbers
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
      return apiError("Phone numbers are only supported for Vapi agents", 400)
    }

    // Get the current assignment from DB
    let currentPhoneNumber = typedAgent.external_phone_number
    const telephonyConfig = typedAgent.config?.telephony
    const vapiPhoneNumberId = telephonyConfig?.vapi_phone_number_id

    // Try to get the secret key
    const secretKey = await getVapiSecretKeyForAgent(typedAgent)
    
    // If we have a phone number ID, fetch details from Vapi
    let vapiPhoneData: any = null
    if (vapiPhoneNumberId && secretKey) {
      const fetchResult = await getPhoneNumber({
        apiKey: secretKey,
        phoneNumberId: vapiPhoneNumberId,
      })
      
      if (fetchResult.success && fetchResult.data) {
        vapiPhoneData = fetchResult.data
        // For free Vapi numbers, sipUri is constructed (sip:{id}@sip.vapi.ai)
        const fetchedNumber = fetchResult.data.number || fetchResult.data.sipUri
        if (fetchedNumber && fetchedNumber !== currentPhoneNumber) {
          currentPhoneNumber = fetchedNumber
          // Update the database with the actual number/SIP URI
          await ctx.adminClient
            .from("ai_agents")
            .update({
              external_phone_number: fetchedNumber,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
        }
      }
    } else if (vapiPhoneNumberId && !currentPhoneNumber) {
      // If we have an ID but no key to fetch, construct the SIP URI
      currentPhoneNumber = `sip:${vapiPhoneNumberId}@sip.vapi.ai`
    }

    // Try to list phone numbers from Vapi (optional - may fail if no key)
    let availableNumbers: any[] = []
    
    if (secretKey) {
      const listResult = await listPhoneNumbers({ apiKey: secretKey })
      if (listResult.success && listResult.data) {
        availableNumbers = listResult.data.map((n) => ({
          id: n.id,
          number: n.number || n.sipUri,
          name: n.name,
          status: n.status,
          assistantId: n.assistantId,
          isAssignedToThisAgent: n.assistantId === typedAgent.external_agent_id,
        }))
      }
    }

    return apiResponse({
      currentPhoneNumber,
      vapiPhoneNumberId,
      isAssigned: !!vapiPhoneNumberId,
      availableNumbers,
      canProvision: !!secretKey && !!typedAgent.external_agent_id,
      // Include status info from Vapi
      vapiStatus: vapiPhoneData?.status,
      sipUri: vapiPhoneData?.sipUri,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/agents/[id]/phone-number error:", error)
    return serverError()
  }
}

// ============================================================================
// POST /api/w/[workspaceSlug]/agents/[id]/phone-number
// Provision a free US phone number and attach to this agent
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to manage phone numbers")
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
      return apiError("Phone numbers are only supported for Vapi agents", 400)
    }

    // Agent must be synced
    if (!typedAgent.external_agent_id) {
      return apiError(
        "Agent must be synced with Vapi before assigning a phone number. Save the agent with an API key first.",
        400
      )
    }

    // Check if already has a phone number
    if (typedAgent.config?.telephony?.vapi_phone_number_id) {
      return apiError(
        "Agent already has a phone number assigned. Release it first to get a new one.",
        400
      )
    }

    // Get secret key
    const secretKey = await getVapiSecretKeyForAgent(typedAgent)
    if (!secretKey) {
      return apiError(
        "No Vapi secret API key configured. Add one in the integration settings.",
        400
      )
    }

    // Create a free US phone number
    const createResult = await createFreeUsPhoneNumber({
      apiKey: secretKey,
      name: `Agent: ${typedAgent.name}`,
    })

    if (!createResult.success || !createResult.data) {
      return apiError(
        createResult.error || "Failed to provision phone number from Vapi",
        500
      )
    }

    const phoneNumberData = createResult.data
    
    // Free Vapi numbers don't have a PSTN number, only a SIP URI
    // The SIP URI is constructed in the phone-numbers.ts if not returned by Vapi
    const pstnNumber = phoneNumberData.number || null
    const sipUri = phoneNumberData.sipUri // Always available (constructed if needed)
    
    console.log("[PhoneNumber] Created - ID:", phoneNumberData.id, "PSTN:", pstnNumber, "SipUri:", sipUri, "Status:", phoneNumberData.status)

    // Attach the phone number to the assistant
    const attachResult = await attachPhoneNumberToAssistant({
      apiKey: secretKey,
      phoneNumberId: phoneNumberData.id,
      assistantId: typedAgent.external_agent_id,
    })

    if (!attachResult.success) {
      // Log but continue - number is created, just not attached
      console.error("[PhoneNumber] Failed to attach phone number:", attachResult.error)
    }

    // Display: prefer PSTN number, fallback to SIP URI
    // For free Vapi numbers, sipUri is the primary (and only) identifier
    const displayNumber = pstnNumber || sipUri

    // Update agent in database with the phone number
    const updatedConfig: AgentConfig = {
      ...typedAgent.config,
      telephony: {
        ...typedAgent.config?.telephony,
        vapi_phone_number_id: phoneNumberData.id,
      },
    }

    const { error: updateError } = await ctx.adminClient
      .from("ai_agents")
      .update({
        external_phone_number: displayNumber,
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("[PhoneNumber] Failed to update agent:", updateError)
      return apiError("Phone number provisioned but failed to save to agent", 500)
    }

    // Response includes both number types so UI can display appropriately
    const responseData = {
      success: true,
      phoneNumber: pstnNumber, // Traditional phone number (may be null for free numbers)
      sipUri: sipUri, // SIP URI (primary for free Vapi numbers)
      displayNumber: displayNumber, // Best available display value
      phoneNumberId: phoneNumberData.id,
      status: phoneNumberData.status,
      message: sipUri 
        ? "SIP phone number provisioned and attached successfully"
        : "Phone number provisioned (activating...)",
    }
    console.log("[PhoneNumber API] Returning:", responseData)
    return apiResponse(responseData)
  } catch (error) {
    console.error("POST /api/w/[slug]/agents/[id]/phone-number error:", error)
    return serverError()
  }
}

// ============================================================================
// DELETE /api/w/[workspaceSlug]/agents/[id]/phone-number
// Detach phone number from agent (does not delete from Vapi)
// ============================================================================

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to manage phone numbers")
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
      return apiError("Phone numbers are only supported for Vapi agents", 400)
    }

    const vapiPhoneNumberId = typedAgent.config?.telephony?.vapi_phone_number_id

    if (!vapiPhoneNumberId) {
      return apiError("No phone number is assigned to this agent", 400)
    }

    // Get secret key
    const secretKey = await getVapiSecretKeyForAgent(typedAgent)
    
    // Detach the phone number from the assistant (set assistantId to null)
    if (secretKey) {
      const detachResult = await attachPhoneNumberToAssistant({
        apiKey: secretKey,
        phoneNumberId: vapiPhoneNumberId,
        assistantId: null,
      })

      if (!detachResult.success) {
        console.error("[PhoneNumber] Failed to detach phone number:", detachResult.error)
        // Continue anyway - we'll clear the local reference
      }
    }

    // Clear phone number from agent in database
    const updatedConfig: AgentConfig = {
      ...typedAgent.config,
      telephony: {
        ...typedAgent.config?.telephony,
        vapi_phone_number_id: undefined,
      },
    }

    const { error: updateError } = await ctx.adminClient
      .from("ai_agents")
      .update({
        external_phone_number: null,
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("[PhoneNumber] Failed to update agent:", updateError)
      return apiError("Failed to release phone number from agent", 500)
    }

    return apiResponse({
      success: true,
      message: "Phone number released from agent",
    })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/agents/[id]/phone-number error:", error)
    return serverError()
  }
}

// ============================================================================
// PUT /api/w/[workspaceSlug]/agents/[id]/phone-number
// Assign an existing phone number (BYO or Vapi) to this agent for inbound calls
// ============================================================================

const assignPhoneNumberSchema = z.object({
  // Either provide an existing phoneNumberId from Vapi
  phoneNumberId: z.string().optional(),
  // Or create a new BYO phone number with these params
  byoNumber: z.string().optional(), // E.164 format
  byoName: z.string().optional(),
})

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to manage phone numbers")
    }

    // Parse request body
    const body = await request.json()
    const validation = assignPhoneNumberSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message || "Invalid request", 400)
    }

    const { phoneNumberId: existingPhoneNumberId, byoNumber, byoName } = validation.data

    if (!existingPhoneNumberId && !byoNumber) {
      return apiError("Either phoneNumberId or byoNumber must be provided", 400)
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
      return apiError("Phone numbers are only supported for Vapi agents", 400)
    }

    // Agent must be synced
    if (!typedAgent.external_agent_id) {
      return apiError(
        "Agent must be synced with Vapi before assigning a phone number. Save the agent with an API key first.",
        400
      )
    }

    // Get Vapi integration details
    const integrationDetails = await getVapiIntegrationDetails(typedAgent)
    if (!integrationDetails) {
      return apiError(
        "No Vapi secret API key configured. Add one in the integration settings.",
        400
      )
    }

    const { secretKey, config: vapiConfig } = integrationDetails
    let phoneNumberId: string
    let displayNumber: string

    // Case 1: Assign an existing phone number
    if (existingPhoneNumberId) {
      phoneNumberId = existingPhoneNumberId

      // Fetch the phone number details from Vapi
      const fetchResult = await getPhoneNumber({
        apiKey: secretKey,
        phoneNumberId: existingPhoneNumberId,
      })

      if (!fetchResult.success || !fetchResult.data) {
        return apiError(
          fetchResult.error || "Phone number not found in Vapi",
          404
        )
      }

      displayNumber = fetchResult.data.number || fetchResult.data.sipUri || existingPhoneNumberId
    }
    // Case 2: Create a new BYO phone number linked to SIP trunk
    else if (byoNumber) {
      const sipTrunkCredentialId = vapiConfig.sip_trunk_credential_id
      if (!sipTrunkCredentialId) {
        return apiError(
          "No SIP trunk configured. Add a SIP trunk credential ID in the Vapi integration settings first.",
          400
        )
      }

      // Create BYO phone number
      const createResult = await createByoPhoneNumber({
        apiKey: secretKey,
        number: byoNumber,
        credentialId: sipTrunkCredentialId,
        name: byoName || `Agent: ${typedAgent.name}`,
        numberE164CheckEnabled: false, // Allow flexibility in number format
      })

      if (!createResult.success || !createResult.data) {
        return apiError(
          createResult.error || "Failed to create BYO phone number in Vapi",
          500
        )
      }

      phoneNumberId = createResult.data.id
      displayNumber = createResult.data.number || byoNumber

      console.log("[PhoneNumber] Created BYO phone number:", {
        id: phoneNumberId,
        number: displayNumber,
        credentialId: sipTrunkCredentialId,
      })
    } else {
      return apiError("Either phoneNumberId or byoNumber must be provided", 400)
    }

    // Attach the phone number to the assistant (for inbound routing)
    const attachResult = await attachPhoneNumberToAssistant({
      apiKey: secretKey,
      phoneNumberId,
      assistantId: typedAgent.external_agent_id,
    })

    if (!attachResult.success) {
      console.error("[PhoneNumber] Failed to attach phone number:", attachResult.error)
      // Continue anyway - the number is assigned locally
    }

    // Update agent in database with the phone number
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
        external_phone_number: displayNumber,
        config: updatedConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("[PhoneNumber] Failed to update agent:", updateError)
      return apiError("Phone number assigned but failed to save to agent", 500)
    }

    return apiResponse({
      success: true,
      phoneNumber: displayNumber,
      phoneNumberId,
      message: byoNumber
        ? "BYO phone number created and assigned to agent for inbound calls"
        : "Phone number assigned to agent for inbound calls",
    })
  } catch (error) {
    console.error("PUT /api/w/[slug]/agents/[id]/phone-number error:", error)
    return serverError()
  }
}


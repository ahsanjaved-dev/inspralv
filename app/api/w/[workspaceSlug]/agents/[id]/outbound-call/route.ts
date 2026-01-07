import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import type { AIAgent, IntegrationApiKeys, VapiIntegrationConfig } from "@/types/database.types"
import { createOutboundCall } from "@/lib/integrations/vapi/calls"
import { hasSufficientCredits, checkMonthlyMinutesLimit } from "@/lib/billing/usage"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; id: string }>
}

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

const outboundCallSchema = z.object({
  customerNumber: z
    .string()
    .min(1, "Customer phone number is required")
    .regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone number format. Use E.164 format (e.g., +14155551234)"),
  customerName: z.string().optional(),
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

  // Need to fetch from workspace_integrations (for config and potentially the key)
  if (!agent.workspace_id) {
    console.error("[OutboundCall] Agent has no workspace_id")
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
      console.error("[OutboundCall] Failed to fetch VAPI integration:", error)
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
    console.error("[OutboundCall] Error fetching integration details:", error)
    return null
  }
}

// ============================================================================
// POST /api/w/[workspaceSlug]/agents/[id]/outbound-call
// Create an outbound call from the agent's phone number to a customer
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to make outbound calls")
    }

    // Check paywall - block outbound calls if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    // Parse and validate request body
    const body = await request.json()
    const validation = outboundCallSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message || "Invalid request", 400)
    }

    const { customerNumber, customerName } = validation.data

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
      return apiError("Outbound calls are only supported for Vapi agents", 400)
    }

    // Agent must be synced
    if (!typedAgent.external_agent_id) {
      return apiError(
        "Agent must be synced with Vapi before making outbound calls. Save the agent with an API key first.",
        400
      )
    }

    // Get Vapi integration details (includes shared outbound phone number)
    const integrationDetails = await getVapiIntegrationDetails(typedAgent)
    if (!integrationDetails) {
      return apiError(
        "No Vapi secret API key configured. Add one in the integration settings.",
        400
      )
    }

    const { secretKey, config: vapiConfig } = integrationDetails

    // Determine which phone number to use for outbound calls:
    // 1. Prefer shared outbound phone number (configured at workspace level)
    // 2. Fall back to agent's own phone number (if assigned)
    const sharedOutboundPhoneNumberId = vapiConfig.shared_outbound_phone_number_id
    const agentPhoneNumberId = typedAgent.config?.telephony?.vapi_phone_number_id
    
    const outboundPhoneNumberId = sharedOutboundPhoneNumberId || agentPhoneNumberId

    if (!outboundPhoneNumberId) {
      return apiError(
        "No outbound phone number configured. Set up a shared outbound number in integration settings or assign a phone number to the agent.",
        400
      )
    }

    console.log("[OutboundCall] Using phone number:", {
      shared: sharedOutboundPhoneNumberId,
      agent: agentPhoneNumberId,
      selected: outboundPhoneNumberId,
    })

    // ============================================================================
    // BILLING CHECKS
    // ============================================================================

    // 1. Check if partner has sufficient credits (estimate 5 minutes for outbound call)
    const estimatedMinutes = 5
    const hasCredits = await hasSufficientCredits(ctx.partner.id, estimatedMinutes)

    if (!hasCredits) {
      return apiError(
        "Insufficient credits. Please top up your account before making outbound calls.",
        402 // Payment Required
      )
    }

    // 2. Check if workspace has remaining monthly minutes
    const minutesCheck = await checkMonthlyMinutesLimit(ctx.workspace.id)

    if (!minutesCheck.allowed) {
      return apiError(
        `Monthly minutes limit reached. You have used ${minutesCheck.currentUsage} of ${minutesCheck.limit} minutes this month. Please upgrade your plan or wait until next month.`,
        429 // Too Many Requests
      )
    }

    console.log("[OutboundCall] Billing checks passed:", {
      hasCredits: true,
      monthlyMinutesRemaining: minutesCheck.remaining,
    })

    // Create the outbound call
    // Key: assistantId = agent's Vapi assistant (determines behavior)
    //      phoneNumberId = shared outbound number (determines caller ID/trunk)
    const callResult = await createOutboundCall({
      apiKey: secretKey,
      assistantId: typedAgent.external_agent_id,
      phoneNumberId: outboundPhoneNumberId,
      customerNumber,
      customerName,
    })

    if (!callResult.success || !callResult.data) {
      return apiError(
        callResult.error || "Failed to create outbound call",
        500
      )
    }

    const call = callResult.data

    // Determine display number for response
    const fromNumber = sharedOutboundPhoneNumberId
      ? vapiConfig.shared_outbound_phone_number || "Shared outbound number"
      : typedAgent.external_phone_number

    return apiResponse({
      success: true,
      callId: call.id,
      status: call.status,
      customerNumber,
      fromNumber,
      usedSharedOutbound: !!sharedOutboundPhoneNumberId,
      message: "Outbound call initiated successfully",
    })
  } catch (error) {
    console.error("POST /api/w/[slug]/agents/[id]/outbound-call error:", error)
    return serverError()
  }
}


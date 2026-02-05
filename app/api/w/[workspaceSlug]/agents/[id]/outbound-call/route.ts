import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import type { AIAgent, VapiIntegrationConfig, RetellIntegrationConfig } from "@/types/database.types"
import { createOutboundCall } from "@/lib/integrations/vapi/calls"
import { createRetellOutboundCall } from "@/lib/integrations/retell/calls"
import { checkMonthlyMinutesLimit } from "@/lib/billing/usage"
import { hasSufficientCredits } from "@/lib/stripe/credits"
import { canMakePostpaidCall, hasSufficientWorkspaceCredits } from "@/lib/stripe/workspace-credits"
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

  if (legacySecretKey?.key) {
    console.log("[OutboundCall] Using legacy agent-level key")
    return { secretKey: legacySecretKey.key, config: {} }
  }

  // NEW ORG-LEVEL FLOW: Fetch from workspace_integration_assignments -> partner_integrations
  if (!agent.workspace_id) {
    console.error("[OutboundCall] Agent has no workspace_id")
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
      console.error("[OutboundCall] Failed to fetch workspace:", workspaceError)
      return null
    }

    // Check for assigned integration
    const { data: assignment, error: assignmentError } = await supabase
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id,
          api_keys,
          config,
          is_active
        )
      `)
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", "vapi")
      .single()

    if (!assignmentError && assignment?.partner_integration) {
      const partnerIntegration = assignment.partner_integration as any
      if (partnerIntegration.is_active) {
        const apiKeys = partnerIntegration.api_keys as any
        const vapiConfig = (partnerIntegration.config as VapiIntegrationConfig) || {}
        console.log(`[OutboundCall] Using assigned org-level integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}`)
        if (apiKeys?.default_secret_key) {
          return { secretKey: apiKeys.default_secret_key, config: vapiConfig }
        }
      }
    }

    // If no assignment, try to find the default integration
    console.log("[OutboundCall] No assignment found, checking for default integration...")
    const { data: defaultIntegration, error: defaultError } = await supabase
      .from("partner_integrations")
      .select("id, api_keys, config, is_active")
      .eq("partner_id", workspace.partner_id)
      .eq("provider", "vapi")
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (!defaultError && defaultIntegration) {
      // Auto-create the assignment
      await supabase
        .from("workspace_integration_assignments")
        .insert({
          workspace_id: agent.workspace_id,
          provider: "vapi",
          partner_integration_id: defaultIntegration.id,
        })

      const apiKeys = defaultIntegration.api_keys as any
      const vapiConfig = (defaultIntegration.config as VapiIntegrationConfig) || {}
      console.log(`[OutboundCall] Using default org-level integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}`)
      if (apiKeys?.default_secret_key) {
        return { secretKey: apiKeys.default_secret_key, config: vapiConfig }
      }
    }

    console.log("[OutboundCall] No integration found")
    return null
  } catch (error) {
    console.error("[OutboundCall] Error fetching integration details:", error)
    return null
  }
}

// ============================================================================
// RETELL INTEGRATION DETAILS
// ============================================================================

interface RetellIntegrationDetails {
  secretKey: string
  config: RetellIntegrationConfig
}

async function getRetellIntegrationDetails(agent: AIAgent): Promise<RetellIntegrationDetails | null> {
  // Check legacy keys first
  const legacySecretKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === "retell" && key.is_active
  )

  if (legacySecretKey?.key) {
    console.log("[OutboundCall] Using legacy agent-level Retell key")
    return { secretKey: legacySecretKey.key, config: {} }
  }

  // NEW ORG-LEVEL FLOW: Fetch from workspace_integration_assignments -> partner_integrations
  if (!agent.workspace_id) {
    console.error("[OutboundCall] Agent has no workspace_id")
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
      console.error("[OutboundCall] Failed to fetch workspace:", workspaceError)
      return null
    }

    // Check for assigned integration
    const { data: assignment, error: assignmentError } = await supabase
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id,
          api_keys,
          config,
          is_active
        )
      `)
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", "retell")
      .single()

    if (!assignmentError && assignment?.partner_integration) {
      const partnerIntegration = assignment.partner_integration as any
      if (partnerIntegration.is_active) {
        const apiKeys = partnerIntegration.api_keys as any
        const retellConfig = (partnerIntegration.config as RetellIntegrationConfig) || {}
        console.log(`[OutboundCall] Using assigned org-level Retell integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}`)
        if (apiKeys?.default_secret_key) {
          return { secretKey: apiKeys.default_secret_key, config: retellConfig }
        }
      }
    }

    // If no assignment, try to find the default integration
    console.log("[OutboundCall] No Retell assignment found, checking for default integration...")
    const { data: defaultIntegration, error: defaultError } = await supabase
      .from("partner_integrations")
      .select("id, api_keys, config, is_active")
      .eq("partner_id", workspace.partner_id)
      .eq("provider", "retell")
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (!defaultError && defaultIntegration) {
      // Auto-create the assignment
      await supabase
        .from("workspace_integration_assignments")
        .insert({
          workspace_id: agent.workspace_id,
          provider: "retell",
          partner_integration_id: defaultIntegration.id,
        })

      const apiKeys = defaultIntegration.api_keys as any
      const retellConfig = (defaultIntegration.config as RetellIntegrationConfig) || {}
      console.log(`[OutboundCall] Using default org-level Retell integration, secretKey: ${apiKeys?.default_secret_key ? 'found' : 'not found'}`)
      if (apiKeys?.default_secret_key) {
        return { secretKey: apiKeys.default_secret_key, config: retellConfig }
      }
    }

    console.log("[OutboundCall] No Retell integration found")
    return null
  } catch (error) {
    console.error("[OutboundCall] Error fetching Retell integration details:", error)
    return null
  }
}

// ============================================================================
// POST /api/w/[workspaceSlug]/agents/[id]/outbound-call
// Create an outbound call from the agent's phone number to a customer
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  console.log("[OutboundCall] Route handler invoked")
  try {
    const { workspaceSlug, id } = await params
    console.log("[OutboundCall] Params:", { workspaceSlug, id })
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

    // Must be a VAPI or Retell agent
    if (typedAgent.provider !== "vapi" && typedAgent.provider !== "retell") {
      return apiError("Outbound calls are only supported for VAPI and Retell agents", 400)
    }

    // Agent must be synced
    if (!typedAgent.external_agent_id) {
      return apiError(
        `Agent must be synced with ${typedAgent.provider === "vapi" ? "VAPI" : "Retell"} before making outbound calls. Save the agent with an API key first.`,
        400
      )
    }

    // ============================================================================
    // BILLING CHECKS (common for both providers)
    // ============================================================================

    // Check if workspace is billing exempt (uses partner credits)
    const isBillingExempt = ctx.workspace.is_billing_exempt
    const isPlatformPartner = ctx.partner.is_platform_partner
    const estimatedMinutes = 5

    if (isBillingExempt) {
      // Platform partner's billing-exempt workspaces skip credit checks entirely
      // (Platform partner owns the platform and doesn't use the credit system)
      if (isPlatformPartner) {
        console.log("[OutboundCall] Billing checks skipped (platform partner billing-exempt workspace)")
      } else {
        // Non-platform partner billing-exempt workspaces use partner credits
        const hasPartnerCredits = await hasSufficientCredits(ctx.partner.id, estimatedMinutes)

        if (!hasPartnerCredits) {
          return apiError(
            "Insufficient organization credits. Please contact your organization admin to top up credits.",
            402 // Payment Required
          )
        }

        console.log("[OutboundCall] Billing checks passed (billing-exempt, using partner credits)")
      }
    } else {
      // Non-billing-exempt workspaces: Check subscription and workspace credits
      
      // 1. Check if workspace has an active subscription with available minutes
      const postpaidCheck = await canMakePostpaidCall(ctx.workspace.id)
      
      if (postpaidCheck.billingType === "postpaid") {
        // Postpaid subscription - check against usage limit
        if (!postpaidCheck.allowed) {
          return apiError(
            `Monthly minutes limit reached. You have used ${postpaidCheck.currentUsage} of ${postpaidCheck.limitMinutes} minutes. Please upgrade your plan or wait until next billing period.`,
            429 // Too Many Requests
          )
        }
        console.log("[OutboundCall] Billing checks passed (postpaid subscription):", {
          remainingMinutes: postpaidCheck.remainingMinutes,
        })
      } else if (postpaidCheck.billingType === "prepaid") {
        // Prepaid subscription - has included minutes, overage uses workspace credits
        // The subscription has included minutes, so we allow the call
        // Overage will be handled at call completion via workspace credits
        console.log("[OutboundCall] Billing checks passed (prepaid subscription):", {
          remainingIncludedMinutes: postpaidCheck.remainingMinutes,
        })
      } else {
        // No subscription - check workspace prepaid credits
        const hasWorkspaceCredits = await hasSufficientWorkspaceCredits(ctx.workspace.id, estimatedMinutes)

        if (!hasWorkspaceCredits) {
          return apiError(
            "Insufficient credits. Please top up your account before making outbound calls.",
            402 // Payment Required
          )
        }
        console.log("[OutboundCall] Billing checks passed (workspace credits)")
      }

      // 2. Also check workspace monthly minutes limit (plan-level limit)
      const minutesCheck = await checkMonthlyMinutesLimit(ctx.workspace.id)

      if (!minutesCheck.allowed) {
        return apiError(
          `Monthly minutes limit reached. You have used ${minutesCheck.currentUsage} of ${minutesCheck.limit} minutes this month. Please upgrade your plan or wait until next month.`,
          429 // Too Many Requests
        )
      }
    }

    // ============================================================================
    // HANDLE VAPI OUTBOUND CALL
    // ============================================================================

    if (typedAgent.provider === "vapi") {
      // Get VAPI integration details (includes shared outbound phone number)
      const integrationDetails = await getVapiIntegrationDetails(typedAgent)
      if (!integrationDetails) {
        return apiError(
          "No VAPI secret API key configured. Add one in the integration settings.",
          400
        )
      }

      const { secretKey, config: vapiConfig } = integrationDetails

      // Determine which phone number to use for outbound calls:
      // 1. Prefer shared outbound phone number (configured at workspace level)
      // 2. Fall back to agent's config telephony phone number
      // 3. Fall back to agent's assigned_phone_number_id (fetch VAPI ID from DB)
      const sharedOutboundPhoneNumberId = vapiConfig.shared_outbound_phone_number_id
      let agentPhoneNumberId = typedAgent.config?.telephony?.vapi_phone_number_id
      
      // If no phone number in config, check assigned_phone_number_id
      if (!agentPhoneNumberId && typedAgent.assigned_phone_number_id) {
        console.log("[OutboundCall] Checking assigned_phone_number_id:", typedAgent.assigned_phone_number_id)
        
        // Fetch the phone number from DB to get its VAPI external_id
        const { data: phoneNumber } = await ctx.adminClient
          .from("phone_numbers")
          .select("id, external_id, phone_number")
          .eq("id", typedAgent.assigned_phone_number_id)
          .single()
        
        if (phoneNumber?.external_id) {
          agentPhoneNumberId = phoneNumber.external_id
          console.log("[OutboundCall] Found VAPI phone number ID from assigned number:", agentPhoneNumberId)
        } else {
          console.log("[OutboundCall] Assigned phone number not synced to VAPI:", phoneNumber)
        }
      }
      
      const outboundPhoneNumberId = sharedOutboundPhoneNumberId || agentPhoneNumberId

      if (!outboundPhoneNumberId) {
        return apiError(
          "No outbound phone number configured. Set up a shared outbound number in integration settings, or assign a synced phone number to the agent.",
          400
        )
      }

      console.log("[OutboundCall] VAPI - Using phone number:", {
        shared: sharedOutboundPhoneNumberId,
        agent: agentPhoneNumberId,
        assignedPhoneNumberId: typedAgent.assigned_phone_number_id,
        selected: outboundPhoneNumberId,
      })

      // Create the outbound call via VAPI
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
        provider: "vapi",
        callId: call.id,
        status: call.status,
        customerNumber,
        fromNumber,
        usedSharedOutbound: !!sharedOutboundPhoneNumberId,
        message: "Outbound call initiated successfully",
      })
    }

    // ============================================================================
    // HANDLE RETELL OUTBOUND CALL
    // ============================================================================

    if (typedAgent.provider === "retell") {
      // Get Retell integration details
      const integrationDetails = await getRetellIntegrationDetails(typedAgent)
      if (!integrationDetails) {
        return apiError(
          "No Retell secret API key configured. Add one in the integration settings.",
          400
        )
      }

      const { secretKey, config: retellConfig } = integrationDetails

      // Determine which phone number to use for outbound calls:
      // 1. Prefer shared outbound phone number (configured at workspace level)
      // 2. Fall back to agent's assigned_phone_number_id (fetch phone number from DB)
      const sharedOutboundPhoneNumber = retellConfig.shared_outbound_phone_number
      let agentPhoneNumber: string | undefined = undefined
      
      // Check assigned_phone_number_id for agent-specific phone number
      if (!agentPhoneNumber && typedAgent.assigned_phone_number_id) {
        console.log("[OutboundCall] Checking assigned_phone_number_id for Retell:", typedAgent.assigned_phone_number_id)
        
        // Fetch the phone number from DB
        const { data: phoneNumber } = await ctx.adminClient
          .from("phone_numbers")
          .select("id, phone_number, external_id")
          .eq("id", typedAgent.assigned_phone_number_id)
          .single()
        
        if (phoneNumber?.phone_number) {
          agentPhoneNumber = phoneNumber.phone_number
          console.log("[OutboundCall] Found phone number from assigned number:", agentPhoneNumber)
        } else {
          console.log("[OutboundCall] Assigned phone number not found:", phoneNumber)
        }
      }
      
      const outboundPhoneNumber = sharedOutboundPhoneNumber || agentPhoneNumber

      if (!outboundPhoneNumber) {
        return apiError(
          "No outbound phone number configured. Set up a shared outbound number in integration settings, or assign a phone number to the agent.",
          400
        )
      }

      console.log("[OutboundCall] Retell - Using phone number:", {
        shared: sharedOutboundPhoneNumber,
        agent: agentPhoneNumber,
        assignedPhoneNumberId: typedAgent.assigned_phone_number_id,
        selected: outboundPhoneNumber,
      })

      // Create the outbound call via Retell
      // Use override_agent_id to specify the agent for this specific call
      const callResult = await createRetellOutboundCall({
        apiKey: secretKey,
        toNumber: customerNumber,
        fromNumber: outboundPhoneNumber,
        overrideAgentId: typedAgent.external_agent_id,
        metadata: {
          customer_name: customerName,
          workspace_id: ctx.workspace.id,
          agent_id: typedAgent.id,
        },
      })

      if (!callResult.success || !callResult.data) {
        return apiError(
          callResult.error || "Failed to create outbound call",
          500
        )
      }

      const call = callResult.data

      return apiResponse({
        success: true,
        provider: "retell",
        callId: call.call_id,
        status: call.call_status,
        customerNumber,
        fromNumber: outboundPhoneNumber,
        usedSharedOutbound: !!sharedOutboundPhoneNumber,
        message: "Outbound call initiated successfully",
      })
    }

    // Should never reach here due to provider check above
    return apiError("Unsupported provider", 400)
  } catch (error) {
    console.error("POST /api/w/[slug]/agents/[id]/outbound-call error:", error)
    return serverError()
  }
}


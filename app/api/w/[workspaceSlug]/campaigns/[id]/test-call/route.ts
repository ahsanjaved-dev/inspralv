import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound, getValidationError } from "@/lib/api/helpers"
import { z } from "zod"
import {
  makeTestCall,
  convertBusinessHoursToBlockRules,
  type CampaignProviderConfig,
} from "@/lib/integrations/campaign-provider"
import type { CampaignData } from "@/lib/integrations/campaign-provider"
import type { BusinessHoursConfig } from "@/types/database.types"

const testCallSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  variables: z.record(z.string(), z.string()).optional(),
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
// HELPER: Get VAPI Config for Fallback
// ============================================================================

interface VapiIntegrationDetails {
  apiKey: string
  phoneNumberId: string | null
  config: any
}

async function getVapiConfigForFallback(
  agent: any,
  workspaceId: string,
  adminClient: ReturnType<typeof getSupabaseAdmin>
): Promise<VapiIntegrationDetails | null> {
  try {
    const { data: workspace } = await adminClient
      .from("workspaces")
      .select("partner_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace?.partner_id) return null

    const { data: assignment } = await adminClient
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id,
          api_keys,
          config,
          is_active
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("provider", "vapi")
      .single()

    if (assignment?.partner_integration) {
      const partnerIntegration = assignment.partner_integration as any
      if (partnerIntegration.is_active) {
        const apiKeys = partnerIntegration.api_keys as any
        const vapiConfig = partnerIntegration.config || {}
        
        if (apiKeys?.default_secret_key) {
          let phoneNumberId: string | null = null
          
          if (vapiConfig.shared_outbound_phone_number_id) {
            phoneNumberId = vapiConfig.shared_outbound_phone_number_id
          } else if (agent.assigned_phone_number_id) {
            const { data: phoneNumber } = await adminClient
              .from("phone_numbers")
              .select("external_id")
              .eq("id", agent.assigned_phone_number_id)
              .single()
            
            if (phoneNumber?.external_id) {
              phoneNumberId = phoneNumber.external_id
            }
          }
          
          return {
            apiKey: apiKeys.default_secret_key,
            phoneNumberId,
            config: vapiConfig,
          }
        }
      }
    }

    // Try default integration
    const { data: defaultIntegration } = await adminClient
      .from("partner_integrations")
      .select("id, api_keys, config, is_active")
      .eq("partner_id", workspace.partner_id)
      .eq("provider", "vapi")
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (defaultIntegration) {
      const apiKeys = defaultIntegration.api_keys as any
      const vapiConfig = defaultIntegration.config || {}
      
      if (apiKeys?.default_secret_key) {
        let phoneNumberId: string | null = null
        
        if (vapiConfig.shared_outbound_phone_number_id) {
          phoneNumberId = vapiConfig.shared_outbound_phone_number_id
        } else if (agent.assigned_phone_number_id) {
          const { data: phoneNumber } = await adminClient
            .from("phone_numbers")
            .select("external_id")
            .eq("id", agent.assigned_phone_number_id)
            .single()
          
          if (phoneNumber?.external_id) {
            phoneNumberId = phoneNumber.external_id
          }
        }
        
        return {
          apiKey: apiKeys.default_secret_key,
          phoneNumberId,
          config: vapiConfig,
        }
      }
    }

    return null
  } catch (error) {
    console.error("[CampaignTestCall] Error getting VAPI config:", error)
    return null
  }
}

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/test-call
 * 
 * Queue a single test call via unified provider (Inspra with VAPI fallback).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check paywall
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    const body = await request.json()
    const parsed = testCallSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(getValidationError(parsed.error))
    }

    // Get campaign with agent
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select(`
        *,
        agent:ai_agents!agent_id(
          id, 
          external_agent_id,
          external_phone_number,
          assigned_phone_number_id
        )
      `)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    const agent = campaign.agent as any
    if (!agent?.external_agent_id) {
      return apiError("Agent has not been synced with the voice provider")
    }

    // Get CLI (caller ID) from agent's phone number
    let cli = agent.external_phone_number
    
    if (!cli && agent.assigned_phone_number_id) {
      const { data: phoneNumber } = await ctx.adminClient
        .from("phone_numbers")
        .select("phone_number, phone_number_e164")
        .eq("id", agent.assigned_phone_number_id)
        .single()
      
      if (phoneNumber) {
        cli = phoneNumber.phone_number_e164 || phoneNumber.phone_number
      }
    }
    
    if (!cli) {
      return apiError("Agent does not have a phone number assigned")
    }

    // =========================================================================
    // GET VAPI CONFIG FOR FALLBACK
    // =========================================================================
    
    const vapiDetails = await getVapiConfigForFallback(agent, ctx.workspace.id, ctx.adminClient)
    const vapiConfig: CampaignProviderConfig["vapi"] = vapiDetails?.apiKey && vapiDetails?.phoneNumberId
      ? {
          apiKey: vapiDetails.apiKey,
          phoneNumberId: vapiDetails.phoneNumberId,
        }
      : undefined

    console.log("[CampaignTestCall] VAPI fallback available:", !!vapiConfig)

    // =========================================================================
    // MAKE TEST CALL VIA UNIFIED PROVIDER
    // =========================================================================

    const businessHoursConfig = campaign.business_hours_config as BusinessHoursConfig | null

    // Build campaign data for test call
    const campaignData: CampaignData = {
      id: campaign.id,
      workspace_id: ctx.workspace.id,
      agent: {
        external_agent_id: agent.external_agent_id,
        external_phone_number: agent.external_phone_number,
        assigned_phone_number_id: agent.assigned_phone_number_id,
      },
      cli,
      schedule_type: "immediate",
      scheduled_start_at: null,
      scheduled_expires_at: null,
      business_hours_config: businessHoursConfig,
      timezone: campaign.timezone || "UTC",
    }

    // Default variables if not provided
    const variables = parsed.data.variables || {
      FIRST_NAME: "Test",
      LAST_NAME: "User",
      COMPANY_NAME: "Test Company",
      EMAIL: "",
      REASON_FOR_CALL: "Test call",
      ADDRESS: "",
      ADDRESS_LINE_2: "",
      CITY: "",
      STATE: "",
      POST_CODE: "",
      COUNTRY: "",
    }

    console.log("[CampaignTestCall] Making test call to:", parsed.data.phone_number)

    // Make test call via unified provider
    const result = await makeTestCall(
      campaignData,
      parsed.data.phone_number,
      variables,
      vapiConfig
    )

    if (!result.success) {
      console.error("[CampaignTestCall] Test call failed:", result.error)
      return serverError(`Test call failed: ${result.error}`)
    }

    console.log("[CampaignTestCall] Test call queued via:", result.provider)

    return apiResponse({
      success: true,
      message: `Test call queued successfully via ${result.provider}`,
      phone: parsed.data.phone_number,
      provider: {
        used: result.provider,
        fallbackUsed: result.fallbackUsed,
        primaryError: result.primaryError,
      },
    })
  } catch (error) {
    console.error("[CampaignTestCall] Exception:", error)
    return serverError("Internal server error")
  }
}

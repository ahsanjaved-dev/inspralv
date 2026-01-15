import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import {
  startCampaignBatch,
  type CampaignProviderConfig,
} from "@/lib/integrations/campaign-provider"
import type { CampaignData, RecipientData } from "@/lib/integrations/campaign-provider"
import type { BusinessHoursConfig } from "@/types/database.types"

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
    // Get workspace to find partner_id
    const { data: workspace } = await adminClient
      .from("workspaces")
      .select("partner_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace?.partner_id) return null

    // Check for assigned integration
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
    console.error("[CampaignResume] Error getting VAPI config:", error)
    return null
  }
}

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/resume
 * 
 * Resume a paused campaign.
 * Uses unified provider with automatic VAPI fallback.
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

    // Get campaign with agent
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select(`
        *,
        agent:ai_agents!agent_id(
          id,
          name,
          provider,
          is_active,
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

    // Validate campaign can be resumed
    if (campaign.status !== "paused") {
      return apiError("Only paused campaigns can be resumed")
    }

    const agent = campaign.agent as any
    if (!agent?.external_agent_id) {
      return apiError("Agent is not synced with external provider")
    }

    if (!agent.is_active) {
      return apiError("Agent is not active")
    }

    // Get CLI (outbound phone number)
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
      return apiError("No outbound phone number configured for this agent")
    }

    // Get pending recipients
    const { data: recipients, error: recipientsError } = await ctx.adminClient
      .from("call_recipients")
      .select("*")
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (recipientsError) {
      console.error("[CampaignResume] Error fetching recipients:", recipientsError)
      return serverError("Failed to fetch recipients")
    }

    if (!recipients || recipients.length === 0) {
      return apiError("No pending recipients to resume calls for")
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

    console.log("[CampaignResume] VAPI fallback available:", !!vapiConfig)

    // =========================================================================
    // RESUME CAMPAIGN VIA UNIFIED PROVIDER
    // =========================================================================

    console.log("[CampaignResume] Resuming campaign via unified provider...")

    // Build campaign data - use "immediate" schedule type for resume
    const campaignData: CampaignData = {
      id: campaign.id,
      workspace_id: campaign.workspace_id,
      agent: {
        external_agent_id: agent.external_agent_id,
        external_phone_number: agent.external_phone_number,
        assigned_phone_number_id: agent.assigned_phone_number_id,
      },
      cli,
      schedule_type: "immediate", // Resume immediately
      scheduled_start_at: null,
      scheduled_expires_at: campaign.scheduled_expires_at,
      business_hours_config: campaign.business_hours_config as BusinessHoursConfig,
      timezone: campaign.timezone || "UTC",
    }

    const recipientData: RecipientData[] = recipients.map((r) => ({
      phone_number: r.phone_number,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      company: r.company,
      reason_for_call: r.reason_for_call,
      address_line_1: r.address_line_1,
      address_line_2: r.address_line_2,
      suburb: r.suburb,
      state: r.state,
      post_code: r.post_code,
      country: r.country,
    }))

    // Resume via unified provider
    const providerResult = await startCampaignBatch(
      campaignData,
      recipientData,
      vapiConfig,
      { startNow: true }
    )

    if (!providerResult.success) {
      console.error("[CampaignResume] Failed to resume campaign:", providerResult.error)
      // Don't fail completely - still update local status for manual handling
    }

    // Update campaign status to active
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[CampaignResume] Error updating campaign status:", updateError)
      return serverError("Failed to update campaign status")
    }

    console.log("[CampaignResume] Campaign resumed:", {
      campaignId: id,
      provider: providerResult.provider,
      fallbackUsed: providerResult.fallbackUsed,
    })

    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      provider: {
        used: providerResult.provider,
        success: providerResult.success,
        error: providerResult.error,
        fallbackUsed: providerResult.fallbackUsed,
        primaryError: providerResult.primaryError,
        batchRef: providerResult.batchRef,
        recipientCount: recipients.length,
      },
      message: `Campaign resumed via ${providerResult.provider}. Pending calls will be processed according to business hours.`,
    })
  } catch (error) {
    console.error("[CampaignResume] Exception:", error)
    return serverError("Internal server error")
  }
}

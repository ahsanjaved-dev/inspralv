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
// HELPER: Get CLI (Caller ID) for campaign
// ============================================================================

async function getCLIForAgent(
  agent: any,
  workspaceId: string,
  partnerId: string,
  adminClient: ReturnType<typeof getSupabaseAdmin>
): Promise<string | null> {
  // Priority:
  // 1. Agent's external_phone_number
  // 2. Agent's assigned_phone_number_id (lookup)
  // 3. Shared outbound from integration config

  if (agent.external_phone_number) {
    return agent.external_phone_number
  }

  if (agent.assigned_phone_number_id) {
    const { data: phoneNumber } = await adminClient
      .from("phone_numbers")
      .select("phone_number, phone_number_e164")
      .eq("id", agent.assigned_phone_number_id)
      .single()

    if (phoneNumber) {
      return phoneNumber.phone_number_e164 || phoneNumber.phone_number
    }
  }

  // Check integration for shared outbound number
  const supabase = getSupabaseAdmin()
  const { data: assignment } = await supabase
    .from("workspace_integration_assignments")
    .select(`
      partner_integration:partner_integrations (
        config
      )
    `)
    .eq("workspace_id", workspaceId)
    .eq("provider", "vapi")
    .single()

  if (assignment?.partner_integration) {
    const config = (assignment.partner_integration as any).config
    if (config?.shared_outbound_phone_number) {
      return config.shared_outbound_phone_number
    }
  }

  return null
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
          // Get VAPI phone number ID
          let phoneNumberId: string | null = null
          
          // Priority: shared outbound phone number ID > agent's assigned phone > agent's external
          if (vapiConfig.shared_outbound_phone_number_id) {
            phoneNumberId = vapiConfig.shared_outbound_phone_number_id
          } else if (agent.assigned_phone_number_id) {
            // Lookup the phone number's external_id (VAPI phone number ID)
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
    console.error("[CampaignStart] Error getting VAPI config:", error)
    return null
  }
}

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/start
 * 
 * Start a campaign that is in "ready" status.
 * 
 * Flow:
 * 1. Try Inspra API first (primary)
 * 2. If Inspra fails, automatically fallback to VAPI
 * 3. Campaign status changes to "active"
 * 4. Calls begin immediately (respecting business hours)
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

    // Get campaign with agent (full details needed)
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

    // Validate campaign can be started
    if (campaign.status === "active") {
      return apiError("Campaign is already active")
    }

    if (campaign.status === "completed" || campaign.status === "cancelled") {
      return apiError("Cannot start a completed or cancelled campaign")
    }

    if (campaign.status === "scheduled") {
      return apiError("Scheduled campaigns start automatically at the scheduled time")
    }

    // Only allow starting from "ready" or "draft" status
    if (campaign.status !== "ready" && campaign.status !== "draft") {
      return apiError(`Cannot start campaign with status: ${campaign.status}`)
    }

    // Validate agent
    const agent = campaign.agent as any
    if (!agent || !agent.is_active) {
      return apiError("Campaign agent is not active")
    }

    if (!agent.external_agent_id) {
      return apiError("Agent has not been synced with the voice provider")
    }

    // Get CLI (Caller ID)
    const cli = await getCLIForAgent(agent, ctx.workspace.id, ctx.partner.id, ctx.adminClient)
    if (!cli) {
      return apiError("No outbound phone number configured for the agent")
    }

    // Fetch all recipients for this campaign
    const { data: recipients, error: recipientsError } = await ctx.adminClient
      .from("call_recipients")
      .select("*")
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (recipientsError) {
      console.error("[CampaignStart] Error fetching recipients:", recipientsError)
      return serverError("Failed to fetch recipients")
    }

    if (!recipients || recipients.length === 0) {
      return apiError("No pending recipients to call. Add recipients first.")
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

    console.log("[CampaignStart] VAPI fallback available:", !!vapiConfig)

    // =========================================================================
    // START CAMPAIGN VIA UNIFIED PROVIDER (Inspra first, VAPI fallback)
    // =========================================================================

    console.log("[CampaignStart] Starting campaign via unified provider...")

    // Build campaign data
    const campaignData: CampaignData = {
      id: campaign.id,
      workspace_id: ctx.workspace.id,
      agent: {
        external_agent_id: agent.external_agent_id,
        external_phone_number: agent.external_phone_number,
        assigned_phone_number_id: agent.assigned_phone_number_id,
      },
      cli,
      schedule_type: campaign.schedule_type,
      scheduled_start_at: campaign.scheduled_start_at,
      scheduled_expires_at: campaign.scheduled_expires_at,
      business_hours_config: campaign.business_hours_config as BusinessHoursConfig | null,
      timezone: campaign.timezone,
    }

    // Map recipients (include ID for tracking)
    const recipientData: RecipientData[] = recipients.map((r: any) => ({
      id: r.id,  // Include DB ID for tracking call results
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

    // Start via unified provider
    const providerResult = await startCampaignBatch(
      campaignData,
      recipientData,
      vapiConfig,
      { startNow: true }
    )

    if (!providerResult.success) {
      console.error("[CampaignStart] Failed to start campaign:", providerResult.error)
      return serverError(`Failed to start campaign: ${providerResult.error || "Provider error"}`)
    }

    console.log("[CampaignStart] Campaign started via:", providerResult.provider)
    if (providerResult.fallbackUsed) {
      console.log("[CampaignStart] Fallback was used. Primary error:", providerResult.primaryError)
    }

    // =========================================================================
    // UPDATE RECIPIENT STATUS (VAPI)
    // When using VAPI, we have immediate call results to update
    // =========================================================================
    
    if (providerResult.provider === "vapi" && providerResult.vapiResults?.results) {
      console.log("[CampaignStart] Updating recipient status from VAPI results...")
      
      const callResults = providerResult.vapiResults.results
      const successfulCalls = callResults.filter(r => r.success && r.callId)
      const failedCalls = callResults.filter(r => !r.success)
      
      // Update successful calls - set status to "calling" and store external call ID
      for (const result of successfulCalls) {
        try {
          await ctx.adminClient
            .from("call_recipients")
            .update({
              call_status: "calling",
              external_call_id: result.callId,
              call_started_at: new Date().toISOString(),
            })
            .eq("id", result.recipientId)
            .eq("campaign_id", id)
            
          console.log(`[CampaignStart] Updated recipient ${result.recipientId}: calling, callId=${result.callId}`)
        } catch (err) {
          console.error(`[CampaignStart] Failed to update recipient ${result.recipientId}:`, err)
        }
      }
      
      // Update failed calls - set status to "failed" with error
      for (const result of failedCalls) {
        try {
          await ctx.adminClient
            .from("call_recipients")
            .update({
              call_status: "failed",
              last_error: result.error || "Call creation failed",
            })
            .eq("id", result.recipientId)
            .eq("campaign_id", id)
            
          console.log(`[CampaignStart] Updated recipient ${result.recipientId}: failed, error=${result.error}`)
        } catch (err) {
          console.error(`[CampaignStart] Failed to update recipient ${result.recipientId}:`, err)
        }
      }
      
      console.log(`[CampaignStart] Recipient updates complete: ${successfulCalls.length} in_progress, ${failedCalls.length} failed`)
    }

    // =========================================================================
    // UPDATE CAMPAIGN STATUS TO ACTIVE
    // =========================================================================

    // Calculate actual counts based on VAPI results
    const successCount = providerResult.vapiResults?.successfulCalls ?? recipients.length
    const failedCount = providerResult.vapiResults?.failedCalls ?? 0
    const pendingCount = recipients.length - successCount - failedCount

    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
        pending_calls: pendingCount,
        successful_calls: successCount > 0 ? 0 : 0,  // Will be updated by webhook when calls complete
        failed_calls: failedCount,  // Immediately failed calls
      })
      .eq("id", id)
      .select(`
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active, external_agent_id)
      `)
      .single()

    if (updateError) {
      console.error("[CampaignStart] Error updating campaign status:", updateError)
      return serverError("Failed to update campaign status")
    }

    console.log("[CampaignStart] Campaign started:", {
      campaignId: id,
      batchRef: providerResult.batchRef,
      pendingRecipients: recipients.length,
      provider: providerResult.provider,
      fallbackUsed: providerResult.fallbackUsed,
    })

    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      batchRef: providerResult.batchRef,
      recipientCount: recipients.length,
      message: `Campaign started via ${providerResult.provider}! Calls are now being processed.`,
      provider: {
        used: providerResult.provider,
        fallbackUsed: providerResult.fallbackUsed,
        primaryError: providerResult.primaryError,
      },
      // Include VAPI-specific results if using VAPI
      ...(providerResult.vapiResults && {
        vapiResults: {
          successfulCalls: providerResult.vapiResults.successfulCalls,
          failedCalls: providerResult.vapiResults.failedCalls,
          skippedCalls: providerResult.vapiResults.skippedCalls,
        },
      }),
    })
  } catch (error) {
    console.error("[CampaignStart] Exception:", error)
    return serverError("Internal server error")
  }
}

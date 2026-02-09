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
import { isWithinBusinessHours, getNextBusinessHoursStart } from "@/lib/campaigns/batch-caller"

// ============================================================================
// VERCEL CONFIG
// ============================================================================
// We now return immediately, so shorter timeout is fine
export const maxDuration = 60

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
  // 1. Check agent's direct external phone number
  if (agent.external_phone_number) {
    return agent.external_phone_number
  }

  // 2. Check agent's assigned phone number from our DB
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

  // 3. Check for shared outbound phone number from integration config
  // Determine agent provider (default to vapi if not specified)
  const agentProvider = agent.provider || "vapi"
  
  const supabase = getSupabaseAdmin()
  
  // First try workspace assignment
  const { data: assignment } = await supabase
    .from("workspace_integration_assignments")
    .select(`
      partner_integration:partner_integrations (
        config,
        is_active
      )
    `)
    .eq("workspace_id", workspaceId)
    .eq("provider", agentProvider)
    .single()

  if (assignment?.partner_integration) {
    const partnerIntegration = assignment.partner_integration as any
    if (partnerIntegration.is_active) {
      const config = partnerIntegration.config
      if (config?.shared_outbound_phone_number) {
        console.log(`[Campaign] Using shared outbound phone number from ${agentProvider} integration:`, config.shared_outbound_phone_number)
        return config.shared_outbound_phone_number
      }
    }
  }

  // Fallback to default partner integration
  const { data: defaultIntegration } = await supabase
    .from("partner_integrations")
    .select("config, is_active")
    .eq("partner_id", partnerId)
    .eq("provider", agentProvider)
    .eq("is_default", true)
    .eq("is_active", true)
    .single()

  if (defaultIntegration?.is_active) {
    const config = defaultIntegration.config as any
    if (config?.shared_outbound_phone_number) {
      console.log(`[Campaign] Using shared outbound phone number from default ${agentProvider} integration:`, config.shared_outbound_phone_number)
      return config.shared_outbound_phone_number
    }
  }

  return null
}

// ============================================================================
// HELPER: Get VAPI Config
// ============================================================================

interface VapiIntegrationDetails {
  apiKey: string
  phoneNumberId: string | null
  config: any
}

async function getVapiConfig(
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
    console.error("[CampaignStart] Error getting VAPI config:", error)
    return null
  }
}

// ============================================================================
// BACKGROUND CALL PROCESSOR
// ============================================================================

/**
 * Process calls in background (fire-and-forget)
 * Updates recipient statuses as calls are made
 */
async function processCallsInBackground(
  campaignId: string,
  workspaceId: string,
  campaignData: CampaignData,
  recipients: RecipientData[],
  vapiConfig: CampaignProviderConfig["vapi"]
) {
  const adminClient = getSupabaseAdmin()
  
  console.log(`[CampaignStart:BG] Starting background processing for ${recipients.length} recipients`)
  
  try {
    // Start the batch processing
    const providerResult = await startCampaignBatch(
      campaignData,
      recipients,
      vapiConfig,
      { startNow: true }
    )

    console.log(`[CampaignStart:BG] Batch complete:`, {
      success: providerResult.success,
      successfulCalls: providerResult.vapiResults?.successfulCalls ?? 0,
      failedCalls: providerResult.vapiResults?.failedCalls ?? 0,
    })

    // Update recipient statuses based on results
    if (providerResult.vapiResults?.results) {
      const callResults = providerResult.vapiResults.results
      const successfulCalls = callResults.filter(r => r.success && r.callId)
      const failedCalls = callResults.filter(r => !r.success)
      const now = new Date().toISOString()

      // Update successful calls to "calling" status
      if (successfulCalls.length > 0) {
        const batchSize = 50
        for (let i = 0; i < successfulCalls.length; i += batchSize) {
          const batch = successfulCalls.slice(i, i + batchSize)
          await Promise.all(batch.map(result =>
            adminClient
              .from("call_recipients")
              .update({
                call_status: "calling",
                external_call_id: result.callId,
                call_started_at: now,
                attempts: 1,
                last_attempt_at: now,
                updated_at: now,
              })
              .eq("id", result.recipientId)
          ))
        }
        console.log(`[CampaignStart:BG] Updated ${successfulCalls.length} recipients to "calling"`)
      }

      // Update failed calls
      if (failedCalls.length > 0) {
        const batchSize = 50
        for (let i = 0; i < failedCalls.length; i += batchSize) {
          const batch = failedCalls.slice(i, i + batchSize)
          await Promise.all(batch.map(result =>
            adminClient
              .from("call_recipients")
              .update({
                call_status: "failed",
                last_error: result.error || "Call creation failed",
                attempts: 1,
                last_attempt_at: now,
                updated_at: now,
              })
              .eq("id", result.recipientId)
          ))
        }
        console.log(`[CampaignStart:BG] Updated ${failedCalls.length} recipients to "failed"`)
      }

      // Update campaign stats
      await adminClient
        .from("call_campaigns")
        .update({
          pending_calls: recipients.length - successfulCalls.length - failedCalls.length,
          failed_calls: failedCalls.length,
          updated_at: now,
        })
        .eq("id", campaignId)
    }

    // If all calls failed, mark campaign as failed/completed
    if (!providerResult.success && providerResult.vapiResults?.failedCalls === recipients.length) {
      await adminClient
        .from("call_campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId)
      console.log(`[CampaignStart:BG] All calls failed, campaign marked as completed`)
    }

  } catch (error) {
    console.error(`[CampaignStart:BG] Background processing error:`, error)
    
    // Update campaign with error
    await adminClient
      .from("call_campaigns")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
  }
}

// ============================================================================
// POST /api/w/[workspaceSlug]/campaigns/[id]/start
// ============================================================================

/**
 * Start a campaign
 * 
 * OPTIMIZED FLOW:
 * 1. Validate campaign and prerequisites
 * 2. Update campaign status to "active" IMMEDIATELY
 * 3. Return success response to frontend (fast!)
 * 4. Process calls in background (fire-and-forget)
 * 5. Webhooks will update call statuses in real-time
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

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

    // Validate campaign status
    if (campaign.status === "active") {
      return apiError("Campaign is already active")
    }

    if (campaign.status === "completed" || campaign.status === "cancelled") {
      return apiError("Cannot start a completed or cancelled campaign")
    }

    if (campaign.status === "scheduled") {
      return apiError("Scheduled campaigns start automatically at the scheduled time")
    }

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

    // Check business hours before starting
    const businessHoursConfig = campaign.business_hours_config as BusinessHoursConfig | null
    // IMPORTANT: Use the timezone from business hours config (set by user in the schedule step)
    // Fall back to campaign.timezone only if business hours config doesn't have a timezone
    const campaignTimezone = businessHoursConfig?.timezone || campaign.timezone || "Australia/Melbourne"
    
    console.log("[CampaignStart] Business hours check:", {
      enabled: businessHoursConfig?.enabled,
      configTimezone: businessHoursConfig?.timezone,
      campaignTimezone: campaign.timezone,
      effectiveTimezone: campaignTimezone,
      schedule: businessHoursConfig?.schedule,
    })
    
    if (businessHoursConfig?.enabled) {
      const withinBusinessHours = isWithinBusinessHours(businessHoursConfig, campaignTimezone)
      
      if (!withinBusinessHours) {
        // Get next available business hours window
        const nextWindow = getNextBusinessHoursStart(businessHoursConfig, campaignTimezone)
        
        // Format timezone name nicely (e.g., "Australia/Melbourne" -> "Melbourne")
        const tzName = campaignTimezone.split('/').pop()?.replace('_', ' ') || campaignTimezone
        
        if (nextWindow) {
          return apiError(
            `Outside business hours. Next calling window: ${nextWindow.dayName} at ${nextWindow.nextStartTimeFormatted} (${tzName})`,
            400
          )
        } else {
          return apiError(
            `Outside business hours. No calling windows configured for the upcoming week.`,
            400
          )
        }
      }
    }

    // Get CLI (Caller ID)
    const cli = await getCLIForAgent(agent, ctx.workspace.id, ctx.partner.id, ctx.adminClient)
    if (!cli) {
      return apiError("No outbound phone number configured for the agent")
    }

    // Get VAPI config
    const vapiDetails = await getVapiConfig(agent, ctx.workspace.id, ctx.adminClient)
    if (!vapiDetails?.apiKey || !vapiDetails?.phoneNumberId) {
      return apiError("VAPI integration not configured properly")
    }

    const vapiConfig: CampaignProviderConfig["vapi"] = {
      apiKey: vapiDetails.apiKey,
      phoneNumberId: vapiDetails.phoneNumberId,
    }

    // Get pending recipients count
    const { count: recipientCount } = await ctx.adminClient
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (!recipientCount || recipientCount === 0) {
      return apiError("No pending recipients to call. Add recipients first.")
    }

    // =========================================================================
    // STEP 1: UPDATE CAMPAIGN TO "ACTIVE" IMMEDIATELY
    // =========================================================================
    
    const now = new Date().toISOString()
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "active",
        started_at: now,
        updated_at: now,
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

    console.log("[CampaignStart] Campaign status updated to ACTIVE:", id)

    // =========================================================================
    // STEP 2: RETURN RESPONSE IMMEDIATELY (don't wait for calls)
    // =========================================================================
    
    // Build campaign data for background processing
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

    // Fetch all recipients for background processing
    const { data: recipients } = await ctx.adminClient
      .from("call_recipients")
      .select("*")
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    const recipientData: RecipientData[] = (recipients || []).map((r: any) => ({
      id: r.id,
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

    // =========================================================================
    // STEP 3: FIRE-AND-FORGET BACKGROUND PROCESSING
    // =========================================================================
    
    // Start processing in background (don't await!)
    processCallsInBackground(
      id,
      ctx.workspace.id,
      campaignData,
      recipientData,
      vapiConfig
    ).catch(err => {
      console.error("[CampaignStart] Background processing failed:", err)
    })

    console.log("[CampaignStart] Returning immediate response, processing continues in background")

    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      recipientCount: recipientData.length,
      message: "Campaign started! Calls are being queued in the background.",
      processing: {
        status: "started",
        totalRecipients: recipientData.length,
        note: "Call statuses will update in real-time via webhooks",
      },
    })
  } catch (error) {
    console.error("[CampaignStart] Exception:", error)
    return serverError("Internal server error")
  }
}

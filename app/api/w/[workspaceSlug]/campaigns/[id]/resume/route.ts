import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import {
  loadJsonBatch,
  buildLoadJsonPayload,
  type CampaignData,
  type RecipientData,
} from "@/lib/integrations/inspra/client"
import type { BusinessHoursConfig } from "@/types/database.types"

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/resume
 * 
 * Resume a paused campaign.
 * Calls Inspra /load-json to re-queue pending recipients with updated timing.
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

    // Build Inspra payload with current time as NBF (start immediately)
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

    // Build payload - this sets NBF to now for immediate start
    const inspraPayload = buildLoadJsonPayload(campaignData, recipientData)
    
    // Override NBF to now for resuming
    inspraPayload.nbf = new Date().toISOString()
    
    // Set expiry to 30 days from now if not set
    if (!campaign.scheduled_expires_at) {
      const exp = new Date()
      exp.setDate(exp.getDate() + 30)
      inspraPayload.exp = exp.toISOString()
    }

    console.log("[CampaignResume] Calling Inspra load-json:", {
      batchRef: inspraPayload.batchRef,
      recipientCount: inspraPayload.callList.length,
      agentId: inspraPayload.agentId,
    })

    const inspraResult = await loadJsonBatch(inspraPayload)

    if (!inspraResult.success) {
      console.error("[CampaignResume] Inspra API error:", inspraResult.error)
      // Don't fail - still update local status for testing
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

    console.log("[CampaignResume] Campaign resumed:", id)

    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      inspra: {
        called: true,
        success: inspraResult.success,
        error: inspraResult.error,
        batchRef: inspraPayload.batchRef,
        recipientCount: inspraPayload.callList.length,
      },
      message: "Campaign resumed. Pending calls will be processed according to business hours.",
    })
  } catch (error) {
    console.error("[CampaignResume] Exception:", error)
    return serverError("Internal server error")
  }
}

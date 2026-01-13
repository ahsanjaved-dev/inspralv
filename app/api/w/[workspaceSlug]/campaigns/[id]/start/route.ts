import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/start
 * 
 * Start a campaign that was previously created.
 * 
 * Since the batch was already sent to Inspra on CREATE (with NBF set to future),
 * starting the campaign just updates the local status.
 * 
 * In production, this might also call Inspra to update the NBF to "now"
 * if Inspra supports such an endpoint.
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
          external_agent_id
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

    // Validate agent
    const agent = campaign.agent as any
    if (!agent || !agent.is_active) {
      return apiError("Campaign agent is not active")
    }

    if (!agent.external_agent_id) {
      return apiError("Agent has not been synced with the voice provider")
    }

    // Check we have recipients
    const { count: pendingCount, error: countError } = await ctx.adminClient
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (countError) {
      console.error("[CampaignStart] Error counting recipients:", countError)
      return serverError("Failed to count recipients")
    }

    if (!pendingCount || pendingCount === 0) {
      return apiError("No pending recipients to call. Add recipients first.")
    }

    // Update campaign status to active
    // The batch was already sent to Inspra on CREATE
    // Inspra will handle the actual calling based on NBF/EXP/blockRules
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
        pending_calls: pendingCount,
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
      batchRef: `campaign-${id}`,
      pendingRecipients: pendingCount,
    })

    // NOTE: In production, if Inspra supports updating NBF, we would call:
    // await updateBatchNbf({ batchRef: `campaign-${id}`, nbf: new Date().toISOString() })
    // For now, the batch timing is controlled by what was sent on CREATE

    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      batchRef: `campaign-${id}`,
      recipientCount: pendingCount,
      message: "Campaign started. Calls will be processed by Inspra according to schedule.",
    })
  } catch (error) {
    console.error("[CampaignStart] Exception:", error)
    return serverError("Internal server error")
  }
}

import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import { terminateBatch } from "@/lib/integrations/inspra/client"

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/terminate
 * 
 * Terminate/cancel a campaign.
 * Calls Inspra /terminate-batch to stop all processing.
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
        agent:ai_agents!agent_id(id, external_agent_id)
      `)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Validate campaign can be terminated
    if (campaign.status !== "active" && campaign.status !== "paused" && campaign.status !== "draft") {
      return apiError("Only active, paused, or draft campaigns can be terminated")
    }

    const agent = campaign.agent as any

    // Call Inspra API to terminate batch (only if agent is synced)
    let inspraResult: { success: boolean; error?: string } = { success: true }
    
    if (agent?.external_agent_id) {
      const inspraPayload = {
        workspaceId: ctx.workspace.id,
        agentId: agent.external_agent_id,
        batchRef: `campaign-${id}`,
      }

      console.log("[CampaignTerminate] Calling Inspra terminate-batch:", inspraPayload)

      inspraResult = await terminateBatch(inspraPayload)

      if (!inspraResult.success) {
        console.error("[CampaignTerminate] Inspra API error:", inspraResult.error)
        // Don't fail - still update local status
      }
    }

    // Update campaign status to cancelled
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[CampaignTerminate] Error updating campaign status:", updateError)
      return serverError("Failed to update campaign status")
    }

    // Mark all pending recipients as cancelled
    const { error: recipientError } = await ctx.adminClient
      .from("call_recipients")
      .update({
        call_status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (recipientError) {
      console.error("[CampaignTerminate] Error updating recipients:", recipientError)
    }

    console.log("[CampaignTerminate] Campaign terminated:", id)

    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      inspra: {
        called: !!agent?.external_agent_id,
        success: inspraResult.success,
        error: inspraResult.error,
      },
      message: "Campaign terminated. Pending recipients have been cancelled.",
    })
  } catch (error) {
    console.error("[CampaignTerminate] Exception:", error)
    return serverError("Internal server error")
  }
}

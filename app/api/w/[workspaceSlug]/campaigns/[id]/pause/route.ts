import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import { pauseBatch } from "@/lib/integrations/inspra/client"

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/pause
 * 
 * Pause an active campaign.
 * Calls Inspra /pause-batch to stop processing new calls.
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

    // Validate campaign can be paused
    if (campaign.status !== "active") {
      return apiError("Only active campaigns can be paused")
    }

    const agent = campaign.agent as any
    if (!agent?.external_agent_id) {
      return apiError("Agent configuration is invalid")
    }

    // Call Inspra API to pause batch
    const inspraPayload = {
      workspaceId: ctx.workspace.id,
      agentId: agent.external_agent_id,
      batchRef: `campaign-${id}`,
    }

    console.log("[CampaignPause] Calling Inspra pause-batch:", inspraPayload)

    const inspraResult = await pauseBatch(inspraPayload)

    if (!inspraResult.success) {
      console.error("[CampaignPause] Inspra API error:", inspraResult.error)
      // Don't fail - still update local status
      // The batch might not exist in Inspra yet (testing mode)
    }

    // Update campaign status to paused
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[CampaignPause] Error updating campaign status:", updateError)
      return serverError("Failed to update campaign status")
    }

    console.log("[CampaignPause] Campaign paused:", id)

    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      inspra: {
        called: true,
        success: inspraResult.success,
        error: inspraResult.error,
      },
      message: "Campaign paused. In-progress calls will complete, but no new calls will be initiated.",
    })
  } catch (error) {
    console.error("[CampaignPause] Exception:", error)
    return serverError("Internal server error")
  }
}

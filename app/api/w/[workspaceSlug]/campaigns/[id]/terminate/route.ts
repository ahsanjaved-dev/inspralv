import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import { terminateCampaignBatch } from "@/lib/integrations/campaign-provider"

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/terminate
 *
 * Terminate/cancel a campaign.
 * Uses unified provider with automatic fallback handling.
 * For Inspra: calls /terminate-batch
 * For VAPI: state-based (campaign status stops all further processing)
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
      .select(
        `
        *,
        agent:ai_agents!agent_id(id, external_agent_id)
      `
      )
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Validate campaign can be terminated
    if (
      campaign.status !== "active" &&
      campaign.status !== "paused" &&
      campaign.status !== "draft" &&
      campaign.status !== "ready"
    ) {
      return apiError("Only active, paused, draft, or ready campaigns can be terminated")
    }

    const agent = campaign.agent as any

    // Call Inspra API to terminate batch (only if agent is synced)
    let inspraResult: { success: boolean; error?: string } = { success: true }

    if (agent?.external_agent_id) {
      console.log("[CampaignTerminate] Terminating campaign:", id)

      providerResult = await terminateCampaignBatch(ctx.workspace.id, agent.external_agent_id, id)

      if (!providerResult.success) {
        console.error("[CampaignTerminate] Provider error:", providerResult.error)
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
      provider: {
        called: !!agent?.external_agent_id,
        used: providerResult.provider,
        success: providerResult.success,
        error: providerResult.error,
      },
      message: "Campaign terminated. Pending recipients have been cancelled.",
    })
  } catch (error) {
    console.error("[CampaignTerminate] Exception:", error)
    return serverError("Internal server error")
  }
}

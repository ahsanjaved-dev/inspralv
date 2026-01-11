import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"

// Inspra Outbound API base URL
const INSPRA_API_BASE_URL = process.env.INSPRA_OUTBOUND_API_URL || "https://api.inspra.io"

// POST /api/w/[workspaceSlug]/campaigns/[id]/pause - Pause campaign via Inspra API
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
      batchRef: `campaign-${campaign.id}`,
    }

    console.log("[CampaignPause] Sending to Inspra API:", inspraPayload)

    const inspraResponse = await fetch(`${INSPRA_API_BASE_URL}/pause-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.INSPRA_API_KEY && {
          "Authorization": `Bearer ${process.env.INSPRA_API_KEY}`,
        }),
      },
      body: JSON.stringify(inspraPayload),
    })

    if (!inspraResponse.ok) {
      const errorText = await inspraResponse.text()
      console.error("[CampaignPause] Inspra API error:", {
        status: inspraResponse.status,
        body: errorText,
      })
      return apiError(`Failed to pause campaign: ${errorText}`, inspraResponse.status)
    }

    // Update campaign status to paused
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "paused",
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[CampaignPause] Error updating campaign status:", updateError)
    }

    return apiResponse({
      success: true,
      campaign: updatedCampaign || campaign,
    })
  } catch (error) {
    console.error("[CampaignPause] Exception:", error)
    return serverError("Internal server error")
  }
}


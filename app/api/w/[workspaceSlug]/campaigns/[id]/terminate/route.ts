import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"

// Inspra Outbound API base URL
const INSPRA_API_BASE_URL = process.env.INSPRA_OUTBOUND_API_URL || "https://api.inspra.io"

// POST /api/w/[workspaceSlug]/campaigns/[id]/terminate - Terminate/cancel campaign via Inspra API
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
    if (campaign.status !== "active" && campaign.status !== "paused") {
      return apiError("Only active or paused campaigns can be terminated")
    }

    const agent = campaign.agent as any
    if (!agent?.external_agent_id) {
      return apiError("Agent configuration is invalid")
    }

    // Call Inspra API to terminate batch
    const inspraPayload = {
      workspaceId: ctx.workspace.id,
      agentId: agent.external_agent_id,
      batchRef: `campaign-${campaign.id}`,
    }

    console.log("[CampaignTerminate] Sending to Inspra API:", inspraPayload)

    const inspraResponse = await fetch(`${INSPRA_API_BASE_URL}/terminate-batch`, {
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
      console.error("[CampaignTerminate] Inspra API error:", {
        status: inspraResponse.status,
        body: errorText,
      })
      return apiError(`Failed to terminate campaign: ${errorText}`, inspraResponse.status)
    }

    // Update campaign status to cancelled
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[CampaignTerminate] Error updating campaign status:", updateError)
    }

    return apiResponse({
      success: true,
      campaign: updatedCampaign || campaign,
    })
  } catch (error) {
    console.error("[CampaignTerminate] Exception:", error)
    return serverError("Internal server error")
  }
}


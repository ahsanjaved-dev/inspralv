import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import {
  apiResponse,
  apiError,
  unauthorized,
  serverError,
  notFound,
  getValidationError,
} from "@/lib/api/helpers"
import { updateCampaignSchema } from "@/types/database.types"
import { terminateCampaignBatch } from "@/lib/integrations/campaign-provider"

// GET /api/w/[workspaceSlug]/campaigns/[id] - Get campaign details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const { data: campaign, error } = await ctx.adminClient
      .from("call_campaigns")
      .select(
        `
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active)
      `
      )
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (error || !campaign) {
      return notFound("Campaign")
    }

    return apiResponse(campaign)
  } catch (error) {
    console.error("[CampaignAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

// PATCH /api/w/[workspaceSlug]/campaigns/[id] - Update campaign
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check paywall - block campaign updates if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    const body = await request.json()
    const parsed = updateCampaignSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(getValidationError(parsed.error))
    }

    // Verify campaign exists
    const { data: existing, error: existingError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, status")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (existingError || !existing) {
      return notFound("Campaign")
    }

    // If changing agent, verify new agent exists
    if (parsed.data.agent_id) {
      const { data: agent, error: agentError } = await ctx.adminClient
        .from("ai_agents")
        .select("id")
        .eq("id", parsed.data.agent_id)
        .eq("workspace_id", ctx.workspace.id)
        .is("deleted_at", null)
        .single()

      if (agentError || !agent) {
        return apiError("Agent not found or does not belong to this workspace")
      }
    }

    // Handle status transitions
    const updateData: Record<string, unknown> = { ...parsed.data }

    if (parsed.data.status === "active" && existing.status === "draft") {
      updateData.started_at = new Date().toISOString()
    }

    if (parsed.data.status === "completed" || parsed.data.status === "cancelled") {
      updateData.completed_at = new Date().toISOString()
    }

    // Update campaign
    const { data: campaign, error } = await ctx.adminClient
      .from("call_campaigns")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active)
      `
      )
      .single()

    if (error) {
      console.error("[CampaignAPI] Error updating campaign:", error)
      return serverError("Failed to update campaign")
    }

    return apiResponse(campaign)
  } catch (error) {
    console.error("[CampaignAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

// DELETE /api/w/[workspaceSlug]/campaigns/[id] - Permanently delete campaign
// Automatically terminates the batch with provider if campaign was active/paused
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check paywall - block campaign deletion if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    // Only admins/owners can delete
    if (ctx.workspace.role !== "owner" && ctx.workspace.role !== "admin") {
      return apiError("Only workspace admins can delete campaigns", 403)
    }

    // Verify campaign exists and get full details including agent
    const { data: existing, error: existingError } = await ctx.adminClient
      .from("call_campaigns")
      .select(
        `
        id, status,
        agent:ai_agents!agent_id(id, external_agent_id)
      `
      )
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .single()

    if (existingError || !existing) {
      return notFound("Campaign")
    }

    const agent = existing.agent as any

    // If campaign is active or paused, terminate it first
    let providerResult: { success: boolean; error?: string; provider?: string } = { success: true }
    const needsTermination = existing.status === "active" || existing.status === "paused"

    if (needsTermination && agent?.external_agent_id) {
      console.log("[CampaignAPI] Terminating batch before delete:", id)

      providerResult = await terminateCampaignBatch(ctx.workspace.id, agent.external_agent_id, id)

      if (!providerResult.success) {
        console.error("[CampaignAPI] Provider terminate error:", providerResult.error)
        // Continue with deletion even if provider fails
      }
    }

    // Permanently delete campaign (recipients are deleted via CASCADE)
    const { error } = await ctx.adminClient
      .from("call_campaigns")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)

    if (error) {
      console.error("[CampaignAPI] Error deleting campaign:", error)
      return serverError("Failed to delete campaign")
    }

    console.log(
      `[CampaignAPI] Campaign deleted: ${id}${needsTermination ? " (batch terminated)" : ""}`
    )

    return apiResponse({
      success: true,
      terminated: needsTermination,
      provider: needsTermination
        ? {
            called: !!agent?.external_agent_id,
            used: providerResult.provider,
            success: providerResult.success,
            error: providerResult.error,
          }
        : undefined,
    })
  } catch (error) {
    console.error("[CampaignAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

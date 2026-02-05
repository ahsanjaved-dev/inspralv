import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

/**
 * GET /api/w/[workspaceSlug]/limits
 * Returns workspace resource limits and current usage
 * Used to validate limits BEFORE showing creation forms
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Get current agent count
    const { count: agentCount } = await ctx.adminClient
      .from("ai_agents")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)

    // Get resource limits from workspace
    const resourceLimits = ctx.workspace.resource_limits as {
      max_agents?: number
      max_users?: number
      max_minutes_per_month?: number
    } | null

    const maxAgents = resourceLimits?.max_agents ?? 10
    const maxUsers = resourceLimits?.max_users ?? 20
    const currentAgents = agentCount ?? 0

    // Calculate remaining and check if creation is allowed
    const remainingAgents = Math.max(0, maxAgents - currentAgents)
    const canCreateAgent = currentAgents < maxAgents

    return apiResponse({
      agents: {
        current: currentAgents,
        max: maxAgents,
        remaining: remainingAgents,
        isUnlimited: maxAgents === -1,
      },
      users: {
        max: maxUsers,
        isUnlimited: maxUsers === -1,
      },
      canCreateAgent,
      // Include workspace info for context
      workspace: {
        id: ctx.workspace.id,
        name: ctx.workspace.name,
        slug: ctx.workspace.slug,
      },
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/limits error:", error)
    return serverError()
  }
}


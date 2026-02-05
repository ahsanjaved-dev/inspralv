import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { hasWorkspacePermission, type WorkspaceRole } from "@/lib/rbac/permissions"
import type { DashboardStats } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Check if user has workspace.dashboard.stats permission
    const workspaceRole = ctx.workspace.role as WorkspaceRole
    
    if (!hasWorkspacePermission(workspaceRole, "workspace.dashboard.stats")) {
      return forbidden(
        "You don't have permission to view workspace statistics. " +
        `Your role: ${workspaceRole}`
      )
    }

    const workspaceId = ctx.workspace.id

    // Query agents count
    const agentQuery = ctx.adminClient
      .from("ai_agents")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)

    // Query conversations count
    const conversationQuery = ctx.adminClient
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)

    // Query workspace for monthly usage stats
    // These are updated by the billing system when calls complete
    const workspaceQuery = ctx.adminClient
      .from("workspaces")
      .select("current_month_minutes, current_month_cost")
      .eq("id", workspaceId)
      .single()

    // Query conversations this month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const conversationsThisMonthQuery = ctx.adminClient
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("created_at", startOfMonth)

    const [agentsResult, conversationsResult, workspaceResult, conversationsThisMonthResult] =
      await Promise.all([agentQuery, conversationQuery, workspaceQuery, conversationsThisMonthQuery])

    // Get monthly usage from workspace table (populated by billing system)
    const totalMinutes = Number(workspaceResult.data?.current_month_minutes) || 0
    const totalCost = Number(workspaceResult.data?.current_month_cost) || 0

    const stats: DashboardStats = {
      total_agents: agentsResult.count || 0,
      total_conversations: conversationsResult.count || 0,
      total_minutes: totalMinutes,
      total_cost: totalCost,
      conversations_this_month: conversationsThisMonthResult.count || 0,
      minutes_this_month: totalMinutes,
      cost_this_month: totalCost,
    }

    return apiResponse(stats)
  } catch (error) {
    console.error("GET /api/w/[slug]/dashboard/stats error:", error)
    return serverError()
  }
}

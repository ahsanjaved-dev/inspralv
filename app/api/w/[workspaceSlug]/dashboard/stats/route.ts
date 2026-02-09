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
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    // Query agents count
    const agentQuery = ctx.adminClient
      .from("ai_agents")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)

    // Query conversations count (all time)
    const conversationQuery = ctx.adminClient
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)

    // Query conversations this month with duration and cost data
    // This replaces the workspace table lookup to avoid stale data from billing race conditions
    const monthlyConversationsQuery = ctx.adminClient
      .from("conversations")
      .select("duration_seconds, total_cost")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .is("deleted_at", null)
      .gte("created_at", startOfMonth)

    const [agentsResult, conversationsResult, monthlyConversationsResult] =
      await Promise.all([agentQuery, conversationQuery, monthlyConversationsQuery])

    // Compute monthly usage directly from conversations (source of truth)
    // This ensures stats are always up-to-date even when billing hasn't finished processing
    const monthlyRows = monthlyConversationsResult.data || []
    const conversationsThisMonth = monthlyRows.length
    const totalMinutes = monthlyRows.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / 60
    const totalCost = monthlyRows.reduce((sum, r) => sum + (r.total_cost || 0), 0)

    const stats: DashboardStats = {
      total_agents: agentsResult.count || 0,
      total_conversations: conversationsResult.count || 0,
      total_minutes: totalMinutes,
      total_cost: totalCost,
      conversations_this_month: conversationsThisMonth,
      minutes_this_month: totalMinutes,
      cost_this_month: totalCost,
    }

    return apiResponse(stats)
  } catch (error) {
    console.error("GET /api/w/[slug]/dashboard/stats error:", error)
    return serverError()
  }
}

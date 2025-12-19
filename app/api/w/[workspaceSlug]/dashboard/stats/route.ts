import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
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

    // Query usage for this month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const usageQuery = ctx.adminClient
      .from("usage_tracking")
      .select("resource_type, quantity, total_cost")
      .eq("workspace_id", workspaceId)
      .gte("recorded_at", startOfMonth)

    // Query conversations this month
    const conversationsThisMonthQuery = ctx.adminClient
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("created_at", startOfMonth)

    const [agentsResult, conversationsResult, usageResult, conversationsThisMonthResult] =
      await Promise.all([agentQuery, conversationQuery, usageQuery, conversationsThisMonthQuery])

    // Calculate usage metrics
    let totalMinutes = 0
    let totalCost = 0

    if (usageResult.data) {
      usageResult.data.forEach((record) => {
        if (record.resource_type === "voice_minutes") {
          totalMinutes += Number(record.quantity) || 0
        }
        totalCost += Number(record.total_cost) || 0
      })
    }

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

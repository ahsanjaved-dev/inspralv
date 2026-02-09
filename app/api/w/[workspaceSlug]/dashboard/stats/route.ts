import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { hasWorkspacePermission, type WorkspaceRole } from "@/lib/rbac/permissions"
import { startOfDay, endOfDay, subDays } from "date-fns"
import type { DashboardStats } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// Date filter type
type DateFilter = "today" | "7d" | "30d" | "all" | "manual"

function getDateRange(filter: DateFilter, startDate?: string, endDate?: string): { start: Date | null; end: Date | null } {
  const now = new Date()
  
  switch (filter) {
    case "today":
      return {
        start: startOfDay(now),
        end: endOfDay(now),
      }
    case "7d":
      return {
        start: startOfDay(subDays(now, 6)),
        end: endOfDay(now),
      }
    case "30d":
      return {
        start: startOfDay(subDays(now, 29)),
        end: endOfDay(now),
      }
    case "manual":
      return {
        start: startDate ? startOfDay(new Date(startDate)) : null,
        end: endDate ? endOfDay(new Date(endDate)) : null,
      }
    case "all":
    default:
      return { start: null, end: null }
  }
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

    // Parse date filter from query params
    const { searchParams } = new URL(request.url)
    const filterParam = (searchParams.get("filter") || "today") as DateFilter
    const startDateParam = searchParams.get("startDate") || undefined
    const endDateParam = searchParams.get("endDate") || undefined
    
    const { start: dateStart, end: dateEnd } = getDateRange(filterParam, startDateParam, endDateParam)

    // Query agents count (not filtered by date - agents are resources, not time-based)
    const agentQuery = ctx.adminClient
      .from("ai_agents")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)

    // Query total conversations count (all time for reference)
    const totalConversationQuery = ctx.adminClient
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)

    // Query conversations within the date filter
    let filteredConversationQuery = ctx.adminClient
      .from("conversations")
      .select("duration_seconds, total_cost", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
    
    if (dateStart) {
      filteredConversationQuery = filteredConversationQuery.gte("created_at", dateStart.toISOString())
    }
    if (dateEnd) {
      filteredConversationQuery = filteredConversationQuery.lte("created_at", dateEnd.toISOString())
    }

    const [agentsResult, totalConversationsResult, filteredConversationsResult] =
      await Promise.all([agentQuery, totalConversationQuery, filteredConversationQuery])

    // Calculate minutes and cost from filtered conversations
    const filteredConversations = filteredConversationsResult.data || []
    const filteredMinutes = filteredConversations.reduce(
      (sum, c) => sum + ((c.duration_seconds || 0) / 60), 
      0
    )
    const filteredCost = filteredConversations.reduce(
      (sum, c) => sum + (Number(c.total_cost) || 0), 
      0
    )

    const stats: DashboardStats = {
      total_agents: agentsResult.count || 0,
      total_conversations: totalConversationsResult.count || 0,
      total_minutes: filteredMinutes,
      total_cost: filteredCost,
      conversations_this_month: filteredConversationsResult.count || 0, // Now represents filtered period
      minutes_this_month: filteredMinutes,
      cost_this_month: filteredCost,
    }

    return apiResponse({
      ...stats,
      filter: filterParam,
      dateRange: {
        start: dateStart?.toISOString() || null,
        end: dateEnd?.toISOString() || null,
      },
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/dashboard/stats error:", error)
    return serverError()
  }
}

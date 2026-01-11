import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { subDays, format, startOfDay, endOfDay } from "date-fns"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// ============================================================================
// GET /api/w/[workspaceSlug]/dashboard/charts
// Get chart data for the workspace dashboard
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get("days") || "7"
    const days = Math.min(parseInt(daysParam, 10) || 7, 90) // Max 90 days

    const workspaceId = ctx.workspace.id
    const startDate = startOfDay(subDays(new Date(), days - 1))
    const endDate = endOfDay(new Date())

    // Fetch all calls within the date range
    const { data: calls, error } = await ctx.adminClient
      .from("conversations")
      .select(`
        id,
        status,
        direction,
        duration_seconds,
        total_cost,
        created_at,
        caller_phone_number,
        metadata,
        ai_agents!inner (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Get dashboard charts error:", error)
      return serverError()
    }

    // Process calls by date for line chart
    const callsByDate: Record<string, { date: string; calls: number; duration: number; cost: number }> = {}
    
    // Initialize all dates in range with zero values
    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd")
      callsByDate[date] = { date, calls: 0, duration: 0, cost: 0 }
    }

    // Process calls by outcome/status
    const outcomeStats = {
      completed: 0,
      failed: 0,
      no_answer: 0,
      busy: 0,
      canceled: 0,
      in_progress: 0,
      initiated: 0,
    }

    // Process each call
    calls?.forEach((call) => {
      const callDate = format(new Date(call.created_at), "yyyy-MM-dd")
      
      // Update calls by date
      if (callsByDate[callDate]) {
        callsByDate[callDate].calls += 1
        callsByDate[callDate].duration += call.duration_seconds || 0
        callsByDate[callDate].cost += Number(call.total_cost) || 0
      }

      // Update outcome stats
      const status = call.status as keyof typeof outcomeStats
      if (status in outcomeStats) {
        outcomeStats[status] += 1
      }
    })

    // Convert calls by date to sorted array
    const callsOverTime = Object.values(callsByDate).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Format outcomes for chart
    const callOutcomes = [
      { status: "completed", label: "Completed", count: outcomeStats.completed, color: "#22c55e" },
      { status: "failed", label: "Failed", count: outcomeStats.failed, color: "#ef4444" },
      { status: "no_answer", label: "No Answer", count: outcomeStats.no_answer, color: "#6b7280" },
      { status: "busy", label: "Busy", count: outcomeStats.busy, color: "#f97316" },
      { status: "canceled", label: "Canceled", count: outcomeStats.canceled, color: "#64748b" },
      { status: "in_progress", label: "In Progress", count: outcomeStats.in_progress, color: "#3b82f6" },
    ].filter((o) => o.count > 0)

    // Get recent calls (top 5)
    const recentCalls = (calls || []).slice(0, 5).map((call) => ({
      id: call.id,
      status: call.status,
      direction: call.direction,
      duration_seconds: call.duration_seconds,
      total_cost: call.total_cost,
      created_at: call.created_at,
      caller_phone_number: call.caller_phone_number,
      call_type: (call.metadata as Record<string, unknown>)?.call_type || "phone",
      agent: {
        id: (call.ai_agents as { id: string; name: string }[])?.[0]?.id,
        name: (call.ai_agents as { id: string; name: string }[])?.[0]?.name || "Unknown Agent",
      },
    }))

    // Summary stats for the period
    const totalCalls = calls?.length || 0
    const totalDuration = calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0
    const totalCost = calls?.reduce((sum, c) => sum + (Number(c.total_cost) || 0), 0) || 0
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0

    return apiResponse({
      period: {
        days,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      },
      summary: {
        total_calls: totalCalls,
        total_duration_seconds: totalDuration,
        total_cost: totalCost,
        avg_duration_seconds: avgDuration,
      },
      calls_over_time: callsOverTime,
      call_outcomes: callOutcomes,
      recent_calls: recentCalls,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/dashboard/charts error:", error)
    return serverError()
  }
}


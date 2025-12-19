import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const context = await getWorkspaceContext(workspaceSlug)
    if (!context) return unauthorized()

    const { adminClient, workspace } = context

    // Get agent performance stats
    const { data: agents } = await adminClient
      .from("ai_agents")
      .select("id, name, provider, is_active")
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)

    // Get conversation stats per agent
    const agentStats = await Promise.all(
      (agents || []).map(async (agent) => {
        const { data: convs } = await adminClient
          .from("conversations")
          .select("status, duration_seconds, total_cost")
          .eq("agent_id", agent.id)
          .is("deleted_at", null)

        const totalCalls = convs?.length || 0
        const completedCalls = convs?.filter((c) => c.status === "completed").length || 0
        const totalMinutes =
          (convs?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) ?? 0) / 60
        const totalCost = convs?.reduce((sum, c) => sum + (c.total_cost || 0), 0) ?? 0

        return {
          id: agent.id,
          name: agent.name,
          provider: agent.provider,
          is_active: agent.is_active,
          total_calls: totalCalls,
          completed_calls: completedCalls,
          success_rate: totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0,
          total_minutes: Math.round(totalMinutes * 100) / 100,
          total_cost: Math.round(totalCost * 100) / 100,
        }
      })
    )

    return apiResponse({
      agents: agentStats,
      summary: {
        total_agents: agents?.length || 0,
        total_calls: agentStats.reduce((sum, a) => sum + a.total_calls, 0),
        total_minutes: agentStats.reduce((sum, a) => sum + a.total_minutes, 0),
        total_cost: agentStats.reduce((sum, a) => sum + a.total_cost, 0),
      },
    })
  } catch (error) {
    console.error("GET analytics error:", error)
    return serverError()
  }
}

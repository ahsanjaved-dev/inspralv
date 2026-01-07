import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// ============================================================================
// GET /api/w/[workspaceSlug]/calls/stats
// Get call statistics for the workspace
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Get all calls for stats calculation
    const { data: calls, error } = await ctx.adminClient
      .from("conversations")
      .select("status, duration_seconds")
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)

    if (error) {
      console.error("Get call stats error:", error)
      return serverError()
    }

    const total = calls?.length || 0
    const completed = calls?.filter((c) => c.status === "completed").length || 0
    const failed = calls?.filter((c) => c.status === "failed" || c.status === "no_answer" || c.status === "busy").length || 0
    
    const totalDuration = calls?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0
    const avgDurationSeconds = total > 0 ? Math.round(totalDuration / total) : 0

    return apiResponse({
      total,
      completed,
      failed,
      avgDurationSeconds,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/calls/stats error:", error)
    return serverError()
  }
}


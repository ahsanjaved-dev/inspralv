import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")

    let query = adminClient
      .from("workspaces")
      .select("*", { count: "exact" })
      .eq("partner_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: workspaces, error, count } = await query

    if (error) {
      console.error("List workspaces error:", error)
      return apiError("Failed to fetch workspaces")
    }

    // Get member counts for each workspace
    const workspacesWithCounts = await Promise.all(
      (workspaces || []).map(async (ws) => {
        const { count: memberCount } = await adminClient
          .from("workspace_members")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", ws.id)
          .is("removed_at", null)

        const { count: agentCount } = await adminClient
          .from("ai_agents")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", ws.id)
          .is("deleted_at", null)

        return {
          ...ws,
          member_count: memberCount || 0,
          agent_count: agentCount || 0,
        }
      })
    )

    return apiResponse({
      data: workspacesWithCounts,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/super-admin/partners/[id]/workspaces error:", error)
    return serverError()
  }
}

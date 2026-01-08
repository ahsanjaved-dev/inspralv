import { NextRequest } from "next/server"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, unauthorized, serverError, forbidden } from "@/lib/api/helpers"
import { hasPartnerPermission, type PartnerRole } from "@/lib/rbac/permissions"

export interface PartnerDashboardStats {
  total_workspaces: number
  total_agents_all_workspaces: number
  total_calls_today: number
  /** Total members across all workspaces */
  total_members?: number
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()

    if (!auth) {
      return unauthorized()
    }

    // Check if user has partner.stats.read permission
    // Only partner admins and owners can view organization-wide stats
    const partnerRole = auth.partnerRole as PartnerRole | null
    
    if (!partnerRole) {
      return forbidden("You must be a partner member to access organization stats")
    }
    
    if (!hasPartnerPermission(partnerRole, "partner.stats.read")) {
      return forbidden(
        "You don't have permission to view organization-wide statistics. " +
        "This requires admin or owner access."
      )
    }

    // For partner admins/owners, count ALL workspaces under this partner (not just accessible ones)
    // This is now already handled by getPartnerAuthContext which returns all workspaces for admins
    const totalWorkspaces = auth.workspaces.length

    // Get workspace IDs for querying (now includes all partner workspaces for admins)
    const workspaceIds = auth.workspaces.map((ws) => ws.id)

    if (workspaceIds.length === 0) {
      // No workspaces, return zeros
      const stats: PartnerDashboardStats = {
        total_workspaces: 0,
        total_agents_all_workspaces: 0,
        total_calls_today: 0,
        total_members: 0,
      }
      return apiResponse(stats)
    }

    // Query total agents across all workspaces
    const agentsQuery = auth.adminClient
      .from("ai_agents")
      .select("*", { count: "exact", head: true })
      .in("workspace_id", workspaceIds)
      .is("deleted_at", null)

    // Query total calls (conversations) today across all workspaces
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const callsTodayQuery = auth.adminClient
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .in("workspace_id", workspaceIds)
      .is("deleted_at", null)
      .gte("created_at", startOfToday.toISOString())

    // Query total unique members across all workspaces
    const membersQuery = auth.adminClient
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .in("workspace_id", workspaceIds)
      .is("removed_at", null)

    const [agentsResult, callsTodayResult, membersResult] = await Promise.all([
      agentsQuery, 
      callsTodayQuery,
      membersQuery
    ])

    const stats: PartnerDashboardStats = {
      total_workspaces: totalWorkspaces,
      total_agents_all_workspaces: agentsResult.count || 0,
      total_calls_today: callsTodayResult.count || 0,
      total_members: membersResult.count || 0,
    }

    return apiResponse(stats)
  } catch (error) {
    console.error("GET /api/partner/dashboard/stats error:", error)
    return serverError()
  }
}

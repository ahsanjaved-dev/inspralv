import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPartnerFromHost, type ResolvedPartner } from "./partner"
import type {
  PartnerAuthUser,
  AccessibleWorkspace,
  WorkspaceMemberRole,
  PartnerMemberRole,
  PartnerMembership,
} from "@/types/database.types"

// Helper to check if user is partner admin/owner
function isPartnerAdminOrOwner(role: PartnerMemberRole | null): boolean {
  return role === "owner" || role === "admin"
}

// ============================================================================
// PARTNER AUTH CONTEXT
// ============================================================================

export interface PartnerAuthContext {
  /** The authenticated user */
  user: PartnerAuthUser
  /** The partner resolved from the current hostname */
  partner: ResolvedPartner
  /** User's role within this partner (null if not a member) */
  partnerRole: PartnerMemberRole | null
  /** User's partner membership details */
  partnerMembership: PartnerMembership | null
  /** List of workspaces the user can access within this partner */
  workspaces: AccessibleWorkspace[]
  /** The Supabase client for database operations */
  supabase: Awaited<ReturnType<typeof createClient>>
  /** The admin client for bypassing RLS (use carefully) */
  adminClient: ReturnType<typeof createAdminClient>
}

/**
 * Get the partner-aware authentication context
 * This combines:
 * 1. Auth user from Supabase
 * 2. Partner resolved from hostname
 * 3. User's partner membership for that partner
 * 4. User's workspace memberships for that partner
 */
export async function getPartnerAuthContext(): Promise<PartnerAuthContext | null> {
  try {
    const supabase = await createClient()

    // Step 1: Get authenticated user
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      console.log("[getPartnerAuthContext] No auth user:", authError?.message)
      return null
    }

    // Step 2: Resolve partner from hostname
    const partner = await getPartnerFromHost()

    const adminClient = createAdminClient()

    // Step 3: Get user's partner membership
    const { data: partnerMemberData, error: partnerMemberError } = await adminClient
      .from("partner_members")
      .select(
        `
        id,
        role,
        partner:partners!inner(
          id,
          name,
          slug,
          is_platform_partner
        )
      `
      )
      .eq("user_id", authUser.id)
      .eq("partner_id", partner.id)
      .is("removed_at", null)
      .single()

    let partnerRole: PartnerMemberRole | null = null
    let partnerMembership: PartnerMembership | null = null

    if (partnerMemberData && !partnerMemberError) {
      const pm = partnerMemberData as any
      partnerRole = pm.role as PartnerMemberRole
      partnerMembership = {
        id: pm.id,
        partner_id: pm.partner.id,
        partner_name: pm.partner.name,
        partner_slug: pm.partner.slug,
        role: pm.role,
        is_platform_partner: pm.partner.is_platform_partner,
      }
    }

    // Step 4: Get user's workspace memberships for this partner
    const { data: memberships, error: membershipError } = await adminClient
      .from("workspace_members")
      .select(
        `
        role,
        workspace:workspaces!inner(
          id,
          name,
          slug,
          partner_id,
          description,
          resource_limits,
          status,
          deleted_at,
          created_at
        )
      `
      )
      .eq("user_id", authUser.id)
      .is("removed_at", null)

    if (membershipError) {
      console.error("[getPartnerAuthContext] Membership query error:", membershipError)
    }

    // Filter to only workspaces belonging to current partner and not deleted
    const userWorkspaces: AccessibleWorkspace[] = (memberships || [])
      .filter(
        (m: any) => m.workspace?.partner_id === partner.id && m.workspace?.deleted_at === null
      )
      .map((m: any) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        partner_id: m.workspace.partner_id,
        description: m.workspace.description,
        role: m.role as WorkspaceMemberRole,
        resource_limits: m.workspace.resource_limits || {},
        status: m.workspace.status,
        is_partner_admin_access: false,
        created_at: m.workspace.created_at,
      }))

    // Step 5: For partner admins/owners, also fetch ALL workspaces under this partner
    let workspaces: AccessibleWorkspace[] = userWorkspaces

    if (isPartnerAdminOrOwner(partnerRole)) {
      // Fetch all workspaces for this partner
      const { data: allPartnerWorkspaces, error: allWsError } = await adminClient
        .from("workspaces")
        .select("id, name, slug, partner_id, description, resource_limits, status, created_at")
        .eq("partner_id", partner.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })

      if (allWsError) {
        console.error("[getPartnerAuthContext] All workspaces query error:", allWsError)
      } else if (allPartnerWorkspaces) {
        // Get workspace IDs user is already a member of
        const userWorkspaceIds = new Set(userWorkspaces.map((w) => w.id))

        // Filter to workspaces user doesn't have direct access to
        const additionalWorkspaceIds = allPartnerWorkspaces
          .filter((ws) => !userWorkspaceIds.has(ws.id))
          .map((ws) => ws.id)

        if (additionalWorkspaceIds.length > 0) {
          // BATCH QUERIES: Fetch all counts and owner info in parallel instead of N+1
          const [memberCountsResult, agentCountsResult, ownersResult] = await Promise.all([
            // Batch fetch member counts - group by workspace_id
            adminClient
              .from("workspace_members")
              .select("workspace_id")
              .in("workspace_id", additionalWorkspaceIds)
              .is("removed_at", null),

            // Batch fetch agent counts - group by workspace_id
            adminClient
              .from("ai_agents")
              .select("workspace_id")
              .in("workspace_id", additionalWorkspaceIds)
              .is("deleted_at", null),

            // Batch fetch owners (role = owner) for each workspace
            // NOTE: Cannot join to auth.users via PostgREST, so just get user_id
            // Owner email lookup is skipped to avoid 400 errors from FK to auth schema
            adminClient
              .from("workspace_members")
              .select("workspace_id, user_id")
              .in("workspace_id", additionalWorkspaceIds)
              .eq("role", "owner")
              .is("removed_at", null),
          ])

          // Build lookup maps from batch results
          const memberCountMap = new Map<string, number>()
          const agentCountMap = new Map<string, number>()
          const ownerUserIdMap = new Map<string, string | null>()

          // Count members per workspace
          if (memberCountsResult.data) {
            for (const row of memberCountsResult.data) {
              const wsId = row.workspace_id
              memberCountMap.set(wsId, (memberCountMap.get(wsId) || 0) + 1)
            }
          }

          // Count agents per workspace
          if (agentCountsResult.data) {
            for (const row of agentCountsResult.data) {
              const wsId = row.workspace_id
              agentCountMap.set(wsId, (agentCountMap.get(wsId) || 0) + 1)
            }
          }

          // Map owner user_ids to workspaces (email lookup skipped - auth.users not accessible via PostgREST)
          if (ownersResult.data) {
            for (const row of ownersResult.data as any[]) {
              if (!ownerUserIdMap.has(row.workspace_id)) {
                ownerUserIdMap.set(row.workspace_id, row.user_id || null)
              }
            }
          }

          // Build additional workspaces with pre-fetched data
          // Note: owner_email is set to null since we can't join to auth.users via PostgREST
          // The UI can display owner info differently if needed
          const additionalWorkspaces: AccessibleWorkspace[] = allPartnerWorkspaces
            .filter((ws) => !userWorkspaceIds.has(ws.id))
            .map((ws) => ({
              id: ws.id,
              name: ws.name,
              slug: ws.slug,
              partner_id: ws.partner_id,
              description: ws.description,
              role: "admin" as WorkspaceMemberRole, // Partner admin gets admin access
              resource_limits: ws.resource_limits || {},
              status: ws.status,
              is_partner_admin_access: true,
              owner_email: null, // Cannot fetch from auth.users via PostgREST
              member_count: memberCountMap.get(ws.id) || 0,
              agent_count: agentCountMap.get(ws.id) || 0,
              created_at: ws.created_at,
            }))

          // Merge: user's direct workspaces first, then additional workspaces
          workspaces = [...userWorkspaces, ...additionalWorkspaces]
        } else {
          // No additional workspaces to fetch
          workspaces = userWorkspaces
        }
      }
    }

    // Sort workspaces by name
    workspaces.sort((a, b) => a.name.localeCompare(b.name))

    // Construct user object
    const user: PartnerAuthUser = {
      id: authUser.id,
      email: authUser.email!,
      first_name: authUser.user_metadata?.first_name || null,
      last_name: authUser.user_metadata?.last_name || null,
      avatar_url: authUser.user_metadata?.avatar_url || null,
    }

    return {
      user,
      partner,
      partnerRole,
      partnerMembership,
      workspaces,
      supabase,
      adminClient,
    }
  } catch (error) {
    console.error("[getPartnerAuthContext] Unexpected error:", error)
    return null
  }
}

// ============================================================================
// PARTNER ACCESS VALIDATION
// ============================================================================

export function isPartnerMember(context: PartnerAuthContext): boolean {
  return context.partnerRole !== null
}

export function isPartnerAdmin(context: PartnerAuthContext): boolean {
  return context.partnerRole === "owner" || context.partnerRole === "admin"
}

export function isPartnerOwner(context: PartnerAuthContext): boolean {
  return context.partnerRole === "owner"
}

export function hasPartnerRole(
  context: PartnerAuthContext,
  requiredRoles: PartnerMemberRole[]
): boolean {
  if (!context.partnerRole) return false
  return requiredRoles.includes(context.partnerRole)
}

export function canCreateWorkspace(context: PartnerAuthContext): boolean {
  // Only partner owners and admins can create workspaces
  return isPartnerAdmin(context)
}

// ============================================================================
// WORKSPACE ACCESS VALIDATION (existing functions - unchanged)
// ============================================================================

export function getWorkspaceBySlug(
  context: PartnerAuthContext,
  workspaceSlug: string
): AccessibleWorkspace | null {
  return context.workspaces.find((w) => w.slug === workspaceSlug) || null
}

export function getWorkspaceById(
  context: PartnerAuthContext,
  workspaceId: string
): AccessibleWorkspace | null {
  return context.workspaces.find((w) => w.id === workspaceId) || null
}

export function hasWorkspaceRole(
  context: PartnerAuthContext,
  workspaceSlug: string,
  requiredRoles: WorkspaceMemberRole[]
): boolean {
  const workspace = getWorkspaceBySlug(context, workspaceSlug)
  if (!workspace) return false
  return requiredRoles.includes(workspace.role)
}

export function isWorkspaceAdmin(context: PartnerAuthContext, workspaceSlug: string): boolean {
  return hasWorkspaceRole(context, workspaceSlug, ["owner", "admin"])
}

export function isWorkspaceOwner(context: PartnerAuthContext, workspaceSlug: string): boolean {
  return hasWorkspaceRole(context, workspaceSlug, ["owner"])
}

export function requireWorkspaceAccess(
  context: PartnerAuthContext,
  workspaceSlug: string,
  requiredRoles?: WorkspaceMemberRole[]
): AccessibleWorkspace {
  const workspace = getWorkspaceBySlug(context, workspaceSlug)

  if (!workspace) {
    throw new Error(`No access to workspace: ${workspaceSlug}`)
  }

  if (requiredRoles && !requiredRoles.includes(workspace.role)) {
    throw new Error(
      `Insufficient permissions in workspace: ${workspaceSlug}. Required: ${requiredRoles.join(", ")}, has: ${workspace.role}`
    )
  }

  return workspace
}

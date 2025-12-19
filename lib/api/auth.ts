import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPartnerFromHost, type ResolvedPartner } from "./partner"
import type {
  User,
  Organization,
  PartnerAuthUser,
  AccessibleWorkspace,
  WorkspaceMemberRole,
} from "@/types/database.types"

// ============================================================================
// LEGACY AUTH CONTEXT (keeping for backward compatibility)
// ============================================================================

export interface AuthContext {
  user: User
  organization: Organization
  supabase: Awaited<ReturnType<typeof createClient>>
}

export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const supabase = await createClient()

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      console.log("[getAuthContext] No auth user:", authError?.message)
      return null
    }

    // Use admin client to bypass RLS issues
    const adminClient = createAdminClient()

    // Get user with organization using admin client
    const { data: user, error: userError } = await adminClient
      .from("users")
      .select(`*, organization:organizations(*)`)
      .eq("id", authUser.id)
      .single()

    if (userError) {
      console.error(
        "[getAuthContext] User query error:",
        userError.message,
        "for user:",
        authUser.id
      )
    }

    if (!user) {
      console.error("[getAuthContext] No user row found for:", authUser.id)
      return null
    }

    // Get user's department permissions using admin client
    const { data: departmentPermissions, error: deptError } = await adminClient
      .from("department_permissions")
      .select(`*, department:departments(*)`)
      .eq("user_id", authUser.id)
      .is("revoked_at", null)

    if (deptError) {
      console.error("[getAuthContext] Department permissions error:", deptError)
    }

    return {
      user: user as User,
      organization: (user as any).organization as Organization,
      supabase,
    }
  } catch (error) {
    console.error("[getAuthContext] Unexpected error:", error)
    return null
  }
}

// ============================================================================
// NEW PARTNER AUTH CONTEXT (Milestone 3)
// ============================================================================

export interface PartnerAuthContext {
  /** The authenticated user */
  user: PartnerAuthUser
  /** The partner resolved from the current hostname */
  partner: ResolvedPartner
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
 * 3. User's workspace memberships for that partner
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

    // Step 3: Get user's workspace memberships for this partner
    const adminClient = createAdminClient()

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
          deleted_at
        )
      `
      )
      .eq("user_id", authUser.id)
      .is("removed_at", null)

    if (membershipError) {
      console.error("[getPartnerAuthContext] Membership query error:", membershipError)
    }

    // Filter to only workspaces belonging to current partner and not deleted
    const workspaces: AccessibleWorkspace[] = (memberships || [])
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
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Construct user object
    const user: PartnerAuthUser = {
      id: authUser.id,
      email: authUser.email!,
      first_name: authUser.user_metadata?.first_name || null,
      last_name: authUser.user_metadata?.last_name || null,
      avatar_url: authUser.user_metadata?.avatar_url || null,
    }

    console.log(
      `[getPartnerAuthContext] User ${user.email} has access to ${workspaces.length} workspaces in partner ${partner.slug}`
    )

    return {
      user,
      partner,
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
// WORKSPACE ACCESS VALIDATION
// ============================================================================

/**
 * Check if user has access to a specific workspace by slug
 * @returns The workspace if accessible, null otherwise
 */
export function getWorkspaceBySlug(
  context: PartnerAuthContext,
  workspaceSlug: string
): AccessibleWorkspace | null {
  return context.workspaces.find((w) => w.slug === workspaceSlug) || null
}

/**
 * Check if user has access to a specific workspace by ID
 * @returns The workspace if accessible, null otherwise
 */
export function getWorkspaceById(
  context: PartnerAuthContext,
  workspaceId: string
): AccessibleWorkspace | null {
  return context.workspaces.find((w) => w.id === workspaceId) || null
}

/**
 * Check if user has the required role in a workspace
 */
export function hasWorkspaceRole(
  context: PartnerAuthContext,
  workspaceSlug: string,
  requiredRoles: WorkspaceMemberRole[]
): boolean {
  const workspace = getWorkspaceBySlug(context, workspaceSlug)
  if (!workspace) return false
  return requiredRoles.includes(workspace.role)
}

/**
 * Check if user is owner or admin of a workspace
 */
export function isWorkspaceAdmin(context: PartnerAuthContext, workspaceSlug: string): boolean {
  return hasWorkspaceRole(context, workspaceSlug, ["owner", "admin"])
}

/**
 * Check if user is the owner of a workspace
 */
export function isWorkspaceOwner(context: PartnerAuthContext, workspaceSlug: string): boolean {
  return hasWorkspaceRole(context, workspaceSlug, ["owner"])
}

/**
 * Require access to a workspace, throwing if not accessible
 * Useful for API routes that need a specific workspace
 */
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

// ============================================================================
// LEGACY HELPER FUNCTIONS (keeping for backward compatibility)
// ============================================================================

export function hasRole(user: User, requiredRoles: string[]): boolean {
  return requiredRoles.includes(user.role)
}

export function isOrgOwner(user: User): boolean {
  return hasRole(user, ["org_owner"])
}

export function isOrgAdmin(user: User): boolean {
  return hasRole(user, ["org_owner", "org_admin"])
}

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { User, Organization, Department, DepartmentPermission } from "@/types/database.types"

export interface AuthContext {
  user: User
  organization: Organization
  departments: (DepartmentPermission & { department: Department })[]
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
      departments: (departmentPermissions || []) as (DepartmentPermission & {
        department: Department
      })[],
      supabase, // Return the regular client for other operations
    }
  } catch (error) {
    console.error("[getAuthContext] Unexpected error:", error)
    return null
  }
}

export function hasRole(user: User, requiredRoles: string[]): boolean {
  return requiredRoles.includes(user.role)
}

export function isOrgOwner(user: User): boolean {
  return hasRole(user, ["org_owner"])
}

export function isOrgAdmin(user: User): boolean {
  return hasRole(user, ["org_owner", "org_admin"])
}

export function hasDepartmentAccess(
  departments: (DepartmentPermission & { department: Department })[],
  departmentId: string,
  requiredRoles?: string[]
): boolean {
  const permission = departments.find((d) => d.department_id === departmentId)
  if (!permission) return false
  if (!requiredRoles) return true
  return requiredRoles.includes(permission.role)
}

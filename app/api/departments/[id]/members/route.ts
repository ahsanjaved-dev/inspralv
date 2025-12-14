import { NextRequest } from "next/server"
import { getAuthContext, isOrgAdmin, hasDepartmentAccess } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

interface Params {
  params: Promise<{ id: string }>
}

// GET - List department members
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthContext()
    if (!auth) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    // Verify department belongs to org
    const { data: dept } = await adminClient
      .from("departments")
      .select("id")
      .eq("id", id)
      .eq("organization_id", auth.organization.id)
      .is("deleted_at", null)
      .single()

    if (!dept) {
      return apiError("Department not found", 404)
    }

    const { data: members, error } = await adminClient
      .from("department_permissions")
      .select(
        `
        *,
        user:users(*)
      `
      )
      .eq("department_id", id)
      .is("revoked_at", null)
      .order("granted_at", { ascending: true })

    if (error) {
      console.error("Fetch members error:", error)
      return serverError()
    }

    return apiResponse(members)
  } catch (error) {
    console.error("GET /api/departments/[id]/members error:", error)
    return serverError()
  }
}

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
})

// POST - Add member to department
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthContext()
    if (!auth) return unauthorized()

    const { id } = await params

    // Check permission: org admin or department admin/owner
    const canAdd =
      isOrgAdmin(auth.user) || hasDepartmentAccess(auth.departments, id, ["owner", "admin"])

    if (!canAdd) {
      return forbidden("You don't have permission to add members")
    }

    const body = await request.json()
    const validation = addMemberSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    const { user_id, role } = validation.data
    const adminClient = createAdminClient()

    // Verify user is in same organization
    const { data: user } = await adminClient
      .from("users")
      .select("id")
      .eq("id", user_id)
      .eq("organization_id", auth.organization.id)
      .is("deleted_at", null)
      .single()

    if (!user) {
      return apiError("User not found in your organization")
    }

    // Check if already a member
    const { data: existing } = await adminClient
      .from("department_permissions")
      .select("id")
      .eq("department_id", id)
      .eq("user_id", user_id)
      .is("revoked_at", null)
      .single()

    if (existing) {
      return apiError("User is already a member of this department")
    }

    // Add member
    const { data: permission, error } = await adminClient
      .from("department_permissions")
      .insert({
        department_id: id,
        user_id,
        role,
        granted_by: auth.user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Add member error:", error)
      return serverError()
    }

    // Update department user count
    await adminClient.rpc("increment_department_users", { dept_id: id })

    return apiResponse(permission, 201)
  } catch (error) {
    console.error("POST /api/departments/[id]/members error:", error)
    return serverError()
  }
}

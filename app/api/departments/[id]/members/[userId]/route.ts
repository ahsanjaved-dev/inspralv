import { NextRequest } from "next/server"
import { getAuthContext, isOrgAdmin, hasDepartmentAccess } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"

interface Params {
  params: Promise<{ id: string; userId: string }>
}

// DELETE - Remove member from department
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthContext()
    if (!auth) return unauthorized()

    const { id, userId } = await params

    // Check permission
    const canRemove =
      isOrgAdmin(auth.user) || hasDepartmentAccess(auth.departments, id, ["owner", "admin"])

    if (!canRemove) {
      return forbidden("You don't have permission to remove members")
    }

    const adminClient = createAdminClient()

    // Check if trying to remove the owner
    const { data: membership } = await adminClient
      .from("department_permissions")
      .select("role")
      .eq("department_id", id)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .single()

    if (!membership) {
      return apiError("User is not a member of this department", 404)
    }

    if (membership.role === "owner") {
      return apiError("Cannot remove the department owner. Transfer ownership first.")
    }

    // Soft revoke the permission
    const { error } = await adminClient
      .from("department_permissions")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: auth.user.id,
      })
      .eq("department_id", id)
      .eq("user_id", userId)
      .is("revoked_at", null)

    if (error) {
      console.error("Remove member error:", error)
      return serverError()
    }

    // Update department user count
    await adminClient.rpc("decrement_department_users", { dept_id: id })

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/departments/[id]/members/[userId] error:", error)
    return serverError()
  }
}

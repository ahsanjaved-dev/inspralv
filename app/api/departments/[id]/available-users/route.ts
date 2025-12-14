import { NextRequest } from "next/server"
import { getAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"

interface Params {
  params: Promise<{ id: string }>
}

// GET - Get organization users NOT in this department
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await getAuthContext()
    if (!auth) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    // Get all org users
    const { data: allUsers, error: usersError } = await adminClient
      .from("users")
      .select("*")
      .eq("organization_id", auth.organization.id)
      .is("deleted_at", null)
      .eq("status", "active")

    if (usersError) {
      console.error("Fetch users error:", usersError)
      return serverError()
    }

    // Get current department members
    const { data: currentMembers } = await adminClient
      .from("department_permissions")
      .select("user_id")
      .eq("department_id", id)
      .is("revoked_at", null)

    const memberIds = new Set(currentMembers?.map((m) => m.user_id) || [])

    // Filter out users already in department
    const availableUsers = allUsers?.filter((user) => !memberIds.has(user.id)) || []

    return apiResponse(availableUsers)
  } catch (error) {
    console.error("GET /api/departments/[id]/available-users error:", error)
    return serverError()
  }
}

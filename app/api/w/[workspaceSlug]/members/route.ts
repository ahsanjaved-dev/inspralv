import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

const inviteMemberSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["admin", "member", "viewer"]),
})

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const { data: members, error } = await ctx.adminClient
      .from("workspace_members")
      .select(
        `
        id,
        role,
        joined_at,
        user_id
      `
      )
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)
      .order("joined_at", { ascending: true })

    if (error) {
      console.error("List members error:", error)
      return serverError()
    }

    // Fetch user details from auth.users
    const userIds = members.map((m) => m.user_id)

    // Note: In production, you'd want to join with a users table or use a different approach
    // For now, return member data without full user details
    const membersWithDetails = members.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
    }))

    return apiResponse(membersWithDetails)
  } catch (error) {
    console.error("GET /api/w/[slug]/members error:", error)
    return serverError()
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only owners and admins can invite members")
    }

    const body = await request.json()
    const validation = inviteMemberSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    // Check member limits
    const { count } = await ctx.adminClient
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)

    const maxUsers = ctx.workspace.resource_limits.max_users || 20
    if (count && count >= maxUsers) {
      return apiError(`Member limit reached. Maximum: ${maxUsers} members.`, 403)
    }

    // TODO: Implement invitation flow
    // For now, return a placeholder response
    return apiResponse(
      {
        message: "Invitation system will be implemented in a future milestone",
        email: validation.data.email,
        role: validation.data.role,
      },
      201
    )
  } catch (error) {
    console.error("POST /api/w/[slug]/members error:", error)
    return serverError()
  }
}

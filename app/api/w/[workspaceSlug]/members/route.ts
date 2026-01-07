import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
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

    // Fetch workspace members with user details from users table
    const { data: members, error } = await ctx.adminClient
      .from("workspace_members")
      .select(
        `
        id,
        role,
        joined_at,
        user_id,
        user:users!workspace_members_user_id_fkey(
          id,
          email,
          first_name,
          last_name,
          avatar_url
        )
      `
      )
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)
      .order("joined_at", { ascending: true })

    if (error) {
      console.error("List members error:", error)
      
      // Fallback: Try without the join if the foreign key relationship isn't set up
      const { data: basicMembers, error: basicError } = await ctx.adminClient
        .from("workspace_members")
        .select("id, role, joined_at, user_id")
        .eq("workspace_id", ctx.workspace.id)
        .is("removed_at", null)
        .order("joined_at", { ascending: true })

      if (basicError) {
        console.error("List basic members error:", basicError)
        return serverError()
      }

      // Fetch user details separately from users table
      const userIds = basicMembers.map((m) => m.user_id)
      const { data: users } = await ctx.adminClient
        .from("users")
        .select("id, email, first_name, last_name, avatar_url")
        .in("id", userIds)

      const usersMap = new Map(users?.map((u) => [u.id, u]) || [])

      const membersWithDetails = basicMembers.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        user: usersMap.get(m.user_id) || null,
      }))

      return apiResponse(membersWithDetails)
    }

    // Transform the response to flatten user data
    const membersWithDetails = members.map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      user: m.user || null,
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

    // Check paywall - block member invitations if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    const body = await request.json()
    const validation = inviteMemberSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    // Check member limits
    const { count } = await ctx.adminClient
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)

    const resourceLimits = ctx.workspace.resource_limits as { max_users?: number } | null
    const maxUsers = resourceLimits?.max_users || 20
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

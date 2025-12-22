import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; memberId: string }>
}

const updateMemberSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
})

/**
 * PATCH /api/w/[workspaceSlug]/members/[memberId] - Update a member's role
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, memberId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only owners and admins can manage members")
    }

    const body = await request.json()
    const validation = updateMemberSchema.safeParse(body)

    if (!validation.success) {
      return apiError("Invalid request data")
    }

    const { role } = validation.data

    // Get the member to update
    const { data: member, error: memberError } = await ctx.adminClient
      .from("workspace_members")
      .select("id, role, user_id")
      .eq("id", memberId)
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)
      .single()

    if (memberError || !member) {
      return apiError("Member not found", 404)
    }

    const isCurrentUserOwner = ctx.workspace.role === "owner"

    // Prevent changing owner role unless you're an owner
    if (member.role === "owner" && !isCurrentUserOwner) {
      return forbidden("Only owners can modify other owners")
    }

    // Prevent assigning owner role unless you're an owner
    if (role === "owner" && !isCurrentUserOwner) {
      return forbidden("Only owners can assign the owner role")
    }

    // Prevent changing your own role
    if (member.user_id === ctx.user.id) {
      return apiError("You cannot change your own role")
    }

    // Ensure at least one owner remains
    if (member.role === "owner" && role !== "owner") {
      const { count } = await ctx.adminClient
        .from("workspace_members")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspace.id)
        .eq("role", "owner")
        .is("removed_at", null)

      if (count && count <= 1) {
        return apiError("Cannot demote the last owner. Assign another owner first.")
      }
    }

    // Update the role
    const { error: updateError } = await ctx.adminClient
      .from("workspace_members")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", memberId)

    if (updateError) {
      console.error("Update member role error:", updateError)
      return serverError()
    }

    return apiResponse({ success: true, role })
  } catch (error) {
    console.error("PATCH /api/w/[slug]/members/[id] error:", error)
    return serverError()
  }
}

/**
 * DELETE /api/w/[workspaceSlug]/members/[memberId] - Remove a member
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, memberId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only owners and admins can remove members")
    }

    // Get the member to remove
    const { data: member, error: memberError } = await ctx.adminClient
      .from("workspace_members")
      .select("id, role, user_id")
      .eq("id", memberId)
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)
      .single()

    if (memberError || !member) {
      return apiError("Member not found", 404)
    }

    const isCurrentUserOwner = ctx.workspace.role === "owner"

    // Prevent removing owners unless you're an owner
    if (member.role === "owner" && !isCurrentUserOwner) {
      return forbidden("Only owners can remove other owners")
    }

    // Prevent removing yourself
    if (member.user_id === ctx.user.id) {
      return apiError("You cannot remove yourself. Leave the workspace instead.")
    }

    // Ensure at least one owner remains
    if (member.role === "owner") {
      const { count } = await ctx.adminClient
        .from("workspace_members")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", ctx.workspace.id)
        .eq("role", "owner")
        .is("removed_at", null)

      if (count && count <= 1) {
        return apiError("Cannot remove the last owner")
      }
    }

    // Soft delete the member
    const { error: deleteError } = await ctx.adminClient
      .from("workspace_members")
      .update({
        removed_at: new Date().toISOString(),
        removed_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId)

    if (deleteError) {
      console.error("Remove member error:", deleteError)
      return serverError()
    }

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/members/[id] error:", error)
    return serverError()
  }
}


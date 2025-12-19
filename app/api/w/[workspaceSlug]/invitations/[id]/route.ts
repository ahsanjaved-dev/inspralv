import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import {
  apiResponse,
  apiError,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} from "@/lib/api/helpers"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; id: string }>
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only owners and admins can cancel invitations")
    }

    // Check invitation exists
    const { data: invitation } = await ctx.adminClient
      .from("workspace_invitations")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "pending")
      .single()

    if (!invitation) {
      return notFound("Invitation")
    }

    // Cancel invitation
    const { error } = await ctx.adminClient
      .from("workspace_invitations")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      console.error("Cancel invitation error:", error)
      return apiError("Failed to cancel invitation")
    }

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/invitations/[id] error:", error)
    return serverError()
  }
}

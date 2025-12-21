import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { createWorkspaceInvitationSchema } from "@/types/database.types"
import { sendWorkspaceInvitationEmail } from "@/lib/email/send"
import { headers } from "next/headers"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return unauthorized()
    }

    const { data: invitations, error } = await ctx.adminClient
      .from("workspace_invitations")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("List invitations error:", error)
      return serverError()
    }

    return apiResponse(invitations)
  } catch (error) {
    console.error("GET /api/w/[slug]/invitations error:", error)
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
    const validation = createWorkspaceInvitationSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    const { email, role, message } = validation.data

    // Check if user is already a member
    const { data: existingMember } = await ctx.adminClient
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)
      .eq(
        "user_id",
        (await ctx.adminClient.auth.admin.listUsers()).data.users.find((u) => u.email === email)
          ?.id || ""
      )
      .maybeSingle()

    // Alternative approach - check via auth
    const {
      data: { users },
    } = await ctx.adminClient.auth.admin.listUsers()
    const existingUser = users.find((u) => u.email === email)

    if (existingUser) {
      const { data: member } = await ctx.adminClient
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", ctx.workspace.id)
        .eq("user_id", existingUser.id)
        .is("removed_at", null)
        .maybeSingle()

      if (member) {
        return apiError("This user is already a member of this workspace")
      }
    }

    // Check if already invited
    const { data: existingInvitation } = await ctx.adminClient
      .from("workspace_invitations")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle()

    if (existingInvitation) {
      return apiError("An invitation is already pending for this email")
    }

    // Check member limits
    const { count: memberCount } = await ctx.adminClient
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .is("removed_at", null)

    const { count: inviteCount } = await ctx.adminClient
      .from("workspace_invitations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "pending")

    const maxUsers = ctx.workspace.resource_limits.max_users || 20
    const totalPending = (memberCount || 0) + (inviteCount || 0)

    if (totalPending >= maxUsers) {
      return apiError(`Member limit reached. Maximum: ${maxUsers} members.`, 403)
    }

    // Create invitation
    const { data: invitation, error } = await ctx.adminClient
      .from("workspace_invitations")
      .insert({
        workspace_id: ctx.workspace.id,
        email,
        role,
        message: message || null,
        invited_by: ctx.user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Create invitation error:", error)
      return apiError("Failed to create invitation")
    }

    // Get host for invite link
    const headersList = await headers()
    const host = headersList.get("host") || "localhost:3000"
    const protocol = host.includes("localhost") ? "http" : "https"
    const inviteLink = `${protocol}://${host}/accept-workspace-invitation?token=${invitation.token}`

    // Send email
    try {
      const inviterName = ctx.user.first_name
        ? `${ctx.user.first_name} ${ctx.user.last_name || ""}`.trim()
        : ctx.user.email

      await sendWorkspaceInvitationEmail({
        to: email,
        workspaceName: ctx.workspace.name,
        inviterName,
        inviteLink,
        role,
        message: message || undefined,
        expiresAt: invitation.expires_at,
        partnerBranding: {
          companyName: ctx.partner.branding.company_name || ctx.partner.name,
          primaryColor: ctx.partner.branding.primary_color,
          logoUrl: ctx.partner.branding.logo_url,
        },
      })
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError)
      // Don't fail the request if email fails - invitation is still created
    }

    return apiResponse(invitation, 201)
  } catch (error) {
    console.error("POST /api/w/[slug]/invitations error:", error)
    return serverError()
  }
}

import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { headers } from "next/headers"
import { z } from "zod"

const createInvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  message: z.string().max(500).optional(),
})

/**
 * GET /api/partner/invitations - List all pending invitations
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()

    if (!isPartnerAdmin(ctx)) {
      return forbidden("Only admins and owners can view invitations")
    }

    const { data: invitations, error } = await ctx.adminClient
      .from("partner_invitations")
      .select(`
        id,
        email,
        role,
        message,
        status,
        expires_at,
        created_at,
        inviter:users!invited_by(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("partner_id", ctx.partner.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("List partner invitations error:", error)
      return serverError()
    }

    return apiResponse(invitations)
  } catch (error) {
    console.error("GET /api/partner/invitations error:", error)
    return serverError()
  }
}

/**
 * POST /api/partner/invitations - Create a new invitation
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()

    if (!isPartnerAdmin(ctx)) {
      return forbidden("Only admins and owners can invite team members")
    }

    const body = await request.json()
    const validation = createInvitationSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.errors.map(e => e.message).join(", ")
      return apiError(errors)
    }

    const { email, role, message } = validation.data

    // Only owners can invite other owners
    if (role === "owner" && ctx.partnerRole !== "owner") {
      return forbidden("Only owners can invite other owners")
    }

    // Check if user is already a member
    const { data: { users } } = await ctx.adminClient.auth.admin.listUsers()
    const existingUser = users.find(u => u.email === email)

    if (existingUser) {
      const { data: existingMember } = await ctx.adminClient
        .from("partner_members")
        .select("id")
        .eq("partner_id", ctx.partner.id)
        .eq("user_id", existingUser.id)
        .is("removed_at", null)
        .maybeSingle()

      if (existingMember) {
        return apiError("This user is already a team member")
      }
    }

    // Check if already invited
    const { data: existingInvitation } = await ctx.adminClient
      .from("partner_invitations")
      .select("id")
      .eq("partner_id", ctx.partner.id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle()

    if (existingInvitation) {
      return apiError("An invitation is already pending for this email")
    }

    // Create the invitation
    const { data: invitation, error } = await ctx.adminClient
      .from("partner_invitations")
      .insert({
        partner_id: ctx.partner.id,
        email,
        role,
        message: message || null,
        invited_by: ctx.user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Create partner invitation error:", error)
      return apiError("Failed to create invitation")
    }

    // Build invite link
    const headersList = await headers()
    const host = headersList.get("host") || "localhost:3000"
    const protocol = host.includes("localhost") ? "http" : "https"
    const inviteLink = `${protocol}://${host}/accept-partner-invitation?token=${invitation.token}`

    // TODO: Send email invitation
    // For now, we'll log it in development
    console.log(`[Partner Invitation] Email: ${email}, Link: ${inviteLink}`)

    return apiResponse({ ...invitation, invite_link: inviteLink }, 201)
  } catch (error) {
    console.error("POST /api/partner/invitations error:", error)
    return serverError()
  }
}


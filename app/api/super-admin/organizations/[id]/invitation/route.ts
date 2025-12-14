import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiResponse, apiError, unauthorized, notFound, serverError } from "@/lib/api/helpers"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    // Get the latest pending invitation for this organization
    const { data: invitation, error } = await adminClient
      .from("invitations")
      .select("*")
      .eq("organization_id", id)
      .eq("type", "org_owner")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (error || !invitation) {
      return notFound("Invitation")
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    return apiResponse({
      id: invitation.id,
      email: invitation.email,
      token: invitation.token,
      expires_at: invitation.expires_at,
      invitation_link: `${appUrl}/accept-invitation?token=${invitation.token}`,
    })
  } catch (error) {
    console.error("GET /api/super-admin/organizations/[id]/invitation error:", error)
    return serverError()
  }
}

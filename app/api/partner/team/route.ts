import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"

/**
 * GET /api/partner/team - List all team members for the current partner
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getPartnerAuthContext()
    if (!ctx) return unauthorized()
    
    // All partner members can view the team
    if (!ctx.partnerRole) {
      return forbidden("You are not a member of this organization")
    }

    const { data: members, error } = await ctx.adminClient
      .from("partner_members")
      .select(`
        id,
        role,
        joined_at,
        created_at,
        user:users!inner(
          id,
          email,
          first_name,
          last_name,
          avatar_url,
          status
        )
      `)
      .eq("partner_id", ctx.partner.id)
      .is("removed_at", null)
      .order("role", { ascending: true })
      .order("joined_at", { ascending: true })

    if (error) {
      console.error("List partner members error:", error)
      return serverError()
    }

    // Transform the data to a cleaner format
    const transformedMembers = members.map((m: any) => ({
      id: m.id,
      role: m.role,
      joined_at: m.joined_at,
      user_id: m.user.id,
      email: m.user.email,
      first_name: m.user.first_name,
      last_name: m.user.last_name,
      avatar_url: m.user.avatar_url,
      status: m.user.status,
    }))

    return apiResponse(transformedMembers)
  } catch (error) {
    console.error("GET /api/partner/team error:", error)
    return serverError()
  }
}


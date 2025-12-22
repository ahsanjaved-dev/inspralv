import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status") || "all"
    const search = searchParams.get("search") || ""
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "10")

    const adminClient = createAdminClient()

    // Build query
    let query = adminClient
      .from("partner_requests")
      .select("*", { count: "exact" })
      .order("requested_at", { ascending: false })

    // Filter by status
    if (status !== "all") {
      query = query.eq("status", status)
    }

    // Search by company name or email
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,contact_email.ilike.%${search}%,contact_name.ilike.%${search}%`
      )
    }

    // Pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: requests, error, count } = await query

    if (error) {
      console.error("List partner requests error:", error)
      return serverError()
    }

    return apiResponse({
      data: requests,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/super-admin/partner-requests error:", error)
    return serverError()
  }
}

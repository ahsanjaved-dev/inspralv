import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, notFound, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ id: string }>
}

const addDomainSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
  is_primary: z.boolean().default(false),
})

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: domains, error } = await adminClient
      .from("partner_domains")
      .select("*")
      .eq("partner_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })

    if (error) {
      console.error("List domains error:", error)
      return apiError("Failed to fetch domains")
    }

    return apiResponse(domains)
  } catch (error) {
    console.error("GET /api/super-admin/partners/[id]/domains error:", error)
    return serverError()
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const body = await request.json()
    const validation = addDomainSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    const adminClient = createAdminClient()

    // Check partner exists
    const { data: partner } = await adminClient
      .from("partners")
      .select("id")
      .eq("id", id)
      .is("deleted_at", null)
      .single()

    if (!partner) {
      return notFound("Partner")
    }

    // Check hostname uniqueness
    const { data: existingDomain } = await adminClient
      .from("partner_domains")
      .select("id")
      .eq("hostname", validation.data.hostname)
      .maybeSingle()

    if (existingDomain) {
      return apiError("This hostname is already in use")
    }

    // If setting as primary, unset other primaries
    if (validation.data.is_primary) {
      await adminClient.from("partner_domains").update({ is_primary: false }).eq("partner_id", id)
    }

    // Create domain
    const { data: domain, error } = await adminClient
      .from("partner_domains")
      .insert({
        partner_id: id,
        hostname: validation.data.hostname,
        is_primary: validation.data.is_primary,
        // Generate verification token for custom domains
        verification_token: crypto.randomUUID(),
      })
      .select()
      .single()

    if (error) {
      console.error("Create domain error:", error)
      return apiError("Failed to add domain")
    }

    return apiResponse(domain, 201)
  } catch (error) {
    console.error("POST /api/super-admin/partners/[id]/domains error:", error)
    return serverError()
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const domainId = request.nextUrl.searchParams.get("domainId")

    if (!domainId) {
      return apiError("Domain ID is required")
    }

    const adminClient = createAdminClient()

    // Check domain exists and belongs to partner
    const { data: domain } = await adminClient
      .from("partner_domains")
      .select("id, is_primary")
      .eq("id", domainId)
      .eq("partner_id", id)
      .single()

    if (!domain) {
      return notFound("Domain")
    }

    if (domain.is_primary) {
      return apiError("Cannot delete the primary domain. Set another domain as primary first.", 400)
    }

    const { error } = await adminClient.from("partner_domains").delete().eq("id", domainId)

    if (error) {
      console.error("Delete domain error:", error)
      return apiError("Failed to delete domain")
    }

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/super-admin/partners/[id]/domains error:", error)
    return serverError()
  }
}

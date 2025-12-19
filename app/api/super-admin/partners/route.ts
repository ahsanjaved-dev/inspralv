import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

const createPartnerSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  hostname: z.string().min(1, "Primary hostname is required"),
  branding: z
    .object({
      company_name: z.string().optional(),
      logo_url: z.string().url().optional().or(z.literal("")),
      favicon_url: z.string().url().optional().or(z.literal("")),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
    })
    .optional(),
  plan_tier: z.enum(["free", "starter", "pro", "enterprise"]).default("starter"),
  features: z
    .object({
      white_label: z.boolean().optional(),
      custom_domain: z.boolean().optional(),
      api_access: z.boolean().optional(),
      sso: z.boolean().optional(),
      advanced_analytics: z.boolean().optional(),
    })
    .optional(),
  resource_limits: z
    .object({
      max_workspaces: z.number().optional(),
      max_users_per_workspace: z.number().optional(),
      max_agents_per_workspace: z.number().optional(),
    })
    .optional(),
  is_platform_partner: z.boolean().default(false),
})

export async function GET(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const adminClient = createAdminClient()

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const search = searchParams.get("search")
    const plan_tier = searchParams.get("plan_tier")

    let query = adminClient
      .from("partners")
      .select("*, partner_domains(hostname, is_primary)", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
    }

    if (plan_tier && plan_tier !== "all") {
      query = query.eq("plan_tier", plan_tier)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: partners, error, count } = await query

    if (error) {
      console.error("List partners error:", error)
      return apiError("Failed to fetch partners")
    }

    return apiResponse({
      data: partners,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/super-admin/partners error:", error)
    return serverError()
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const body = await request.json()
    const validation = createPartnerSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    const adminClient = createAdminClient()
    const { hostname, ...partnerData } = validation.data

    // Check slug uniqueness
    const { data: existingSlug } = await adminClient
      .from("partners")
      .select("id")
      .eq("slug", partnerData.slug)
      .maybeSingle()

    if (existingSlug) {
      return apiError("A partner with this slug already exists")
    }

    // Check hostname uniqueness
    const { data: existingDomain } = await adminClient
      .from("partner_domains")
      .select("id")
      .eq("hostname", hostname)
      .maybeSingle()

    if (existingDomain) {
      return apiError("This hostname is already in use")
    }

    // Create partner
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .insert({
        name: partnerData.name,
        slug: partnerData.slug,
        branding: partnerData.branding || {},
        plan_tier: partnerData.plan_tier,
        features: partnerData.features || {},
        resource_limits: partnerData.resource_limits || {},
        is_platform_partner: partnerData.is_platform_partner,
        subscription_status: "active",
        settings: {},
      })
      .select()
      .single()

    if (partnerError) {
      console.error("Create partner error:", partnerError)
      return apiError("Failed to create partner")
    }

    // Create primary domain
    const { error: domainError } = await adminClient.from("partner_domains").insert({
      partner_id: partner.id,
      hostname,
      is_primary: true,
      verified_at: new Date().toISOString(), // Auto-verify for now
    })

    if (domainError) {
      console.error("Create domain error:", domainError)
      // Rollback partner
      await adminClient.from("partners").delete().eq("id", partner.id)
      return apiError("Failed to create partner domain")
    }

    return apiResponse(partner, 201)
  } catch (error) {
    console.error("POST /api/super-admin/partners error:", error)
    return serverError()
  }
}

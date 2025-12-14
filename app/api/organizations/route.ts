import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"
import type { PlanTier } from "@/types/database.types"

const createOrganizationSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Valid email is required"),
  plan_tier: z
    .enum(["starter", "professional", "enterprise", "custom"] as const)
    .default("starter"),
  trial_days: z.number().min(0).max(90).default(14),
  message: z.string().max(1000).optional(),
})

// GET - List all organizations
export async function GET(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const search = searchParams.get("search")
    const planTier = searchParams.get("plan_tier")
    const status = searchParams.get("status")

    // Use admin client to bypass RLS for listing all orgs
    const adminClient = createAdminClient()

    let query = adminClient
      .from("organizations")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
    }

    if (planTier && planTier !== "all") {
      query = query.eq("plan_tier", planTier as PlanTier)
    }

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: organizations, error, count } = await query

    if (error) {
      console.error("List organizations error:", error)
      return apiError("Failed to fetch organizations")
    }

    return apiResponse({
      data: organizations,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/super-admin/organizations error:", error)
    return serverError()
  }
}

// POST - Create new organization with invitation
export async function POST(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const body = await request.json()
    const validation = createOrganizationSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    const { name, email, plan_tier, trial_days, message } = validation.data

    // Use admin client to bypass RLS
    const adminClient = createAdminClient()

    // Generate unique slug
    const baseSlug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-") || "org"

    let finalSlug = baseSlug
    let counter = 0

    while (true) {
      const { data: existingOrg } = await adminClient
        .from("organizations")
        .select("id")
        .eq("slug", finalSlug)
        .single()

      if (!existingOrg) break

      counter++
      finalSlug = `${baseSlug}-${counter}`
    }

    // Calculate trial end date
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + trial_days)

    // Create organization
    const { data: organization, error: orgError } = await adminClient
      .from("organizations")
      .insert({
        name,
        slug: finalSlug,
        status: "pending_activation",
        plan_tier,
        subscription_status: trial_days > 0 ? "trialing" : "active",
        trial_ends_at: trial_days > 0 ? trialEndsAt.toISOString() : null,
      })
      .select()
      .single()

    if (orgError) {
      console.error("Create organization error:", orgError)
      return apiError("Failed to create organization")
    }

    // Create invitation for org owner
    const { data: invitation, error: invError } = await adminClient
      .from("invitations")
      .insert({
        type: "org_owner",
        email,
        organization_id: organization.id,
        role: "org_owner",
        message: message || null,
        invited_by: context.superAdmin.id,
        status: "pending",
      })
      .select()
      .single()

    if (invError) {
      console.error("Create invitation error:", invError)
      // Rollback organization creation
      await adminClient.from("organizations").delete().eq("id", organization.id)
      return apiError("Failed to create invitation")
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    return apiResponse(
      {
        organization,
        invitation: {
          id: invitation.id,
          token: invitation.token,
          email: invitation.email,
          expires_at: invitation.expires_at,
        },
        invitation_link: `${appUrl}/accept-invitation?token=${invitation.token}`,
      },
      201
    )
  } catch (error) {
    console.error("POST /api/super-admin/organizations error:", error)
    return serverError()
  }
}

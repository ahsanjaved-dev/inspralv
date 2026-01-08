/**
 * Super Admin White-Label Variants API
 * GET  - List all variants
 * POST - Create a new variant
 */

import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { createWhiteLabelVariantSchema } from "@/types/database.types"

/**
 * GET - List all white-label variants
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const adminClient = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const includeInactive = searchParams.get("includeInactive") === "true"

    let query = adminClient
      .from("white_label_variants")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (!includeInactive) {
      query = query.eq("is_active", true)
    }

    const { data: variants, error } = await query

    if (error) {
      console.error("List variants error:", error)
      return serverError("Failed to fetch variants")
    }

    // Get partner counts for each variant
    const variantIds = variants?.map((v) => v.id) || []
    const { data: partnerCounts } = await adminClient
      .from("partners")
      .select("white_label_variant_id")
      .in("white_label_variant_id", variantIds)

    const countByVariant = new Map<string, number>()
    for (const p of partnerCounts || []) {
      if (p.white_label_variant_id) {
        const count = countByVariant.get(p.white_label_variant_id) || 0
        countByVariant.set(p.white_label_variant_id, count + 1)
      }
    }

    return apiResponse({
      variants: (variants || []).map((v) => ({
        id: v.id,
        slug: v.slug,
        name: v.name,
        description: v.description,
        monthlyPriceCents: v.monthly_price_cents,
        stripePriceId: v.stripe_price_id,
        maxWorkspaces: v.max_workspaces,
        isActive: v.is_active,
        sortOrder: v.sort_order,
        partnerCount: countByVariant.get(v.id) || 0,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      })),
    })
  } catch (error) {
    console.error("GET /api/super-admin/white-label-variants error:", error)
    return serverError()
  }
}

/**
 * POST - Create a new white-label variant
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const body = await request.json()
    const validation = createWhiteLabelVariantSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message || "Invalid variant data")
    }

    const data = validation.data
    const adminClient = createAdminClient()

    // Check if slug already exists
    const { data: existing } = await adminClient
      .from("white_label_variants")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle()

    if (existing) {
      return apiError("A variant with this slug already exists", 409)
    }

    // Create the variant
    const { data: variant, error } = await adminClient
      .from("white_label_variants")
      .insert({
        slug: data.slug,
        name: data.name,
        description: data.description || null,
        monthly_price_cents: data.monthly_price_cents,
        stripe_price_id: data.stripe_price_id || null,
        max_workspaces: data.max_workspaces,
        is_active: data.is_active,
        sort_order: data.sort_order,
      })
      .select()
      .single()

    if (error) {
      console.error("Create variant error:", error)
      return serverError("Failed to create variant")
    }

    return apiResponse(
      {
        variant: {
          id: variant.id,
          slug: variant.slug,
          name: variant.name,
          description: variant.description,
          monthlyPriceCents: variant.monthly_price_cents,
          stripePriceId: variant.stripe_price_id,
          maxWorkspaces: variant.max_workspaces,
          isActive: variant.is_active,
          sortOrder: variant.sort_order,
          createdAt: variant.created_at,
          updatedAt: variant.updated_at,
        },
      },
      201
    )
  } catch (error) {
    console.error("POST /api/super-admin/white-label-variants error:", error)
    return serverError()
  }
}


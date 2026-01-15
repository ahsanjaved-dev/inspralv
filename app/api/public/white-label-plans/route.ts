/**
 * Public API - White-Label Plans
 * GET - List active white-label variants (public pricing info for agencies)
 * 
 * No authentication required - this is public pricing information
 * displayed on the partner request form.
 */

import { NextRequest } from "next/server"
import { apiResponse, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    const adminClient = createAdminClient()

    // Only return active variants, ordered by sort_order
    const { data: variants, error } = await adminClient
      .from("white_label_variants")
      .select("id, slug, name, description, monthly_price_cents, max_workspaces, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("monthly_price_cents", { ascending: true })

    if (error) {
      console.error("Public plans fetch error:", error)
      return serverError("Failed to fetch plans")
    }

    // Transform to camelCase and only expose safe public fields
    const plans = (variants || []).map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      description: v.description,
      monthlyPriceCents: v.monthly_price_cents,
      monthlyPrice: v.monthly_price_cents / 100, // Convenience: price in dollars
      maxWorkspaces: v.max_workspaces,
      // Note: We don't expose stripe_product_id or stripe_price_id publicly
    }))

    return apiResponse({ plans })
  } catch (error) {
    console.error("GET /api/public/white-label-plans error:", error)
    return serverError()
  }
}

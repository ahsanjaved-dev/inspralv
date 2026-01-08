/**
 * Super Admin White-Label Variant Detail API
 * GET    - Get variant details
 * PATCH  - Update variant
 * DELETE - Delete variant (soft delete or hard delete if no partners)
 */

import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, notFound, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { updateWhiteLabelVariantSchema } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET - Get variant details with partner usage
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: variant, error } = await adminClient
      .from("white_label_variants")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !variant) {
      return notFound("White-label variant")
    }

    // Get partners using this variant
    const { data: partners, count } = await adminClient
      .from("partners")
      .select("id, name, slug, subscription_status", { count: "exact" })
      .eq("white_label_variant_id", id)
      .is("deleted_at", null)
      .limit(10)

    return apiResponse({
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
      usage: {
        partnerCount: count || 0,
        partners: (partners || []).map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          subscriptionStatus: p.subscription_status,
        })),
      },
    })
  } catch (error) {
    console.error("GET /api/super-admin/white-label-variants/[id] error:", error)
    return serverError()
  }
}

/**
 * PATCH - Update variant
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const body = await request.json()
    const validation = updateWhiteLabelVariantSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message || "Invalid variant data")
    }

    const data = validation.data
    const adminClient = createAdminClient()

    // Check variant exists
    const { data: existing, error: fetchError } = await adminClient
      .from("white_label_variants")
      .select("id, slug")
      .eq("id", id)
      .single()

    if (fetchError || !existing) {
      return notFound("White-label variant")
    }

    // If changing slug, check for conflicts
    if (data.slug && data.slug !== existing.slug) {
      const { data: slugConflict } = await adminClient
        .from("white_label_variants")
        .select("id")
        .eq("slug", data.slug)
        .neq("id", id)
        .maybeSingle()

      if (slugConflict) {
        return apiError("A variant with this slug already exists", 409)
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {}
    if (data.slug !== undefined) updateData.slug = data.slug
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.monthly_price_cents !== undefined) updateData.monthly_price_cents = data.monthly_price_cents
    if (data.stripe_price_id !== undefined) updateData.stripe_price_id = data.stripe_price_id
    if (data.max_workspaces !== undefined) updateData.max_workspaces = data.max_workspaces
    if (data.is_active !== undefined) updateData.is_active = data.is_active
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order

    const { data: variant, error } = await adminClient
      .from("white_label_variants")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Update variant error:", error)
      return serverError("Failed to update variant")
    }

    return apiResponse({
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
    })
  } catch (error) {
    console.error("PATCH /api/super-admin/white-label-variants/[id] error:", error)
    return serverError()
  }
}

/**
 * DELETE - Delete variant
 * Only allowed if no partners are using it
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    // Check variant exists
    const { data: existing, error: fetchError } = await adminClient
      .from("white_label_variants")
      .select("id")
      .eq("id", id)
      .single()

    if (fetchError || !existing) {
      return notFound("White-label variant")
    }

    // Check if any partners are using this variant
    const { count } = await adminClient
      .from("partners")
      .select("id", { count: "exact", head: true })
      .eq("white_label_variant_id", id)
      .is("deleted_at", null)

    if (count && count > 0) {
      return apiError(
        `Cannot delete variant: ${count} partner(s) are using it. Deactivate instead or reassign partners first.`,
        409
      )
    }

    // Also check partner requests
    const { count: requestCount } = await adminClient
      .from("partner_requests")
      .select("id", { count: "exact", head: true })
      .eq("assigned_white_label_variant_id", id)
      .in("status", ["pending", "provisioning"])

    if (requestCount && requestCount > 0) {
      return apiError(
        `Cannot delete variant: ${requestCount} pending request(s) have it assigned.`,
        409
      )
    }

    // Safe to delete
    const { error } = await adminClient
      .from("white_label_variants")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Delete variant error:", error)
      return serverError("Failed to delete variant")
    }

    return apiResponse({ success: true, message: "Variant deleted" })
  } catch (error) {
    console.error("DELETE /api/super-admin/white-label-variants/[id] error:", error)
    return serverError()
  }
}


/**
 * Super Admin White-Label Variant Detail API
 * GET    - Get variant details
 * PATCH  - Update variant (handles Stripe Product/Price updates)
 * DELETE - Delete variant (soft delete or hard delete if no partners)
 */

import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, notFound, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { updateWhiteLabelVariantSchema } from "@/types/database.types"
import { getStripe } from "@/lib/stripe"

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
        stripeProductId: variant.stripe_product_id,
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
 * Handles Stripe Product/Price updates when price or name changes
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

    // Check variant exists and get current data
    const { data: existing, error: fetchError } = await adminClient
      .from("white_label_variants")
      .select("*")
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

    // Handle Stripe updates
    const stripe = getStripe()
    let newStripeProductId = existing.stripe_product_id
    let newStripePriceId = existing.stripe_price_id
    
    const newPrice = data.monthly_price_cents ?? existing.monthly_price_cents
    const newName = data.name ?? existing.name
    const newDescription = data.description ?? existing.description
    const newSlug = data.slug ?? existing.slug

    // Check if price changed
    const priceChanged = data.monthly_price_cents !== undefined && 
                         data.monthly_price_cents !== existing.monthly_price_cents

    // Check if we need to create/update Stripe resources
    if (newPrice > 0) {
      // Case 1: Had no Stripe product, now needs one (price changed from 0 to > 0)
      if (!existing.stripe_product_id) {
        try {
          // Create new product
          const product = await stripe.products.create({
            name: newName,
            description: newDescription || `${newName} - White-Label Partner Plan`,
            metadata: {
              type: "white_label_variant",
              variant_slug: newSlug,
              max_workspaces: String(data.max_workspaces ?? existing.max_workspaces),
            },
          })

          // Create new price
          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: newPrice,
            currency: "usd",
            recurring: { interval: "month" },
            metadata: {
              type: "white_label_variant",
              variant_slug: newSlug,
            },
          })

          newStripeProductId = product.id
          newStripePriceId = price.id

          console.log(`[White-Label Variants] Created Stripe Product ${product.id} and Price ${price.id} for variant ${newSlug}`)
        } catch (stripeError) {
          console.error("[White-Label Variants] Failed to create Stripe product/price:", stripeError)
          return apiError("Failed to create Stripe product/price", 500)
        }
      }
      // Case 2: Has existing Stripe product
      else {
        try {
          // Update product name/description if changed
          const nameChanged = data.name !== undefined && data.name !== existing.name
          const descChanged = data.description !== undefined && data.description !== existing.description

          if (nameChanged || descChanged) {
            await stripe.products.update(existing.stripe_product_id, {
              name: newName,
              description: newDescription || `${newName} - White-Label Partner Plan`,
              metadata: {
                variant_slug: newSlug,
                max_workspaces: String(data.max_workspaces ?? existing.max_workspaces),
              },
            })
            console.log(`[White-Label Variants] Updated Stripe Product ${existing.stripe_product_id}`)
          }

          // If price changed, archive old price and create new one
          if (priceChanged && existing.stripe_price_id) {
            // Archive the old price
            await stripe.prices.update(existing.stripe_price_id, { active: false })
            console.log(`[White-Label Variants] Archived old Stripe Price ${existing.stripe_price_id}`)

            // Create new price
            const price = await stripe.prices.create({
              product: existing.stripe_product_id,
              unit_amount: newPrice,
              currency: "usd",
              recurring: { interval: "month" },
              metadata: {
                type: "white_label_variant",
                variant_slug: newSlug,
              },
            })

            newStripePriceId = price.id
            console.log(`[White-Label Variants] Created new Stripe Price ${price.id}`)
          }
        } catch (stripeError) {
          console.error("[White-Label Variants] Failed to update Stripe:", stripeError)
          return apiError("Failed to update Stripe product/price", 500)
        }
      }
    }
    // Case 3: Price changed to 0 - deactivate Stripe resources
    else if (priceChanged && newPrice === 0 && existing.stripe_price_id) {
      try {
        await stripe.prices.update(existing.stripe_price_id, { active: false })
        console.log(`[White-Label Variants] Deactivated Stripe Price ${existing.stripe_price_id} (variant now free)`)
        // Keep product ID for reference but clear price ID
        newStripePriceId = null
      } catch (stripeError) {
        console.error("[White-Label Variants] Failed to deactivate Stripe price:", stripeError)
        // Non-fatal - continue with update
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {}
    if (data.slug !== undefined) updateData.slug = data.slug
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.monthly_price_cents !== undefined) updateData.monthly_price_cents = data.monthly_price_cents
    if (data.max_workspaces !== undefined) updateData.max_workspaces = data.max_workspaces
    if (data.is_active !== undefined) updateData.is_active = data.is_active
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order

    // Always update Stripe IDs based on our calculations
    updateData.stripe_product_id = newStripeProductId
    updateData.stripe_price_id = newStripePriceId

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
        stripeProductId: variant.stripe_product_id,
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
      .select("id, stripe_product_id, stripe_price_id")
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

    // Archive Stripe resources if they exist
    if (existing.stripe_price_id) {
      try {
        const stripe = getStripe()
        await stripe.prices.update(existing.stripe_price_id, { active: false })
        console.log(`[White-Label Variants] Archived Stripe Price ${existing.stripe_price_id}`)
        
        if (existing.stripe_product_id) {
          await stripe.products.update(existing.stripe_product_id, { active: false })
          console.log(`[White-Label Variants] Archived Stripe Product ${existing.stripe_product_id}`)
        }
      } catch (stripeError) {
        console.error("[White-Label Variants] Failed to archive Stripe resources:", stripeError)
        // Non-fatal - continue with delete
      }
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

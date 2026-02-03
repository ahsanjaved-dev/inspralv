import { NextRequest } from "next/server"
import { getPartnerFromHost, getHostname, clearPartnerCache } from "@/lib/api/partner"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

// Schema for branding update
const updateBrandingSchema = z.object({
  logo_url: z.string().url().optional().nullable(),
  favicon_url: z.string().url().optional().nullable(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional(),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional(),
  company_name: z.string().min(1).max(100).optional(),
  background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional(),
  text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional(),
})

/**
 * GET /api/partner
 * Returns the resolved partner for the current hostname
 * Useful for debugging and testing partner resolution
 */
export async function GET(request: NextRequest) {
  try {
    const hostname = await getHostname()
    const partner = await getPartnerFromHost()

    return apiResponse({
      hostname,
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        branding: partner.branding,
        plan_tier: partner.plan_tier,
        is_platform_partner: partner.is_platform_partner,
      },
    })
  } catch (error) {
    console.error("GET /api/partner error:", error)
    return serverError((error as Error).message)
  }
}

/**
 * PATCH /api/partner
 * Update partner branding settings
 * Only accessible by partner admins and owners
 */
export async function PATCH(request: NextRequest) {
  try {
    // Get authenticated partner context
    const ctx = await getPartnerAuthContext()
    if (!ctx) {
      return unauthorized()
    }

    // Only admins and owners can update branding
    if (ctx.partnerRole !== "owner" && ctx.partnerRole !== "admin") {
      return forbidden("Only admins and owners can update organization branding")
    }

    // Parse and validate request body
    const body = await request.json()
    const { branding } = body

    if (!branding) {
      return apiError("Branding data is required", 400)
    }

    const validationResult = updateBrandingSchema.safeParse(branding)
    if (!validationResult.success) {
      return apiError(
        `Invalid branding data: ${validationResult.error.issues.map((e) => e.message).join(", ")}`,
        400
      )
    }

    const validatedBranding = validationResult.data

    // Get current branding to merge with updates
    const currentBranding = ctx.partner.branding || {}
    const updatedBranding = {
      ...currentBranding,
      ...validatedBranding,
    }

    // Update partner branding in database
    const adminClient = createAdminClient()
    const { data: updated, error } = await adminClient
      .from("partners")
      .update({
        branding: updatedBranding,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.partner.id)
      .select("id, name, slug, branding")
      .single()

    if (error) {
      console.error("Failed to update partner branding:", error)
      return serverError("Failed to update branding")
    }

    // Clear partner cache so changes take effect immediately
    await clearPartnerCache()

    return apiResponse({
      success: true,
      message: "Branding updated successfully",
      partner: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        branding: updated.branding,
      },
    })
  } catch (error) {
    console.error("PATCH /api/partner error:", error)
    return serverError((error as Error).message)
  }
}

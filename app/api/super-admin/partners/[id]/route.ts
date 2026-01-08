import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, notFound, serverError, getValidationError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ id: string }>
}

const updatePartnerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  branding: z
    .object({
      company_name: z.string().optional(),
      logo_url: z.string().url().optional().or(z.literal("")),
      favicon_url: z.string().url().optional().or(z.literal("")),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
    })
    .optional(),
  // Canonical tiers are free/pro/agency; keep legacy values accepted for older records.
  plan_tier: z.enum(["free", "pro", "agency", "starter", "professional", "enterprise"]).optional(),
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
  is_platform_partner: z.boolean().optional(),
})

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: partner, error } = await adminClient
      .from("partners")
      .select(
        `
        *,
        partner_domains(id, hostname, is_primary, verified_at, created_at)
      `
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single()

    if (error || !partner) {
      return notFound("Partner")
    }

    // Get workspace count
    const { count: workspaceCount } = await adminClient
      .from("workspaces")
      .select("*", { count: "exact", head: true })
      .eq("partner_id", id)
      .is("deleted_at", null)

    return apiResponse({
      ...partner,
      workspace_count: workspaceCount || 0,
    })
  } catch (error) {
    console.error("GET /api/super-admin/partners/[id] error:", error)
    return serverError()
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const body = await request.json()
    const validation = updatePartnerSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    const adminClient = createAdminClient()

    // Check partner exists
    const { data: existing } = await adminClient
      .from("partners")
      .select("id")
      .eq("id", id)
      .is("deleted_at", null)
      .single()

    if (!existing) {
      return notFound("Partner")
    }

    const { data: partner, error } = await adminClient
      .from("partners")
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Update partner error:", error)
      return apiError("Failed to update partner")
    }

    return apiResponse(partner)
  } catch (error) {
    console.error("PATCH /api/super-admin/partners/[id] error:", error)
    return serverError()
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    // Check partner exists and is not platform partner
    const { data: existing } = await adminClient
      .from("partners")
      .select("id, is_platform_partner")
      .eq("id", id)
      .is("deleted_at", null)
      .single()

    if (!existing) {
      return notFound("Partner")
    }

    if (existing.is_platform_partner) {
      return apiError("Cannot delete the platform partner", 403)
    }

    // Soft delete
    const { error } = await adminClient
      .from("partners")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      console.error("Delete partner error:", error)
      return apiError("Failed to delete partner")
    }

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/super-admin/partners/[id] error:", error)
    return serverError()
  }
}

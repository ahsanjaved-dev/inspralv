import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPartnerRejectionEmail, sendAgencyCheckoutEmail } from "@/lib/email/send"
import { createCheckoutToken, getTokenExpiry } from "@/lib/checkout-token"
import { env } from "@/lib/env"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ id: string }>
}

// Schema for editing partner request data
const editPartnerRequestSchema = z.object({
  company_name: z.string().min(1).max(255).optional(),
  contact_name: z.string().min(1).max(255).optional(),
  contact_email: z.string().email().optional(),
  phone: z.string().max(50).optional().nullable(),
  custom_domain: z.string().min(1).max(255).optional(),
  desired_subdomain: z.string().max(100).optional(),
  business_description: z.string().optional(),
  expected_users: z.number().optional().nullable(),
  use_case: z.string().optional(),
  // Partner tier - all white-label partners are "partner" tier
  selected_plan: z.string().optional(),
  // White-label variant assignment (determines pricing + workspace limits)
  assigned_white_label_variant_id: z.string().uuid().optional().nullable(),
  branding_data: z
    .object({
      logo_url: z.string().optional(),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
      company_name: z.string().optional(),
    })
    .optional(),
})

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    const { data: partnerRequest, error } = await adminClient
      .from("partner_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    // If a variant is assigned, fetch its details
    let assignedVariant = null
    if (partnerRequest.assigned_white_label_variant_id) {
      const { data: variant } = await adminClient
        .from("white_label_variants")
        .select("id, name, slug, monthly_price_cents, max_workspaces, description")
        .eq("id", partnerRequest.assigned_white_label_variant_id)
        .single()
      
      if (variant) {
        assignedVariant = {
          id: variant.id,
          name: variant.name,
          slug: variant.slug,
          monthlyPriceCents: variant.monthly_price_cents,
          maxWorkspaces: variant.max_workspaces,
          description: variant.description,
        }
      }
    }

    return apiResponse({
      ...partnerRequest,
      assignedVariant,
    })
  } catch (error) {
    console.error("GET /api/super-admin/partner-requests/[id] error:", error)
    return serverError()
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const body = await request.json()
    const { action, rejection_reason, ...editData } = body

    const adminClient = createAdminClient()

    // Get the request
    const { data: partnerRequest, error: fetchError } = await adminClient
      .from("partner_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    // Handle action-based operations (approve/reject)
    if (action) {
      if (!["approve", "reject"].includes(action)) {
        return apiError("Invalid action. Must be 'approve' or 'reject'", 400)
      }

      if (partnerRequest.status !== "pending") {
        return apiError("Request has already been processed", 400)
      }

      if (action === "reject") {
        if (!rejection_reason) {
          return apiError("Rejection reason is required", 400)
        }

        // Update request status to rejected
        const { error: updateError } = await adminClient
          .from("partner_requests")
          .update({
            status: "rejected",
            rejection_reason,
            reviewed_at: new Date().toISOString(),
            reviewed_by: context.superAdmin.id,
          })
          .eq("id", id)

        if (updateError) {
          console.error("Update partner request error:", updateError)
          return serverError()
        }

        // Send rejection email
        try {
          await sendPartnerRejectionEmail(partnerRequest.contact_email, {
            company_name: partnerRequest.company_name,
            contact_name: partnerRequest.contact_name,
            reason: rejection_reason,
          })
        } catch (emailError) {
          console.error("Failed to send rejection email:", emailError)
        }

        return apiResponse({
          success: true,
          message: "Partner request rejected",
        })
      }

      if (action === "approve") {
        // Get variant ID from body or use the one already assigned
        const variantId = body.variant_id || partnerRequest.assigned_white_label_variant_id
        
        if (!variantId) {
          return apiError("A plan variant must be selected before approval", 400)
        }

        // Fetch the variant details
        const { data: variant, error: variantError } = await adminClient
          .from("white_label_variants")
          .select("id, name, monthly_price_cents, max_workspaces, stripe_price_id")
          .eq("id", variantId)
          .single()

        if (variantError || !variant) {
          return apiError("Selected plan variant not found", 400)
        }

        if (!variant.stripe_price_id && variant.monthly_price_cents > 0) {
          return apiError("Selected plan does not have Stripe pricing configured", 400)
        }

        // Generate checkout token (expires in 7 days)
        const checkoutToken = createCheckoutToken(id, 7)
        const tokenExpiry = getTokenExpiry(checkoutToken)
        const expiresAtFormatted = tokenExpiry 
          ? tokenExpiry.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
          : "7 days from now"

        // Build checkout URL
        const checkoutUrl = `${env.appUrl}/agency-checkout?token=${encodeURIComponent(checkoutToken)}`

        // Update request status to approved and store checkout metadata
        const { error: updateError } = await adminClient
          .from("partner_requests")
          .update({
            status: "approved",
            assigned_white_label_variant_id: variantId,
            reviewed_at: new Date().toISOString(),
            reviewed_by: context.superAdmin.id,
            metadata: {
              ...(partnerRequest.metadata || {}),
              checkout_token: checkoutToken,
              checkout_token_expires_at: tokenExpiry?.toISOString(),
              checkout_sent_at: new Date().toISOString(),
            },
          })
          .eq("id", id)

        if (updateError) {
          console.error("Update partner request error:", updateError)
          return serverError()
        }

        // Send checkout email to the agency
        try {
          const planPrice = variant.monthly_price_cents === 0 
            ? "Free" 
            : `$${(variant.monthly_price_cents / 100).toFixed(0)}/month`
          const maxWorkspaces = variant.max_workspaces === -1 
            ? "Unlimited" 
            : String(variant.max_workspaces)

          await sendAgencyCheckoutEmail(partnerRequest.contact_email, {
            company_name: partnerRequest.company_name,
            contact_name: partnerRequest.contact_name,
            plan_name: variant.name,
            plan_price: planPrice,
            max_workspaces: maxWorkspaces,
            checkout_url: checkoutUrl,
            expires_at: expiresAtFormatted,
          })
        } catch (emailError) {
          console.error("Failed to send checkout email:", emailError)
          // Don't fail the request - admin can resend
        }

        return apiResponse({
          success: true,
          message: "Partner request approved. Checkout link sent to agency.",
          requestId: id,
          checkoutUrl,
          variant: {
            id: variant.id,
            name: variant.name,
            monthlyPriceCents: variant.monthly_price_cents,
            maxWorkspaces: variant.max_workspaces,
          },
        })
      }

      return serverError()
    }

    // Handle edit operation (no action provided, just edit fields)
    const validation = editPartnerRequestSchema.safeParse(editData)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message || "Validation failed", 400)
    }

    const updateData = validation.data

    // If custom_domain is being changed, check for conflicts
    if (updateData.custom_domain && updateData.custom_domain !== partnerRequest.custom_domain) {
      // Check if domain is already used by another pending request
      const { data: existingRequest } = await adminClient
        .from("partner_requests")
        .select("id")
        .eq("custom_domain", updateData.custom_domain.toLowerCase())
        .in("status", ["pending", "provisioning"])
        .neq("id", id)
        .maybeSingle()

      if (existingRequest) {
        return apiError("This domain is already requested by another partner", 409)
      }

      // Check if domain already exists in partner_domains
      const { data: existingDomain } = await adminClient
        .from("partner_domains")
        .select("id")
        .eq("hostname", updateData.custom_domain.toLowerCase())
        .maybeSingle()

      if (existingDomain) {
        return apiError("This domain is already registered to a partner", 409)
      }

      // Normalize domain to lowercase
      updateData.custom_domain = updateData.custom_domain.toLowerCase()
    }

    // Update the partner request
    const { data: updatedRequest, error: updateError } = await adminClient
      .from("partner_requests")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("Update partner request error:", updateError)
      return serverError()
    }

    return apiResponse({
      success: true,
      message: "Partner request updated successfully",
      data: updatedRequest,
    })
  } catch (error) {
    console.error("PATCH /api/super-admin/partner-requests/[id] error:", error)
    return serverError()
  }
}

// Permanently delete a partner request
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    // Check if the request exists
    const { data: partnerRequest, error: fetchError } = await adminClient
      .from("partner_requests")
      .select("id, status, provisioned_partner_id")
      .eq("id", id)
      .single()

    if (fetchError || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    // If a partner was already provisioned from this request, prevent deletion
    if (partnerRequest.provisioned_partner_id) {
      return apiError(
        "Cannot delete this request because a partner has already been provisioned from it. Delete the partner first.",
        400
      )
    }

    // Permanently delete the partner request
    const { error: deleteError } = await adminClient
      .from("partner_requests")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("Delete partner request error:", deleteError)
      return serverError()
    }

    return apiResponse({
      success: true,
      message: "Partner request permanently deleted",
    })
  } catch (error) {
    console.error("DELETE /api/super-admin/partner-requests/[id] error:", error)
    return serverError()
  }
}

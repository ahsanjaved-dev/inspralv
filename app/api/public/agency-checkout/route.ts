/**
 * Public API - Agency Checkout
 * GET  - Validate checkout token and return request/variant details
 * POST - Create Stripe Checkout Session for agency subscription
 */

import { NextRequest } from "next/server"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyCheckoutToken } from "@/lib/checkout-token"
import { getStripe } from "@/lib/stripe"
import { env } from "@/lib/env"

/**
 * GET - Validate token and return checkout data
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")

    if (!token) {
      return apiError("Missing checkout token", 400)
    }

    // Verify token
    const payload = verifyCheckoutToken(token)
    if (!payload) {
      return apiError("Invalid or expired checkout link", 400)
    }

    const adminClient = createAdminClient()

    // Get the partner request
    const { data: partnerRequest, error: requestError } = await adminClient
      .from("partner_requests")
      .select(`
        id,
        company_name,
        contact_name,
        contact_email,
        desired_subdomain,
        status,
        assigned_white_label_variant_id,
        metadata
      `)
      .eq("id", payload.requestId)
      .single()

    if (requestError || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    // Check status - must be "approved" to proceed
    if (partnerRequest.status !== "approved") {
      return apiResponse({
        request: {
          id: partnerRequest.id,
          companyName: partnerRequest.company_name,
          contactName: partnerRequest.contact_name,
          contactEmail: partnerRequest.contact_email,
          desiredSubdomain: partnerRequest.desired_subdomain,
          status: partnerRequest.status,
        },
        variant: null,
        expiresAt: null,
        message: partnerRequest.status === "provisioning" || partnerRequest.status === "approved"
          ? "This checkout has already been completed"
          : "This request is no longer valid",
      })
    }

    // Get the variant
    if (!partnerRequest.assigned_white_label_variant_id) {
      return apiError("No plan assigned to this request", 400)
    }

    const { data: variant, error: variantError } = await adminClient
      .from("white_label_variants")
      .select("id, name, description, monthly_price_cents, max_workspaces, stripe_price_id")
      .eq("id", partnerRequest.assigned_white_label_variant_id)
      .single()

    if (variantError || !variant) {
      return apiError("Selected plan not found", 400)
    }

    // Get expiry from metadata
    const metadata = partnerRequest.metadata as Record<string, unknown> | null
    const expiresAt = metadata?.checkout_token_expires_at as string | null

    return apiResponse({
      request: {
        id: partnerRequest.id,
        companyName: partnerRequest.company_name,
        contactName: partnerRequest.contact_name,
        contactEmail: partnerRequest.contact_email,
        desiredSubdomain: partnerRequest.desired_subdomain,
        status: partnerRequest.status,
      },
      variant: {
        id: variant.id,
        name: variant.name,
        description: variant.description,
        monthlyPriceCents: variant.monthly_price_cents,
        maxWorkspaces: variant.max_workspaces,
      },
      expiresAt,
    })
  } catch (error) {
    console.error("GET /api/public/agency-checkout error:", error)
    return serverError()
  }
}

/**
 * POST - Create Stripe Checkout Session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return apiError("Missing checkout token", 400)
    }

    // Verify token
    const payload = verifyCheckoutToken(token)
    if (!payload) {
      return apiError("Invalid or expired checkout link", 400)
    }

    const adminClient = createAdminClient()

    // Get the partner request
    const { data: partnerRequest, error: requestError } = await adminClient
      .from("partner_requests")
      .select(`
        id,
        company_name,
        contact_name,
        contact_email,
        desired_subdomain,
        status,
        assigned_white_label_variant_id
      `)
      .eq("id", payload.requestId)
      .single()

    if (requestError || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    // Must be approved status
    if (partnerRequest.status !== "approved") {
      return apiError(
        partnerRequest.status === "provisioning"
          ? "This checkout has already been completed"
          : "This request is no longer valid for checkout",
        400
      )
    }

    // Get the variant with Stripe price
    if (!partnerRequest.assigned_white_label_variant_id) {
      return apiError("No plan assigned to this request", 400)
    }

    const { data: variant, error: variantError } = await adminClient
      .from("white_label_variants")
      .select("id, name, stripe_price_id, monthly_price_cents")
      .eq("id", partnerRequest.assigned_white_label_variant_id)
      .single()

    if (variantError || !variant) {
      return apiError("Selected plan not found", 400)
    }

    // Free plans don't need Stripe checkout
    if (variant.monthly_price_cents === 0) {
      // For free plans, we could auto-provision here
      // But for now, let's require payment flow even for free (they'll just see $0)
      // This keeps the flow consistent
    }

    if (!variant.stripe_price_id) {
      return apiError("Selected plan is not configured for payments", 400)
    }

    // Create Stripe Checkout Session
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: partnerRequest.contact_email,
      line_items: [
        {
          price: variant.stripe_price_id,
          quantity: 1,
        },
      ],
      metadata: {
        type: "agency_subscription",
        partner_request_id: partnerRequest.id,
        variant_id: variant.id,
        company_name: partnerRequest.company_name,
      },
      subscription_data: {
        metadata: {
          type: "agency_subscription",
          partner_request_id: partnerRequest.id,
          variant_id: variant.id,
        },
      },
      success_url: `${env.appUrl}/agency-checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appUrl}/agency-checkout?token=${encodeURIComponent(token)}`,
      allow_promotion_codes: true,
    })

    // Update request status to indicate checkout started
    await adminClient
      .from("partner_requests")
      .update({
        metadata: {
          ...(partnerRequest as unknown as { metadata?: Record<string, unknown> }).metadata,
          stripe_checkout_session_id: session.id,
          checkout_started_at: new Date().toISOString(),
        },
      })
      .eq("id", partnerRequest.id)

    return apiResponse({
      url: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    console.error("POST /api/public/agency-checkout error:", error)
    return serverError()
  }
}

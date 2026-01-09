/**
 * POST /api/partner/billing/checkout
 * Creates a Stripe Checkout Session for partner subscription
 * 
 * Partner billing uses the assigned WhiteLabelVariant's Stripe price.
 * Partners must have a variant assigned by super admin during provisioning.
 * 
 * NOTE: This is for AGENCY partner billing only.
 * Direct users (Free/Pro) subscribe at the workspace level via /api/w/[slug]/subscription
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { getStripe, getOrCreateCustomer } from "@/lib/stripe"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

const checkoutSchema = z.object({
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    // 2. Only partner admins/owners can manage billing
    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can manage billing")
    }

    // 3. Parse and validate request body
    const body = await request.json().catch(() => ({}))
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request")
    }

    const { successUrl, cancelUrl } = parsed.data

    if (!prisma) {
      return serverError("Database not configured")
    }

    // 4. Get partner from database with variant info
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        isBillingExempt: true,
        isPlatformPartner: true,
        whiteLabelVariantId: true,
        whiteLabelVariant: {
          select: {
            id: true,
            name: true,
            slug: true,
            stripePriceId: true,
            monthlyPriceCents: true,
            maxWorkspaces: true,
          },
        },
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    // 5. Check if partner is billing-exempt (platform partner)
    if (partner.isBillingExempt || partner.isPlatformPartner) {
      return apiError(
        "This organization is exempt from platform billing. " +
        "End users subscribe to plans at the workspace level."
      )
    }

    // 6. Check if partner already has an active subscription
    if (partner.stripeSubscriptionId && partner.subscriptionStatus === "active") {
      return apiError(
        "Partner already has an active subscription. " +
        "Use the billing portal to manage your subscription."
      )
    }

    // 7. Require an assigned variant
    if (!partner.whiteLabelVariant) {
      return apiError(
        "No plan tier assigned to this partner. " +
        "Please contact the platform administrator to assign a plan."
      )
    }

    const variant = partner.whiteLabelVariant

    // 8. Require variant has Stripe price configured
    if (!variant.stripePriceId) {
      return apiError(
        "Your plan tier does not have billing configured yet. " +
        "Please contact the platform administrator."
      )
    }

    // 9. Get or create Stripe customer
    const customer = await getOrCreateCustomer(
      partner.id,
      auth.user.email,
      partner.name,
      partner.stripeCustomerId
    )

    // 10. Update partner with Stripe customer ID if new
    if (!partner.stripeCustomerId) {
      await prisma.partner.update({
        where: { id: partner.id },
        data: { stripeCustomerId: customer.id },
      })
    }

    // 11. Create Checkout Session on platform Stripe account
    const stripe = getStripe()
    const baseUrl = env.appUrl

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [
        {
          price: variant.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${baseUrl}/org/billing?checkout=success`,
      cancel_url: cancelUrl || `${baseUrl}/org/billing?checkout=cancelled`,
      metadata: {
        partner_id: partner.id,
        plan_tier: variant.slug,
        white_label_variant_id: variant.id,
        variant_name: variant.name,
      },
      subscription_data: {
        metadata: {
          partner_id: partner.id,
          plan_tier: variant.slug,
          white_label_variant_id: variant.id,
          variant_name: variant.name,
        },
      },
    })

    return apiResponse({
      sessionId: session.id,
      url: session.url,
      variant: {
        id: variant.id,
        name: variant.name,
        slug: variant.slug,
        monthlyPriceCents: variant.monthlyPriceCents,
        maxWorkspaces: variant.maxWorkspaces,
      },
    })
  } catch (error) {
    console.error("POST /api/partner/billing/checkout error:", error)
    return serverError((error as Error).message)
  }
}

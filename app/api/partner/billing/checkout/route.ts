/**
 * POST /api/partner/billing/checkout
 * Creates a Stripe Checkout Session for partner subscription
 * 
 * For white-label partners: Uses the assigned variant's Stripe price ID
 * For regular partners: Uses the legacy plan-based pricing
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { getStripe, getOrCreateCustomer, getPriceIdForPlan } from "@/lib/stripe"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

const checkoutSchema = z.object({
  // Optional: legacy plan-based checkout (for backwards compatibility)
  plan: z.enum(["pro", "agency"]).optional(),
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
    const body = await request.json()
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request")
    }

    const { plan, successUrl, cancelUrl } = parsed.data

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
        whiteLabelVariantId: true,
        whiteLabelVariant: {
          select: {
            id: true,
            name: true,
            slug: true,
            stripePriceId: true,
            monthlyPriceCents: true,
          },
        },
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    // 5. Check if partner is billing-exempt (e.g., Genius365 / platform partner)
    if (partner.isBillingExempt) {
      return apiError("This organization is exempt from platform billing.")
    }

    // 6. Check if partner already has an active subscription
    if (partner.stripeSubscriptionId && partner.subscriptionStatus === "active") {
      return apiError("Partner already has an active subscription. Use the customer portal to change plans.")
    }

    // 7. Determine the Stripe price ID
    let priceId: string | null = null
    let planTier: string = "partner"

    // If partner has an assigned white-label variant, use that price
    if (partner.whiteLabelVariant?.stripePriceId) {
      priceId = partner.whiteLabelVariant.stripePriceId
      planTier = partner.whiteLabelVariant.slug
    } else if (plan) {
      // Legacy: use plan-based pricing
      priceId = getPriceIdForPlan(plan)
      planTier = plan
    }

    if (!priceId) {
      // If no variant assigned and no plan specified
      if (partner.whiteLabelVariantId) {
        return apiError("Your plan variant does not have a Stripe price configured. Please contact support.")
      }
      return apiError("No plan specified and no variant assigned. Please contact support.")
    }

    // 8. Get or create Stripe customer
    const customer = await getOrCreateCustomer(
      partner.id,
      auth.user.email,
      partner.name,
      partner.stripeCustomerId
    )

    // 9. Update partner with Stripe customer ID if new
    if (!partner.stripeCustomerId) {
      await prisma.partner.update({
        where: { id: partner.id },
        data: { stripeCustomerId: customer.id },
      })
    }

    // 10. Create Checkout Session on platform Stripe account
    const stripe = getStripe()
    const baseUrl = env.appUrl

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${baseUrl}/org/billing?checkout=success`,
      cancel_url: cancelUrl || `${baseUrl}/org/billing?checkout=cancelled`,
      metadata: {
        partner_id: partner.id,
        plan_tier: planTier,
        white_label_variant_id: partner.whiteLabelVariantId || "",
      },
      subscription_data: {
        metadata: {
          partner_id: partner.id,
          plan_tier: planTier,
          white_label_variant_id: partner.whiteLabelVariantId || "",
        },
      },
    })

    return apiResponse({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    console.error("POST /api/partner/billing/checkout error:", error)
    return serverError((error as Error).message)
  }
}


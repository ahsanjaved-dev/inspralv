/**
 * POST /api/partner/billing/checkout
 * Creates a Stripe Checkout Session for partner subscription
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { getStripe, getOrCreateCustomer, getPriceIdForPlan, type PlanTier } from "@/lib/stripe"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

const checkoutSchema = z.object({
  plan: z.enum(["starter", "professional", "enterprise"]),
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

    // 4. Get the price ID for the selected plan
    const priceId = getPriceIdForPlan(plan as PlanTier)
    if (!priceId) {
      return apiError(`Price not configured for plan: ${plan}. Please set STRIPE_PRICE_${plan.toUpperCase()} env var.`)
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // 5. Get partner from database using Prisma
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    // 6. Check if partner already has an active subscription
    if (partner.stripeSubscriptionId && partner.subscriptionStatus === "active") {
      return apiError("Partner already has an active subscription. Use the customer portal to change plans.")
    }

    // 7. Get or create Stripe customer
    const customer = await getOrCreateCustomer(
      partner.id,
      auth.user.email,
      partner.name,
      partner.stripeCustomerId
    )

    // 8. Update partner with Stripe customer ID if new
    if (!partner.stripeCustomerId) {
      await prisma.partner.update({
        where: { id: partner.id },
        data: { stripeCustomerId: customer.id },
      })
    }

    // 9. Create Checkout Session
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
      success_url: successUrl || `${baseUrl}/org/settings?checkout=success`,
      cancel_url: cancelUrl || `${baseUrl}/org/settings?checkout=cancelled`,
      metadata: {
        partner_id: partner.id,
        plan_tier: plan,
      },
      subscription_data: {
        metadata: {
          partner_id: partner.id,
          plan_tier: plan,
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


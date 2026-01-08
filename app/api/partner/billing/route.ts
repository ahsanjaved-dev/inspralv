/**
 * GET /api/partner/billing
 * Returns the current billing/subscription status for a partner
 * Includes white-label variant info if assigned
 */

import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { plans } from "@/config/plans"

export async function GET() {
  try {
    // 1. Authenticate
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // 2. Get partner billing info from database with variant
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        name: true,
        planTier: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        isBillingExempt: true,
        whiteLabelVariantId: true,
        whiteLabelVariant: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            monthlyPriceCents: true,
            stripePriceId: true,
            maxWorkspaces: true,
          },
        },
        resourceLimits: true,
      },
    })

    if (!partner) {
      return unauthorized()
    }

    // 3. Get plan details (fallback for legacy partners without variant)
    const planKey = partner.planTier as keyof typeof plans
    const planDetails = plans[planKey] || plans.free

    // 4. Build response with variant info
    const whiteLabelVariant = partner.whiteLabelVariant
      ? {
          id: partner.whiteLabelVariant.id,
          slug: partner.whiteLabelVariant.slug,
          name: partner.whiteLabelVariant.name,
          description: partner.whiteLabelVariant.description,
          monthlyPriceCents: partner.whiteLabelVariant.monthlyPriceCents,
          stripePriceId: partner.whiteLabelVariant.stripePriceId,
          maxWorkspaces: partner.whiteLabelVariant.maxWorkspaces,
        }
      : null

    // Use variant name/price if available, otherwise use legacy plan
    const effectivePlanName = whiteLabelVariant?.name || planDetails.name
    const effectivePlanPrice = whiteLabelVariant
      ? whiteLabelVariant.monthlyPriceCents / 100
      : planDetails.price

    return apiResponse({
      partner: {
        id: partner.id,
        name: partner.name,
        isBillingExempt: partner.isBillingExempt,
      },
      subscription: {
        planTier: partner.planTier,
        planName: effectivePlanName,
        planPrice: effectivePlanPrice,
        status: partner.subscriptionStatus,
        hasActiveSubscription: partner.subscriptionStatus === "active",
        hasStripeCustomer: !!partner.stripeCustomerId,
        hasStripeSubscription: !!partner.stripeSubscriptionId,
      },
      whiteLabelVariant,
      features: planDetails.features,
      features_list: planDetails.features_list,
    })
  } catch (error) {
    console.error("GET /api/partner/billing error:", error)
    return serverError((error as Error).message)
  }
}


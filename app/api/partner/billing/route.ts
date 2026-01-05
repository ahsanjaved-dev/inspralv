/**
 * GET /api/partner/billing
 * Returns the current billing/subscription status for a partner
 */

import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import {prisma} from "@/lib/prisma"
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

    // 2. Get partner billing info from database
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        name: true,
        planTier: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    })

    if (!partner) {
      return unauthorized()
    }

    // 3. Get plan details
    const planKey = partner.planTier as keyof typeof plans
    const planDetails = plans[planKey] || plans.starter

    return apiResponse({
      partner: {
        id: partner.id,
        name: partner.name,
      },
      subscription: {
        planTier: partner.planTier,
        planName: planDetails.name,
        planPrice: planDetails.price,
        status: partner.subscriptionStatus,
        hasActiveSubscription: partner.subscriptionStatus === "active",
        hasStripeCustomer: !!partner.stripeCustomerId,
        hasStripeSubscription: !!partner.stripeSubscriptionId,
      },
      features: planDetails.features,
      features_list: planDetails.features_list,
    })
  } catch (error) {
    console.error("GET /api/partner/billing error:", error)
    return serverError((error as Error).message)
  }
}


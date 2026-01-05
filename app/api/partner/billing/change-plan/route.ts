/**
 * Plan Change API Routes
 *
 * POST /api/partner/billing/change-plan
 * Change subscription plan with proration
 *
 * GET /api/partner/billing/change-plan
 * Preview plan change with proration details
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import {
  getPriceIdForPlan,
  updateSubscriptionPlan,
  previewSubscriptionChange,
  type PlanTier
} from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

const changePlanSchema = z.object({
  newPlan: z.enum(["starter", "professional", "enterprise"]),
})

/**
 * GET - Preview plan change with proration
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    // Only admins can preview plan changes
    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can manage subscriptions")
    }

    const searchParams = request.nextUrl.searchParams
    const newPlan = searchParams.get("newPlan") as PlanTier | null

    if (!newPlan || !["starter", "professional", "enterprise"].includes(newPlan)) {
      return apiError("Invalid plan specified")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get partner's subscription
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        planTier: true,
        stripeSubscriptionId: true,
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    if (!partner.stripeSubscriptionId) {
      return apiError("No active subscription found", 400)
    }

    if (partner.planTier === newPlan) {
      return apiError("You are already on this plan", 400)
    }

    // Get price ID for new plan
    const newPriceId = getPriceIdForPlan(newPlan)
    if (!newPriceId) {
      return apiError("Invalid plan configuration", 500)
    }

    // Get proration preview
    const preview = await previewSubscriptionChange(
      partner.stripeSubscriptionId,
      newPriceId
    )

    return apiResponse({
      currentPlan: partner.planTier,
      newPlan,
      prorationAmount: preview.prorationAmount,
      prorationAmountDollars: (preview.prorationAmount / 100).toFixed(2),
      immediateCharge: preview.immediateCharge,
      nextBillingDate: new Date(preview.nextBillingDate * 1000).toISOString(),
      isUpgrade: getIsUpgrade(partner.planTier, newPlan),
    })
  } catch (error) {
    console.error("GET /api/partner/billing/change-plan error:", error)
    return serverError((error as Error).message)
  }
}

/**
 * POST - Change subscription plan
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    // Only admins can change plans
    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can manage subscriptions")
    }

    const body = await request.json()
    const parsed = changePlanSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request")
    }

    const { newPlan } = parsed.data

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get partner's subscription
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        planTier: true,
        stripeSubscriptionId: true,
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    if (!partner.stripeSubscriptionId) {
      return apiError("No active subscription found", 400)
    }

    if (partner.planTier === newPlan) {
      return apiError("You are already on this plan", 400)
    }

    // Get price ID for new plan
    const newPriceId = getPriceIdForPlan(newPlan)
    if (!newPriceId) {
      return apiError("Invalid plan configuration", 500)
    }

    // Update the subscription in Stripe
    const result = await updateSubscriptionPlan(
      partner.stripeSubscriptionId,
      newPriceId
    )

    // Update partner's plan tier in database
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        planTier: newPlan,
      },
    })

    return apiResponse({
      success: true,
      newPlan,
      prorationAmount: result.prorationAmount,
      prorationAmountDollars: (result.prorationAmount / 100).toFixed(2),
      immediateCharge: result.immediateCharge,
      message: result.immediateCharge
        ? `Plan changed successfully. You will be charged $${(result.prorationAmount / 100).toFixed(2)} for the upgrade.`
        : "Plan changed successfully. Changes will take effect on your next billing cycle.",
    })
  } catch (error) {
    console.error("POST /api/partner/billing/change-plan error:", error)
    return serverError((error as Error).message)
  }
}

/**
 * Helper to determine if plan change is an upgrade
 */
function getIsUpgrade(currentPlan: string, newPlan: string): boolean {
  const planOrder = { starter: 1, professional: 2, enterprise: 3 }
  return (
    planOrder[newPlan as keyof typeof planOrder] >
    planOrder[currentPlan as keyof typeof planOrder]
  )
}

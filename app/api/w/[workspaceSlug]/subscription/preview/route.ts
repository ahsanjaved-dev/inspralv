/**
 * Subscription Change Preview API
 * POST - Preview proration for changing to a different plan
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "@/lib/stripe"

type RouteParams = { params: Promise<{ workspaceSlug: string }> }

const previewSchema = z.object({
  newPlanId: z.string().uuid(),
})

// POST - Preview proration for plan change
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug } = await params
    
    const context = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])
    if (!context) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    const body = await request.json()
    const parsed = previewSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request")
    }

    const { newPlanId } = parsed.data

    // Get current subscription
    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: {
        plan: {
          select: { 
            id: true, 
            name: true, 
            monthlyPriceCents: true,
            includedMinutes: true,
          },
        },
      },
    })

    if (!subscription) {
      return apiError("No active subscription")
    }

    if (subscription.status !== "active") {
      return apiError("Can only preview changes for active subscriptions")
    }

    if (subscription.planId === newPlanId) {
      return apiError("Already subscribed to this plan")
    }

    // Get the new plan
    const newPlan = await prisma.workspaceSubscriptionPlan.findFirst({
      where: {
        id: newPlanId,
        partnerId: context.workspace.partner_id,
        isActive: true,
      },
    })

    if (!newPlan) {
      return notFound("New subscription plan")
    }

    // Calculate basic info
    const isUpgrade = newPlan.monthlyPriceCents > subscription.plan.monthlyPriceCents
    const priceDifferenceCents = newPlan.monthlyPriceCents - subscription.plan.monthlyPriceCents
    const minutesDifference = newPlan.includedMinutes - subscription.plan.includedMinutes

    // If both are free plans, no proration needed
    if (subscription.plan.monthlyPriceCents === 0 && newPlan.monthlyPriceCents === 0) {
      return apiResponse({
        currentPlan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          monthlyPriceCents: subscription.plan.monthlyPriceCents,
          includedMinutes: subscription.plan.includedMinutes,
        },
        newPlan: {
          id: newPlan.id,
          name: newPlan.name,
          monthlyPriceCents: newPlan.monthlyPriceCents,
          includedMinutes: newPlan.includedMinutes,
        },
        isUpgrade,
        priceDifferenceCents,
        minutesDifference,
        prorationAmountCents: 0,
        immediateCharge: false,
        message: "Free plan change - no charges",
      })
    }

    // For paid plans, get Stripe proration preview
    const partner = await prisma.partner.findUnique({
      where: { id: context.workspace.partner_id },
      select: { settings: true },
    })

    const connectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown>)

    if (!connectAccountId || !subscription.stripeSubscriptionId || !newPlan.stripePriceId) {
      // Can't get Stripe preview, return estimate
      const daysRemaining = subscription.currentPeriodEnd
        ? Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 30
      const daysInPeriod = 30
      const prorationFactor = daysRemaining / daysInPeriod
      const estimatedProration = Math.round(priceDifferenceCents * prorationFactor)

      return apiResponse({
        currentPlan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          monthlyPriceCents: subscription.plan.monthlyPriceCents,
          includedMinutes: subscription.plan.includedMinutes,
        },
        newPlan: {
          id: newPlan.id,
          name: newPlan.name,
          monthlyPriceCents: newPlan.monthlyPriceCents,
          includedMinutes: newPlan.includedMinutes,
        },
        isUpgrade,
        priceDifferenceCents,
        minutesDifference,
        prorationAmountCents: isUpgrade ? estimatedProration : 0,
        immediateCharge: isUpgrade && estimatedProration > 0,
        daysRemaining,
        isEstimate: true,
        message: isUpgrade
          ? `Estimated charge of $${(estimatedProration / 100).toFixed(2)} for the remainder of this billing period`
          : `Your plan will be downgraded. New price takes effect next billing period.`,
      })
    }

    // Get actual proration from Stripe
    const stripe = getStripe()

    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
        { stripeAccount: connectAccountId }
      )

      const subscriptionItemId = stripeSubscription.items.data[0]?.id
      if (!subscriptionItemId) {
        throw new Error("No subscription item found")
      }

      // Preview the upcoming invoice with the change
      const upcomingInvoice = await stripe.invoices.createPreview(
        {
          subscription: subscription.stripeSubscriptionId,
          subscription_items: [
            {
              id: subscriptionItemId,
              price: newPlan.stripePriceId,
            },
          ],
          subscription_proration_behavior: "create_prorations",
        },
        { stripeAccount: connectAccountId }
      )

      const prorationAmountCents = upcomingInvoice.amount_due || 0

      return apiResponse({
        currentPlan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          monthlyPriceCents: subscription.plan.monthlyPriceCents,
          includedMinutes: subscription.plan.includedMinutes,
        },
        newPlan: {
          id: newPlan.id,
          name: newPlan.name,
          monthlyPriceCents: newPlan.monthlyPriceCents,
          includedMinutes: newPlan.includedMinutes,
        },
        isUpgrade,
        priceDifferenceCents,
        minutesDifference,
        prorationAmountCents,
        immediateCharge: prorationAmountCents > 0,
        isEstimate: false,
        message: prorationAmountCents > 0
          ? `You will be charged $${(prorationAmountCents / 100).toFixed(2)} now for the prorated difference`
          : isUpgrade
            ? "Upgrade will be applied immediately"
            : "Downgrade will be applied immediately with credit for unused time",
      })
    } catch (stripeError) {
      console.error("Stripe preview error:", stripeError)
      
      // Fallback to estimate
      return apiResponse({
        currentPlan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          monthlyPriceCents: subscription.plan.monthlyPriceCents,
          includedMinutes: subscription.plan.includedMinutes,
        },
        newPlan: {
          id: newPlan.id,
          name: newPlan.name,
          monthlyPriceCents: newPlan.monthlyPriceCents,
          includedMinutes: newPlan.includedMinutes,
        },
        isUpgrade,
        priceDifferenceCents,
        minutesDifference,
        prorationAmountCents: isUpgrade ? priceDifferenceCents : 0,
        immediateCharge: isUpgrade,
        isEstimate: true,
        message: "Could not calculate exact proration. Estimate shown.",
      })
    }
  } catch (error) {
    console.error("POST /api/w/[slug]/subscription/preview error:", error)
    return serverError((error as Error).message)
  }
}


/**
 * Workspace Subscription API
 * GET    - Get current subscription status
 * POST   - Subscribe to a plan (creates Stripe Checkout)
 * DELETE - Cancel subscription
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "@/lib/stripe"
import { env } from "@/lib/env"

type RouteParams = { params: Promise<{ workspaceSlug: string }> }

const subscribeSchema = z.object({
  planId: z.string().uuid(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})

const changePlanSchema = z.object({
  newPlanId: z.string().uuid(),
  immediate: z.boolean().default(true), // true = prorate now, false = change at period end
})

// GET - Get current subscription
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug } = await params
    
    const context = await getWorkspaceContext(workspaceSlug)
    if (!context) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get subscription with plan details
    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            description: true,
            monthlyPriceCents: true,
            includedMinutes: true,
            overageRateCents: true,
            features: true,
            maxAgents: true,
            maxConversationsPerMonth: true,
          },
        },
      },
    })

    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/e7abe0ce-adad-4c04-8933-7a7770164db8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'subscription/route.ts:GET',message:'Subscription fetched',data:{found:!!subscription,status:subscription?.status,planName:subscription?.plan?.name,workspaceId:context.workspace.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B-C'})}).catch(()=>{});
    // #endregion

    if (!subscription) {
      return apiResponse({
        hasSubscription: false,
        subscription: null,
      })
    }

    // Incomplete subscriptions should not be treated as active subscriptions
    // They represent a checkout that was started but not completed
    if (subscription.status === "incomplete") {
      return apiResponse({
        hasSubscription: false,
        subscription: null,
        pendingCheckout: true,
        pendingPlan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
        },
      })
    }

    // Calculate usage
    const includedMinutes = subscription.plan.includedMinutes
    const usedMinutes = subscription.minutesUsedThisPeriod
    const remainingMinutes = Math.max(0, includedMinutes - usedMinutes)
    const overageMinutes = Math.max(0, usedMinutes - includedMinutes)

    return apiResponse({
      hasSubscription: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        plan: subscription.plan,
        currentPeriodStart: subscription.currentPeriodStart?.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
        usage: {
          includedMinutes,
          usedMinutes,
          remainingMinutes,
          overageMinutes,
          overageChargesCents: subscription.overageChargesCents,
        },
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt?.toISOString(),
        trialEnd: subscription.trialEnd?.toISOString(),
        createdAt: subscription.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/subscription error:", error)
    return serverError((error as Error).message)
  }
}

// POST - Subscribe to a plan
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

    // Parse request
    const body = await request.json()
    const parsed = subscribeSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request")
    }

    const { planId, successUrl, cancelUrl } = parsed.data

    // Check if already subscribed
    const existingSubscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: context.workspace.id },
    })

    if (existingSubscription && existingSubscription.status === "active") {
      return apiError("Workspace already has an active subscription. Use plan change to switch plans.")
    }
    
    // If there's an incomplete subscription for a different plan, delete it first
    if (existingSubscription && existingSubscription.status === "incomplete" && existingSubscription.planId !== planId) {
      await prisma.workspaceSubscription.delete({
        where: { id: existingSubscription.id },
      })
    }

    // Get the plan
    const plan = await prisma.workspaceSubscriptionPlan.findFirst({
      where: {
        id: planId,
        partnerId: context.workspace.partner_id,
        isActive: true,
      },
    })

    if (!plan) {
      return notFound("Subscription plan")
    }

    // Get partner's Connect account
    const partner = await prisma.partner.findUnique({
      where: { id: context.workspace.partner_id },
      select: { id: true, name: true, settings: true },
    })

    if (!partner) {
      return serverError("Partner not found")
    }

    const connectAccountId = getConnectAccountId(partner.settings as Record<string, unknown>)

    // If plan is free, create subscription directly
    if (plan.monthlyPriceCents === 0) {
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setMonth(periodEnd.getMonth() + 1)

      const subscription = await prisma.workspaceSubscription.upsert({
        where: { workspaceId: context.workspace.id },
        create: {
          workspaceId: context.workspace.id,
          planId: plan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        update: {
          planId: plan.id,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          minutesUsedThisPeriod: 0,
          overageChargesCents: 0,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      })

      return apiResponse({
        subscription: {
          id: subscription.id,
          status: subscription.status,
          planId: plan.id,
          planName: plan.name,
        },
        checkoutUrl: null, // No payment needed
      }, 201)
    }

    // Paid plan - need Stripe checkout
    if (!connectAccountId) {
      return apiError("Partner has not set up payment processing. Contact your partner.")
    }

    if (!plan.stripePriceId) {
      return apiError("Plan is not configured for payments. Contact your partner.")
    }

    const stripe = getStripe()

    // Get or create workspace customer on Connect account
    let stripeCustomerId = existingSubscription?.stripeCustomerId

    if (!stripeCustomerId) {
      // Create customer on Connect account
      const customer = await stripe.customers.create(
        {
          email: context.user?.email,
          name: context.workspace.name,
          metadata: {
            workspace_id: context.workspace.id,
            workspace_slug: context.workspace.slug,
            partner_id: context.workspace.partner_id,
          },
        },
        { stripeAccount: connectAccountId }
      )
      stripeCustomerId = customer.id
    }

    // Determine URLs
    const baseUrl = env.appUrl || request.headers.get("origin") || ""
    const defaultSuccessUrl = `${baseUrl}/w/${workspaceSlug}/billing?subscription=success`
    const defaultCancelUrl = `${baseUrl}/w/${workspaceSlug}/billing?subscription=canceled`

    // Create Checkout Session on Connect account
    const session = await stripe.checkout.sessions.create(
      {
        customer: stripeCustomerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: successUrl || defaultSuccessUrl,
        cancel_url: cancelUrl || defaultCancelUrl,
        subscription_data: {
          metadata: {
            workspace_id: context.workspace.id,
            plan_id: plan.id,
            partner_id: context.workspace.partner_id,
          },
        },
        metadata: {
          workspace_id: context.workspace.id,
          plan_id: plan.id,
          type: "workspace_subscription",
        },
      },
      { stripeAccount: connectAccountId }
    )

    // Create/update subscription record as incomplete
    await prisma.workspaceSubscription.upsert({
      where: { workspaceId: context.workspace.id },
      create: {
        workspaceId: context.workspace.id,
        planId: plan.id,
        stripeCustomerId,
        status: "incomplete",
      },
      update: {
        planId: plan.id,
        stripeCustomerId,
        status: "incomplete",
      },
    })

    return apiResponse({
      checkoutUrl: session.url,
      sessionId: session.id,
    })
  } catch (error) {
    console.error("POST /api/w/[slug]/subscription error:", error)
    return serverError((error as Error).message)
  }
}

// PATCH - Change subscription plan (upgrade/downgrade with proration)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug } = await params
    
    const context = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])
    if (!context) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Parse request
    const body = await request.json()
    const parsed = changePlanSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request")
    }

    const { newPlanId, immediate } = parsed.data

    // Get current subscription
    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: {
        plan: {
          select: { id: true, name: true, partnerId: true, monthlyPriceCents: true },
        },
      },
    })

    if (!subscription) {
      return apiError("No active subscription to change")
    }

    if (subscription.status !== "active") {
      return apiError("Can only change active subscriptions")
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

    // Get partner's Connect account
    const partner = await prisma.partner.findUnique({
      where: { id: context.workspace.partner_id },
      select: { settings: true },
    })

    const connectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown>)

    // Handle free plan changes locally (no Stripe involved)
    if (subscription.plan.monthlyPriceCents === 0 && newPlan.monthlyPriceCents === 0) {
      // Free to free - just update locally
      await prisma.workspaceSubscription.update({
        where: { id: subscription.id },
        data: { planId: newPlanId },
      })

      return apiResponse({
        message: "Plan changed successfully",
        oldPlan: subscription.plan.name,
        newPlan: newPlan.name,
        prorationAmount: 0,
      })
    }

    // If changing from free to paid, need checkout
    if (subscription.plan.monthlyPriceCents === 0 && newPlan.monthlyPriceCents > 0) {
      return apiError("To upgrade to a paid plan, please cancel and subscribe to the new plan.")
    }

    // Paid plan changes require Stripe
    if (!connectAccountId || !subscription.stripeSubscriptionId) {
      return apiError("Cannot change plan: Stripe subscription not found")
    }

    if (!newPlan.stripePriceId) {
      return apiError("New plan is not configured for payments")
    }

    const stripe = getStripe()

    // Get current Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
      { stripeAccount: connectAccountId }
    )

    const subscriptionItemId = stripeSubscription.items.data[0]?.id
    if (!subscriptionItemId) {
      return apiError("Subscription has no items")
    }

    // Determine proration behavior based on upgrade vs downgrade
    const isUpgrade = newPlan.monthlyPriceCents > subscription.plan.monthlyPriceCents
    
    // For upgrades: charge immediately
    // For downgrades: credit on next invoice
    const prorationBehavior = immediate 
      ? (isUpgrade ? "always_invoice" : "create_prorations")
      : "none"

    // Update the subscription with proration
    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [
          {
            id: subscriptionItemId,
            price: newPlan.stripePriceId,
          },
        ],
        proration_behavior: prorationBehavior,
        metadata: {
          workspace_id: context.workspace.id,
          plan_id: newPlanId,
          partner_id: context.workspace.partner_id,
        },
      },
      { stripeAccount: connectAccountId }
    )

    // Update local subscription record
    await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: {
        planId: newPlanId,
        // If downgrading with schedule, keep current period; Stripe handles the rest
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    })

    // Calculate proration info (isUpgrade already calculated above)
    const priceDifference = newPlan.monthlyPriceCents - subscription.plan.monthlyPriceCents

    return apiResponse({
      message: `Plan ${isUpgrade ? "upgraded" : "downgraded"} successfully`,
      oldPlan: subscription.plan.name,
      newPlan: newPlan.name,
      isUpgrade,
      immediate,
      priceDifferenceCents: priceDifference,
      stripeSubscriptionId: updatedSubscription.id,
    })
  } catch (error) {
    console.error("PATCH /api/w/[slug]/subscription error:", error)
    return serverError((error as Error).message)
  }
}

// DELETE - Cancel subscription
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug } = await params
    
    const context = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])
    if (!context) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    const subscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: {
        plan: {
          select: { partnerId: true },
        },
      },
    })

    if (!subscription) {
      return notFound("Subscription")
    }

    if (subscription.status === "canceled") {
      return apiError("Subscription is already canceled")
    }

    // If there's a Stripe subscription, cancel it at period end
    if (subscription.stripeSubscriptionId) {
      const partner = await prisma.partner.findUnique({
        where: { id: subscription.plan.partnerId },
        select: { settings: true },
      })

      const connectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown>)

      if (connectAccountId) {
        try {
          const stripe = getStripe()
          await stripe.subscriptions.update(
            subscription.stripeSubscriptionId,
            { cancel_at_period_end: true },
            { stripeAccount: connectAccountId }
          )
        } catch (stripeError) {
          console.error("Failed to cancel Stripe subscription:", stripeError)
        }
      }
    }

    // Update local subscription
    await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      },
    })

    return apiResponse({
      message: "Subscription will be canceled at the end of the billing period",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString(),
    })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/subscription error:", error)
    return serverError((error as Error).message)
  }
}


/**
 * POST /api/webhooks/stripe-connect
 * Stripe Connect webhook handler for events from connected accounts
 * 
 * This endpoint receives events from partner Stripe Connect accounts
 * and handles:
 * - Workspace credit top-ups (payment_intent.succeeded)
 * - Workspace subscriptions (customer.subscription.*)
 */

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { applyWorkspaceTopup } from "@/lib/stripe/workspace-credits"
import { resetPostpaidPeriod } from "@/lib/stripe/postpaid-invoices"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"

// Disable body parsing - we need the raw body for signature verification
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const stripe = getStripe()

  try {
    // 1. Get raw body and signature
    const body = await request.text()
    const signature = request.headers.get("stripe-signature")
    const connectAccountId = request.headers.get("stripe-account")

    if (!signature) {
      console.error("[Stripe Connect Webhook] Missing stripe-signature header")
      return NextResponse.json({ error: "Missing signature" }, { status: 400 })
    }

    // 2. Verify webhook signature using Connect webhook secret
    const connectWebhookSecret = env.stripeConnectWebhookSecret
    if (!connectWebhookSecret) {
      console.error("[Stripe Connect Webhook] STRIPE_CONNECT_WEBHOOK_SECRET not configured")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, connectWebhookSecret)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      console.error("[Stripe Connect Webhook] Signature verification failed:", message)
      return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 })
    }

    console.log(`[Stripe Connect Webhook] Received event: ${event.type} (${event.id}) from account: ${connectAccountId || "platform"}`)

    // 3. Handle the event
    switch (event.type) {
      case "payment_intent.succeeded":
        await handleConnectPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      // Subscription events
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        console.log(`[Stripe Connect Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Stripe Connect Webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleConnectPaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log(`[Stripe Connect Webhook] PaymentIntent succeeded: ${paymentIntent.id}`)

  const { type, amount_cents, workspace_id } = paymentIntent.metadata || {}

  // Only handle workspace credits top-ups
  if (type !== "workspace_credits_topup" || !workspace_id) {
    console.log(`[Stripe Connect Webhook] PaymentIntent ${paymentIntent.id} is not a workspace credits top-up, skipping`)
    return
  }

  const amountCents = parseInt(amount_cents || "0", 10)
  if (isNaN(amountCents) || amountCents <= 0) {
    console.error(`[Stripe Connect Webhook] Invalid amount_cents in PaymentIntent metadata: ${amount_cents}`)
    return
  }

  // Apply the top-up (idempotent)
  const result = await applyWorkspaceTopup(workspace_id, amountCents, paymentIntent.id)

  if (result.alreadyApplied) {
    console.log(`[Stripe Connect Webhook] Workspace credits top-up already applied for PaymentIntent ${paymentIntent.id}`)
  } else {
    console.log(`[Stripe Connect Webhook] Workspace credits top-up applied: Workspace ${workspace_id}, Amount $${(amountCents / 100).toFixed(2)}`)
  }
}

// =============================================================================
// SUBSCRIPTION HANDLERS
// =============================================================================

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log(`[Stripe Connect Webhook] Subscription updated: ${subscription.id}`)

  if (!prisma) {
    console.error("[Stripe Connect Webhook] Database not configured")
    return
  }

  const { workspace_id, plan_id } = subscription.metadata || {}

  if (!workspace_id) {
    console.log(`[Stripe Connect Webhook] Subscription ${subscription.id} has no workspace_id metadata, skipping`)
    return
  }

  if (!plan_id) {
    console.log(`[Stripe Connect Webhook] Subscription ${subscription.id} has no plan_id metadata, skipping`)
    return
  }

  // Map Stripe status to our status
  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    incomplete_expired: "canceled",
    trialing: "trialing",
    unpaid: "past_due",
    paused: "paused",
  }

  const status = statusMap[subscription.status] || "incomplete"

  try {
    // Check if subscription exists to determine if this is an update or create
    const existingSub = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: workspace_id },
      include: {
        plan: {
          select: { billingType: true },
        },
      },
    })

    // Get billing period from subscription items (Stripe SDK v20+ type changes)
    const subscriptionItem = subscription.items.data[0]
    const currentPeriodStart = subscriptionItem?.current_period_start
    const currentPeriodEnd = subscriptionItem?.current_period_end

    const baseData = {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: typeof subscription.customer === "string" 
        ? subscription.customer 
        : subscription.customer?.id,
      status: status as "active" | "past_due" | "canceled" | "incomplete" | "trialing" | "paused",
      currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart * 1000) : null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at 
        ? new Date(subscription.canceled_at * 1000) 
        : null,
      trialStart: subscription.trial_start 
        ? new Date(subscription.trial_start * 1000) 
        : null,
      trialEnd: subscription.trial_end 
        ? new Date(subscription.trial_end * 1000) 
        : null,
    }

    await prisma.workspaceSubscription.upsert({
      where: { workspaceId: workspace_id },
      create: {
        workspaceId: workspace_id,
        planId: plan_id,
        ...baseData,
      },
      update: {
        ...baseData,
        // Note: Usage resets are handled in handleInvoicePaymentSucceeded
        // Don't reset here to avoid race conditions with postpaid invoicing
      },
    })

    console.log(`[Stripe Connect Webhook] Subscription ${subscription.id} updated for workspace ${workspace_id}, status: ${status}`)
  } catch (error) {
    console.error(`[Stripe Connect Webhook] Failed to update subscription ${subscription.id}:`, error)
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log(`[Stripe Connect Webhook] Subscription deleted: ${subscription.id}`)

  if (!prisma) {
    console.error("[Stripe Connect Webhook] Database not configured")
    return
  }

  const { workspace_id } = subscription.metadata || {}

  if (!workspace_id) {
    // Try to find by stripe subscription ID
    const existingSub = await prisma.workspaceSubscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    })

    if (existingSub) {
      await prisma.workspaceSubscription.update({
        where: { id: existingSub.id },
        data: {
          status: "canceled",
          canceledAt: new Date(),
        },
      })
      console.log(`[Stripe Connect Webhook] Subscription ${subscription.id} marked as canceled`)
    }
    return
  }

  try {
    await prisma.workspaceSubscription.update({
      where: { workspaceId: workspace_id },
      data: {
        status: "canceled",
        canceledAt: new Date(),
      },
    })

    console.log(`[Stripe Connect Webhook] Subscription ${subscription.id} canceled for workspace ${workspace_id}`)
  } catch (error) {
    console.error(`[Stripe Connect Webhook] Failed to cancel subscription ${subscription.id}:`, error)
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log(`[Stripe Connect Webhook] Invoice payment succeeded: ${invoice.id}`)

  if (!prisma) {
    console.error("[Stripe Connect Webhook] Database not configured")
    return
  }

  // Check if this is a postpaid usage invoice (not a subscription invoice)
  const invoiceMetadata = invoice.metadata || {}
  if (invoiceMetadata.type === "postpaid_usage" && invoiceMetadata.subscription_id) {
    // This is a postpaid usage invoice - reset the period
    console.log(`[Stripe Connect Webhook] Postpaid invoice paid: ${invoice.id}`)
    
    try {
      const result = await resetPostpaidPeriod(invoiceMetadata.subscription_id)
      console.log(
        `[Stripe Connect Webhook] Postpaid period reset: ${result.previousUsage} min, ` +
        `$${(result.previousCharges / 100).toFixed(2)}`
      )
    } catch (error) {
      console.error(`[Stripe Connect Webhook] Failed to reset postpaid period:`, error)
    }
    return
  }

  // Handle regular subscription invoices
  if (!invoice.subscription) {
    return
  }

  const subscriptionId = typeof invoice.subscription === "string" 
    ? invoice.subscription 
    : invoice.subscription.id

  try {
    // Get the subscription to check billing type
    const subscription = await prisma.workspaceSubscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      include: {
        plan: {
          select: { billingType: true },
        },
      },
    })

    if (!subscription) {
      console.log(`[Stripe Connect Webhook] Subscription ${subscriptionId} not found in database`)
      return
    }

    // Reset usage for the new billing period
    const updateData: Record<string, unknown> = {
      minutesUsedThisPeriod: 0,
      overageChargesCents: 0,
      status: "active",
    }

    // For postpaid subscriptions, also reset postpaid counters
    if (subscription.plan.billingType === "postpaid") {
      updateData.postpaidMinutesUsed = 0
      updateData.pendingInvoiceAmountCents = 0
    }

    await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: updateData,
    })

    console.log(`[Stripe Connect Webhook] Reset usage for subscription ${subscriptionId} (${subscription.plan.billingType})`)
  } catch (error) {
    console.error(`[Stripe Connect Webhook] Failed to reset usage for invoice ${invoice.id}:`, error)
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log(`[Stripe Connect Webhook] Invoice payment failed: ${invoice.id}`)

  if (!invoice.subscription) {
    return
  }

  if (!prisma) {
    console.error("[Stripe Connect Webhook] Database not configured")
    return
  }

  const subscriptionId = typeof invoice.subscription === "string" 
    ? invoice.subscription 
    : invoice.subscription.id

  try {
    await prisma.workspaceSubscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        status: "past_due",
      },
    })

    console.log(`[Stripe Connect Webhook] Marked subscription ${subscriptionId} as past_due`)
    
    // TODO: Send notification to workspace members about payment failure
  } catch (error) {
    console.error(`[Stripe Connect Webhook] Failed to update status for invoice ${invoice.id}:`, error)
  }
}


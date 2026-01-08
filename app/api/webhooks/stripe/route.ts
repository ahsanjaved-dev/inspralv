/**
 * POST /api/webhooks/stripe
 * Stripe webhook handler for subscription and payment events
 * 
 * This endpoint receives events from Stripe and updates the database accordingly.
 * It verifies webhook signatures to ensure authenticity.
 */

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { constructWebhookEvent, getPlanFromPriceId } from "@/lib/stripe"
import { applyTopup } from "@/lib/stripe/credits"
import { prisma } from "@/lib/prisma"
import { sendPaymentFailedEmail } from "@/lib/email/send"
import { env } from "@/lib/env"

// Disable body parsing - we need the raw body for signature verification
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  let event: Stripe.Event

  try {
    // 1. Get raw body and signature
    const body = await request.text()
    const signature = request.headers.get("stripe-signature")

    if (!signature) {
      console.error("[Stripe Webhook] Missing stripe-signature header")
      return NextResponse.json({ error: "Missing signature" }, { status: 400 })
    }

    // 2. Verify webhook signature
    try {
      event = constructWebhookEvent(body, signature)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      console.error("[Stripe Webhook] Signature verification failed:", message)
      return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 })
    }

    console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`)

    // 3. Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Stripe Webhook] Error processing webhook:", error)
    // Return 200 to prevent Stripe from retrying (we've logged the error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (!prisma) return
  console.log(`[Stripe Webhook] Checkout session completed: ${session.id}`)

  const partnerId = session.metadata?.partner_id
  const planTier = session.metadata?.plan_tier
  const type = session.metadata?.type
  const workspaceId = session.metadata?.workspace_id

  // Handle workspace subscription checkout (from public signups)
  if (type === "workspace_subscription" && workspaceId) {
    console.log(`[Stripe Webhook] Workspace subscription checkout completed: ${session.id} for workspace ${workspaceId}`)
    // The actual subscription update will be handled by customer.subscription.created/updated
    return
  }

  // Handle partner subscription checkout
  if (!partnerId) {
    console.error("[Stripe Webhook] No partner_id in checkout session metadata")
    return
  }

  // The subscription will be created separately and handled by customer.subscription.created
  // But we can update the customer ID here if needed
  if (session.customer && typeof session.customer === "string") {
    await prisma.partner.update({
      where: { id: partnerId },
      data: {
        stripeCustomerId: session.customer,
      },
    })
  }

  console.log(`[Stripe Webhook] Partner ${partnerId} completed checkout for ${planTier} plan`)
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  if (!prisma) return
  console.log(`[Stripe Webhook] Subscription updated: ${subscription.id}, status: ${subscription.status}`)
  console.log(`[Stripe Webhook] Subscription metadata:`, JSON.stringify(subscription.metadata, null, 2))

  const workspaceId = subscription.metadata?.workspace_id
  const partnerId = subscription.metadata?.partner_id
  const planId = subscription.metadata?.plan_id
  const type = subscription.metadata?.type

  // Handle workspace subscription (from public signups using main Stripe account)
  if (type === "workspace_subscription" && workspaceId && planId) {
    console.log(`[Stripe Webhook] Updating workspace subscription for workspace ${workspaceId}`)
    try {
      await updateWorkspaceSubscription(workspaceId, planId, subscription)
      console.log(`[Stripe Webhook] Successfully updated workspace subscription`)
    } catch (error) {
      console.error(`[Stripe Webhook] Error updating workspace subscription:`, error)
      throw error
    }
    return
  }

  // Handle partner subscription
  if (!partnerId) {
    // Try to find partner by customer ID
    const customerId = typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id

    if (customerId) {
      const partner = await prisma.partner.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      })

      if (partner) {
        await updatePartnerSubscription(partner.id, subscription)
        return
      }
    }

    console.error("[Stripe Webhook] Could not find partner or workspace for subscription:", subscription.id)
    return
  }

  await updatePartnerSubscription(partnerId, subscription)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  if (!prisma) return
  console.log(`[Stripe Webhook] Subscription deleted: ${subscription.id}`)

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id

  if (!customerId) {
    console.error("[Stripe Webhook] No customer ID in deleted subscription")
    return
  }

  // Find partner by customer ID
  const partner = await prisma.partner.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  })

  if (!partner) {
    console.error("[Stripe Webhook] Partner not found for customer:", customerId)
    return
  }

  // Update partner - subscription cancelled
  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      subscriptionStatus: "canceled",
      // Keep the subscription ID for reference
    },
  })

  console.log(`[Stripe Webhook] Partner ${partner.id} subscription marked as canceled`)
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!prisma) return
  console.log(`[Stripe Webhook] Invoice paid: ${invoice.id}`)

  // For subscription invoices, the subscription update event will handle status
  // This is useful for tracking payments and potentially adding credits

  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id

  if (!customerId) return

  const partner = await prisma.partner.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  })

  if (partner) {
    console.log(`[Stripe Webhook] Invoice paid for partner ${partner.id}: $${(invoice.amount_paid / 100).toFixed(2)}`)
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!prisma) return
  console.log(`[Stripe Webhook] Invoice payment failed: ${invoice.id}`)

  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id

  if (!customerId) return

  const partner = await prisma.partner.findUnique({
    where: { stripeCustomerId: customerId },
    select: {
      id: true,
      name: true,
      planTier: true,
      members: {
        where: {
          role: { in: ["owner", "admin"] },
          removedAt: null,
        },
        select: {
          user: {
            select: {
              email: true,
            },
          },
        },
      },
    },
  })

  if (partner) {
    // Update status to past_due
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        subscriptionStatus: "past_due",
      },
    })

    console.log(`[Stripe Webhook] Partner ${partner.id} marked as past_due due to failed payment`)

    // Send email notification to all partner admins
    const adminEmails = partner.members.map((m) => m.user.email).filter(Boolean)

    if (adminEmails.length > 0) {
      try {
        const planName = partner.planTier.charAt(0).toUpperCase() + partner.planTier.slice(1)
        const amountDue = invoice.amount_due ? (invoice.amount_due / 100).toFixed(2) : "0.00"
        const attemptDate = invoice.created ? new Date(invoice.created * 1000).toLocaleDateString() : new Date().toLocaleDateString()
        const updatePaymentUrl = `${env.appUrl}/org/billing`

        await sendPaymentFailedEmail(adminEmails, {
          partner_name: partner.name,
          plan_name: planName,
          amount_due: amountDue,
          attempt_date: attemptDate,
          update_payment_url: updatePaymentUrl,
        })

        console.log(`[Stripe Webhook] Payment failure notification sent to ${adminEmails.length} admin(s)`)
      } catch (error) {
        console.error(`[Stripe Webhook] Failed to send payment failure email:`, error)
        // Don't fail the webhook if email fails
      }
    } else {
      console.warn(`[Stripe Webhook] No admin emails found for partner ${partner.id}`)
    }
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log(`[Stripe Webhook] PaymentIntent succeeded: ${paymentIntent.id}`)

  const { type, amount_cents, partner_id } = paymentIntent.metadata || {}

  const amountCents = parseInt(amount_cents || "0", 10)
  if (isNaN(amountCents) || amountCents <= 0) {
    console.log(`[Stripe Webhook] PaymentIntent ${paymentIntent.id} has no valid amount_cents, skipping`)
    return
  }

  // Handle partner-level credits top-up (platform payments)
  // Note: Workspace top-ups are handled by the Connect webhook (/api/webhooks/stripe-connect)
  if (type === "credits_topup" && partner_id) {
    const result = await applyTopup(partner_id, amountCents, paymentIntent.id)

    if (result.alreadyApplied) {
      console.log(`[Stripe Webhook] Partner credits top-up already applied for PaymentIntent ${paymentIntent.id}`)
    } else {
      console.log(`[Stripe Webhook] Partner credits top-up applied: Partner ${partner_id}, Amount $${(amountCents / 100).toFixed(2)}`)
    }
    return
  }

  console.log(`[Stripe Webhook] PaymentIntent ${paymentIntent.id} type "${type}" not handled by platform webhook`)
}

// =============================================================================
// HELPERS
// =============================================================================

async function updatePartnerSubscription(partnerId: string, subscription: Stripe.Subscription) {
  if (!prisma) return

  // Get the price ID from the subscription
  const priceId = subscription.items.data[0]?.price?.id
  const planTier = priceId ? getPlanFromPriceId(priceId) : null

  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      ...(planTier && { planTier }),
    },
  })

  console.log(`[Stripe Webhook] Partner ${partnerId} subscription updated: status=${subscription.status}, plan=${planTier || "unknown"}`)
}

async function updateWorkspaceSubscription(workspaceId: string, planId: string, subscription: Stripe.Subscription) {
  if (!prisma) return

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

  // Get billing period from subscription
  const currentPeriodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : null
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id

  await prisma.workspaceSubscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      planId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      status: status as "active" | "past_due" | "canceled" | "incomplete" | "trialing" | "paused",
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
    update: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      status: status as "active" | "past_due" | "canceled" | "incomplete" | "trialing" | "paused",
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
  })

  console.log(`[Stripe Webhook] Workspace ${workspaceId} subscription updated: status=${status}`)
}


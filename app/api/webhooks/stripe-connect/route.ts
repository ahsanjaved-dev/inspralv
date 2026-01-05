/**
 * POST /api/webhooks/stripe-connect
 * Stripe Connect webhook handler for events from connected accounts
 * 
 * This endpoint receives events from partner Stripe Connect accounts
 * and handles workspace credit top-ups.
 */

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { applyWorkspaceTopup } from "@/lib/stripe/workspace-credits"
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


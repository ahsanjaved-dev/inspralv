/**
 * Stripe Client Configuration
 * Platform Stripe client for managing subscriptions and payments
 */

import Stripe from "stripe"
import { env } from "@/lib/env"

// Validate Stripe is configured
function getStripeClient(): Stripe {
  if (!env.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured")
  }

  return new Stripe(env.stripeSecretKey, {
    apiVersion: "2025-12-15.clover",
    typescript: true,
  })
}

// Lazy-loaded Stripe client
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = getStripeClient()
  }
  return _stripe
}

// For direct access (will throw if not configured)
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return getStripe()[prop as keyof Stripe]
  },
})

// =============================================================================
// PRICE ID HELPERS
// =============================================================================

export type PlanTier = "starter" | "professional" | "enterprise"

export function getPriceIdForPlan(tier: PlanTier): string | null {
  switch (tier) {
    case "starter":
      return env.stripePriceStarter || null
    case "professional":
      return env.stripePriceProfessional || null
    case "enterprise":
      return env.stripePriceEnterprise || null
    default:
      return null
  }
}

export function getPlanFromPriceId(priceId: string): PlanTier | null {
  if (priceId === env.stripePriceStarter) return "starter"
  if (priceId === env.stripePriceProfessional) return "professional"
  if (priceId === env.stripePriceEnterprise) return "enterprise"
  return null
}

// =============================================================================
// CUSTOMER HELPERS
// =============================================================================

/**
 * Get or create a Stripe customer for a partner
 */
export async function getOrCreateCustomer(
  partnerId: string,
  email: string,
  name: string,
  existingCustomerId?: string | null
): Promise<Stripe.Customer> {
  const stripeClient = getStripe()

  // If we already have a customer ID, retrieve it
  if (existingCustomerId) {
    try {
      const customer = await stripeClient.customers.retrieve(existingCustomerId)
      if (!customer.deleted) {
        return customer as Stripe.Customer
      }
    } catch {
      // Customer doesn't exist, create new one
    }
  }

  // Create new customer
  return stripeClient.customers.create({
    email,
    name,
    metadata: {
      partner_id: partnerId,
    },
  })
}

// =============================================================================
// SUBSCRIPTION HELPERS
// =============================================================================

/**
 * Update an existing subscription to a new plan
 * Returns proration details
 */
export async function updateSubscriptionPlan(
  subscriptionId: string,
  newPriceId: string
): Promise<{
  subscription: Stripe.Subscription
  prorationAmount: number
  immediateCharge: boolean
}> {
  const stripeClient = getStripe()

  // Get current subscription to check proration
  const currentSubscription = await stripeClient.subscriptions.retrieve(subscriptionId)

  // Get the subscription item ID (assuming single-item subscriptions)
  const subscriptionItemId = currentSubscription.items.data[0]?.id
  if (!subscriptionItemId) {
    throw new Error("Subscription has no items")
  }

  // Update the subscription with proration
  const updatedSubscription = await stripeClient.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscriptionItemId,
        price: newPriceId,
      },
    ],
    proration_behavior: "create_prorations", // Create prorations for upgrades/downgrades
    billing_cycle_anchor: "unchanged", // Keep the same billing cycle
  })

  // Calculate proration amount from the upcoming invoice
  let prorationAmount = 0
  let immediateCharge = false

  // Get the upcoming invoice to see proration details
  try {
    const upcomingInvoice = await stripeClient.invoices.createPreview({
      subscription: subscriptionId,
    })

    // Use the total amount due as the proration amount
    prorationAmount = upcomingInvoice.amount_due

    // Check if there will be an immediate charge
    immediateCharge = prorationAmount > 0
  } catch {
    // Upcoming invoice might not be available immediately
  }

  return {
    subscription: updatedSubscription,
    prorationAmount,
    immediateCharge,
  }
}

/**
 * Get proration preview without actually changing the subscription
 */
export async function previewSubscriptionChange(
  subscriptionId: string,
  newPriceId: string
): Promise<{
  prorationAmount: number
  prorationDate: number
  nextBillingDate: number
  immediateCharge: boolean
}> {
  const stripeClient = getStripe()

  const currentSubscription = await stripeClient.subscriptions.retrieve(subscriptionId)
  const subscriptionItemId = currentSubscription.items.data[0]?.id

  if (!subscriptionItemId) {
    throw new Error("Subscription has no items")
  }

  // Preview the change
  const upcomingInvoice = await stripeClient.invoices.createPreview({
    subscription: subscriptionId,
    subscription_details: {
      items: [
        {
          id: subscriptionItemId,
          price: newPriceId,
        },
      ],
      proration_behavior: "create_prorations",
    },
  })

  // Use the total amount due as the proration amount
  const prorationAmount = upcomingInvoice.amount_due

  return {
    prorationAmount,
    prorationDate: upcomingInvoice.period_start,
    nextBillingDate: upcomingInvoice.period_end,
    immediateCharge: prorationAmount > 0,
  }
}

// =============================================================================
// STRIPE CONNECT HELPERS
// =============================================================================

/**
 * Extract Stripe Connect account ID from partner settings
 * Handles both snake_case and camelCase keys for backwards compatibility
 */
export function getConnectAccountId(
  settings: Record<string, unknown> | null | undefined
): string | undefined {
  if (!settings) return undefined
  // Check both snake_case (canonical) and camelCase (legacy reads)
  return (
    (settings.stripe_connect_account_id as string | undefined) ||
    (settings.stripeConnectAccountId as string | undefined)
  )
}

// =============================================================================
// WEBHOOK SIGNATURE VERIFICATION
// =============================================================================

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!env.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured")
  }

  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    env.stripeWebhookSecret
  )
}


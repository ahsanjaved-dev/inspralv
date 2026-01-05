/**
 * Postpaid Invoice Generation
 * 
 * Handles generating and sending Stripe invoices for postpaid subscriptions
 * at the end of each billing period.
 */

import { prisma } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "./index"
import type Stripe from "stripe"

// =============================================================================
// TYPES
// =============================================================================

export interface PostpaidInvoiceResult {
  success: boolean
  invoiceId?: string
  invoiceUrl?: string
  amountCents: number
  minutesUsed: number
  message: string
}

export interface PostpaidSubscriptionInfo {
  subscriptionId: string
  workspaceId: string
  workspaceName: string
  planName: string
  postpaidMinutesUsed: number
  pendingInvoiceAmountCents: number
  overageRateCents: number
  stripeCustomerId: string | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
}

// =============================================================================
// GET POSTPAID SUBSCRIPTIONS DUE FOR INVOICING
// =============================================================================

/**
 * Get all postpaid subscriptions that are due for invoicing
 * (period has ended and there's usage to invoice)
 */
export async function getPostpaidSubscriptionsDueForInvoicing(
  partnerId: string
): Promise<PostpaidSubscriptionInfo[]> {
  if (!prisma) throw new Error("Database not configured")

  const now = new Date()

  const subscriptions = await prisma.workspaceSubscription.findMany({
    where: {
      status: "active",
      pendingInvoiceAmountCents: { gt: 0 },
      currentPeriodEnd: { lte: now },
      plan: {
        billingType: "postpaid",
        partnerId: partnerId,
      },
    },
    include: {
      plan: {
        select: {
          name: true,
          overageRateCents: true,
        },
      },
    },
  })

  // Get workspace names
  const workspaceIds = subscriptions.map((s) => s.workspaceId)
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, name: true },
  })
  const workspaceMap = new Map(workspaces.map((w) => [w.id, w.name]))

  return subscriptions.map((sub) => ({
    subscriptionId: sub.id,
    workspaceId: sub.workspaceId,
    workspaceName: workspaceMap.get(sub.workspaceId) || "Unknown Workspace",
    planName: sub.plan.name,
    postpaidMinutesUsed: sub.postpaidMinutesUsed,
    pendingInvoiceAmountCents: sub.pendingInvoiceAmountCents,
    overageRateCents: sub.plan.overageRateCents,
    stripeCustomerId: sub.stripeCustomerId,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
  }))
}

// =============================================================================
// GENERATE POSTPAID INVOICE
// =============================================================================

/**
 * Generate and send a Stripe invoice for a postpaid subscription
 * This creates an invoice on the Partner's Connect account
 */
export async function generatePostpaidInvoice(
  subscriptionId: string,
  partnerId: string
): Promise<PostpaidInvoiceResult> {
  if (!prisma) throw new Error("Database not configured")

  const stripe = getStripe()

  // Get subscription details
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: {
        select: {
          name: true,
          billingType: true,
          overageRateCents: true,
          partner: {
            select: {
              id: true,
              settings: true,
            },
          },
        },
      },
    },
  })

  if (!subscription) {
    return {
      success: false,
      amountCents: 0,
      minutesUsed: 0,
      message: "Subscription not found",
    }
  }

  if (subscription.plan.billingType !== "postpaid") {
    return {
      success: false,
      amountCents: 0,
      minutesUsed: 0,
      message: "Not a postpaid subscription",
    }
  }

  if (subscription.pendingInvoiceAmountCents <= 0) {
    return {
      success: false,
      amountCents: 0,
      minutesUsed: 0,
      message: "No usage to invoice",
    }
  }

  // Get Connect account ID
  const connectAccountId = getConnectAccountId(
    subscription.plan.partner.settings as Record<string, unknown>
  )

  if (!connectAccountId) {
    return {
      success: false,
      amountCents: subscription.pendingInvoiceAmountCents,
      minutesUsed: subscription.postpaidMinutesUsed,
      message: "Partner has not completed Stripe Connect onboarding",
    }
  }

  // Get workspace name for invoice description
  const workspace = await prisma.workspace.findUnique({
    where: { id: subscription.workspaceId },
    select: { name: true },
  })

  const workspaceName = workspace?.name || "Workspace"
  const periodStart = subscription.currentPeriodStart
  const periodEnd = subscription.currentPeriodEnd

  try {
    // Create or get customer on Connect account
    let customerId = subscription.stripeCustomerId

    if (!customerId) {
      // Create a new customer on the Connect account
      const customer = await stripe.customers.create(
        {
          name: workspaceName,
          metadata: {
            workspace_id: subscription.workspaceId,
            subscription_id: subscription.id,
          },
        },
        { stripeAccount: connectAccountId }
      )
      customerId = customer.id

      // Save customer ID to subscription
      await prisma.workspaceSubscription.update({
        where: { id: subscription.id },
        data: { stripeCustomerId: customerId },
      })
    }

    // Format period for description
    const formatDate = (d: Date | null) =>
      d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A"

    const periodDescription = `${formatDate(periodStart)} - ${formatDate(periodEnd)}`
    const ratePerMinute = subscription.plan.overageRateCents / 100

    // Create invoice
    const invoice = await stripe.invoices.create(
      {
        customer: customerId,
        auto_advance: true, // Automatically finalize and attempt payment
        collection_method: "send_invoice",
        days_until_due: 7, // 7 days to pay
        description: `Voice usage for ${workspaceName}`,
        metadata: {
          workspace_id: subscription.workspaceId,
          subscription_id: subscription.id,
          billing_period: periodDescription,
          type: "postpaid_usage",
        },
      },
      { stripeAccount: connectAccountId }
    )

    // Add line item for usage
    await stripe.invoiceItems.create(
      {
        customer: customerId,
        invoice: invoice.id,
        amount: subscription.pendingInvoiceAmountCents,
        currency: "usd",
        description: `Voice minutes: ${subscription.postpaidMinutesUsed} min @ $${ratePerMinute.toFixed(2)}/min (${periodDescription})`,
        metadata: {
          minutes_used: String(subscription.postpaidMinutesUsed),
          rate_cents: String(subscription.plan.overageRateCents),
        },
      },
      { stripeAccount: connectAccountId }
    )

    // Finalize the invoice (this sends it to the customer)
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(
      invoice.id,
      { stripeAccount: connectAccountId }
    )

    // Send the invoice email
    await stripe.invoices.sendInvoice(
      invoice.id,
      { stripeAccount: connectAccountId }
    )

    console.log(
      `[Postpaid] Invoice ${invoice.id} created for subscription ${subscriptionId}: ` +
        `${subscription.postpaidMinutesUsed} min, $${(subscription.pendingInvoiceAmountCents / 100).toFixed(2)}`
    )

    return {
      success: true,
      invoiceId: invoice.id,
      invoiceUrl: finalizedInvoice.hosted_invoice_url || undefined,
      amountCents: subscription.pendingInvoiceAmountCents,
      minutesUsed: subscription.postpaidMinutesUsed,
      message: "Invoice created and sent",
    }
  } catch (error) {
    console.error(`[Postpaid] Failed to create invoice for ${subscriptionId}:`, error)
    return {
      success: false,
      amountCents: subscription.pendingInvoiceAmountCents,
      minutesUsed: subscription.postpaidMinutesUsed,
      message: `Stripe error: ${(error as Error).message}`,
    }
  }
}

// =============================================================================
// RESET POSTPAID PERIOD
// =============================================================================

/**
 * Reset postpaid usage counters and start a new billing period
 * Call this after generating the invoice
 */
export async function resetPostpaidPeriod(
  subscriptionId: string,
  newPeriodStart?: Date,
  newPeriodEnd?: Date
): Promise<{ success: boolean; previousUsage: number; previousCharges: number }> {
  if (!prisma) throw new Error("Database not configured")

  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      postpaidMinutesUsed: true,
      pendingInvoiceAmountCents: true,
    },
  })

  if (!subscription) {
    throw new Error("Subscription not found")
  }

  const previousUsage = subscription.postpaidMinutesUsed
  const previousCharges = subscription.pendingInvoiceAmountCents

  // Calculate new period dates
  const periodStart = newPeriodStart || new Date()
  const periodEnd = newPeriodEnd || new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 days

  await prisma.workspaceSubscription.update({
    where: { id: subscriptionId },
    data: {
      postpaidMinutesUsed: 0,
      pendingInvoiceAmountCents: 0,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  })

  console.log(
    `[Postpaid] Reset period for subscription ${subscriptionId}: ` +
      `${previousUsage} min, $${(previousCharges / 100).toFixed(2)} -> 0`
  )

  return {
    success: true,
    previousUsage,
    previousCharges,
  }
}

// =============================================================================
// PROCESS ALL DUE INVOICES FOR A PARTNER
// =============================================================================

/**
 * Process all postpaid invoices due for a partner
 * Returns summary of processed invoices
 */
export async function processPartnerPostpaidInvoices(
  partnerId: string
): Promise<{
  processed: number
  successful: number
  failed: number
  totalAmountCents: number
  results: PostpaidInvoiceResult[]
}> {
  const dueSubscriptions = await getPostpaidSubscriptionsDueForInvoicing(partnerId)

  const results: PostpaidInvoiceResult[] = []
  let successful = 0
  let failed = 0
  let totalAmountCents = 0

  for (const sub of dueSubscriptions) {
    const result = await generatePostpaidInvoice(sub.subscriptionId, partnerId)
    results.push(result)

    if (result.success) {
      successful++
      totalAmountCents += result.amountCents

      // Reset the period after successful invoice
      await resetPostpaidPeriod(sub.subscriptionId)
    } else {
      failed++
    }
  }

  return {
    processed: dueSubscriptions.length,
    successful,
    failed,
    totalAmountCents,
    results,
  }
}


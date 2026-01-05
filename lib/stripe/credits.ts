/**
 * Partner Credits Management
 * 
 * Handles credit balance tracking, top-ups, and usage deductions for partners.
 * Credits are stored in cents (dollars * 100).
 */

import { prisma, type CreditTransactionType } from "@/lib/prisma"
import { getStripe } from "./index"
import { sendLowBalanceAlertEmail } from "@/lib/email/send"
import { env } from "@/lib/env"

// =============================================================================
// CONSTANTS
// =============================================================================

export const TOPUP_AMOUNTS_CENTS = [
  { label: "$10", value: 1000 },
  { label: "$25", value: 2500 },
  { label: "$50", value: 5000 },
  { label: "$100", value: 10000 },
] as const

export const DEFAULT_PER_MINUTE_RATE_CENTS = 15 // $0.15 per minute

// =============================================================================
// TYPES
// =============================================================================

export interface PartnerCreditsInfo {
  balanceCents: number
  balanceDollars: number
  lowBalanceThresholdCents: number
  perMinuteRateCents: number
  isLowBalance: boolean
  estimatedMinutesRemaining: number
}

export interface CreditTransactionInfo {
  id: string
  type: CreditTransactionType
  amountCents: number
  balanceAfterCents: number
  description: string | null
  createdAt: Date
}

// =============================================================================
// GET/CREATE CREDITS
// =============================================================================

/**
 * Get or create billing credits record for a partner
 */
export async function getOrCreatePartnerCredits(partnerId: string) {
  if (!prisma) throw new Error("Database not configured")

  let credits = await prisma.billingCredits.findUnique({
    where: { partnerId },
  })

  if (!credits) {
    credits = await prisma.billingCredits.create({
      data: {
        partnerId,
        balanceCents: 0,
        lowBalanceThresholdCents: 1000, // $10
        perMinuteRateCents: DEFAULT_PER_MINUTE_RATE_CENTS,
      },
    })
  }

  return credits
}

/**
 * Get partner credits info with computed fields
 */
export async function getPartnerCreditsInfo(partnerId: string): Promise<PartnerCreditsInfo> {
  const credits = await getOrCreatePartnerCredits(partnerId)

  const estimatedMinutesRemaining = credits.perMinuteRateCents > 0
    ? Math.floor(credits.balanceCents / credits.perMinuteRateCents)
    : 0

  return {
    balanceCents: credits.balanceCents,
    balanceDollars: credits.balanceCents / 100,
    lowBalanceThresholdCents: credits.lowBalanceThresholdCents,
    perMinuteRateCents: credits.perMinuteRateCents,
    isLowBalance: credits.balanceCents < credits.lowBalanceThresholdCents,
    estimatedMinutesRemaining,
  }
}

// =============================================================================
// TRANSACTIONS
// =============================================================================

/**
 * Get recent transactions for a partner
 */
export async function getPartnerTransactions(
  partnerId: string,
  limit = 20
): Promise<CreditTransactionInfo[]> {
  if (!prisma) throw new Error("Database not configured")

  const credits = await getOrCreatePartnerCredits(partnerId)

  const transactions = await prisma.creditTransaction.findMany({
    where: { billingCreditsId: credits.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    amountCents: tx.amountCents,
    balanceAfterCents: tx.balanceAfterCents,
    description: tx.description,
    createdAt: tx.createdAt,
  }))
}

// =============================================================================
// TOP-UP (PAYMENT INTENT)
// =============================================================================

/**
 * Create a PaymentIntent for topping up credits
 */
export async function createTopupPaymentIntent(
  partnerId: string,
  amountCents: number,
  stripeCustomerId: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe()

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: stripeCustomerId,
    metadata: {
      partner_id: partnerId,
      type: "credits_topup",
      amount_cents: String(amountCents),
    },
    automatic_payment_methods: {
      enabled: true,
    },
  })

  if (!paymentIntent.client_secret) {
    throw new Error("Failed to create payment intent")
  }

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  }
}

/**
 * Apply a top-up after successful payment (idempotent)
 * Called from webhook when payment_intent.succeeded
 */
export async function applyTopup(
  partnerId: string,
  amountCents: number,
  paymentIntentId: string
): Promise<{ success: boolean; alreadyApplied: boolean }> {
  if (!prisma) throw new Error("Database not configured")

  // Check if this payment intent was already applied (idempotency)
  const existingTx = await prisma.creditTransaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  })

  if (existingTx) {
    return { success: true, alreadyApplied: true }
  }

  // Get or create credits record
  const credits = await getOrCreatePartnerCredits(partnerId)

  // Apply the top-up in a transaction
  const newBalance = credits.balanceCents + amountCents

  await prisma.$transaction([
    prisma.billingCredits.update({
      where: { id: credits.id },
      data: { balanceCents: newBalance },
    }),
    prisma.creditTransaction.create({
      data: {
        billingCreditsId: credits.id,
        type: "topup",
        amountCents: amountCents,
        balanceAfterCents: newBalance,
        description: `Credit top-up: $${(amountCents / 100).toFixed(2)}`,
        stripePaymentIntentId: paymentIntentId,
      },
    }),
  ])

  return { success: true, alreadyApplied: false }
}

// =============================================================================
// USAGE DEDUCTION
// =============================================================================

/**
 * Deduct credits for usage (e.g., after a call completes)
 * Uses atomic database operations to prevent race conditions.
 * Returns the new balance, or throws if insufficient credits.
 */
export async function deductUsage(
  partnerId: string,
  durationSeconds: number,
  conversationId?: string,
  description?: string
): Promise<{ amountDeducted: number; newBalanceCents: number; isLowBalance: boolean }> {
  if (!prisma) throw new Error("Database not configured")

  const credits = await getOrCreatePartnerCredits(partnerId)

  // Calculate cost: ceil(seconds/60) * perMinuteRate
  const minutes = Math.ceil(durationSeconds / 60)
  const amountCents = minutes * credits.perMinuteRateCents

  // Use interactive transaction for atomic check-and-update
  const result = await prisma.$transaction(async (tx) => {
    // Atomic update with balance check in WHERE clause
    const updated = await tx.billingCredits.updateMany({
      where: {
        id: credits.id,
        balanceCents: { gte: amountCents }, // Atomic check: only update if sufficient
      },
      data: {
        balanceCents: { decrement: amountCents },
      },
    })

    if (updated.count === 0) {
      // Either record doesn't exist or insufficient balance
      const current = await tx.billingCredits.findUnique({
        where: { id: credits.id },
        select: { balanceCents: true },
      })
      throw new Error(
        `Insufficient credits. Required: $${(amountCents / 100).toFixed(2)}, Available: $${((current?.balanceCents || 0) / 100).toFixed(2)}`
      )
    }

    // Get the new balance
    const updatedCredits = await tx.billingCredits.findUnique({
      where: { id: credits.id },
      select: { balanceCents: true, lowBalanceThresholdCents: true },
    })

    const newBalance = updatedCredits?.balanceCents ?? 0
    const threshold = updatedCredits?.lowBalanceThresholdCents ?? 1000

    // Create transaction record
    await tx.creditTransaction.create({
      data: {
        billingCreditsId: credits.id,
        type: "usage",
        amountCents: -amountCents, // Negative for debits
        balanceAfterCents: newBalance,
        description: description || `Usage: ${minutes} minute${minutes > 1 ? "s" : ""} @ $${(credits.perMinuteRateCents / 100).toFixed(2)}/min`,
        conversationId,
      },
    })

    return { newBalance, isLowBalance: newBalance < threshold }
  })

  return {
    amountDeducted: amountCents,
    newBalanceCents: result.newBalance,
    isLowBalance: result.isLowBalance,
  }
}

/**
 * Check if partner has sufficient credits for estimated usage
 */
export async function hasSufficientCredits(
  partnerId: string,
  estimatedMinutes: number
): Promise<boolean> {
  const info = await getPartnerCreditsInfo(partnerId)
  const estimatedCost = estimatedMinutes * info.perMinuteRateCents
  return info.balanceCents >= estimatedCost
}

// =============================================================================
// LOW BALANCE ALERTS
// =============================================================================

/**
 * Check and send low balance alert if needed
 * Call this after deducting usage to notify admins when balance drops below threshold
 */
export async function checkAndSendLowBalanceAlert(
  partnerId: string,
  newBalanceCents: number,
  isLowBalance: boolean
): Promise<void> {
  if (!isLowBalance || !prisma) return

  try {
    // Get partner info and admin emails
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        name: true,
        billingCredits: {
          select: { lowBalanceThresholdCents: true },
        },
        members: {
          where: {
            role: { in: ["owner", "admin"] },
            removedAt: null,
          },
          select: {
            user: { select: { email: true, firstName: true } },
          },
        },
      },
    })

    if (!partner || partner.members.length === 0) return

    const adminEmails = partner.members.map((m) => m.user.email).filter(Boolean) as string[]
    const recipientName = partner.members[0]?.user.firstName || "Admin"
    const threshold = partner.billingCredits?.lowBalanceThresholdCents || 1000

    await sendLowBalanceAlertEmail(adminEmails, {
      recipient_name: recipientName,
      account_name: partner.name,
      account_type: "partner",
      current_balance: `$${(newBalanceCents / 100).toFixed(2)}`,
      threshold: `$${(threshold / 100).toFixed(2)}`,
      topup_url: `${env.appUrl}/org/billing`,
    })

    console.log(`[Credits] Low balance alert sent to ${adminEmails.length} admin(s) for partner ${partnerId}`)
  } catch (error) {
    // Don't throw - this is a non-critical notification
    console.error(`[Credits] Failed to send low balance alert:`, error)
  }
}


/**
 * Workspace Credits Management
 * 
 * Handles credit balance tracking, top-ups via Stripe Connect, and usage deductions for workspaces.
 * Billing-exempt workspaces (partner's default) draw from partner-level credits instead.
 */

import { prisma, type CreditTransactionType } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "./index"
import { deductUsage as deductPartnerUsage, checkAndSendLowBalanceAlert as checkPartnerLowBalance } from "./credits"
import { sendLowBalanceAlertEmail } from "@/lib/email/send"
import { env } from "@/lib/env"

// =============================================================================
// CONSTANTS
// =============================================================================

export const WORKSPACE_TOPUP_AMOUNTS_CENTS = [
  { label: "$5", value: 500 },
  { label: "$10", value: 1000 },
  { label: "$25", value: 2500 },
  { label: "$50", value: 5000 },
] as const

// Free tier credits grant amount (in cents)
export const FREE_TIER_CREDITS_CENTS = 1000 // $10

// =============================================================================
// TYPES
// =============================================================================

export interface WorkspaceCreditsInfo {
  balanceCents: number
  balanceDollars: number
  lowBalanceThresholdCents: number
  perMinuteRateCents: number
  isLowBalance: boolean
  estimatedMinutesRemaining: number
  isBillingExempt: boolean
}

export interface WorkspaceCreditTransactionInfo {
  id: string
  type: CreditTransactionType
  amountCents: number
  balanceAfterCents: number
  description: string | null
  createdAt: Date
}

// =============================================================================
// GET WORKSPACE WITH BILLING INFO
// =============================================================================

/**
 * Get workspace with billing info and partner's Connect account
 */
export async function getWorkspaceWithBillingInfo(workspaceId: string) {
  if (!prisma) throw new Error("Database not configured")

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      partner: {
        select: {
          id: true,
          settings: true,
          stripeCustomerId: true,
        },
      },
      workspaceCredits: true,
    },
  })

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  // Get Connect account ID from partner settings (handles both key formats)
  const partnerSettings = workspace.partner.settings as Record<string, unknown> | null
  const stripeConnectAccountId = getConnectAccountId(partnerSettings)

  return {
    workspace,
    partnerId: workspace.partner.id,
    stripeConnectAccountId,
    isBillingExempt: workspace.isBillingExempt,
    perMinuteRateCents: workspace.perMinuteRateCents,
  }
}

// =============================================================================
// GET/CREATE WORKSPACE CREDITS
// =============================================================================

/**
 * Get or create workspace credits record
 */
export async function getOrCreateWorkspaceCredits(workspaceId: string) {
  if (!prisma) throw new Error("Database not configured")

  let credits = await prisma.workspaceCredits.findUnique({
    where: { workspaceId },
  })

  if (!credits) {
    credits = await prisma.workspaceCredits.create({
      data: {
        workspaceId,
        balanceCents: 0,
        lowBalanceThresholdCents: 500, // $5
      },
    })
  }

  return credits
}

/**
 * Grant initial free tier credits to a workspace (idempotent)
 * This is called when a workspace is created with the "free" plan.
 * It checks for an existing grant transaction before applying.
 * 
 * @param workspaceId - The workspace to grant credits to
 * @param amountCents - Amount to grant (default: $10 = 1000 cents)
 * @returns Object with success status and whether already granted
 */
export async function grantInitialFreeTierCredits(
  workspaceId: string,
  amountCents: number = FREE_TIER_CREDITS_CENTS
): Promise<{ success: boolean; alreadyGranted: boolean; newBalanceCents?: number }> {
  if (!prisma) throw new Error("Database not configured")

  // Get or create the workspace credits record
  const credits = await getOrCreateWorkspaceCredits(workspaceId)

  // Check if we've already granted free tier credits (idempotency)
  const existingGrant = await prisma.workspaceCreditTransaction.findFirst({
    where: {
      workspaceCreditsId: credits.id,
      type: "adjustment",
      metadata: {
        path: ["reason"],
        equals: "free_tier_grant",
      },
    },
  })

  if (existingGrant) {
    return { success: true, alreadyGranted: true, newBalanceCents: credits.balanceCents }
  }

  // Apply the free tier grant in a transaction
  const newBalance = credits.balanceCents + amountCents

  await prisma.$transaction([
    prisma.workspaceCredits.update({
      where: { id: credits.id },
      data: { balanceCents: newBalance },
    }),
    prisma.workspaceCreditTransaction.create({
      data: {
        workspaceCreditsId: credits.id,
        type: "adjustment",
        amountCents: amountCents,
        balanceAfterCents: newBalance,
        description: `Free tier credits: $${(amountCents / 100).toFixed(2)}`,
        metadata: { reason: "free_tier_grant" },
      },
    }),
  ])

  console.log(`[Workspace Credits] Granted $${(amountCents / 100).toFixed(2)} free tier credits to workspace ${workspaceId}`)

  return { success: true, alreadyGranted: false, newBalanceCents: newBalance }
}

/**
 * Get workspace credits info with computed fields
 */
export async function getWorkspaceCreditsInfo(workspaceId: string): Promise<WorkspaceCreditsInfo> {
  if (!prisma) throw new Error("Database not configured")

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { workspaceCredits: true },
  })

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  // If billing exempt, return info indicating that
  if (workspace.isBillingExempt) {
    return {
      balanceCents: 0,
      balanceDollars: 0,
      lowBalanceThresholdCents: 0,
      perMinuteRateCents: workspace.perMinuteRateCents,
      isLowBalance: false,
      estimatedMinutesRemaining: 0,
      isBillingExempt: true,
    }
  }

  const credits = workspace.workspaceCredits || await getOrCreateWorkspaceCredits(workspaceId)

  const estimatedMinutesRemaining = workspace.perMinuteRateCents > 0
    ? Math.floor(credits.balanceCents / workspace.perMinuteRateCents)
    : 0

  return {
    balanceCents: credits.balanceCents,
    balanceDollars: credits.balanceCents / 100,
    lowBalanceThresholdCents: credits.lowBalanceThresholdCents,
    perMinuteRateCents: workspace.perMinuteRateCents,
    isLowBalance: credits.balanceCents < credits.lowBalanceThresholdCents,
    estimatedMinutesRemaining,
    isBillingExempt: false,
  }
}

// =============================================================================
// TRANSACTIONS
// =============================================================================

/**
 * Get recent transactions for a workspace
 */
export async function getWorkspaceTransactions(
  workspaceId: string,
  limit = 20
): Promise<WorkspaceCreditTransactionInfo[]> {
  if (!prisma) throw new Error("Database not configured")

  const credits = await getOrCreateWorkspaceCredits(workspaceId)

  const transactions = await prisma.workspaceCreditTransaction.findMany({
    where: { workspaceCreditsId: credits.id },
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
// TOP-UP (PAYMENT INTENT VIA CONNECT)
// =============================================================================

/**
 * Create a PaymentIntent for topping up workspace credits
 * Payment goes to partner's Stripe Connect account
 * Platform takes a % cut from each payment via application_fee_amount
 */
export async function createWorkspaceTopupPaymentIntent(
  workspaceId: string,
  amountCents: number,
  platformFeePercent?: number
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe()

  // Get workspace and partner info
  const { workspace, stripeConnectAccountId, isBillingExempt } = await getWorkspaceWithBillingInfo(workspaceId)

  if (isBillingExempt) {
    throw new Error("Billing-exempt workspaces cannot purchase credits. Use partner credits instead.")
  }

  if (!stripeConnectAccountId) {
    throw new Error("Partner has not completed Stripe Connect onboarding")
  }

  // Calculate platform fee using env var (default 10%)
  const feePercent = platformFeePercent ?? env.stripeConnectPlatformFeePercent ?? 10
  const applicationFeeAmount = Math.round(amountCents * (feePercent / 100))

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      application_fee_amount: applicationFeeAmount,
      metadata: {
        workspace_id: workspaceId,
        partner_id: workspace.partnerId,
        type: "workspace_credits_topup",
        amount_cents: String(amountCents),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    },
    {
      stripeAccount: stripeConnectAccountId,
    }
  )

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
 * Called from webhook when payment_intent.succeeded on Connect account
 */
export async function applyWorkspaceTopup(
  workspaceId: string,
  amountCents: number,
  paymentIntentId: string
): Promise<{ success: boolean; alreadyApplied: boolean }> {
  if (!prisma) throw new Error("Database not configured")

  // Check if this payment intent was already applied (idempotency)
  const existingTx = await prisma.workspaceCreditTransaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  })

  if (existingTx) {
    return { success: true, alreadyApplied: true }
  }

  // Get or create credits record
  const credits = await getOrCreateWorkspaceCredits(workspaceId)

  // Apply the top-up in a transaction
  const newBalance = credits.balanceCents + amountCents

  await prisma.$transaction([
    prisma.workspaceCredits.update({
      where: { id: credits.id },
      data: { balanceCents: newBalance },
    }),
    prisma.workspaceCreditTransaction.create({
      data: {
        workspaceCreditsId: credits.id,
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
// USAGE DEDUCTION (WITH SUBSCRIPTION SUPPORT)
// =============================================================================

export interface UsageDeductionResult {
  amountDeducted: number
  newBalanceCents: number
  deductedFrom: "subscription" | "workspace" | "partner" | "postpaid"
  isLowBalance: boolean
  subscriptionMinutesUsed?: number
  overageMinutes?: number
  // Postpaid-specific fields
  postpaidMinutesUsed?: number
  postpaidMinutesLimit?: number
  pendingInvoiceAmountCents?: number
}

// =============================================================================
// POSTPAID BILLING
// =============================================================================

export interface PostpaidCheckResult {
  allowed: boolean
  remainingMinutes: number
  currentUsage: number
  limitMinutes: number
  message: string
  billingType: "prepaid" | "postpaid" | "none"
}

/**
 * Check if a workspace with postpaid subscription can make a call
 * Returns allowance status and remaining minutes
 */
export async function canMakePostpaidCall(workspaceId: string): Promise<PostpaidCheckResult> {
  if (!prisma) throw new Error("Database not configured")

  // Get workspace subscription with plan details
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId },
    include: {
      plan: {
        select: {
          billingType: true,
          postpaidMinutesLimit: true,
          includedMinutes: true,
        },
      },
    },
  })

  // No active subscription
  if (!subscription || subscription.status !== "active") {
    return {
      allowed: true, // Will be handled by credits check
      remainingMinutes: 0,
      currentUsage: 0,
      limitMinutes: 0,
      message: "No active subscription - using prepaid credits",
      billingType: "none",
    }
  }

  // Prepaid subscription - always allow (handled by credits)
  if (subscription.plan.billingType === "prepaid") {
    const remainingIncluded = Math.max(0, subscription.plan.includedMinutes - subscription.minutesUsedThisPeriod)
    return {
      allowed: true,
      remainingMinutes: remainingIncluded,
      currentUsage: subscription.minutesUsedThisPeriod,
      limitMinutes: subscription.plan.includedMinutes,
      message: "Prepaid plan - use included minutes then credits",
      billingType: "prepaid",
    }
  }

  // Postpaid subscription - check against limit
  const limit = subscription.plan.postpaidMinutesLimit || 0
  const used = subscription.postpaidMinutesUsed
  const remaining = Math.max(0, limit - used)

  if (used >= limit) {
    return {
      allowed: false,
      remainingMinutes: 0,
      currentUsage: used,
      limitMinutes: limit,
      message: "Postpaid minutes limit exceeded. Payment required to continue.",
      billingType: "postpaid",
    }
  }

  return {
    allowed: true,
    remainingMinutes: remaining,
    currentUsage: used,
    limitMinutes: limit,
    message: "OK",
    billingType: "postpaid",
  }
}

/**
 * Record postpaid usage for a subscription
 * This is an atomic operation that checks the limit before incrementing
 */
export async function recordPostpaidUsage(
  workspaceId: string,
  durationSeconds: number,
  conversationId?: string,
  description?: string
): Promise<UsageDeductionResult> {
  if (!prisma) throw new Error("Database not configured")

  const minutes = Math.ceil(durationSeconds / 60)

  // Get subscription with plan details and lock for update
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId },
    include: {
      plan: {
        select: {
          billingType: true,
          postpaidMinutesLimit: true,
          overageRateCents: true,
        },
      },
    },
  })

  if (!subscription || subscription.status !== "active") {
    throw new Error("No active subscription found")
  }

  if (subscription.plan.billingType !== "postpaid") {
    throw new Error("Not a postpaid subscription")
  }

  const limit = subscription.plan.postpaidMinutesLimit || 0
  const currentUsage = subscription.postpaidMinutesUsed
  const newUsage = currentUsage + minutes

  // Check if this would exceed the limit
  if (newUsage > limit) {
    throw new Error(
      `Postpaid limit exceeded. Current: ${currentUsage} min, Requested: ${minutes} min, Limit: ${limit} min`
    )
  }

  // Calculate the charge for this usage
  const chargeCents = minutes * subscription.plan.overageRateCents

  // Atomically update the subscription usage
  const result = await prisma.$transaction(async (tx) => {
    // Use updateMany with condition for atomic check
    const updated = await tx.workspaceSubscription.updateMany({
      where: {
        id: subscription.id,
        postpaidMinutesUsed: { lte: limit - minutes }, // Ensure we don't exceed
      },
      data: {
        postpaidMinutesUsed: { increment: minutes },
        pendingInvoiceAmountCents: { increment: chargeCents },
      },
    })

    if (updated.count === 0) {
      throw new Error("Postpaid limit would be exceeded")
    }

    // Get updated subscription
    const updatedSubscription = await tx.workspaceSubscription.findUnique({
      where: { id: subscription.id },
      select: {
        postpaidMinutesUsed: true,
        pendingInvoiceAmountCents: true,
      },
    })

    return updatedSubscription
  })

  return {
    amountDeducted: chargeCents,
    newBalanceCents: 0, // Not applicable for postpaid
    deductedFrom: "postpaid",
    isLowBalance: false,
    postpaidMinutesUsed: result?.postpaidMinutesUsed || newUsage,
    postpaidMinutesLimit: limit,
    pendingInvoiceAmountCents: result?.pendingInvoiceAmountCents || 0,
  }
}

/**
 * Deduct usage for a workspace call
 * Priority order:
 * 1. Billing-exempt workspaces → Partner credits
 * 2. Postpaid subscription → Track usage against limit (invoice at period end)
 * 3. Prepaid subscription with included minutes → Use subscription minutes first
 * 4. Overage/extra minutes → Deduct from workspace prepaid credits at overage rate
 * 5. No subscription → Deduct from workspace prepaid credits
 */
export async function deductWorkspaceUsage(
  workspaceId: string,
  durationSeconds: number,
  conversationId?: string,
  description?: string
): Promise<UsageDeductionResult> {
  if (!prisma) throw new Error("Database not configured")

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      partnerId: true,
      isBillingExempt: true,
      perMinuteRateCents: true,
    },
  })

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  // If billing exempt, deduct from partner credits
  if (workspace.isBillingExempt) {
    const result = await deductPartnerUsage(
      workspace.partnerId,
      durationSeconds,
      conversationId,
      description || `Usage from workspace (exempt)`
    )
    return {
      ...result,
      deductedFrom: "partner",
    }
  }

  const minutes = Math.ceil(durationSeconds / 60)

  // Check for active subscription
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId },
    include: {
      plan: {
        select: {
          billingType: true,
          includedMinutes: true,
          overageRateCents: true,
          postpaidMinutesLimit: true,
        },
      },
    },
  })

  // If active subscription, check billing type
  if (subscription && subscription.status === "active") {
    // POSTPAID: Track usage against limit (no credits deducted now)
    if (subscription.plan.billingType === "postpaid") {
      return await recordPostpaidUsage(
        workspaceId,
        durationSeconds,
        conversationId,
        description
      )
    }

    // PREPAID: Use subscription logic (included minutes + credits for overage)
    return await deductWithSubscription(
      workspaceId,
      workspace.perMinuteRateCents,
      minutes,
      subscription,
      conversationId,
      description
    )
  }

  // No subscription - use prepaid credits only
  return await deductFromPrepaidCredits(
    workspaceId,
    workspace.perMinuteRateCents,
    minutes,
    conversationId,
    description
  )
}

/**
 * Deduct usage using subscription included minutes, with overage from credits
 */
async function deductWithSubscription(
  workspaceId: string,
  perMinuteRateCents: number,
  minutes: number,
  subscription: {
    id: string
    minutesUsedThisPeriod: number
    overageChargesCents: number
    plan: { includedMinutes: number; overageRateCents: number }
  },
  conversationId?: string,
  description?: string
): Promise<UsageDeductionResult> {
  if (!prisma) throw new Error("Database not configured")

  const { includedMinutes, overageRateCents } = subscription.plan
  const currentUsed = subscription.minutesUsedThisPeriod
  const remainingIncluded = Math.max(0, includedMinutes - currentUsed)

  // How many minutes can be covered by subscription?
  const minutesFromSubscription = Math.min(minutes, remainingIncluded)
  const overageMinutes = minutes - minutesFromSubscription

  // Update subscription usage
  await prisma.workspaceSubscription.update({
    where: { id: subscription.id },
    data: {
      minutesUsedThisPeriod: { increment: minutesFromSubscription },
    },
  })

  // If all minutes covered by subscription, no credits needed
  if (overageMinutes === 0) {
    return {
      amountDeducted: 0,
      newBalanceCents: 0, // Not relevant for subscription usage
      deductedFrom: "subscription",
      isLowBalance: false,
      subscriptionMinutesUsed: minutesFromSubscription,
      overageMinutes: 0,
    }
  }

  // Overage minutes - deduct from prepaid credits at overage rate
  const overageAmountCents = overageMinutes * overageRateCents
  
  try {
    const creditsResult = await deductFromPrepaidCreditsAmount(
      workspaceId,
      overageAmountCents,
      conversationId,
      description || `Overage: ${overageMinutes} min @ $${(overageRateCents / 100).toFixed(2)}/min`
    )

    // Also track overage on subscription
    await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: {
        overageChargesCents: { increment: overageAmountCents },
      },
    })

    return {
      amountDeducted: overageAmountCents,
      newBalanceCents: creditsResult.newBalance,
      deductedFrom: "workspace",
      isLowBalance: creditsResult.isLowBalance,
      subscriptionMinutesUsed: minutesFromSubscription,
      overageMinutes,
    }
  } catch (error) {
    // If insufficient credits, still log the subscription usage
    console.error(`[Workspace Credits] Overage deduction failed for workspace ${workspaceId}:`, error)
    throw error
  }
}

/**
 * Deduct a specific amount from prepaid credits
 */
async function deductFromPrepaidCreditsAmount(
  workspaceId: string,
  amountCents: number,
  conversationId?: string,
  description?: string
): Promise<{ newBalance: number; isLowBalance: boolean }> {
  if (!prisma) throw new Error("Database not configured")

  const credits = await getOrCreateWorkspaceCredits(workspaceId)

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.workspaceCredits.updateMany({
      where: {
        id: credits.id,
        balanceCents: { gte: amountCents },
      },
      data: {
        balanceCents: { decrement: amountCents },
      },
    })

    if (updated.count === 0) {
      const current = await tx.workspaceCredits.findUnique({
        where: { id: credits.id },
        select: { balanceCents: true },
      })
      throw new Error(
        `Insufficient workspace credits. Required: $${(amountCents / 100).toFixed(2)}, Available: $${((current?.balanceCents || 0) / 100).toFixed(2)}`
      )
    }

    const updatedCredits = await tx.workspaceCredits.findUnique({
      where: { id: credits.id },
      select: { balanceCents: true, lowBalanceThresholdCents: true },
    })

    const newBalance = updatedCredits?.balanceCents ?? 0
    const threshold = updatedCredits?.lowBalanceThresholdCents ?? 500

    await tx.workspaceCreditTransaction.create({
      data: {
        workspaceCreditsId: credits.id,
        type: "usage",
        amountCents: -amountCents,
        balanceAfterCents: newBalance,
        description: description || `Usage charge: $${(amountCents / 100).toFixed(2)}`,
        conversationId,
      },
    })

    return { newBalance, isLowBalance: newBalance < threshold }
  })

  return result
}

/**
 * Deduct from prepaid credits (no subscription)
 */
async function deductFromPrepaidCredits(
  workspaceId: string,
  perMinuteRateCents: number,
  minutes: number,
  conversationId?: string,
  description?: string
): Promise<UsageDeductionResult> {
  const amountCents = minutes * perMinuteRateCents

  const result = await deductFromPrepaidCreditsAmount(
    workspaceId,
    amountCents,
    conversationId,
    description || `Usage: ${minutes} minute${minutes > 1 ? "s" : ""} @ $${(perMinuteRateCents / 100).toFixed(2)}/min`
  )

  return {
    amountDeducted: amountCents,
    newBalanceCents: result.newBalance,
    deductedFrom: "workspace",
    isLowBalance: result.isLowBalance,
  }
}

/**
 * Check if workspace has sufficient credits for estimated usage
 */
export async function hasSufficientWorkspaceCredits(
  workspaceId: string,
  estimatedMinutes: number
): Promise<boolean> {
  const info = await getWorkspaceCreditsInfo(workspaceId)
  
  // Billing exempt workspaces always have "sufficient" (checked at partner level)
  if (info.isBillingExempt) {
    return true
  }
  
  const estimatedCost = estimatedMinutes * info.perMinuteRateCents
  return info.balanceCents >= estimatedCost
}

// =============================================================================
// LOW BALANCE ALERTS
// =============================================================================

/**
 * Check and send low balance alert for workspace if needed
 * Call this after deducting usage to notify admins when balance drops below threshold
 * Note: Alerts are sent to partner admins since workspace members may not have email access
 */
export async function checkAndSendWorkspaceLowBalanceAlert(
  workspaceId: string,
  newBalanceCents: number,
  isLowBalance: boolean
): Promise<void> {
  if (!isLowBalance || !prisma) return

  try {
    // Get workspace info and partner admins
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspaceCredits: {
          select: { lowBalanceThresholdCents: true },
        },
        partner: {
          select: {
            slug: true,
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
        },
      },
    })

    if (!workspace || workspace.partner.members.length === 0) return

    const adminEmails = workspace.partner.members
      .map((m) => m.user.email)
      .filter(Boolean) as string[]
    const recipientName = workspace.partner.members[0]?.user.firstName || "Admin"
    const threshold = workspace.workspaceCredits?.lowBalanceThresholdCents || 500

    await sendLowBalanceAlertEmail(adminEmails, {
      recipient_name: recipientName,
      account_name: workspace.name,
      account_type: "workspace",
      current_balance: `$${(newBalanceCents / 100).toFixed(2)}`,
      threshold: `$${(threshold / 100).toFixed(2)}`,
      topup_url: `${env.appUrl}/w/${workspace.slug}/billing`,
    })

    console.log(`[Workspace Credits] Low balance alert sent to ${adminEmails.length} admin(s) for workspace ${workspaceId}`)
  } catch (error) {
    // Don't throw - this is a non-critical notification
    console.error(`[Workspace Credits] Failed to send low balance alert:`, error)
  }
}

// Re-export for convenience
export { checkPartnerLowBalance }


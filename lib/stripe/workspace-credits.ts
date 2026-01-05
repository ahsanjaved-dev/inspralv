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
 */
export async function createWorkspaceTopupPaymentIntent(
  workspaceId: string,
  amountCents: number,
  platformFeePercent = 10 // 10% platform fee by default
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

  // Calculate platform fee
  const applicationFeeAmount = Math.round(amountCents * (platformFeePercent / 100))

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
// USAGE DEDUCTION
// =============================================================================

/**
 * Deduct credits for usage (e.g., after a call completes)
 * Uses atomic database operations to prevent race conditions.
 * - Billing-exempt workspaces deduct from partner credits
 * - Normal workspaces deduct from their own credits
 */
export async function deductWorkspaceUsage(
  workspaceId: string,
  durationSeconds: number,
  conversationId?: string,
  description?: string
): Promise<{ amountDeducted: number; newBalanceCents: number; deductedFrom: "workspace" | "partner"; isLowBalance: boolean }> {
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

  // Normal workspace - deduct from workspace credits
  const credits = await getOrCreateWorkspaceCredits(workspaceId)

  // Calculate cost: ceil(seconds/60) * perMinuteRate
  const minutes = Math.ceil(durationSeconds / 60)
  const amountCents = minutes * workspace.perMinuteRateCents

  // Use interactive transaction for atomic check-and-update
  const result = await prisma.$transaction(async (tx) => {
    // Atomic update with balance check in WHERE clause
    const updated = await tx.workspaceCredits.updateMany({
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
      const current = await tx.workspaceCredits.findUnique({
        where: { id: credits.id },
        select: { balanceCents: true },
      })
      throw new Error(
        `Insufficient workspace credits. Required: $${(amountCents / 100).toFixed(2)}, Available: $${((current?.balanceCents || 0) / 100).toFixed(2)}`
      )
    }

    // Get the new balance
    const updatedCredits = await tx.workspaceCredits.findUnique({
      where: { id: credits.id },
      select: { balanceCents: true, lowBalanceThresholdCents: true },
    })

    const newBalance = updatedCredits?.balanceCents ?? 0
    const threshold = updatedCredits?.lowBalanceThresholdCents ?? 500

    // Create transaction record
    await tx.workspaceCreditTransaction.create({
      data: {
        workspaceCreditsId: credits.id,
        type: "usage",
        amountCents: -amountCents, // Negative for debits
        balanceAfterCents: newBalance,
        description: description || `Usage: ${minutes} minute${minutes > 1 ? "s" : ""} @ $${(workspace.perMinuteRateCents / 100).toFixed(2)}/min`,
        conversationId,
      },
    })

    return { newBalance, isLowBalance: newBalance < threshold }
  })

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


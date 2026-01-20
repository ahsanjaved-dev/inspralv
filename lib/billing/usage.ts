/**
 * Usage Billing Service
 *
 * Handles credit deduction and monthly minutes tracking for voice calls.
 * Called by provider webhooks (VAPI, Retell) when calls complete.
 * 
 * Billing priority:
 * 1. Postpaid subscriptions → Track usage, invoice at period end
 * 2. Prepaid subscriptions → Use included minutes, then credits for overage
 * 3. No subscription → Deduct from workspace prepaid credits
 * 4. Billing-exempt workspaces → Use partner credits
 */

import { prisma } from "@/lib/prisma"
import { deductUsage, hasSufficientCredits as checkCredits } from "@/lib/stripe/credits"
import { deductWorkspaceUsage, canMakePostpaidCall } from "@/lib/stripe/workspace-credits"

// =============================================================================
// TYPES
// =============================================================================

export interface CallUsageData {
  conversationId: string
  workspaceId: string
  partnerId: string
  durationSeconds: number
  provider: "vapi" | "retell"
  externalCallId?: string
}

export interface UsageProcessResult {
  success: boolean
  amountDeducted?: number
  newBalanceCents?: number
  minutesAdded?: number
  error?: string
  reason?: string
}

// =============================================================================
// PLAN LIMITS
// =============================================================================

const PLAN_MONTHLY_MINUTES = {
  starter: 1000,
  professional: 5000,
  enterprise: 999999, // Effectively unlimited (custom pools)
} as const

/**
 * Get monthly minutes limit for a partner's plan
 */
export function getPlanMonthlyMinutesLimit(planTier: string): number {
  const plan = planTier as keyof typeof PLAN_MONTHLY_MINUTES
  return PLAN_MONTHLY_MINUTES[plan] || PLAN_MONTHLY_MINUTES.starter
}

// =============================================================================
// CREDIT CHECK
// =============================================================================

/**
 * Check if partner has sufficient credits for estimated call duration
 * Use this BEFORE allowing outbound calls
 */
export async function hasSufficientCredits(
  partnerId: string,
  estimatedMinutes: number
): Promise<boolean> {
  return checkCredits(partnerId, estimatedMinutes)
}

// =============================================================================
// MONTHLY MINUTES CHECK
// =============================================================================

/**
 * Check if workspace has remaining monthly minutes
 * Returns { allowed, remaining, limit }
 */
export async function checkMonthlyMinutesLimit(workspaceId: string): Promise<{
  allowed: boolean
  remaining: number
  limit: number
  currentUsage: number
}> {
  if (!prisma) throw new Error("Database not configured")

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      currentMonthMinutes: true,
      partner: {
        select: {
          planTier: true,
        },
      },
    },
  })

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  const limit = getPlanMonthlyMinutesLimit(workspace.partner.planTier)
  const currentUsage = Number(workspace.currentMonthMinutes)
  const remaining = Math.max(0, limit - currentUsage)

  return {
    allowed: currentUsage < limit,
    remaining,
    limit,
    currentUsage,
  }
}

// =============================================================================
// USAGE PROCESSING
// =============================================================================

/**
 * Process call completion and deduct usage
 * Called by provider webhooks after a call completes
 *
 * This function:
 * 1. Uses workspace-level billing (subscriptions + credits)
 * 2. Supports postpaid subscriptions (track usage, invoice later)
 * 3. Supports prepaid subscriptions (included minutes + overage)
 * 4. Falls back to partner credits for billing-exempt workspaces
 * 5. Is idempotent (checks if already processed)
 */
export async function processCallCompletion(
  data: CallUsageData
): Promise<UsageProcessResult> {
  if (!prisma) throw new Error("Database not configured")

  const { conversationId, workspaceId, partnerId, durationSeconds, provider, externalCallId } = data

  try {
    // 1. Check if this call was already processed (idempotency)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        totalCost: true,
        durationSeconds: true,
      },
    })

    if (!conversation) {
      return {
        success: false,
        error: "Conversation not found",
      }
    }

    // If totalCost is already set, this call was already billed
    if (conversation.totalCost !== null && Number(conversation.totalCost) > 0) {
      return {
        success: true,
        reason: "Already processed (idempotent)",
        amountDeducted: Number(conversation.totalCost) * 100, // Convert back to cents
      }
    }

    // 2. Deduct using workspace-level billing (handles subscriptions, postpaid, prepaid, partner fallback)
    const usageResult = await deductWorkspaceUsage(
      workspaceId,
      durationSeconds,
      conversationId,
      `${provider.toUpperCase()} call - ${Math.ceil(durationSeconds / 60)} minutes`
    )

    // 3. Calculate minutes and update workspace + conversation
    const minutes = Math.ceil(durationSeconds / 60)
    const costDollars = usageResult.amountDeducted / 100

    await prisma.$transaction([
      // Update workspace monthly minutes
      prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          currentMonthMinutes: {
            increment: minutes,
          },
          currentMonthCost: {
            increment: costDollars,
          },
        },
      }),
      // Update conversation with cost
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          totalCost: costDollars,
          costBreakdown: {
            minutes,
            rate_per_minute: usageResult.amountDeducted / minutes / 100,
            total_cents: usageResult.amountDeducted,
            billing_type: usageResult.deductedFrom,
            // Include postpaid info if applicable
            ...(usageResult.deductedFrom === "postpaid" && {
              postpaid_minutes_used: usageResult.postpaidMinutesUsed,
              postpaid_minutes_limit: usageResult.postpaidMinutesLimit,
              pending_invoice_cents: usageResult.pendingInvoiceAmountCents,
            }),
          },
          durationSeconds: durationSeconds,
        },
      }),
    ])

    console.log(
      `[Billing] Usage processed: ${minutes} min, $${costDollars.toFixed(2)}, ` +
      `billed to: ${usageResult.deductedFrom}`
    )

    return {
      success: true,
      amountDeducted: usageResult.amountDeducted,
      newBalanceCents: usageResult.newBalanceCents,
      minutesAdded: minutes,
    }
  } catch (error) {
    console.error("[Billing] Failed to process call completion:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Reset workspace monthly usage (call this at start of new billing month)
 * This should be run by a cron job
 */
export async function resetWorkspaceMonthlyUsage(workspaceId: string): Promise<void> {
  if (!prisma) throw new Error("Database not configured")

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      currentMonthMinutes: 0,
      currentMonthCost: 0,
      lastUsageResetAt: new Date(),
    },
  })
}

/**
 * Reset all workspaces' monthly usage (for monthly cron job)
 */
export async function resetAllWorkspacesMonthlyUsage(): Promise<number> {
  if (!prisma) throw new Error("Database not configured")

  const result = await prisma.workspace.updateMany({
    data: {
      currentMonthMinutes: 0,
      currentMonthCost: 0,
      lastUsageResetAt: new Date(),
    },
  })

  return result.count
}

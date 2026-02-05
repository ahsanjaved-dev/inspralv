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
 * 
 * Pricing Model:
 * - Partner sets a single per-minute rate that applies to all their workspaces
 * - Partner rate is used for billing and display (hides provider costs)
 * - Provider costs are stored internally for audit/tracking only
 */

import { prisma } from "@/lib/prisma"
import { deductUsage, hasSufficientCredits as checkCredits, DEFAULT_PER_MINUTE_RATE_CENTS } from "@/lib/stripe/credits"
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
// PARTNER RATE HELPER
// =============================================================================

/**
 * Get the partner's per-minute rate for a workspace
 * This is the canonical rate used for billing and cost display
 * 
 * @param workspaceId - The workspace ID
 * @returns Partner's per-minute rate in cents
 */
export async function getPartnerRateForWorkspace(workspaceId: string): Promise<number> {
  if (!prisma) throw new Error("Database not configured")

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      partner: {
        select: {
          billingCredits: {
            select: {
              perMinuteRateCents: true,
            },
          },
        },
      },
    },
  })

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  // Return partner's rate, or default if not set
  return workspace.partner.billingCredits?.perMinuteRateCents ?? DEFAULT_PER_MINUTE_RATE_CENTS
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
 * 6. Calculates partner cost using partner's per-minute rate (not provider cost)
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
        costBreakdown: true,
        agentId: true,
      },
    })

    if (!conversation) {
      return {
        success: false,
        error: "Conversation not found",
      }
    }

    // Check if our billing system already processed this call
    // We look for billing_type in costBreakdown which is ONLY set by processCallCompletion()
    // This is more reliable than checking totalCost since webhooks may set totalCost from provider data
    const costBreakdown = conversation.costBreakdown as Record<string, unknown> | null
    if (costBreakdown?.billing_type) {
      return {
        success: true,
        reason: "Already processed (idempotent)",
        amountDeducted: Number(costBreakdown.partner_cost_cents) || Number(conversation.totalCost) * 100,
      }
    }

    // 2. Deduct using workspace-level billing (handles subscriptions, postpaid, prepaid, partner fallback)
    const usageResult = await deductWorkspaceUsage(
      workspaceId,
      durationSeconds,
      conversationId,
      `${provider.toUpperCase()} call - ${Math.ceil(durationSeconds / 60)} minutes`
    )

    // 3. Calculate minutes and costs
    const minutes = Math.ceil(durationSeconds / 60)
    const billedCostCents = usageResult.amountDeducted // What we charged (may be $0 for subscription)
    
    // Provider cost (from VAPI/Retell webhook) - stored for internal tracking only
    const providerCostDollars = Number(conversation.totalCost) || 0
    const providerCostCents = Math.round(providerCostDollars * 100)
    
    // Get partner's per-minute rate and calculate PARTNER cost
    // This is the canonical cost that should be displayed to users and used for billing
    const partnerRateCents = await getPartnerRateForWorkspace(workspaceId)
    const partnerCostCents = minutes * partnerRateCents
    const partnerCostDollars = partnerCostCents / 100
    
    // Build transaction operations
    const transactionOps: any[] = [
      // Update workspace monthly usage with PARTNER cost (what workspaces see)
      prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          currentMonthMinutes: {
            increment: minutes,
          },
          currentMonthCost: {
            increment: partnerCostDollars, // Use partner cost for dashboard visibility
          },
        },
      }),
      // Update conversation - store partner cost for display, provider cost for audit
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          // Update totalCost to partner cost (this is what gets displayed)
          totalCost: partnerCostDollars,
          // Store detailed cost breakdown for audit and display
          costBreakdown: {
            minutes,
            // Partner pricing (for display)
            partner_cost_cents: partnerCostCents,
            partner_cost_dollars: partnerCostDollars,
            partner_rate_per_minute_cents: partnerRateCents,
            // Provider cost (internal tracking only)
            provider_cost_cents: providerCostCents,
            provider_cost_dollars: providerCostDollars,
            // Billing info
            billed_cost_cents: billedCostCents,
            billing_type: usageResult.deductedFrom,
            // Include subscription info if applicable
            ...(usageResult.deductedFrom === "subscription" && {
              subscription_minutes_used: usageResult.subscriptionMinutesUsed,
              overage_minutes: usageResult.overageMinutes,
            }),
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
    ]

    // Update agent stats with PARTNER cost (this is what workspaces should see)
    if (conversation.agentId) {
      transactionOps.push(
        prisma.aiAgent.update({
          where: { id: conversation.agentId },
          data: {
            totalConversations: { increment: 1 },
            totalMinutes: { increment: minutes },
            totalCost: { increment: partnerCostDollars }, // Use partner cost
            lastConversationAt: new Date(),
          },
        })
      )
    }

    await prisma.$transaction(transactionOps)

    console.log(
      `[Billing] Usage processed: ${minutes} min, ` +
      `partner cost: $${partnerCostDollars.toFixed(2)} (@ $${(partnerRateCents / 100).toFixed(2)}/min), ` +
      `provider cost: $${providerCostDollars.toFixed(2)} (internal), ` +
      `billed: $${(billedCostCents / 100).toFixed(2)}, billing_type: ${usageResult.deductedFrom}`
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

/**
 * Workspace Paywall Helper
 * 
 * Determines if a workspace is in "paywalled" state (credits exhausted, no subscription).
 * Provides utilities for enforcing read-only mode on API routes.
 */

import { prisma } from "@/lib/prisma"

// =============================================================================
// TYPES
// =============================================================================

export interface PaywallStatus {
  isPaywalled: boolean
  isBillingExempt: boolean
  hasActiveSubscription: boolean
  creditsBalanceCents: number
  reason?: string
}

// =============================================================================
// PAYWALL CHECK
// =============================================================================

/**
 * Check if a workspace is paywalled (should be in read-only mode).
 * 
 * A workspace is paywalled when:
 * - It is NOT billing exempt (uses org credits)
 * - It does NOT have an active subscription
 * - Its credits balance is <= 0
 */
export async function getWorkspacePaywallStatus(workspaceId: string): Promise<PaywallStatus> {
  if (!prisma) {
    throw new Error("Database not configured")
  }

  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/e7abe0ce-adad-4c04-8933-7a7770164db8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workspace-paywall.ts:34',message:'getWorkspacePaywallStatus called',data:{workspaceId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  // Fetch workspace with credits and subscription in one query
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      isBillingExempt: true,
      workspaceCredits: {
        select: {
          balanceCents: true,
        },
      },
      subscription: {
        select: {
          status: true,
        },
      },
    },
  })

  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/e7abe0ce-adad-4c04-8933-7a7770164db8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'workspace-paywall.ts:55',message:'Workspace fetched with subscription',data:{found:!!workspace,subscription:workspace?.subscription,isBillingExempt:workspace?.isBillingExempt,creditsBalance:workspace?.workspaceCredits?.balanceCents},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  if (!workspace) {
    return {
      isPaywalled: true,
      isBillingExempt: false,
      hasActiveSubscription: false,
      creditsBalanceCents: 0,
      reason: "Workspace not found",
    }
  }

  const isBillingExempt = workspace.isBillingExempt
  const hasActiveSubscription = workspace.subscription?.status === "active"
  const creditsBalanceCents = workspace.workspaceCredits?.balanceCents ?? 0

  // Billing exempt workspaces are never paywalled (they use partner credits)
  if (isBillingExempt) {
    return {
      isPaywalled: false,
      isBillingExempt: true,
      hasActiveSubscription,
      creditsBalanceCents,
    }
  }

  // Workspaces with an active subscription are not paywalled
  if (hasActiveSubscription) {
    return {
      isPaywalled: false,
      isBillingExempt: false,
      hasActiveSubscription: true,
      creditsBalanceCents,
    }
  }

  // Check credits balance
  if (creditsBalanceCents <= 0) {
    return {
      isPaywalled: true,
      isBillingExempt: false,
      hasActiveSubscription: false,
      creditsBalanceCents,
      reason: "Credits exhausted. Upgrade to continue.",
    }
  }

  // Has credits, not paywalled
  return {
    isPaywalled: false,
    isBillingExempt: false,
    hasActiveSubscription: false,
    creditsBalanceCents,
  }
}

/**
 * Simple boolean check for paywalled status
 */
export async function isWorkspacePaywalled(workspaceId: string): Promise<boolean> {
  const status = await getWorkspacePaywallStatus(workspaceId)
  return status.isPaywalled
}

// =============================================================================
// API RESPONSE HELPERS
// =============================================================================

/**
 * Create a paywall error response for API routes
 */
export function createPaywallErrorResponse(workspaceSlug: string): Response {
  return new Response(
    JSON.stringify({
      error: "Credits exhausted. Upgrade to continue.",
      code: "WORKSPACE_PAYWALLED",
      billingUrl: `/w/${workspaceSlug}/billing`,
    }),
    {
      status: 402, // Payment Required
      headers: {
        "Content-Type": "application/json",
      },
    }
  )
}

// =============================================================================
// ALLOWLISTED PATHS
// =============================================================================

/**
 * Check if a path should bypass paywall enforcement (billing recovery endpoints)
 */
export function isPaywallExemptPath(pathname: string): boolean {
  const exemptPatterns = [
    // Credits endpoints (allow viewing and topping up)
    /\/api\/w\/[^/]+\/credits(\/.*)?$/,
    // Subscription endpoints (allow managing subscription)
    /\/api\/w\/[^/]+\/subscription(\/.*)?$/,
    // Settings endpoint (allow viewing settings)
    /\/api\/w\/[^/]+\/settings$/,
  ]

  return exemptPatterns.some((pattern) => pattern.test(pathname))
}

/**
 * Check if an HTTP method is a mutation (should be blocked when paywalled)
 */
export function isMutationMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())
}


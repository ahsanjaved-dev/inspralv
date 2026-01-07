/**
 * GET /api/w/[workspaceSlug]/credits
 * Returns the workspace's current credits balance and recent transactions
 */

import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { getWorkspaceCreditsInfo, getWorkspaceTransactions } from "@/lib/stripe/workspace-credits"
import { getConnectAccountId } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { getWorkspacePaywallStatus } from "@/lib/billing/workspace-paywall"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const context = await getWorkspaceContext(workspaceSlug)

    if (!context) {
      return unauthorized()
    }

    // Get partner's Stripe Connect account ID
    let stripeConnectAccountId: string | null = null
    if (prisma && context.partner) {
      const partner = await prisma.partner.findUnique({
        where: { id: context.partner.id },
        select: { settings: true },
      })
      stripeConnectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown> | null) || null
    }

    const [creditsInfo, transactions, paywallStatus] = await Promise.all([
      getWorkspaceCreditsInfo(context.workspace.id),
      getWorkspaceTransactions(context.workspace.id, 10),
      getWorkspacePaywallStatus(context.workspace.id),
    ])

    return apiResponse({
      credits: creditsInfo,
      transactions,
      stripeConnectAccountId,
      // Paywall status for UI enforcement
      isPaywalled: paywallStatus.isPaywalled,
      hasActiveSubscription: paywallStatus.hasActiveSubscription,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/credits error:", error)
    return serverError((error as Error).message)
  }
}


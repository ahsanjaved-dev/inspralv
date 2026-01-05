/**
 * Available Subscription Plans for Workspace
 * GET - List all public plans from the partner
 */

import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

type RouteParams = { params: Promise<{ workspaceSlug: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug } = await params
    
    const context = await getWorkspaceContext(workspaceSlug)
    if (!context) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get all active, public plans from the partner
    const plans = await prisma.workspaceSubscriptionPlan.findMany({
      where: {
        partnerId: context.workspace.partner_id,
        isActive: true,
        isPublic: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { monthlyPriceCents: "asc" },
      ],
    })

    // Get current subscription to mark current plan
    const currentSubscription = await prisma.workspaceSubscription.findUnique({
      where: { workspaceId: context.workspace.id },
      select: { planId: true, status: true },
    })

    return apiResponse({
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPriceCents: plan.monthlyPriceCents,
        monthlyPriceDollars: (plan.monthlyPriceCents / 100).toFixed(2),
        includedMinutes: plan.includedMinutes,
        overageRateCents: plan.overageRateCents,
        overageRateDollars: (plan.overageRateCents / 100).toFixed(2),
        features: plan.features as string[],
        maxAgents: plan.maxAgents,
        maxConversationsPerMonth: plan.maxConversationsPerMonth,
        isCurrent: currentSubscription?.planId === plan.id && 
                   currentSubscription?.status === "active",
      })),
      currentPlanId: currentSubscription?.status === "active" 
        ? currentSubscription.planId 
        : null,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/subscription/plans error:", error)
    return serverError((error as Error).message)
  }
}


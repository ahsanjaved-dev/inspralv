/**
 * Individual Subscription Plan API
 * GET    - Get plan details
 * PATCH  - Update plan
 * DELETE - Deactivate plan (soft delete)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { getStripe } from "@/lib/stripe"

type RouteParams = { params: Promise<{ planId: string }> }

// Validation schema for updating a plan
// Note: billingType cannot be changed after creation (would break existing subscriptions)
const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  includedMinutes: z.number().int().min(0).optional(),
  overageRateCents: z.number().int().min(0).optional(),
  features: z.array(z.string()).optional(),
  maxAgents: z.number().int().min(1).nullable().optional(),
  maxConversationsPerMonth: z.number().int().min(1).nullable().optional(),
  // Postpaid: can update minutes limit (for postpaid plans only)
  postpaidMinutesLimit: z.number().int().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { planId } = await params
    
    const auth = await getPartnerAuthContext()
    if (!auth?.partner) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    const plan = await prisma.workspaceSubscriptionPlan.findFirst({
      where: {
        id: planId,
        partnerId: auth.partner.id,
      },
      include: {
        _count: {
          select: { subscriptions: true },
        },
        subscriptions: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            workspaceId: true,
            status: true,
            minutesUsedThisPeriod: true,
            currentPeriodEnd: true,
            createdAt: true,
          },
        },
      },
    })

    if (!plan) {
      return notFound("Subscription plan")
    }

    return apiResponse({
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPriceCents: plan.monthlyPriceCents,
        includedMinutes: plan.includedMinutes,
        overageRateCents: plan.overageRateCents,
        features: plan.features as string[],
        maxAgents: plan.maxAgents,
        maxConversationsPerMonth: plan.maxConversationsPerMonth,
        billingType: plan.billingType,
        postpaidMinutesLimit: plan.postpaidMinutesLimit,
        isActive: plan.isActive,
        isPublic: plan.isPublic,
        sortOrder: plan.sortOrder,
        stripeProductId: plan.stripeProductId,
        stripePriceId: plan.stripePriceId,
        subscriberCount: plan._count.subscriptions,
        recentSubscriptions: plan.subscriptions,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("GET /api/partner/subscription-plans/[id] error:", error)
    return serverError((error as Error).message)
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { planId } = await params
    
    const auth = await getPartnerAuthContext()
    if (!auth?.partner) {
      return unauthorized()
    }

    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can update subscription plans")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Check plan exists and belongs to partner
    const existingPlan = await prisma.workspaceSubscriptionPlan.findFirst({
      where: {
        id: planId,
        partnerId: auth.partner.id,
      },
    })

    if (!existingPlan) {
      return notFound("Subscription plan")
    }

    // Parse and validate request body
    const body = await request.json()
    const parsed = updatePlanSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid update data")
    }

    const data = parsed.data

    // Validate postpaidMinutesLimit can only be set for postpaid plans
    if (data.postpaidMinutesLimit !== undefined && existingPlan.billingType !== "postpaid") {
      return apiError("Cannot set postpaid minutes limit on a prepaid plan")
    }

    // Update Stripe product name if changed and Stripe is configured (platform partner only)
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: { isPlatformPartner: true },
    })
    const isPlatformPartner = partner?.isPlatformPartner ?? false
    
    if (data.name && existingPlan.stripeProductId && isPlatformPartner) {
      try {
        const stripe = getStripe()
        await stripe.products.update(existingPlan.stripeProductId, { name: data.name })
      } catch (stripeError) {
        console.error("Failed to update Stripe product:", stripeError)
        // Continue - don't fail the update
      }
    }

    // Update plan in database
    const updatedPlan = await prisma.workspaceSubscriptionPlan.update({
      where: { id: planId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.includedMinutes !== undefined && { includedMinutes: data.includedMinutes }),
        ...(data.overageRateCents !== undefined && { overageRateCents: data.overageRateCents }),
        ...(data.features !== undefined && { features: data.features }),
        ...(data.maxAgents !== undefined && { maxAgents: data.maxAgents }),
        ...(data.maxConversationsPerMonth !== undefined && { maxConversationsPerMonth: data.maxConversationsPerMonth }),
        ...(data.postpaidMinutesLimit !== undefined && { postpaidMinutesLimit: data.postpaidMinutesLimit }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    })

    return apiResponse({
      plan: {
        id: updatedPlan.id,
        name: updatedPlan.name,
        description: updatedPlan.description,
        monthlyPriceCents: updatedPlan.monthlyPriceCents,
        includedMinutes: updatedPlan.includedMinutes,
        overageRateCents: updatedPlan.overageRateCents,
        features: updatedPlan.features as string[],
        maxAgents: updatedPlan.maxAgents,
        maxConversationsPerMonth: updatedPlan.maxConversationsPerMonth,
        billingType: updatedPlan.billingType,
        postpaidMinutesLimit: updatedPlan.postpaidMinutesLimit,
        isActive: updatedPlan.isActive,
        isPublic: updatedPlan.isPublic,
        sortOrder: updatedPlan.sortOrder,
        stripeProductId: updatedPlan.stripeProductId,
        stripePriceId: updatedPlan.stripePriceId,
        updatedAt: updatedPlan.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("PATCH /api/partner/subscription-plans/[id] error:", error)
    return serverError((error as Error).message)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { planId } = await params
    
    const auth = await getPartnerAuthContext()
    if (!auth?.partner) {
      return unauthorized()
    }

    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can delete subscription plans")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Check plan exists and belongs to partner
    const existingPlan = await prisma.workspaceSubscriptionPlan.findFirst({
      where: {
        id: planId,
        partnerId: auth.partner.id,
      },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    })

    if (!existingPlan) {
      return notFound("Subscription plan")
    }

    // Don't allow deletion if there are active subscriptions
    if (existingPlan._count.subscriptions > 0) {
      // Soft delete - just deactivate
      await prisma.workspaceSubscriptionPlan.update({
        where: { id: planId },
        data: { isActive: false, isPublic: false },
      })

      return apiResponse({
        message: "Plan has active subscriptions and was deactivated instead of deleted",
        deactivated: true,
      })
    }

    // Archive Stripe product if exists (platform partner only)
    const partnerForDelete = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: { isPlatformPartner: true },
    })
    const isPlatformPartnerDelete = partnerForDelete?.isPlatformPartner ?? false
    
    if (existingPlan.stripeProductId && isPlatformPartnerDelete) {
      try {
        const stripe = getStripe()
        await stripe.products.update(existingPlan.stripeProductId, { active: false })
      } catch (stripeError) {
        console.error("Failed to archive Stripe product:", stripeError)
      }
    }

    // Hard delete the plan
    await prisma.workspaceSubscriptionPlan.delete({
      where: { id: planId },
    })

    return apiResponse({
      message: "Subscription plan deleted successfully",
      deleted: true,
    })
  } catch (error) {
    console.error("DELETE /api/partner/subscription-plans/[id] error:", error)
    return serverError((error as Error).message)
  }
}


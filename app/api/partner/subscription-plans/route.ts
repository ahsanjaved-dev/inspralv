/**
 * Partner Subscription Plans API
 * GET  - List all plans for the partner
 * POST - Create a new subscription plan
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "@/lib/stripe"

// Billing type enum
const billingTypeEnum = z.enum(["prepaid", "postpaid"])

// Validation schema for creating a plan
const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  monthlyPriceCents: z.number().int().min(0),
  includedMinutes: z.number().int().min(0).default(0),
  overageRateCents: z.number().int().min(0).default(20),
  features: z.array(z.string()).default([]),
  maxAgents: z.number().int().min(1).nullable().optional(),
  maxConversationsPerMonth: z.number().int().min(1).nullable().optional(),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  // Postpaid billing fields
  billingType: billingTypeEnum.default("prepaid"),
  postpaidMinutesLimit: z.number().int().min(1).nullable().optional(),
}).refine(
  (data) => {
    // If postpaid, must have a minutes limit
    if (data.billingType === "postpaid") {
      return data.postpaidMinutesLimit != null && data.postpaidMinutesLimit > 0
    }
    return true
  },
  {
    message: "Postpaid plans require a minutes limit greater than 0",
    path: ["postpaidMinutesLimit"],
  }
)

export async function GET() {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth?.partner) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    const plans = await prisma.workspaceSubscriptionPlan.findMany({
      where: {
        partnerId: auth.partner.id,
      },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    })

    return apiResponse({
      plans: plans.map((plan) => ({
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
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("GET /api/partner/subscription-plans error:", error)
    return serverError((error as Error).message)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can create plans
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can create subscription plans")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Parse and validate request body
    const body = await request.json()
    const parsed = createPlanSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid plan data")
    }

    const data = parsed.data

    // Get partner's Stripe Connect account
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: { id: true, name: true, settings: true },
    })

    if (!partner) {
      return unauthorized()
    }

    const connectAccountId = getConnectAccountId(partner.settings as Record<string, unknown>)

    let stripeProductId: string | undefined
    let stripePriceId: string | undefined

    // Create Stripe product and price if Connect is set up and price > 0
    if (connectAccountId && data.monthlyPriceCents > 0) {
      try {
        const stripe = getStripe()

        // Create product on Connect account
        const product = await stripe.products.create(
          {
            name: data.name,
            description: data.description || undefined,
            metadata: {
              partner_id: auth.partner.id,
              type: "workspace_subscription",
            },
          },
          { stripeAccount: connectAccountId }
        )

        // Create recurring price on Connect account
        const price = await stripe.prices.create(
          {
            product: product.id,
            unit_amount: data.monthlyPriceCents,
            currency: "usd",
            recurring: {
              interval: "month",
            },
            metadata: {
              partner_id: auth.partner.id,
            },
          },
          { stripeAccount: connectAccountId }
        )

        stripeProductId = product.id
        stripePriceId = price.id
      } catch (stripeError) {
        console.error("Failed to create Stripe product/price:", stripeError)
        // Continue without Stripe - can be linked later
      }
    }

    // Create the plan in database
    const plan = await prisma.workspaceSubscriptionPlan.create({
      data: {
        partnerId: auth.partner.id,
        name: data.name,
        description: data.description,
        monthlyPriceCents: data.monthlyPriceCents,
        includedMinutes: data.includedMinutes,
        overageRateCents: data.overageRateCents,
        features: data.features,
        maxAgents: data.maxAgents,
        maxConversationsPerMonth: data.maxConversationsPerMonth,
        billingType: data.billingType,
        postpaidMinutesLimit: data.billingType === "postpaid" ? data.postpaidMinutesLimit : null,
        isPublic: data.isPublic,
        sortOrder: data.sortOrder,
        stripeProductId,
        stripePriceId,
      },
    })

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
        createdAt: plan.createdAt.toISOString(),
      },
      stripeConfigured: !!stripePriceId,
    }, 201)
  } catch (error) {
    console.error("POST /api/partner/subscription-plans error:", error)
    return serverError((error as Error).message)
  }
}


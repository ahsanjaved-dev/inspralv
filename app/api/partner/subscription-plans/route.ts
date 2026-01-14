/**
 * Partner Subscription Plans API
 * GET  - List all plans for the partner
 * POST - Create a new subscription plan
 * 
 * For agencies (non-platform partners):
 * - Paid plans require Stripe Connect to be set up
 * - Stripe Product/Price is created on the agency's connected account
 * - Only subscription billing (prepaid) is supported
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "@/lib/stripe"

// Billing type enum - currently only prepaid is supported for agencies
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
  // Postpaid billing fields - currently only supported for platform partner
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

    // Get partner info to check Connect status
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: { settings: true, isPlatformPartner: true },
    })

    const isPlatformPartner = partner?.isPlatformPartner || false
    const connectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown> | null)
    const hasStripeConnect = !!connectAccountId

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
      // Include Stripe Connect status for UI
      isPlatformPartner,
      hasStripeConnect,
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

    // Get partner info including platform partner flag and settings
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: { id: true, name: true, settings: true, isPlatformPartner: true },
    })

    if (!partner) {
      return unauthorized()
    }

    const isPlatformPartner = partner.isPlatformPartner
    const connectAccountId = getConnectAccountId(partner.settings as Record<string, unknown> | null)

    // For agencies (non-platform partners): only subscription billing (prepaid) is supported
    if (!isPlatformPartner && data.billingType === "postpaid") {
      return apiError(
        "Postpaid billing is not currently supported. Please use subscription (prepaid) billing.",
        400
      )
    }

    // For paid plans, agencies must have Stripe Connect set up
    if (!isPlatformPartner && data.monthlyPriceCents > 0 && !connectAccountId) {
      return apiError(
        "Please connect your Stripe account before creating paid plans. Go to Billing settings to set up Stripe Connect.",
        400
      )
    }

    let stripeProductId: string | undefined
    let stripePriceId: string | undefined

    // Create Stripe Product/Price for paid plans
    if (data.monthlyPriceCents > 0) {
      try {
        const stripe = getStripe()

        if (isPlatformPartner) {
          // Platform partner: create on main Stripe account
          const product = await stripe.products.create({
            name: data.name,
            description: data.description || undefined,
            metadata: {
              partner_id: auth.partner.id,
              type: "workspace_subscription",
            },
          })

          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: data.monthlyPriceCents,
            currency: "usd",
            recurring: {
              interval: "month",
            },
            metadata: {
              partner_id: auth.partner.id,
            },
          })

          stripeProductId = product.id
          stripePriceId = price.id
        } else if (connectAccountId) {
          // Agency: create on their Stripe Connect account
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

          console.log(
            `[Subscription Plans] Created Stripe product/price on Connect account ${connectAccountId}: ` +
            `product=${product.id}, price=${price.id}`
          )
        }
      } catch (stripeError) {
        console.error("Failed to create Stripe product/price:", stripeError)
        // For agencies, this is a hard failure - they need Stripe set up properly
        if (!isPlatformPartner) {
          return apiError(
            "Failed to create plan in Stripe. Please ensure your Stripe Connect account is fully set up and try again.",
            500
          )
        }
        // For platform partner, continue without Stripe - can be linked later
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


/**
 * POST /api/partner/credits/topup
 * Creates a PaymentIntent for topping up credits
 * 
 * Request body: { amountCents: number }
 * Returns: { clientSecret: string, paymentIntentId: string }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { createTopupPaymentIntent, TOPUP_AMOUNTS_CENTS } from "@/lib/stripe/credits"
import { prisma } from "@/lib/prisma"
import { getOrCreateCustomer } from "@/lib/stripe"
import { checkCreditsTopupRateLimit, getRateLimitHeaders } from "@/lib/rate-limit"

const topupSchema = z.object({
  amountCents: z.number().int().positive(),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    // Only admins can top up
    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can top up credits")
    }

    // Rate limiting: 5 attempts per 5 minutes per partner
    const rateLimitResult = checkCreditsTopupRateLimit(auth.partner.id)
    if (!rateLimitResult.success) {
      const headers = getRateLimitHeaders(rateLimitResult)
      return new Response(
        JSON.stringify({
          error: "Too many top-up requests. Please try again later.",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        }
      )
    }

    // Parse request body
    const body = await request.json()
    const parsed = topupSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid amount")
    }

    const { amountCents } = parsed.data

    // Validate amount is one of the allowed presets
    const validAmounts: number[] = TOPUP_AMOUNTS_CENTS.map((a) => a.value)
    if (!validAmounts.includes(amountCents)) {
      return apiError(`Invalid top-up amount. Allowed: ${validAmounts.map((a) => `$${a / 100}`).join(", ")}`)
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get partner's Stripe customer ID (create if needed)
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        name: true,
        stripeCustomerId: true,
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    // Ensure we have a Stripe customer
    const customer = await getOrCreateCustomer(
      partner.id,
      auth.user.email,
      partner.name,
      partner.stripeCustomerId
    )

    // Update partner with customer ID if new
    if (!partner.stripeCustomerId) {
      await prisma.partner.update({
        where: { id: partner.id },
        data: { stripeCustomerId: customer.id },
      })
    }

    // Create PaymentIntent
    const { clientSecret, paymentIntentId } = await createTopupPaymentIntent(
      partner.id,
      amountCents,
      customer.id
    )

    return apiResponse({
      clientSecret,
      paymentIntentId,
      amountCents,
    })
  } catch (error) {
    console.error("POST /api/partner/credits/topup error:", error)
    return serverError((error as Error).message)
  }
}


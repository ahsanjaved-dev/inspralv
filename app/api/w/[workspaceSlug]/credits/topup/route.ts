/**
 * POST /api/w/[workspaceSlug]/credits/topup
 * Creates a PaymentIntent for topping up workspace credits via Stripe Connect
 * 
 * Request body: { amountCents: number }
 * Returns: { clientSecret: string, paymentIntentId: string }
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createWorkspaceTopupPaymentIntent, WORKSPACE_TOPUP_AMOUNTS_CENTS, getWorkspaceWithBillingInfo } from "@/lib/stripe/workspace-credits"
import { checkCreditsTopupRateLimit, getRateLimitHeaders } from "@/lib/rate-limit"

const topupSchema = z.object({
  amountCents: z.number().int().positive(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    
    // Only admins/owners can top up
    const context = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])
    if (!context) {
      return unauthorized()
    }

    // Rate limiting: 5 attempts per 5 minutes per workspace
    const rateLimitResult = checkCreditsTopupRateLimit(`workspace:${context.workspace.id}`)
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

    // Get billing info from database (includes isBillingExempt check)
    const billingInfo = await getWorkspaceWithBillingInfo(context.workspace.id)
    
    // Check if workspace is billing exempt
    if (billingInfo.isBillingExempt) {
      return apiError("This workspace is billing-exempt and uses partner credits directly.", 400)
    }

    // Parse request body
    const body = await request.json()
    const parsed = topupSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid amount")
    }

    const { amountCents } = parsed.data

    // Validate amount is one of the allowed presets
    const validAmounts: number[] = WORKSPACE_TOPUP_AMOUNTS_CENTS.map((a) => a.value)
    if (!validAmounts.includes(amountCents)) {
      return apiError(`Invalid top-up amount. Allowed: ${validAmounts.map((a) => `$${a / 100}`).join(", ")}`)
    }

    // Create PaymentIntent on partner's Connect account
    const { clientSecret, paymentIntentId } = await createWorkspaceTopupPaymentIntent(
      context.workspace.id,
      amountCents
    )

    return apiResponse({
      clientSecret,
      paymentIntentId,
      amountCents,
    })
  } catch (error) {
    console.error("POST /api/w/[slug]/credits/topup error:", error)
    return serverError((error as Error).message)
  }
}


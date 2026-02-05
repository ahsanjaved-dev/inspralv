/**
 * Partner Pricing Configuration API
 * 
 * GET /api/partner/pricing - Fetch current partner pricing configuration
 * PATCH /api/partner/pricing - Update partner per-minute rate
 * 
 * The per-minute rate set here is the canonical pricing rate that:
 * - Applies uniformly to all workspaces under the partner
 * - Is used for billing calculations when deducting credits
 * - Is displayed in call logs, agent stats, and analytics (hiding provider costs)
 */

import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
import { getOrCreatePartnerCredits, DEFAULT_PER_MINUTE_RATE_CENTS } from "@/lib/stripe/credits"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Validation schema for updating pricing
const updatePricingSchema = z.object({
  // Rate in dollars (will be converted to cents for storage)
  perMinuteRate: z
    .number()
    .min(0.01, "Minimum rate is $0.01 per minute")
    .max(10.00, "Maximum rate is $10.00 per minute")
    .optional(),
  // Alternative: rate in cents (direct storage)
  perMinuteRateCents: z
    .number()
    .int("Rate must be a whole number of cents")
    .min(1, "Minimum rate is 1 cent ($0.01) per minute")
    .max(1000, "Maximum rate is 1000 cents ($10.00) per minute")
    .optional(),
}).refine(
  (data) => data.perMinuteRate !== undefined || data.perMinuteRateCents !== undefined,
  { message: "Either perMinuteRate (dollars) or perMinuteRateCents must be provided" }
)

/**
 * GET /api/partner/pricing
 * Returns the current partner pricing configuration
 */
export async function GET() {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    // Get or create billing credits record (includes perMinuteRateCents)
    const credits = await getOrCreatePartnerCredits(auth.partner.id)

    return apiResponse({
      pricing: {
        // Rate in cents (raw value from database)
        perMinuteRateCents: credits.perMinuteRateCents,
        // Rate in dollars (for display)
        perMinuteRate: credits.perMinuteRateCents / 100,
        // Formatted rate string
        perMinuteRateFormatted: `$${(credits.perMinuteRateCents / 100).toFixed(2)}`,
        // Default rate for reference
        defaultRateCents: DEFAULT_PER_MINUTE_RATE_CENTS,
        defaultRate: DEFAULT_PER_MINUTE_RATE_CENTS / 100,
      },
      partner: {
        id: auth.partner.id,
        name: auth.partner.name,
      },
    })
  } catch (error) {
    console.error("GET /api/partner/pricing error:", error)
    return serverError((error as Error).message)
  }
}

/**
 * PATCH /api/partner/pricing
 * Updates the partner per-minute rate
 * Only partner admins/owners can update pricing
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    // Only partner admins/owners can update pricing
    if (!isPartnerAdmin(auth)) {
      return forbidden("Only organization admins can update pricing configuration")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = updatePricingSchema.safeParse(body)

    if (!parseResult.success) {
      return apiError(getValidationError(parseResult.error))
    }

    const { perMinuteRate, perMinuteRateCents: rateCentsInput } = parseResult.data

    // Calculate rate in cents (prefer perMinuteRateCents if provided, otherwise convert from dollars)
    let newRateCents: number
    if (rateCentsInput !== undefined) {
      newRateCents = rateCentsInput
    } else if (perMinuteRate !== undefined) {
      // Convert dollars to cents (round to nearest cent)
      newRateCents = Math.round(perMinuteRate * 100)
    } else {
      // This shouldn't happen due to schema refinement, but TypeScript doesn't know that
      return apiError("Either perMinuteRate or perMinuteRateCents must be provided")
    }

    // Ensure rate is within valid bounds (extra safety check)
    if (newRateCents < 1 || newRateCents > 1000) {
      return apiError("Per-minute rate must be between $0.01 and $10.00")
    }

    // Get or create billing credits record
    const existingCredits = await getOrCreatePartnerCredits(auth.partner.id)

    // Update the per-minute rate
    const updatedCredits = await prisma.billingCredits.update({
      where: { id: existingCredits.id },
      data: {
        perMinuteRateCents: newRateCents,
        updatedAt: new Date(),
      },
    })

    console.log(
      `[Pricing] Partner ${auth.partner.id} updated per-minute rate from ${existingCredits.perMinuteRateCents} to ${newRateCents} cents`
    )

    return apiResponse({
      success: true,
      pricing: {
        perMinuteRateCents: updatedCredits.perMinuteRateCents,
        perMinuteRate: updatedCredits.perMinuteRateCents / 100,
        perMinuteRateFormatted: `$${(updatedCredits.perMinuteRateCents / 100).toFixed(2)}`,
        previousRateCents: existingCredits.perMinuteRateCents,
        previousRate: existingCredits.perMinuteRateCents / 100,
      },
      partner: {
        id: auth.partner.id,
        name: auth.partner.name,
      },
    })
  } catch (error) {
    console.error("PATCH /api/partner/pricing error:", error)
    return serverError((error as Error).message)
  }
}


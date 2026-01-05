/**
 * Stripe Connect Onboarding Routes
 * 
 * POST /api/partner/stripe/connect - Create Connect account and get onboarding link
 * GET /api/partner/stripe/connect - Check Connect account status
 */

import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { getStripe, getConnectAccountId } from "@/lib/stripe"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

/**
 * GET - Check Connect account status
 */
export async function GET() {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get partner with Connect account info
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        name: true,
        settings: true,
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    // Check for Connect account ID in settings (handles both key formats)
    const settings = partner.settings as Record<string, unknown> || {}
    const stripeConnectAccountId = getConnectAccountId(settings)

    if (!stripeConnectAccountId) {
      return apiResponse({
        connected: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingComplete: false,
      })
    }

    // Retrieve account status from Stripe
    const stripe = getStripe()
    try {
      const account = await stripe.accounts.retrieve(stripeConnectAccountId)

      return apiResponse({
        connected: true,
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        onboardingComplete: account.details_submitted,
        businessType: account.business_type,
        country: account.country,
      })
    } catch {
      // Account doesn't exist or was deleted
      return apiResponse({
        connected: false,
        accountId: stripeConnectAccountId,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingComplete: false,
        error: "Account not found in Stripe",
      })
    }
  } catch (error) {
    console.error("GET /api/partner/stripe/connect error:", error)
    return serverError((error as Error).message)
  }
}

/**
 * POST - Create Connect account and get onboarding link
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    // Only admins can set up Connect
    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can set up Stripe Connect")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get partner
    const partner = await prisma.partner.findUnique({
      where: { id: auth.partner.id },
      select: {
        id: true,
        name: true,
        settings: true,
      },
    })

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    const stripe = getStripe()
    const settings = partner.settings as Record<string, unknown> || {}
    let stripeConnectAccountId = getConnectAccountId(settings)

    // Create Connect account if doesn't exist
    if (!stripeConnectAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US", // Default, can be changed during onboarding
        email: auth.user.email,
        metadata: {
          partner_id: partner.id,
          partner_name: partner.name,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      })

      stripeConnectAccountId = account.id

      // Save Connect account ID to partner settings
      await prisma.partner.update({
        where: { id: partner.id },
        data: {
          settings: {
            ...settings,
            stripe_connect_account_id: stripeConnectAccountId,
          },
        },
      })
    }

    // Parse optional return/refresh URLs from request body
    let returnUrl = `${env.appUrl}/org/settings?connect=complete`
    let refreshUrl = `${env.appUrl}/org/settings?connect=refresh`

    try {
      const body = await request.json()
      if (body.returnUrl) returnUrl = body.returnUrl
      if (body.refreshUrl) refreshUrl = body.refreshUrl
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Create Account Link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeConnectAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    })

    return apiResponse({
      accountId: stripeConnectAccountId,
      onboardingUrl: accountLink.url,
    })
  } catch (error) {
    console.error("POST /api/partner/stripe/connect error:", error)
    return serverError((error as Error).message)
  }
}


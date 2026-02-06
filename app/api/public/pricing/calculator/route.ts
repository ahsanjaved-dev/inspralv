/**
 * Public API - Cost Calculator Pricing Data
 * GET - Returns pricing information needed for the call cost calculator
 * 
 * No authentication required - this is public pricing information
 * that visitors see on the partner's pricing page.
 * 
 * Returns:
 * - Partner's per-minute rate (for pay-as-you-go)
 * - Available subscription plans with included minutes and overage rates
 */

import { NextRequest } from "next/server"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"
import { getPartnerFromHost } from "@/lib/api/partner"
import { prisma } from "@/lib/prisma"
import { workspacePlans } from "@/config/plans"
import { DEFAULT_PER_MINUTE_RATE_CENTS } from "@/lib/stripe/credits"

export interface CalculatorPlan {
  id: string
  name: string
  slug: string
  monthlyPriceCents: number
  monthlyPrice: number
  includedMinutes: number
  overageRateCents: number
  overageRate: number
  billingType: "prepaid" | "postpaid"
  isPayAsYouGo: boolean // True if this is a credits-based plan (no subscription)
}

export interface CalculatorPricingResponse {
  // Partner's per-minute rate for pay-as-you-go (credits) usage
  perMinuteRateCents: number
  perMinuteRate: number
  perMinuteRateFormatted: string
  
  // Available plans for comparison
  plans: CalculatorPlan[]
  
  // Partner info
  partner: {
    id: string
    name: string
    isPlatformPartner: boolean
    branding: {
      companyName: string | null
      primaryColor: string | null
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Resolve partner from hostname
    const partner = await getPartnerFromHost()

    if (!partner) {
      return apiError("Partner not found", 404)
    }

    // For platform partner, return hardcoded plans from config
    if (partner.is_platform_partner) {
      const plans: CalculatorPlan[] = [
        {
          id: "free",
          name: workspacePlans.free.name,
          slug: "free",
          monthlyPriceCents: 0,
          monthlyPrice: 0,
          includedMinutes: 0, // Pay-as-you-go
          overageRateCents: DEFAULT_PER_MINUTE_RATE_CENTS, // Same as pay-as-you-go rate
          overageRate: DEFAULT_PER_MINUTE_RATE_CENTS / 100,
          billingType: "prepaid",
          isPayAsYouGo: true,
        },
        {
          id: "pro",
          name: workspacePlans.pro.name,
          slug: "pro",
          monthlyPriceCents: workspacePlans.pro.monthlyPriceCents,
          monthlyPrice: workspacePlans.pro.monthlyPriceCents / 100,
          includedMinutes: workspacePlans.pro.features.maxMinutesPerMonth,
          overageRateCents: 8, // $0.08/min overage for Pro
          overageRate: 0.08,
          billingType: "prepaid",
          isPayAsYouGo: false,
        },
      ]

      return apiResponse({
        perMinuteRateCents: DEFAULT_PER_MINUTE_RATE_CENTS,
        perMinuteRate: DEFAULT_PER_MINUTE_RATE_CENTS / 100,
        perMinuteRateFormatted: `$${(DEFAULT_PER_MINUTE_RATE_CENTS / 100).toFixed(2)}`,
        plans,
        partner: {
          id: partner.id,
          name: partner.name,
          isPlatformPartner: true,
          branding: {
            companyName: partner.branding?.company_name || null,
            primaryColor: partner.branding?.primary_color || null,
          },
        },
      } as CalculatorPricingResponse)
    }

    // For white-label partners: fetch their pricing info
    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get partner's billing credits for per-minute rate
    const billingCredits = await prisma.billingCredits.findUnique({
      where: { partnerId: partner.id },
      select: { perMinuteRateCents: true },
    })

    const perMinuteRateCents = billingCredits?.perMinuteRateCents ?? DEFAULT_PER_MINUTE_RATE_CENTS

    // Get active, public subscription plans
    const dbPlans = await prisma.workspaceSubscriptionPlan.findMany({
      where: {
        partnerId: partner.id,
        isActive: true,
        isPublic: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { monthlyPriceCents: "asc" },
      ],
    })

    // Transform to calculator format
    const plans: CalculatorPlan[] = dbPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug || plan.name.toLowerCase().replace(/\s+/g, "-"),
      monthlyPriceCents: plan.monthlyPriceCents,
      monthlyPrice: plan.monthlyPriceCents / 100,
      includedMinutes: plan.includedMinutes,
      overageRateCents: plan.overageRateCents,
      overageRate: plan.overageRateCents / 100,
      billingType: plan.billingType,
      isPayAsYouGo: plan.includedMinutes === 0 && plan.monthlyPriceCents === 0,
    }))

    // If no plans defined, add a virtual "Pay-as-you-go" plan
    if (plans.length === 0) {
      plans.push({
        id: "pay-as-you-go",
        name: "Pay-as-you-go",
        slug: "pay-as-you-go",
        monthlyPriceCents: 0,
        monthlyPrice: 0,
        includedMinutes: 0,
        overageRateCents: perMinuteRateCents,
        overageRate: perMinuteRateCents / 100,
        billingType: "prepaid",
        isPayAsYouGo: true,
      })
    }

    return apiResponse({
      perMinuteRateCents,
      perMinuteRate: perMinuteRateCents / 100,
      perMinuteRateFormatted: `$${(perMinuteRateCents / 100).toFixed(2)}`,
      plans,
      partner: {
        id: partner.id,
        name: partner.name,
        isPlatformPartner: false,
        branding: {
          companyName: partner.branding?.company_name || null,
          primaryColor: partner.branding?.primary_color || null,
        },
      },
    } as CalculatorPricingResponse)
  } catch (error) {
    console.error("GET /api/public/pricing/calculator error:", error)
    return serverError()
  }
}


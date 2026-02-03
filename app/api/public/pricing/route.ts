/**
 * Public API - Partner Pricing Plans
 * GET - List active, public subscription plans for a partner
 * 
 * No authentication required - this is public pricing information
 * that visitors see on the partner's pricing page.
 * 
 * The partner is resolved from the hostname (white-label domain support).
 */

import { NextRequest } from "next/server"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"
import { getPartnerFromHost } from "@/lib/api/partner"
import { prisma } from "@/lib/prisma"

export interface PublicPlan {
  id: string
  slug: string
  name: string
  description: string | null
  monthlyPriceCents: number
  monthlyPrice: number // Convenience: price in dollars
  includedMinutes: number
  overageRateCents: number
  features: string[]
  maxAgents: number | null
  maxConversationsPerMonth: number | null
  isPopular: boolean
  sortOrder: number
}

export interface PublicPricingResponse {
  plans: PublicPlan[]
  partner: {
    id: string
    name: string
    isPlatformPartner: boolean
    branding: {
      companyName: string | null
      primaryColor: string | null
      logoUrl: string | null
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

    // For platform partner, return empty - they use hardcoded plans from config/plans.ts
    if (partner.is_platform_partner) {
      return apiResponse({
        plans: [],
        partner: {
          id: partner.id,
          name: partner.name,
          isPlatformPartner: true,
          branding: {
            companyName: partner.branding?.company_name || null,
            primaryColor: partner.branding?.primary_color || null,
            logoUrl: partner.branding?.logo_url || null,
          },
        },
      } as PublicPricingResponse)
    }

    // For white-label partners: fetch their public subscription plans
    if (!prisma) {
      return serverError("Database not configured")
    }

    const plans = await prisma.workspaceSubscriptionPlan.findMany({
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

    // Transform to public-safe format (don't expose Stripe IDs)
    const publicPlans: PublicPlan[] = plans.map((plan, index) => ({
      id: plan.id,
      slug: plan.slug || plan.name.toLowerCase().replace(/\s+/g, "-"),
      name: plan.name,
      description: plan.description,
      monthlyPriceCents: plan.monthlyPriceCents,
      monthlyPrice: plan.monthlyPriceCents / 100,
      includedMinutes: plan.includedMinutes,
      overageRateCents: plan.overageRateCents,
      features: (plan.features as string[]) || [],
      maxAgents: plan.maxAgents,
      maxConversationsPerMonth: plan.maxConversationsPerMonth,
      isPopular: index === 1, // Second plan is "popular" by default, can be enhanced later
      sortOrder: plan.sortOrder,
    }))

    return apiResponse({
      plans: publicPlans,
      partner: {
        id: partner.id,
        name: partner.name,
        isPlatformPartner: false,
        branding: {
          companyName: partner.branding?.company_name || null,
          primaryColor: partner.branding?.primary_color || null,
          logoUrl: partner.branding?.logo_url || null,
        },
      },
    } as PublicPricingResponse)
  } catch (error) {
    console.error("GET /api/public/pricing error:", error)
    return serverError()
  }
}


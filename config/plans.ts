// =============================================================================
// GENIUS365 SIMPLIFIED PLAN CONFIGURATION
// =============================================================================
// 3-Tier Plan Structure:
// 1. FREE - Get started with $10 credits, no credit card required
// 2. PRO ($99/mo) - For growing businesses with included minutes
// 3. AGENCY - White-label partnership (custom pricing, request-only)
// =============================================================================

// =============================================================================
// WORKSPACE PLANS (Customer-facing)
// =============================================================================

export interface WorkspacePlanFeatures {
  maxAgents: number
  maxMinutesPerMonth: number // 0 = pay-as-you-go with credits
  maxIntegrations: number // -1 = unlimited
  storageGB: number // -1 = unlimited
  freeCredits?: number // Initial credits in dollars (Free plan only)
  hasApiAccess: boolean
  hasPrioritySupport: boolean
  hasCustomBranding: boolean
  hasAdvancedAnalytics: boolean
}

export interface WorkspacePlanDefinition {
  name: string
  slug: string
  description: string
  monthlyPriceCents: number // 0 = free, null = custom/contact
  features: WorkspacePlanFeatures
  featuresList: string[]
  isPopular?: boolean
  ctaText: string
  ctaHref: string
  stripePriceEnvKey?: string // Environment variable key for Stripe price ID
}

/**
 * The 3 workspace plans
 */
export const workspacePlans = {
  free: {
    name: "Free",
    slug: "free",
    description: "Start building with $10 in credits - no credit card required",
    monthlyPriceCents: 0,
    features: {
      maxAgents: 2,
      maxMinutesPerMonth: 0, // Pay-as-you-go with credits
      maxIntegrations: 2,
      storageGB: 2,
      freeCredits: 10, // $10 in credits
      hasApiAccess: false,
      hasPrioritySupport: false,
      hasCustomBranding: false,
      hasAdvancedAnalytics: false,
    },
    featuresList: [
      "$10 free credits to start",
      "2 AI agents",
      "2 provider integrations",
      "2GB storage",
      "Community support",
      "Pay-as-you-go pricing",
    ],
    ctaText: "Start Free",
    ctaHref: "/signup?plan=free",
  },
  pro: {
    name: "Pro",
    slug: "pro",
    description: "Everything you need to scale your AI voice operations",
    monthlyPriceCents: 9900, // $99/mo
    isPopular: true,
    features: {
      maxAgents: 25,
      maxMinutesPerMonth: 3000, // 3,000 included minutes
      maxIntegrations: -1, // Unlimited
      storageGB: 50,
      hasApiAccess: true,
      hasPrioritySupport: true,
      hasCustomBranding: true,
      hasAdvancedAnalytics: true,
    },
    featuresList: [
      "25 AI agents",
      "3,000 minutes/month included",
      "Unlimited integrations",
      "50GB storage",
      "API access",
      "Priority support",
      "Custom branding",
      "Advanced analytics",
      "$0.08/min overage",
    ],
    ctaText: "Get Pro",
    ctaHref: "/signup?plan=pro",
    stripePriceEnvKey: "STRIPE_PRICE_PRO",
  },
  agency: {
    name: "Agency",
    slug: "agency",
    description: "White-label platform for agencies and resellers",
    monthlyPriceCents: -1, // Custom pricing
    features: {
      maxAgents: -1, // Unlimited
      maxMinutesPerMonth: -1, // Custom
      maxIntegrations: -1, // Unlimited
      storageGB: -1, // Unlimited
      hasApiAccess: true,
      hasPrioritySupport: true,
      hasCustomBranding: true,
      hasAdvancedAnalytics: true,
    },
    featuresList: [
      "Unlimited AI agents",
      "Custom minute pools",
      "White-label platform",
      "Custom domain",
      "Create your own pricing plans",
      "Dedicated account manager",
      "24/7 priority support",
      "SLA guarantees",
      "Revenue sharing model",
    ],
    ctaText: "Request Access",
    ctaHref: "/request-partner",
  },
} as const satisfies Record<string, WorkspacePlanDefinition>

export type PlanSlug = keyof typeof workspacePlans

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get workspace plan by slug
 */
export function getWorkspacePlan(slug: string): WorkspacePlanDefinition | undefined {
  return workspacePlans[slug as PlanSlug]
}

/**
 * Get all workspace plans as an array (sorted by price)
 */
export function getWorkspacePlansArray(): WorkspacePlanDefinition[] {
  return Object.values(workspacePlans).sort((a, b) => {
    // Custom pricing (-1) goes last
    if (a.monthlyPriceCents === -1) return 1
    if (b.monthlyPriceCents === -1) return -1
    return a.monthlyPriceCents - b.monthlyPriceCents
  })
}

/**
 * Check if a plan requires payment (is a paid plan)
 */
export function isPaidPlan(slug: string): boolean {
  const plan = getWorkspacePlan(slug)
  return plan ? plan.monthlyPriceCents > 0 : false
}

/**
 * Check if a plan is the agency/white-label plan
 */
export function isAgencyPlan(slug: string): boolean {
  return slug === "agency"
}

/**
 * Format price in cents to display string
 */
export function formatPrice(priceCents: number | null): string {
  if (priceCents === null || priceCents === -1) return "Custom"
  if (priceCents === 0) return "Free"
  return `$${(priceCents / 100).toFixed(0)}`
}

/**
 * Format feature limit (-1 = unlimited, 0 = N/A or pay-as-you-go)
 */
export function formatLimit(limit: number): string {
  if (limit === -1) return "Unlimited"
  if (limit === 0) return "—"
  return limit.toLocaleString()
}

// =============================================================================
// LEGACY EXPORTS (for backwards compatibility)
// =============================================================================
// These maintain compatibility with existing code that uses the old structure

/**
 * @deprecated Use workspacePlans instead
 * Legacy plans object for backwards compatibility
 */
export const plans = {
  free: {
    name: workspacePlans.free.name,
    price: 0,
    features: workspacePlans.free.features,
    features_list: workspacePlans.free.featuresList,
  },
  // New canonical keys (preferred)
  pro: {
    name: workspacePlans.pro.name,
    price: 99,
    features: workspacePlans.pro.features,
    features_list: workspacePlans.pro.featuresList,
  },
  agency: {
    name: workspacePlans.agency.name,
    price: null,
    features: workspacePlans.agency.features,
    features_list: workspacePlans.agency.featuresList,
  },
  starter: {
    // Map old 'starter' to 'pro' for backwards compatibility
    name: workspacePlans.pro.name,
    price: 99,
    features: workspacePlans.pro.features,
    features_list: workspacePlans.pro.featuresList,
  },
  professional: {
    // Alias for pro
    name: workspacePlans.pro.name,
    price: 99,
    features: workspacePlans.pro.features,
    features_list: workspacePlans.pro.featuresList,
  },
  enterprise: {
    // Map old 'enterprise' to 'agency'
    name: workspacePlans.agency.name,
    price: null,
    features: workspacePlans.agency.features,
    features_list: workspacePlans.agency.featuresList,
  },
}

/**
 * @deprecated Use defaultWorkspacePlans instead
 */
export const defaultWorkspacePlans = workspacePlans

/**
 * @deprecated Use workspacePlans.agency instead
 */
export const whitelabelPartnership = {
  name: workspacePlans.agency.name,
  description: workspacePlans.agency.description,
  features: workspacePlans.agency.featuresList,
  ctaText: workspacePlans.agency.ctaText,
  ctaHref: workspacePlans.agency.ctaHref,
}

/**
 * @deprecated
 */
export type PlanTier = keyof typeof plans

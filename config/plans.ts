// =============================================================================
// GENIUS365 PLAN CONFIGURATION
// =============================================================================
// Platform plans for AI Voice Agent workspaces
// 
// PRICING MODEL:
// - Per-minute rate is set at the organization/partner level (default: $0.15/min)
// - Organizations can customize their own rate for their customers
// - Free plan uses credits, Pro plan has included minutes with overage
// =============================================================================

// =============================================================================
// WORKSPACE PLAN FEATURES INTERFACE
// =============================================================================

export interface WorkspacePlanFeatures {
  // Agent limits
  maxAgents: number                // Number of AI voice agents allowed (-1 = unlimited)
  
  // Minutes/Usage
  maxMinutesPerMonth: number       // 0 = pay-as-you-go with credits, -1 = unlimited
  freeCredits?: number             // Initial free credits in dollars (Free plan only)
  overageRateCents?: number        // Overage rate in cents per minute (Pro plan)
  
  // Resources
  maxIntegrations: number          // Provider integrations (VAPI, Retell) - -1 = unlimited
  storageGB: number                // Knowledge base storage in GB (-1 = unlimited)
  maxTeamMembers: number           // Team members per workspace (-1 = unlimited)
  maxPhoneNumbers: number          // Phone numbers allowed (-1 = unlimited)
  
  // Feature flags
  hasWebCalls: boolean             // Browser-based test calls
  hasInboundCalls: boolean         // Inbound phone calls
  hasOutboundCalls: boolean        // Outbound phone calls
  hasCampaigns: boolean            // Batch outbound campaign feature
  hasKnowledgeBase: boolean        // Knowledge base documents
  hasCallRecording: boolean        // Call recording feature
  hasTranscription: boolean        // Call transcription
  hasSentimentAnalysis: boolean    // AI sentiment analysis
  hasLeadCapture: boolean          // Lead capture from calls
  hasApiAccess: boolean            // REST API access
  hasAdvancedAnalytics: boolean    // Advanced analytics & reports
  hasCustomBranding: boolean       // Custom workspace branding
  hasPrioritySupport: boolean      // Priority support access
  
  // Agency-specific
  maxWorkspaces?: number           // For agency plans: workspaces included (-1 = unlimited)
}

export interface WorkspacePlanDefinition {
  name: string
  slug: string
  description: string
  monthlyPriceCents: number        // 0 = free, -1 = custom/contact
  features: WorkspacePlanFeatures
  featuresList: string[]           // Marketing feature bullets
  isPopular?: boolean
  ctaText: string
  ctaHref: string
  stripePriceEnvKey?: string       // Environment variable for Stripe price ID
}

// =============================================================================
// WORKSPACE PLANS
// =============================================================================

/**
 * Genius365 Workspace Plans
 * 
 * FREE: Perfect for testing and small projects
 * - Get started with $10 free credits (~66 minutes at $0.15/min)
 * - 1 AI agent to test your use case
 * - Web calls for testing
 * - Pay-as-you-go after credits run out
 * 
 * PRO: For growing businesses
 * - 3,000 minutes included (worth $450 at pay-as-you-go!)
 * - 10 AI agents for different use cases
 * - Full phone capabilities + campaigns
 * - $0.08/min overage (47% savings vs pay-as-you-go)
 */
export const workspacePlans = {
  free: {
    name: "Free",
    slug: "free",
    description: "Start with $10 free credits to test AI voice agents",
    monthlyPriceCents: 0,
    features: {
      // Agent limits
      maxAgents: 1,
      
      // Minutes/Usage
      maxMinutesPerMonth: 0,          // Pay-as-you-go with credits
      freeCredits: 10,                // $10 free credits (~66 min at $0.15/min)
      
      // Resources
      maxIntegrations: 1,             // 1 provider (VAPI or Retell)
      storageGB: 1,                   // 1GB knowledge base storage
      maxTeamMembers: 1,              // Just the owner
      maxPhoneNumbers: 0,             // No phone numbers (web calls only)
      
      // Feature flags
      hasWebCalls: true,              // Can test via browser
      hasInboundCalls: false,         // No inbound phone calls
      hasOutboundCalls: false,        // No outbound phone calls
      hasCampaigns: false,            // No campaign feature
      hasKnowledgeBase: true,         // Basic knowledge base
      hasCallRecording: true,         // Recordings included
      hasTranscription: true,         // Transcription included
      hasSentimentAnalysis: false,    // No sentiment analysis
      hasLeadCapture: false,          // No lead capture
      hasApiAccess: false,            // No API access
      hasAdvancedAnalytics: false,    // Basic analytics only
      hasCustomBranding: false,       // No custom branding
      hasPrioritySupport: false,      // Community support only
    },
    featuresList: [
      "$10 free credits to start",
      "1 AI voice agent",
      "Web calls for testing",
      "Call recording & transcription",
      "Basic knowledge base (1GB)",
      "Pay-as-you-go pricing",
      "Community support",
    ],
    ctaText: "Start Free",
    ctaHref: "/signup?plan=free",
  },
  
  pro: {
    name: "Pro",
    slug: "pro",
    description: "Everything you need to scale AI voice operations",
    monthlyPriceCents: 9900,          // $99/month
    isPopular: true,
    features: {
      // Agent limits
      maxAgents: 10,
      
      // Minutes/Usage
      maxMinutesPerMonth: 3000,       // 3,000 minutes included
      overageRateCents: 8,            // $0.08/min overage (47% savings)
      
      // Resources
      maxIntegrations: -1,            // Unlimited integrations
      storageGB: 25,                  // 25GB knowledge base storage
      maxTeamMembers: 5,              // 5 team members
      maxPhoneNumbers: 3,             // 3 phone numbers
      
      // Feature flags
      hasWebCalls: true,              // Web calls included
      hasInboundCalls: true,          // Inbound phone calls
      hasOutboundCalls: true,         // Outbound phone calls
      hasCampaigns: true,             // Campaign feature enabled
      hasKnowledgeBase: true,         // Full knowledge base
      hasCallRecording: true,         // Recordings included
      hasTranscription: true,         // Transcription included
      hasSentimentAnalysis: true,     // Sentiment analysis
      hasLeadCapture: true,           // Lead capture from calls
      hasApiAccess: true,             // Full API access
      hasAdvancedAnalytics: true,     // Advanced analytics
      hasCustomBranding: true,        // Custom branding
      hasPrioritySupport: true,       // Priority support
    },
    featuresList: [
      "3,000 minutes/month included",
      "10 AI voice agents",
      "Inbound & outbound calls",
      "3 phone numbers",
      "Campaign management",
      "Knowledge base (25GB)",
      "Advanced analytics",
      "5 team members",
      "API access",
      "Priority support",
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
    monthlyPriceCents: -1,            // Custom pricing
    features: {
      // Agent limits
      maxAgents: -1,                  // Unlimited
      
      // Minutes/Usage
      maxMinutesPerMonth: -1,         // Custom
      
      // Resources
      maxIntegrations: -1,            // Unlimited
      storageGB: -1,                  // Unlimited
      maxTeamMembers: -1,             // Unlimited
      maxPhoneNumbers: -1,            // Unlimited
      maxWorkspaces: 30,              // 30 workspaces included
      
      // Feature flags - All enabled
      hasWebCalls: true,
      hasInboundCalls: true,
      hasOutboundCalls: true,
      hasCampaigns: true,
      hasKnowledgeBase: true,
      hasCallRecording: true,
      hasTranscription: true,
      hasSentimentAnalysis: true,
      hasLeadCapture: true,
      hasApiAccess: true,
      hasAdvancedAnalytics: true,
      hasCustomBranding: true,
      hasPrioritySupport: true,
    },
    featuresList: [
      "30 client workspaces",
      "Unlimited AI agents",
      "White-label platform",
      "Custom domain & branding",
      "Set your own pricing",
      "Revenue sharing model",
      "Dedicated account manager",
      "24/7 priority support",
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
 * Check if a plan requires payment
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
 * Format feature limit (-1 = unlimited, 0 = N/A)
 */
export function formatLimit(limit: number): string {
  if (limit === -1) return "Unlimited"
  if (limit === 0) return "—"
  return limit.toLocaleString()
}

// =============================================================================
// LEGACY EXPORTS (for backwards compatibility)
// =============================================================================

/**
 * @deprecated Use workspacePlans instead
 */
export const plans = {
  free: {
    name: workspacePlans.free.name,
    price: 0,
    features: workspacePlans.free.features,
    features_list: workspacePlans.free.featuresList,
  },
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
  // Legacy aliases
  starter: {
    name: workspacePlans.pro.name,
    price: 99,
    features: workspacePlans.pro.features,
    features_list: workspacePlans.pro.featuresList,
  },
  professional: {
    name: workspacePlans.pro.name,
    price: 99,
    features: workspacePlans.pro.features,
    features_list: workspacePlans.pro.featuresList,
  },
  enterprise: {
    name: workspacePlans.agency.name,
    price: null,
    features: workspacePlans.agency.features,
    features_list: workspacePlans.agency.featuresList,
  },
}

/** @deprecated Use workspacePlans instead */
export const defaultWorkspacePlans = workspacePlans

/** @deprecated Use workspacePlans.agency instead */
export const whitelabelPartnership = {
  name: workspacePlans.agency.name,
  description: workspacePlans.agency.description,
  features: workspacePlans.agency.featuresList,
  ctaText: workspacePlans.agency.ctaText,
  ctaHref: workspacePlans.agency.ctaHref,
}

/** @deprecated */
export type PlanTier = keyof typeof plans

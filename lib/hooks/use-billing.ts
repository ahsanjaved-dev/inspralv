/**
 * React Query hooks for billing operations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/fetcher"

// =============================================================================
// TYPES
// =============================================================================

export interface WhiteLabelVariantInfo {
  id: string
  slug: string
  name: string
  description: string | null
  monthlyPriceCents: number
  stripePriceId: string | null
  maxWorkspaces: number
}

export interface BillingSubscription {
  planTier: string
  planName: string
  planPrice: number | null
  status: string
  hasActiveSubscription: boolean
  hasStripeCustomer: boolean
  hasStripeSubscription: boolean
}

export interface BillingInfo {
  partner: {
    id: string
    name: string
    isBillingExempt: boolean
  }
  subscription: BillingSubscription
  whiteLabelVariant: WhiteLabelVariantInfo | null
  features: Record<string, number>
  features_list: string[]
}

export interface CheckoutResponse {
  sessionId: string
  url: string
}

export interface PortalResponse {
  url: string
}

export interface ConnectStatus {
  connected: boolean
  accountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  onboardingComplete: boolean
  businessType?: string
  country?: string
  error?: string
}

export interface ConnectOnboardingResponse {
  accountId: string
  onboardingUrl: string
}

export interface CreditsInfo {
  balanceCents: number
  balanceDollars: number
  lowBalanceThresholdCents: number
  perMinuteRateCents: number
  isLowBalance: boolean
  estimatedMinutesRemaining: number
}

export interface CreditTransaction {
  id: string
  type: "topup" | "usage" | "refund" | "adjustment"
  amountCents: number
  balanceAfterCents: number
  description: string | null
  createdAt: string
}

export interface CreditsResponse {
  credits: CreditsInfo
  transactions: CreditTransaction[]
}

export interface TopupIntentResponse {
  clientSecret: string
  paymentIntentId: string
  amountCents: number
}

export interface PlanChangePreview {
  currentPlan: string
  newPlan: string
  prorationAmount: number
  prorationAmountDollars: string
  immediateCharge: boolean
  nextBillingDate: string
  isUpgrade: boolean
}

export interface PlanChangeResponse {
  success: boolean
  newPlan: string
  prorationAmount: number
  prorationAmountDollars: string
  immediateCharge: boolean
  message: string
}

export interface PartnerPricingInfo {
  perMinuteRateCents: number
  perMinuteRate: number
  perMinuteRateFormatted: string
  defaultRateCents: number
  defaultRate: number
}

export interface PartnerPricingResponse {
  pricing: PartnerPricingInfo
  partner: {
    id: string
    name: string
  }
}

export interface UpdatePartnerPricingResponse {
  success: boolean
  pricing: PartnerPricingInfo & {
    previousRateCents: number
    previousRate: number
  }
  partner: {
    id: string
    name: string
  }
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const billingKeys = {
  all: ["billing"] as const,
  info: () => [...billingKeys.all, "info"] as const,
  connect: () => [...billingKeys.all, "connect"] as const,
  credits: () => [...billingKeys.all, "credits"] as const,
  pricing: () => [...billingKeys.all, "pricing"] as const,
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Get current billing/subscription info
 */
export function useBillingInfo() {
  return useQuery({
    queryKey: billingKeys.info(),
    queryFn: () => apiFetch<BillingInfo>("/api/partner/billing"),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Create checkout session mutation for partner billing
 * Uses the assigned WhiteLabelVariant's Stripe price.
 * Partners must have a variant assigned by super admin during provisioning.
 */
export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/partner/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create checkout session")
      }

      const result = await response.json()
      return result.data as CheckoutResponse
    },
    onSuccess: () => {
      // Invalidate billing info after successful checkout redirect
      queryClient.invalidateQueries({ queryKey: billingKeys.info() })
    },
  })
}

/**
 * Create customer portal session mutation
 */
export function useCustomerPortal() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/partner/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create portal session")
      }

      const result = await response.json()
      return result.data as PortalResponse
    },
  })
}

// =============================================================================
// STRIPE CONNECT HOOKS
// =============================================================================

/**
 * Get Stripe Connect account status
 */
export function useConnectStatus() {
  return useQuery({
    queryKey: billingKeys.connect(),
    queryFn: () => apiFetch<ConnectStatus>("/api/partner/stripe/connect"),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Start Stripe Connect onboarding
 */
export function useConnectOnboarding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/partner/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/org/billing?connect=complete`,
          refreshUrl: `${window.location.origin}/org/billing?connect=refresh`,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to start Connect onboarding")
      }

      const result = await response.json()
      return result.data as ConnectOnboardingResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.connect() })
    },
  })
}

// =============================================================================
// CREDITS HOOKS
// =============================================================================

/**
 * Get partner credits balance and transactions
 */
export function useCredits() {
  return useQuery({
    queryKey: billingKeys.credits(),
    queryFn: () => apiFetch<CreditsResponse>("/api/partner/credits"),
    staleTime: 1000 * 30, // 30 seconds
  })
}

/**
 * Create a top-up PaymentIntent
 */
export function useTopupIntent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (amountCents: number) => {
      const response = await fetch("/api/partner/credits/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create top-up intent")
      }

      const result = await response.json()
      return result.data as TopupIntentResponse
    },
    onSuccess: () => {
      // Invalidate credits after successful top-up
      queryClient.invalidateQueries({ queryKey: billingKeys.credits() })
    },
  })
}

// =============================================================================
// PARTNER PRICING HOOKS
// =============================================================================

/**
 * Get partner pricing configuration (per-minute rate)
 */
export function usePartnerPricing() {
  return useQuery({
    queryKey: billingKeys.pricing(),
    queryFn: () => apiFetch<PartnerPricingResponse>("/api/partner/pricing"),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Update partner pricing configuration
 */
export function useUpdatePartnerPricing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { perMinuteRate?: number; perMinuteRateCents?: number }) => {
      const response = await fetch("/api/partner/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update pricing")
      }

      const result = await response.json()
      return result.data as UpdatePartnerPricingResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.pricing() })
      queryClient.invalidateQueries({ queryKey: billingKeys.credits() })
    },
  })
}

// =============================================================================
// PLAN CHANGE HOOKS (LEGACY - Partner plans are now managed via WhiteLabelVariants)
// =============================================================================

// NOTE: Partner plan changes are now handled by super admin assigning different variants.
// Partners cannot self-service change their plan tier.
// These hooks are deprecated but kept for backwards compatibility.

/**
 * @deprecated Partner plan changes are managed via WhiteLabelVariants assigned by super admin
 */
export function usePlanChangePreview(newPlan: string | null) {
  return useQuery({
    queryKey: [...billingKeys.info(), "preview", newPlan],
    queryFn: () =>
      apiFetch<PlanChangePreview>(
        `/api/partner/billing/change-plan?newPlan=${newPlan}`
      ),
    enabled: false, // Disabled - partner plan changes not supported
    staleTime: 1000 * 60,
  })
}

/**
 * @deprecated Partner plan changes are managed via WhiteLabelVariants assigned by super admin
 */
export function useChangePlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (_newPlan: string) => {
      throw new Error(
        "Partner plan changes are managed by the platform administrator. " +
        "Please contact support to change your plan tier."
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.info() })
    },
  })
}


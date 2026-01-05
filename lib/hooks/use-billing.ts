/**
 * React Query hooks for billing operations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/fetcher"

// =============================================================================
// TYPES
// =============================================================================

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
  }
  subscription: BillingSubscription
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

// =============================================================================
// QUERY KEYS
// =============================================================================

export const billingKeys = {
  all: ["billing"] as const,
  info: () => [...billingKeys.all, "info"] as const,
  connect: () => [...billingKeys.all, "connect"] as const,
  credits: () => [...billingKeys.all, "credits"] as const,
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
 * Create checkout session mutation
 */
export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (plan: "starter" | "professional" | "enterprise") => {
      const response = await fetch("/api/partner/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
// PLAN CHANGE HOOKS
// =============================================================================

/**
 * Preview plan change with proration details
 */
export function usePlanChangePreview(newPlan: string | null) {
  return useQuery({
    queryKey: [...billingKeys.info(), "preview", newPlan],
    queryFn: () =>
      apiFetch<PlanChangePreview>(
        `/api/partner/billing/change-plan?newPlan=${newPlan}`
      ),
    enabled: !!newPlan,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Change subscription plan mutation
 */
export function useChangePlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newPlan: "starter" | "professional" | "enterprise") => {
      const response = await fetch("/api/partner/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlan }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to change plan")
      }

      const result = await response.json()
      return result.data as PlanChangeResponse
    },
    onSuccess: () => {
      // Invalidate billing info after plan change
      queryClient.invalidateQueries({ queryKey: billingKeys.info() })
    },
  })
}


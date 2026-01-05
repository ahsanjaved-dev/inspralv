"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/fetcher"

// =============================================================================
// TYPES
// =============================================================================

export interface SubscriptionPlan {
  id: string
  name: string
  description: string | null
  monthlyPriceCents: number
  monthlyPriceDollars: string
  includedMinutes: number
  overageRateCents: number
  overageRateDollars: string
  features: string[]
  maxAgents: number | null
  maxConversationsPerMonth: number | null
  isCurrent?: boolean
}

export interface WorkspaceSubscription {
  id: string
  status: "active" | "past_due" | "canceled" | "incomplete" | "trialing" | "paused"
  plan: {
    id: string
    name: string
    description: string | null
    monthlyPriceCents: number
    includedMinutes: number
    overageRateCents: number
    features: string[]
    maxAgents: number | null
    maxConversationsPerMonth: number | null
  }
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  usage: {
    includedMinutes: number
    usedMinutes: number
    remainingMinutes: number
    overageMinutes: number
    overageChargesCents: number
  }
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  trialEnd: string | null
  createdAt: string
}

export interface SubscriptionResponse {
  hasSubscription: boolean
  subscription: WorkspaceSubscription | null
}

export interface PlansResponse {
  plans: SubscriptionPlan[]
  currentPlanId: string | null
}

export interface SubscribeResponse {
  checkoutUrl: string | null
  sessionId?: string
  subscription?: {
    id: string
    status: string
    planId: string
    planName: string
  }
}

export interface PlanChangePreview {
  currentPlan: {
    id: string
    name: string
    monthlyPriceCents: number
    includedMinutes: number
  }
  newPlan: {
    id: string
    name: string
    monthlyPriceCents: number
    includedMinutes: number
  }
  isUpgrade: boolean
  priceDifferenceCents: number
  minutesDifference: number
  prorationAmountCents: number
  immediateCharge: boolean
  isEstimate?: boolean
  message: string
}

export interface PlanChangeResponse {
  message: string
  oldPlan: string
  newPlan: string
  isUpgrade: boolean
  immediate: boolean
  priceDifferenceCents: number
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const subscriptionKeys = {
  all: ["workspaceSubscription"] as const,
  subscription: (workspaceSlug: string) => [...subscriptionKeys.all, workspaceSlug] as const,
  plans: (workspaceSlug: string) => [...subscriptionKeys.all, workspaceSlug, "plans"] as const,
}

// =============================================================================
// WORKSPACE SUBSCRIPTION HOOKS
// =============================================================================

/**
 * Get current workspace subscription
 */
export function useWorkspaceSubscription(workspaceSlug: string) {
  return useQuery({
    queryKey: subscriptionKeys.subscription(workspaceSlug),
    queryFn: () => apiFetch<SubscriptionResponse>(`/api/w/${workspaceSlug}/subscription`),
    staleTime: 1000 * 30, // 30 seconds
    enabled: !!workspaceSlug,
  })
}

/**
 * Get available subscription plans for workspace
 */
export function useSubscriptionPlans(workspaceSlug: string) {
  return useQuery({
    queryKey: subscriptionKeys.plans(workspaceSlug),
    queryFn: () => apiFetch<PlansResponse>(`/api/w/${workspaceSlug}/subscription/plans`),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!workspaceSlug,
  })
}

/**
 * Subscribe to a plan
 */
export function useSubscribeToPlan(workspaceSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (planId: string) => {
      const response = await fetch(`/api/w/${workspaceSlug}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to subscribe")
      }

      const result = await response.json()
      return result.data as SubscribeResponse
    },
    onSuccess: (data) => {
      // If there's a checkout URL, redirect
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        // Free plan - just refresh
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.subscription(workspaceSlug) })
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.plans(workspaceSlug) })
      }
    },
  })
}

/**
 * Cancel subscription
 */
export function useCancelSubscription(workspaceSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/w/${workspaceSlug}/subscription`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to cancel subscription")
      }

      const result = await response.json()
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.subscription(workspaceSlug) })
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.plans(workspaceSlug) })
    },
  })
}

/**
 * Preview plan change (proration)
 */
export function usePlanChangePreview(workspaceSlug: string) {
  return useMutation({
    mutationFn: async (newPlanId: string) => {
      const response = await fetch(`/api/w/${workspaceSlug}/subscription/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlanId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to preview plan change")
      }

      const result = await response.json()
      return result.data as PlanChangePreview
    },
  })
}

/**
 * Change subscription plan (upgrade/downgrade)
 */
export function useChangePlan(workspaceSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ newPlanId, immediate = true }: { newPlanId: string; immediate?: boolean }) => {
      const response = await fetch(`/api/w/${workspaceSlug}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlanId, immediate }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to change plan")
      }

      const result = await response.json()
      return result.data as PlanChangeResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.subscription(workspaceSlug) })
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.plans(workspaceSlug) })
    },
  })
}


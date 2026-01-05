"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/fetcher"

// =============================================================================
// TYPES
// =============================================================================

export type BillingType = "prepaid" | "postpaid"

export interface SubscriptionPlanDetails {
  id: string
  name: string
  description: string | null
  monthlyPriceCents: number
  includedMinutes: number
  overageRateCents: number
  features: string[]
  maxAgents: number | null
  maxConversationsPerMonth: number | null
  // Billing type configuration
  billingType: BillingType
  postpaidMinutesLimit: number | null
  isActive: boolean
  isPublic: boolean
  sortOrder: number
  stripeProductId: string | null
  stripePriceId: string | null
  subscriberCount: number
  createdAt: string
  updatedAt: string
}

export interface CreatePlanInput {
  name: string
  description?: string
  monthlyPriceCents: number
  includedMinutes?: number
  overageRateCents?: number
  features?: string[]
  maxAgents?: number | null
  maxConversationsPerMonth?: number | null
  // Billing type configuration
  billingType?: BillingType
  postpaidMinutesLimit?: number | null
  isPublic?: boolean
  sortOrder?: number
}

export interface UpdatePlanInput {
  name?: string
  description?: string | null
  includedMinutes?: number
  overageRateCents?: number
  features?: string[]
  maxAgents?: number | null
  maxConversationsPerMonth?: number | null
  // Postpaid: can update minutes limit (for postpaid plans only)
  postpaidMinutesLimit?: number | null
  isActive?: boolean
  isPublic?: boolean
  sortOrder?: number
}

export interface PlansResponse {
  plans: SubscriptionPlanDetails[]
}

export interface PlanResponse {
  plan: SubscriptionPlanDetails
  stripeConfigured?: boolean
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const subscriptionPlanKeys = {
  all: ["subscriptionPlans"] as const,
  list: () => [...subscriptionPlanKeys.all, "list"] as const,
  detail: (planId: string) => [...subscriptionPlanKeys.all, planId] as const,
}

// =============================================================================
// PARTNER SUBSCRIPTION PLAN HOOKS
// =============================================================================

/**
 * Get all subscription plans for the partner
 */
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: subscriptionPlanKeys.list(),
    queryFn: () => apiFetch<PlansResponse>("/api/partner/subscription-plans"),
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Get a single subscription plan
 */
export function useSubscriptionPlan(planId: string) {
  return useQuery({
    queryKey: subscriptionPlanKeys.detail(planId),
    queryFn: () => apiFetch<PlanResponse>(`/api/partner/subscription-plans/${planId}`),
    staleTime: 1000 * 30, // 30 seconds
    enabled: !!planId,
  })
}

/**
 * Create a new subscription plan
 */
export function useCreateSubscriptionPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreatePlanInput) => {
      const response = await fetch("/api/partner/subscription-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create plan")
      }

      const result = await response.json()
      return result.data as PlanResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionPlanKeys.list() })
    },
  })
}

/**
 * Update a subscription plan
 */
export function useUpdateSubscriptionPlan(planId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdatePlanInput) => {
      const response = await fetch(`/api/partner/subscription-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update plan")
      }

      const result = await response.json()
      return result.data as PlanResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionPlanKeys.list() })
      queryClient.invalidateQueries({ queryKey: subscriptionPlanKeys.detail(planId) })
    },
  })
}

/**
 * Delete a subscription plan
 */
export function useDeleteSubscriptionPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (planId: string) => {
      const response = await fetch(`/api/partner/subscription-plans/${planId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete plan")
      }

      const result = await response.json()
      return result.data as { message: string; deleted?: boolean; deactivated?: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionPlanKeys.list() })
    },
  })
}


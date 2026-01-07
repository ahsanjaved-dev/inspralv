"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/fetcher"

// =============================================================================
// TYPES
// =============================================================================

export interface WorkspaceCreditsInfo {
  balanceCents: number
  balanceDollars: number
  lowBalanceThresholdCents: number
  perMinuteRateCents: number
  isLowBalance: boolean
  estimatedMinutesRemaining: number
  isBillingExempt: boolean
}

export interface WorkspaceCreditTransaction {
  id: string
  type: "topup" | "usage" | "refund" | "adjustment"
  amountCents: number
  balanceAfterCents: number
  description: string | null
  createdAt: string
}

export interface WorkspaceCreditsResponse {
  credits: WorkspaceCreditsInfo
  transactions: WorkspaceCreditTransaction[]
  stripeConnectAccountId: string | null
  // Paywall status
  isPaywalled: boolean
  hasActiveSubscription: boolean
}

export interface WorkspaceTopupIntentResponse {
  clientSecret: string
  paymentIntentId: string
  amountCents: number
}

export interface WorkspaceBillingSettings {
  workspace: {
    id: string
    name: string
    slug: string
  }
  billing: {
    isBillingExempt: boolean
    perMinuteRateCents: number
    perMinuteRateDollars: number
  }
  credits: WorkspaceCreditsInfo
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const workspaceCreditsKeys = {
  all: ["workspaceCredits"] as const,
  credits: (workspaceSlug: string) => [...workspaceCreditsKeys.all, workspaceSlug] as const,
  billing: (workspaceId: string) => [...workspaceCreditsKeys.all, "billing", workspaceId] as const,
}

// =============================================================================
// WORKSPACE CREDITS HOOKS
// =============================================================================

/**
 * Get workspace credits balance and transactions
 */
export function useWorkspaceCredits(workspaceSlug: string) {
  return useQuery({
    queryKey: workspaceCreditsKeys.credits(workspaceSlug),
    queryFn: () => apiFetch<WorkspaceCreditsResponse>(`/api/w/${workspaceSlug}/credits`),
    staleTime: 1000 * 30, // 30 seconds
    enabled: !!workspaceSlug,
  })
}

/**
 * Create a top-up PaymentIntent for workspace
 */
export function useWorkspaceTopupIntent(workspaceSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (amountCents: number) => {
      const response = await fetch(`/api/w/${workspaceSlug}/credits/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create top-up intent")
      }

      const result = await response.json()
      return result.data as WorkspaceTopupIntentResponse
    },
    onSuccess: () => {
      // Invalidate credits after successful top-up
      queryClient.invalidateQueries({ queryKey: workspaceCreditsKeys.credits(workspaceSlug) })
    },
  })
}

// =============================================================================
// PARTNER WORKSPACE BILLING HOOKS
// =============================================================================

/**
 * Get workspace billing settings (for partner admins)
 */
export function useWorkspaceBillingSettings(workspaceId: string) {
  return useQuery({
    queryKey: workspaceCreditsKeys.billing(workspaceId),
    queryFn: () => apiFetch<WorkspaceBillingSettings>(`/api/partner/workspaces/${workspaceId}/billing`),
    staleTime: 1000 * 60, // 1 minute
    enabled: !!workspaceId,
  })
}

/**
 * Update workspace billing settings (for partner admins)
 */
export function useUpdateWorkspaceBilling(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { isBillingExempt?: boolean; perMinuteRateCents?: number }) => {
      const response = await fetch(`/api/partner/workspaces/${workspaceId}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update billing settings")
      }

      const result = await response.json()
      return result.data as WorkspaceBillingSettings
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceCreditsKeys.billing(workspaceId) })
    },
  })
}


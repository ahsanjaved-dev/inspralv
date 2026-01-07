"use client"

import { useWorkspaceCredits } from "./use-workspace-credits"

/**
 * Hook to check if the current workspace is paywalled.
 * A workspace is paywalled when credits are exhausted and there's no active subscription.
 */
export function useWorkspacePaywall(workspaceSlug: string) {
  const { data, isLoading, error } = useWorkspaceCredits(workspaceSlug)

  return {
    isPaywalled: data?.isPaywalled ?? false,
    hasActiveSubscription: data?.hasActiveSubscription ?? false,
    creditsBalance: data?.credits?.balanceCents ?? 0,
    isBillingExempt: data?.credits?.isBillingExempt ?? false,
    isLoading,
    error,
  }
}

/**
 * Check if an API error is a paywall error
 */
export function isPaywallError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("WORKSPACE_PAYWALLED") || 
           error.message.includes("Credits exhausted")
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code === "WORKSPACE_PAYWALLED"
  }
  return false
}

/**
 * Extract paywall error details from an API response
 */
export interface PaywallErrorDetails {
  isPaywallError: boolean
  message: string
  billingUrl: string
}

export function parsePaywallError(error: unknown): PaywallErrorDetails | null {
  if (!error) return null
  
  // Handle fetch Response
  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>
    if (errObj.code === "WORKSPACE_PAYWALLED") {
      return {
        isPaywallError: true,
        message: (errObj.error as string) || "Credits exhausted. Upgrade to continue.",
        billingUrl: (errObj.billingUrl as string) || "",
      }
    }
  }

  return null
}


/**
 * React Query hooks for white-label variant management (Super Admin)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateWhiteLabelVariantInput, UpdateWhiteLabelVariantInput } from "@/types/database.types"

// =============================================================================
// TYPES
// =============================================================================

/**
 * API response format for white-label variants (camelCase)
 * This matches what the API actually returns
 */
export interface WhiteLabelVariantResponse {
  id: string
  slug: string
  name: string
  description: string | null
  monthlyPriceCents: number
  stripeProductId: string | null
  stripePriceId: string | null
  maxWorkspaces: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  // Also support snake_case for backwards compatibility
  monthly_price_cents?: number
  stripe_product_id?: string | null
  stripe_price_id?: string | null
  max_workspaces?: number
  is_active?: boolean
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export interface WhiteLabelVariantWithUsage extends WhiteLabelVariantResponse {
  partnerCount: number
}

export interface WhiteLabelVariantDetail {
  variant: WhiteLabelVariantResponse
  usage: {
    partnerCount: number
    partners: Array<{
      id: string
      name: string
      slug: string
      subscriptionStatus: string
    }>
  }
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const whiteLabelVariantKeys = {
  all: ["white-label-variants"] as const,
  list: (includeInactive?: boolean) =>
    [...whiteLabelVariantKeys.all, "list", { includeInactive }] as const,
  detail: (id: string) => [...whiteLabelVariantKeys.all, "detail", id] as const,
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * List all white-label variants
 */
export function useWhiteLabelVariants(includeInactive = false) {
  return useQuery({
    queryKey: whiteLabelVariantKeys.list(includeInactive),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (includeInactive) params.set("includeInactive", "true")

      const response = await fetch(`/api/super-admin/white-label-variants?${params}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch variants")
      }
      const result = await response.json()
      return result.data.variants as WhiteLabelVariantWithUsage[]
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Get variant detail with usage info
 */
export function useWhiteLabelVariantDetail(id: string | null) {
  return useQuery({
    queryKey: whiteLabelVariantKeys.detail(id || ""),
    queryFn: async () => {
      if (!id) return null
      const response = await fetch(`/api/super-admin/white-label-variants/${id}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch variant")
      }
      const result = await response.json()
      return result.data as WhiteLabelVariantDetail
    },
    enabled: !!id,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Create a new variant
 */
export function useCreateWhiteLabelVariant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateWhiteLabelVariantInput) => {
      const response = await fetch("/api/super-admin/white-label-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create variant")
      }

      const result = await response.json()
      return result.data.variant as WhiteLabelVariantResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whiteLabelVariantKeys.all })
    },
  })
}

/**
 * Update a variant
 */
export function useUpdateWhiteLabelVariant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWhiteLabelVariantInput }) => {
      const response = await fetch(`/api/super-admin/white-label-variants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update variant")
      }

      const result = await response.json()
      return result.data.variant as WhiteLabelVariantResponse
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: whiteLabelVariantKeys.all })
      queryClient.invalidateQueries({ queryKey: whiteLabelVariantKeys.detail(variables.id) })
    },
  })
}

/**
 * Delete a variant
 */
export function useDeleteWhiteLabelVariant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/super-admin/white-label-variants/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete variant")
      }

      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whiteLabelVariantKeys.all })
    },
  })
}

/**
 * Sync a variant to Stripe (creates Product/Price if missing)
 * This is a convenience wrapper that calls PATCH with minimal data to trigger Stripe sync
 */
export function useSyncVariantToStripe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, variant }: { id: string; variant: WhiteLabelVariantWithUsage }) => {
      // Call PATCH with the same values - the API will detect missing Stripe IDs
      // and create them when monthly_price_cents > 0
      const response = await fetch(`/api/super-admin/white-label-variants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: variant.name,
          description: variant.description,
          monthly_price_cents: variant.monthlyPriceCents,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to sync with Stripe")
      }

      const result = await response.json()
      return result.data.variant as WhiteLabelVariantResponse
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: whiteLabelVariantKeys.all })
      queryClient.invalidateQueries({ queryKey: whiteLabelVariantKeys.detail(variables.id) })
    },
  })
}

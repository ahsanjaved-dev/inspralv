"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { PartnerRequest } from "@/types/database.types"
import type { PaginatedResponse } from "@/types/database.types"

interface PartnerRequestFilters {
  status?: string
  search?: string
  page?: number
  pageSize?: number
}

// Extended type for partner request with resolved variant details
export interface AssignedVariantDetails {
  id: string
  name: string
  slug: string
  monthlyPriceCents: number
  maxWorkspaces: number
  description: string | null
}

export interface PartnerRequestWithVariant extends PartnerRequest {
  assignedVariant: AssignedVariantDetails | null
}

export interface EditPartnerRequestData {
  company_name?: string
  contact_name?: string
  contact_email?: string
  phone?: string | null
  custom_domain?: string
  desired_subdomain?: string
  business_description?: string
  expected_users?: number | null
  use_case?: string
  // Partner tier - all white-label partners are "partner" tier
  selected_plan?: string
  // White-label variant assignment (determines pricing + workspace limits)
  assigned_white_label_variant_id?: string | null
  branding_data?: {
    logo_url?: string
    primary_color?: string
    secondary_color?: string
    company_name?: string
  }
}

export function usePartnerRequests(filters: PartnerRequestFilters = {}) {
  return useQuery<PaginatedResponse<PartnerRequest>>({
    queryKey: ["super-admin-partner-requests", filters],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (filters.status) searchParams.set("status", filters.status)
      if (filters.search) searchParams.set("search", filters.search)
      if (filters.page) searchParams.set("page", String(filters.page))
      if (filters.pageSize) searchParams.set("pageSize", String(filters.pageSize))

      const res = await fetch(`/api/super-admin/partner-requests?${searchParams}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch partner requests")
      }
      const json = await res.json()
      return json.data
    },
  })
}

export function usePartnerRequest(id: string) {
  return useQuery<PartnerRequestWithVariant>({
    queryKey: ["super-admin-partner-request", id],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/partner-requests/${id}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch partner request")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!id,
  })
}

export function useApprovePartnerRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, variantId }: { requestId: string; variantId: string }) => {
      const res = await fetch(`/api/super-admin/partner-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", variant_id: variantId }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to approve request")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner-requests"] })
    },
  })
}

export function useRejectPartnerRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const res = await fetch(`/api/super-admin/partner-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejection_reason: reason }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to reject request")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner-requests"] })
    },
  })
}

export function useEditPartnerRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      requestId,
      data,
    }: {
      requestId: string
      data: EditPartnerRequestData
    }) => {
      const res = await fetch(`/api/super-admin/partner-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update partner request")
      }
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner-requests"] })
      queryClient.invalidateQueries({
        queryKey: ["super-admin-partner-request", variables.requestId],
      })
    },
  })
}

export function useDeletePartnerRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/super-admin/partner-requests/${requestId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to delete partner request")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner-requests"] })
    },
  })
}

export interface ProvisionPartnerInput {
  requestId: string
  /** Required: The white-label variant to assign to this partner */
  variantId: string
}

export function useProvisionPartner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, variantId }: ProvisionPartnerInput) => {
      const res = await fetch(`/api/super-admin/partner-requests/${requestId}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variantId }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to provision partner")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner-requests"] })
      queryClient.invalidateQueries({ queryKey: ["super-admin-partners"] })
    },
  })
}

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
  return useQuery<PartnerRequest>({
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
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/super-admin/partner-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
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

export function useProvisionPartner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/super-admin/partner-requests/${requestId}/provision`, {
        method: "POST",
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

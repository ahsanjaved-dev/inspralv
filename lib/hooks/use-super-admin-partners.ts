"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api/fetcher"
import type { Partner, PartnerDomain, Workspace, PaginatedResponse } from "@/types/database.types"

interface PartnerWithDomains extends Partner {
  partner_domains: PartnerDomain[]
  workspace_count?: number
  agent_count?: number
}

interface CreatePartnerInput {
  name: string
  slug: string
  hostname: string
  branding?: {
    company_name?: string
    logo_url?: string
    favicon_url?: string
    primary_color?: string
    secondary_color?: string
  }
  plan_tier?: string
  features?: Record<string, boolean>
  resource_limits?: Record<string, number>
  is_platform_partner?: boolean
}

interface UpdatePartnerInput {
  name?: string
  branding?: Record<string, string>
  plan_tier?: string
  features?: Record<string, boolean>
  resource_limits?: Record<string, number>
  is_platform_partner?: boolean
}

interface PartnerFilters {
  page?: number
  pageSize?: number
  search?: string
  plan_tier?: string
}

export function useSuperAdminPartners(filters: PartnerFilters = {}) {
  const params = new URLSearchParams()
  if (filters.page) params.set("page", filters.page.toString())
  if (filters.pageSize) params.set("pageSize", filters.pageSize.toString())
  if (filters.search) params.set("search", filters.search)
  if (filters.plan_tier && filters.plan_tier !== "all") params.set("plan_tier", filters.plan_tier)

  const query = params.toString()

  return useQuery({
    queryKey: ["super-admin-partners", filters],
    queryFn: () =>
      api.get<PaginatedResponse<PartnerWithDomains>>(
        `/api/super-admin/partners${query ? `?${query}` : ""}`
      ),
  })
}

export function useSuperAdminPartner(id: string) {
  return useQuery({
    queryKey: ["super-admin-partner", id],
    queryFn: () => api.get<PartnerWithDomains>(`/api/super-admin/partners/${id}`),
    enabled: !!id,
  })
}

export function useCreatePartner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreatePartnerInput) => api.post<Partner>("/api/super-admin/partners", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partners"] })
    },
  })
}

export function useUpdatePartner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePartnerInput }) =>
      api.patch<Partner>(`/api/super-admin/partners/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partners"] })
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner", variables.id] })
    },
  })
}

export function useDeletePartner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/super-admin/partners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-partners"] })
    },
  })
}

export function usePartnerDomains(partnerId: string) {
  return useQuery({
    queryKey: ["super-admin-partner-domains", partnerId],
    queryFn: () => api.get<PartnerDomain[]>(`/api/super-admin/partners/${partnerId}/domains`),
    enabled: !!partnerId,
  })
}

export function useAddPartnerDomain() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      partnerId,
      hostname,
      is_primary,
    }: {
      partnerId: string
      hostname: string
      is_primary?: boolean
    }) => api.post(`/api/super-admin/partners/${partnerId}/domains`, { hostname, is_primary }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["super-admin-partner-domains", variables.partnerId],
      })
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner", variables.partnerId] })
    },
  })
}

export function useDeletePartnerDomain() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ partnerId, domainId }: { partnerId: string; domainId: string }) =>
      api.delete(`/api/super-admin/partners/${partnerId}/domains?domainId=${domainId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["super-admin-partner-domains", variables.partnerId],
      })
      queryClient.invalidateQueries({ queryKey: ["super-admin-partner", variables.partnerId] })
    },
  })
}

export function usePartnerWorkspaces(partnerId: string, page = 1) {
  return useQuery({
    queryKey: ["super-admin-partner-workspaces", partnerId, page],
    queryFn: () =>
      api.get<PaginatedResponse<Workspace & { member_count: number; agent_count: number }>>(
        `/api/super-admin/partners/${partnerId}/workspaces?page=${page}`
      ),
    enabled: !!partnerId,
  })
}

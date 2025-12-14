"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api/fetcher"
import type { AIAgent, PaginatedResponse } from "@/types/database.types"
import type { CreateAgentInput, UpdateAgentInput } from "@/types/api.types"

const AGENTS_KEY = "agents"

interface UseAgentsParams {
  page?: number
  pageSize?: number
  provider?: string
  isActive?: boolean
  department_id?: string
}

function buildQueryString(params?: UseAgentsParams): string {
  if (!params) return ""

  const searchParams = new URLSearchParams()

  if (params.page) searchParams.set("page", params.page.toString())
  if (params.pageSize) searchParams.set("pageSize", params.pageSize.toString())
  if (params.provider) searchParams.set("provider", params.provider)
  if (params.isActive !== undefined) searchParams.set("isActive", params.isActive.toString())
  if (params.department_id) searchParams.set("department_id", params.department_id)

  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

export function useAgents(params?: UseAgentsParams) {
  return useQuery({
    queryKey: [AGENTS_KEY, params],
    queryFn: () => api.get<PaginatedResponse<AIAgent>>(`/api/agents${buildQueryString(params)}`),
  })
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: [AGENTS_KEY, id],
    queryFn: () => api.get<AIAgent>(`/api/agents/${id}`),
    enabled: !!id,
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAgentInput) => api.post<AIAgent>("/api/agents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] })
    },
  })
}

export function useUpdateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAgentInput }) =>
      api.patch<AIAgent>(`/api/agents/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] })
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY, id] })
    },
  })
}

export function useDeleteAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/api/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] })
    },
  })
}

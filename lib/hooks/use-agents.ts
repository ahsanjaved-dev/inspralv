"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { AIAgent, PaginatedResponse } from "@/types/database.types"
import type { CreateAgentInput, UpdateAgentInput } from "@/types/api.types"

const AGENTS_KEY = "agents"

interface UseAgentsParams {
  page?: number
  pageSize?: number
  provider?: string
  isActive?: boolean
}

// Fetch agents list
export function useAgents(params?: UseAgentsParams) {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", params.page.toString())
  if (params?.pageSize) searchParams.set("pageSize", params.pageSize.toString())
  if (params?.provider) searchParams.set("provider", params.provider)
  if (params?.isActive !== undefined) searchParams.set("isActive", params.isActive.toString())

  return useQuery({
    queryKey: [AGENTS_KEY, params],
    queryFn: async (): Promise<PaginatedResponse<AIAgent>> => {
      const res = await fetch(`/api/agents?${searchParams.toString()}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch agents")
      }
      const json = await res.json()
      return json.data
    },
  })
}

// Fetch single agent
export function useAgent(id: string | null) {
  return useQuery({
    queryKey: [AGENTS_KEY, id],
    queryFn: async (): Promise<AIAgent> => {
      const res = await fetch(`/api/agents/${id}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch agent")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!id,
  })
}

// Create agent mutation
export function useCreateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateAgentInput): Promise<AIAgent> => {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create agent")
      }
      const json = await res.json()
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] })
    },
  })
}

// Update agent mutation
export function useUpdateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAgentInput }): Promise<AIAgent> => {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update agent")
      }
      const json = await res.json()
      return json.data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] })
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY, id] })
    },
  })
}

// Delete agent mutation
export function useDeleteAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/agents/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to delete agent")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] })
    },
  })
}

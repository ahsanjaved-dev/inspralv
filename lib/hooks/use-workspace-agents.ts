"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { AIAgent, PaginatedResponse } from "@/types/database.types"
import type { CreateWorkspaceAgentInput, UpdateWorkspaceAgentInput } from "@/types/api.types"

interface UseWorkspaceAgentsOptions {
  provider?: string
  isActive?: boolean
  page?: number
  pageSize?: number
}

export function useWorkspaceAgents(options: UseWorkspaceAgentsOptions = {}) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<PaginatedResponse<AIAgent>>({
    queryKey: ["workspace-agents", workspaceSlug, options],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (options.provider) searchParams.set("provider", options.provider)
      if (options.isActive !== undefined) searchParams.set("isActive", String(options.isActive))
      if (options.page) searchParams.set("page", String(options.page))
      if (options.pageSize) searchParams.set("pageSize", String(options.pageSize))

      const res = await fetch(`/api/w/${workspaceSlug}/agents?${searchParams}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch agents")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
  })
}

export function useWorkspaceAgent(agentId: string) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<AIAgent>({
    queryKey: ["workspace-agent", workspaceSlug, agentId],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch agent")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug && !!agentId,
  })
}

export function useCreateWorkspaceAgent() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateWorkspaceAgentInput) => {
      const res = await fetch(`/api/w/${workspaceSlug}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create agent")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    },
  })
}

export function useUpdateWorkspaceAgent() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWorkspaceAgentInput }) => {
      const res = await fetch(`/api/w/${workspaceSlug}/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update agent")
      }
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
      queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, variables.id] })
    },
  })
}

export function useDeleteWorkspaceAgent() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string) => {
      const res = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to delete agent")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    },
  })
}

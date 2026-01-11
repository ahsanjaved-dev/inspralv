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
    // Optimistic update: remove agent immediately from UI
    onMutate: async (agentId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["workspace-agents", workspaceSlug] })

      // Snapshot previous value
      const previousAgents = queryClient.getQueryData<PaginatedResponse<AIAgent>>([
        "workspace-agents",
        workspaceSlug,
        {},
      ])

      // Optimistically remove the agent
      if (previousAgents) {
        queryClient.setQueryData<PaginatedResponse<AIAgent>>(
          ["workspace-agents", workspaceSlug, {}],
          {
            ...previousAgents,
            data: previousAgents.data.filter((agent: AIAgent) => agent.id !== agentId),
          }
        )
      }

      return { previousAgents }
    },
    // Rollback on error
    onError: (_error, _agentId, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData(
          ["workspace-agents", workspaceSlug, {}],
          context.previousAgents
        )
      }
    },
    // Always refetch after success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    },
  })
}

// ============================================================================
// PHONE NUMBER HOOKS
// ============================================================================

export interface AvailablePhoneNumber {
  id: string
  phone_number: string
  phone_number_e164: string | null
  friendly_name: string | null
  provider: string
  status: string
  supports_inbound: boolean
  supports_outbound: boolean
  supports_sms: boolean
  assigned_agent_id: string | null
  assigned_workspace_id: string | null
  sip_trunk: {
    id: string
    name: string
  } | null
  is_available: boolean
  display_name: string
}

export function useAvailablePhoneNumbers() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<{ data: AvailablePhoneNumber[]; total: number }>({
    queryKey: ["available-phone-numbers", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/phone-numbers/available`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch available phone numbers")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
  })
}
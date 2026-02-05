"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"

interface AgentLimits {
  current: number
  max: number
  remaining: number
  isUnlimited: boolean
}

interface UserLimits {
  max: number
  isUnlimited: boolean
}

interface WorkspaceLimitsResponse {
  agents: AgentLimits
  users: UserLimits
  canCreateAgent: boolean
  workspace: {
    id: string
    name: string
    slug: string
  }
}

/**
 * Hook to fetch workspace resource limits
 * Used to validate limits BEFORE showing creation forms
 * Caches for 1 minute to balance freshness with performance
 */
export function useWorkspaceLimits() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceLimitsResponse>({
    queryKey: ["workspace-limits", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/limits`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch workspace limits")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    // Cache for 1 minute - limits don't change frequently
    staleTime: 60 * 1000,
    // Keep in cache for 5 minutes
    gcTime: 5 * 60 * 1000,
    // Refetch on window focus to catch limit changes
    refetchOnWindowFocus: true,
  })
}

/**
 * Hook to check if agent creation is allowed
 * Returns loading state, canCreate boolean, and usage info
 */
export function useCanCreateAgent() {
  const { data, isLoading, error } = useWorkspaceLimits()

  return {
    isLoading,
    error,
    canCreate: data?.canCreateAgent ?? false,
    agentLimits: data?.agents ?? null,
    // Helper text for UI
    usageText: data?.agents
      ? data.agents.isUnlimited
        ? `${data.agents.current} agents`
        : `${data.agents.current} of ${data.agents.max} agents`
      : null,
    limitReachedMessage: data?.agents && !data.canCreateAgent
      ? `You have reached your agent limit (${data.agents.max}). Please upgrade to create more agents.`
      : null,
  }
}


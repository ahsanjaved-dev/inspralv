"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { ConversationWithAgent, PaginatedResponse } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export interface UseWorkspaceCallsParams {
  page?: number
  pageSize?: number
  status?: string
  direction?: string
  callType?: string
  agentId?: string
  search?: string
  startDate?: string
  endDate?: string
}

export interface WorkspaceCallsStats {
  total: number
  completed: number
  failed: number
  avgDurationSeconds: number
}

// ============================================================================
// HOOK: Fetch workspace calls (same as conversations, but aliased for clarity)
// ============================================================================

export function useWorkspaceCalls(params: UseWorkspaceCallsParams = {}) {
  const { workspaceSlug } = useParams()
  const { page = 1, pageSize = 20, status, direction, callType, agentId, search, startDate, endDate } = params

  return useQuery<PaginatedResponse<ConversationWithAgent>>({
    queryKey: [
      "workspace-calls",
      workspaceSlug,
      { page, pageSize, status, direction, callType, agentId, search, startDate, endDate },
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })

      if (status) searchParams.set("status", status)
      if (direction) searchParams.set("direction", direction)
      if (callType) searchParams.set("call_type", callType)
      if (agentId) searchParams.set("agent_id", agentId)
      if (search) searchParams.set("search", search)
      if (startDate) searchParams.set("start_date", startDate)
      if (endDate) searchParams.set("end_date", endDate)

      const res = await fetch(`/api/w/${workspaceSlug}/calls?${searchParams}`)

      if (!res.ok) {
        throw new Error("Failed to fetch calls")
      }

      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000, // Consider fresh for 10 seconds
  })
}

// ============================================================================
// HOOK: Fetch call stats for dashboard
// ============================================================================

export function useWorkspaceCallsStats() {
  const { workspaceSlug } = useParams()

  return useQuery<WorkspaceCallsStats>({
    queryKey: ["workspace-calls-stats", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/calls/stats`)

      if (!res.ok) {
        throw new Error("Failed to fetch call stats")
      }

      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000, // Consider fresh for 30 seconds
  })
}

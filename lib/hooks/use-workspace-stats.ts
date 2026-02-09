"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { DashboardStats } from "@/types/database.types"

export function useWorkspaceStats() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<DashboardStats>({
    queryKey: ["workspace-stats", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/dashboard/stats`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch stats")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    refetchInterval: 60_000, // Refresh every 1 minute (reduced from 5 min for faster updates)
    staleTime: 30_000, // Consider fresh for 30 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  })
}

"use client"

import { useQuery } from "@tanstack/react-query"

export interface PartnerDashboardStats {
  total_workspaces: number
  total_agents_all_workspaces: number
  total_calls_today: number
  total_members?: number
}

export function usePartnerDashboardStats() {
  return useQuery<PartnerDashboardStats>({
    queryKey: ["partner-dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/partner/dashboard/stats")
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch partner stats")
      }
      const json = await res.json()
      return json.data
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider fresh for 2 minutes
  })
}


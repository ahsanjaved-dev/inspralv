"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { type DashboardDateFilter, type DashboardFilterOptions } from "./use-dashboard-data"

// ============================================================================
// TYPES
// ============================================================================

export interface CallByDate {
  date: string
  calls: number
  duration: number
  cost: number
}

export interface CallOutcome {
  status: string
  label: string
  count: number
  color: string
}

export interface RecentCall {
  id: string
  status: string
  direction: string
  duration_seconds: number | null
  total_cost: number | null
  created_at: string
  caller_phone_number: string | null
  call_type: string
  agent: {
    id: string
    name: string
  }
}

export interface DashboardChartsData {
  period: {
    days: number
    start_date: string
    end_date: string
    filter: DashboardDateFilter
  }
  summary: {
    total_calls: number
    total_duration_seconds: number
    total_cost: number
    avg_duration_seconds: number
  }
  calls_over_time: CallByDate[]
  call_outcomes: CallOutcome[]
  recent_calls: RecentCall[]
}

// ============================================================================
// HOOK: Fetch dashboard chart data
// ============================================================================

export function useDashboardCharts(filterOptions?: DashboardFilterOptions) {
  const { workspaceSlug } = useParams()
  
  // Default to "today" filter if not provided
  const filter = filterOptions?.filter ?? "today"
  const startDate = filterOptions?.startDate
  const endDate = filterOptions?.endDate

  // Build query string for charts API
  const buildChartsUrl = () => {
    const params = new URLSearchParams()
    params.set("filter", filter)
    if (filter === "manual" && startDate) {
      params.set("startDate", startDate.toISOString())
    }
    if (filter === "manual" && endDate) {
      params.set("endDate", endDate.toISOString())
    }
    return `/api/w/${workspaceSlug}/dashboard/charts?${params.toString()}`
  }

  return useQuery<DashboardChartsData>({
    queryKey: ["dashboard-charts", workspaceSlug, filter, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const res = await fetch(buildChartsUrl())

      if (!res.ok) {
        throw new Error("Failed to fetch dashboard charts")
      }

      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000, // Consider fresh for 30 seconds
  })
}

// ============================================================================
// HELPER: Format duration for display
// ============================================================================

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds === 0) return "0:00"
  
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

// ============================================================================
// HELPER: Format relative time
// ============================================================================

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}


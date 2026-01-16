/**
 * Use Workspace Analytics Hook
 * Fetches real analytics data including sentiment analysis
 */

"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"

export interface AnalyticsSentimentStats {
  positive: number
  negative: number
  neutral: number
}

export interface AnalyticsSentimentDistribution {
  positive_percent: number
  negative_percent: number
  neutral_percent: number
}

export interface AgentAnalytics {
  id: string
  name: string
  provider: string
  is_active: boolean
  total_calls: number
  completed_calls: number
  success_rate: number
  total_minutes: number
  total_cost: number
  sentiment: AnalyticsSentimentStats
  sentiment_distribution: AnalyticsSentimentDistribution
}

export interface AnalyticsSummary {
  total_agents: number
  total_calls: number
  completed_calls: number
  success_rate: number
  total_minutes: number
  total_cost: number
  avg_cost_per_call: number
  sentiment: AnalyticsSentimentStats
  sentiment_distribution: AnalyticsSentimentDistribution
  avg_sentiment_score: number
}

export interface DurationDistribution {
  "0-1 min": number
  "1-2 min": number
  "2-5 min": number
  "5-10 min": number
  "10+ min": number
}

export interface AnalyticsData {
  agents: AgentAnalytics[]
  summary: AnalyticsSummary
  trends: {
    calls_by_date: Record<
      string,
      {
        count: number
        cost: number
        duration: number
      }
    >
    duration_distribution: DurationDistribution
  }
}

export interface UseWorkspaceAnalyticsOptions {
  days?: number
  agent?: string
}

/**
 * Fetch analytics data for workspace
 */
export function useWorkspaceAnalytics(options: UseWorkspaceAnalyticsOptions = {}) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const { days = 7, agent = "all" } = options

  return useQuery({
    queryKey: ["workspace-analytics", workspaceSlug, days, agent],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      searchParams.set("days", String(days))
      if (agent !== "all") {
        searchParams.set("agent", agent)
      }
      const response = await fetch(`/api/w/${workspaceSlug}/analytics?${searchParams.toString()}`)
      if (!response.ok) throw new Error("Failed to fetch analytics")
      const data = await response.json()
      return data.data as AnalyticsData
    },
    enabled: !!workspaceSlug,
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

/**
 * Format duration in seconds to readable format
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "0m"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  if (mins === 0) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs}s`

  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

/**
 * Format duration in a short format for charts
 */
export function formatDurationShort(seconds: number): string {
  if (!seconds || seconds === 0) return "0m"
  const mins = Math.floor(seconds / 60)

  if (mins < 60) return `${mins}m`

  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

/**
 * Get sentiment color configuration
 */
export function getSentimentColorConfig(
  sentiment: "positive" | "negative" | "neutral"
): {
  bg: string
  text: string
  hex: string
} {
  switch (sentiment) {
    case "positive":
      return {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-700 dark:text-green-400",
        hex: "hsl(142, 76%, 36%)",
      }
    case "negative":
      return {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-700 dark:text-red-400",
        hex: "hsl(0, 84%, 60%)",
      }
    case "neutral":
      return {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-700 dark:text-amber-400",
        hex: "hsl(38, 92%, 50%)",
      }
  }
}


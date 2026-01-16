import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import {
  calculateSentimentDistribution,
  categorizeSentiment,
} from "@/lib/integrations/sentiment"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const context = await getWorkspaceContext(workspaceSlug)
    if (!context) return unauthorized()

    const { adminClient, workspace } = context

    // Parse date range filter from query params
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "7", 10)
    const agentFilter = searchParams.get("agent") || "all"
    
    // Calculate the date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const startDateISO = startDate.toISOString()

    // Get agent performance stats with sentiment
    const { data: agents } = await adminClient
      .from("ai_agents")
      .select("id, name, provider, is_active")
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)

    // Get conversation stats per agent (filtered by date range)
    const agentStats = await Promise.all(
      (agents || []).map(async (agent) => {
        const { data: convs } = await adminClient
          .from("conversations")
          .select("status, duration_seconds, total_cost, sentiment")
          .eq("agent_id", agent.id)
          .is("deleted_at", null)
          .gte("started_at", startDateISO)

        const totalCalls = convs?.length || 0
        const completedCalls = convs?.filter((c) => c.status === "completed").length || 0
        const totalMinutes =
          (convs?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) ?? 0) / 60
        const totalCost = convs?.reduce((sum, c) => sum + (c.total_cost || 0), 0) ?? 0

        // Calculate sentiment distribution
        let sentimentCounts = {
          positive: 0,
          negative: 0,
          neutral: 0,
        }
        const sentimentScores: number[] = []

        convs?.forEach((conv) => {
          const sentiment = conv.sentiment as "positive" | "negative" | "neutral" | null
          if (sentiment) {
            const counts = categorizeSentiment(sentiment)
            sentimentCounts.positive += counts.positive
            sentimentCounts.negative += counts.negative
            sentimentCounts.neutral += counts.neutral
          }
        })

        return {
          id: agent.id,
          name: agent.name,
          provider: agent.provider,
          is_active: agent.is_active,
          total_calls: totalCalls,
          completed_calls: completedCalls,
          success_rate: totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0,
          total_minutes: Math.round(totalMinutes * 100) / 100,
          total_cost: Math.round(totalCost * 100) / 100,
          sentiment: sentimentCounts,
          sentiment_distribution: calculateSentimentDistribution(
            sentimentCounts.positive,
            sentimentCounts.negative,
            sentimentCounts.neutral
          ),
        }
      })
    )

    // Get overall workspace stats with sentiment (filtered by date range and optionally agent)
    let workspaceQuery = adminClient
      .from("conversations")
      .select("status, duration_seconds, total_cost, sentiment, started_at")
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)
      .gte("started_at", startDateISO)
    
    if (agentFilter !== "all") {
      workspaceQuery = workspaceQuery.eq("agent_id", agentFilter)
    }
    
    const { data: allConversations } = await workspaceQuery

    const allTotalCalls = allConversations?.length || 0
    const allCompletedCalls =
      allConversations?.filter((c) => c.status === "completed").length || 0
    const allTotalMinutes =
      (allConversations?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) ?? 0) / 60
    const allTotalCost =
      allConversations?.reduce((sum, c) => sum + (c.total_cost || 0), 0) ?? 0

    // Calculate overall sentiment
    let overallSentimentCounts = {
      positive: 0,
      negative: 0,
      neutral: 0,
    }

    allConversations?.forEach((conv) => {
      const sentiment = conv.sentiment as "positive" | "negative" | "neutral" | null
      if (sentiment) {
        const counts = categorizeSentiment(sentiment)
        overallSentimentCounts.positive += counts.positive
        overallSentimentCounts.negative += counts.negative
        overallSentimentCounts.neutral += counts.neutral
      }
    })
    
    // Calculate average sentiment score (positive=100, neutral=50, negative=0)
    const sentimentTotal = overallSentimentCounts.positive + overallSentimentCounts.negative + overallSentimentCounts.neutral
    const avgSentimentScore = sentimentTotal > 0 
      ? Math.round(
          ((overallSentimentCounts.positive * 100 + overallSentimentCounts.neutral * 50 + overallSentimentCounts.negative * 0) / sentimentTotal)
        )
      : 0

    // Calculate calls by date for trend data (using actual dates)
    const callsByDate: Record<string, { count: number; cost: number; duration: number }> = {}
    
    // Initialize all dates in the range with zero values
    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - (days - 1 - i))
      const dateKey = date.toISOString().split("T")[0] as string // YYYY-MM-DD format
      callsByDate[dateKey] = { count: 0, cost: 0, duration: 0 }
    }

    // Calculate duration distribution buckets
    const durationBuckets = {
      "0-1 min": 0,
      "1-2 min": 0,
      "2-5 min": 0,
      "5-10 min": 0,
      "10+ min": 0,
    }

    allConversations?.forEach((conv) => {
      // Aggregate by actual date
      if (conv.started_at) {
        const dateKey = new Date(conv.started_at).toISOString().split("T")[0] as string
        if (dateKey && callsByDate[dateKey]) {
          callsByDate[dateKey].count += 1
          callsByDate[dateKey].cost += conv.total_cost || 0
          callsByDate[dateKey].duration += conv.duration_seconds || 0
        }
      }
      
      // Calculate duration distribution
      const durationMinutes = (conv.duration_seconds || 0) / 60
      if (durationMinutes < 1) {
        durationBuckets["0-1 min"] += 1
      } else if (durationMinutes < 2) {
        durationBuckets["1-2 min"] += 1
      } else if (durationMinutes < 5) {
        durationBuckets["2-5 min"] += 1
      } else if (durationMinutes < 10) {
        durationBuckets["5-10 min"] += 1
      } else {
        durationBuckets["10+ min"] += 1
      }
    })

    return apiResponse({
      agents: agentStats,
      summary: {
        total_agents: agents?.length || 0,
        total_calls: allTotalCalls,
        completed_calls: allCompletedCalls,
        success_rate: allTotalCalls > 0 ? (allCompletedCalls / allTotalCalls) * 100 : 0,
        total_minutes: Math.round(allTotalMinutes * 100) / 100,
        total_cost: Math.round(allTotalCost * 100) / 100,
        avg_cost_per_call: allTotalCalls > 0 ? allTotalCost / allTotalCalls : 0,
        sentiment: overallSentimentCounts,
        sentiment_distribution: calculateSentimentDistribution(
          overallSentimentCounts.positive,
          overallSentimentCounts.negative,
          overallSentimentCounts.neutral
        ),
        avg_sentiment_score: avgSentimentScore,
      },
      trends: {
        calls_by_date: callsByDate,
        duration_distribution: durationBuckets,
      },
    })
  } catch (error) {
    console.error("GET analytics error:", error)
    return serverError()
  }
}

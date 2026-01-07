import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import {
  calculateSentimentDistribution,
  calculateAverageSentimentScore,
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

    // Get agent performance stats with sentiment
    const { data: agents } = await adminClient
      .from("ai_agents")
      .select("id, name, provider, is_active")
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)

    // Get conversation stats per agent
    const agentStats = await Promise.all(
      (agents || []).map(async (agent) => {
        const { data: convs } = await adminClient
          .from("conversations")
          .select("status, duration_seconds, total_cost, sentiment")
          .eq("agent_id", agent.id)
          .is("deleted_at", null)

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

    // Get overall workspace stats with sentiment
    const { data: allConversations } = await adminClient
      .from("conversations")
      .select("status, duration_seconds, total_cost, sentiment, started_at")
      .eq("workspace_id", workspace.id)
      .is("deleted_at", null)

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
    const allSentimentScores: number[] = []

    allConversations?.forEach((conv) => {
      const sentiment = conv.sentiment as "positive" | "negative" | "neutral" | null
      if (sentiment) {
        const counts = categorizeSentiment(sentiment)
        overallSentimentCounts.positive += counts.positive
        overallSentimentCounts.negative += counts.negative
        overallSentimentCounts.neutral += counts.neutral
      }
    })

    // Calculate calls by date for trend data
    const callsByDate: Record<string, { count: number; cost: number; duration: number }> = {}

    allConversations?.forEach((conv) => {
      if (conv.started_at) {
        const date = new Date(conv.started_at).toLocaleDateString("en-US", {
          weekday: "short",
        })
        if (!callsByDate[date]) {
          callsByDate[date] = { count: 0, cost: 0, duration: 0 }
        }
        callsByDate[date].count += 1
        callsByDate[date].cost += conv.total_cost || 0
        callsByDate[date].duration += conv.duration_seconds || 0
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
        avg_sentiment_score:
          allSentimentScores.length > 0
            ? Math.round(calculateAverageSentimentScore(allSentimentScores) * 100)
            : 0,
      },
      trends: {
        calls_by_date: callsByDate,
      },
    })
  } catch (error) {
    console.error("GET analytics error:", error)
    return serverError()
  }
}

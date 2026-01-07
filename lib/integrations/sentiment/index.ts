/**
 * Unified Sentiment Analysis Service
 * Abstracts provider-specific sentiment retrieval
 */

import type { AgentProvider } from "@/types/database.types"
import {
  fetchVapiCallSentiment,
  normalizeVapiSentiment,
  calculateVapiSentimentScore,
  type VapiSentimentData,
} from "./vapi-sentiment"
import {
  fetchRetellCallSentiment,
  normalizeRetellSentiment,
  calculateRetellSentimentScore,
  type RetellSentimentData,
} from "./retell-sentiment"

export interface SentimentAnalysisResult {
  sentiment: "positive" | "negative" | "neutral"
  score: number // 0-1 scale
  raw_sentiment?: string // Original sentiment from provider
  summary?: string
  successful?: boolean
}

/**
 * Fetch and normalize sentiment data for any provider
 * Returns standardized sentiment format
 */
export async function fetchCallSentiment(
  callId: string,
  provider: AgentProvider,
  apiKey: string
): Promise<SentimentAnalysisResult | null> {
  try {
    if (provider === "vapi") {
      const sentimentData = await fetchVapiCallSentiment(callId, apiKey)
      if (!sentimentData) return null

      return {
        sentiment: normalizeVapiSentiment(sentimentData.user_sentiment),
        score: sentimentData.sentiment_score ?? calculateVapiSentimentScore(sentimentData.user_sentiment),
        raw_sentiment: sentimentData.user_sentiment || undefined,
        summary: sentimentData.call_summary,
        successful: sentimentData.call_successful,
      }
    } else if (provider === "retell") {
      const sentimentData = await fetchRetellCallSentiment(callId, apiKey)
      if (!sentimentData) return null

      return {
        sentiment: normalizeRetellSentiment(sentimentData.user_sentiment),
        score: sentimentData.sentiment_score ?? calculateRetellSentimentScore(sentimentData.user_sentiment),
        raw_sentiment: sentimentData.user_sentiment || undefined,
        summary: sentimentData.call_summary,
        successful: sentimentData.call_successful,
      }
    } else {
      console.warn(`[Sentiment] Unsupported provider: ${provider}`)
      return null
    }
  } catch (error) {
    console.error(`[Sentiment] Error fetching sentiment for ${provider}:`, error)
    return null
  }
}

/**
 * Categorize sentiment for analytics aggregation
 * Used for counting positive/negative/neutral calls
 */
export function categorizeSentiment(sentiment: "positive" | "negative" | "neutral"): {
  positive: number
  negative: number
  neutral: number
} {
  return {
    positive: sentiment === "positive" ? 1 : 0,
    negative: sentiment === "negative" ? 1 : 0,
    neutral: sentiment === "neutral" ? 1 : 0,
  }
}

/**
 * Calculate average sentiment score from multiple scores
 */
export function calculateAverageSentimentScore(scores: number[]): number {
  if (scores.length === 0) return 0.5

  const sum = scores.reduce((acc, score) => acc + score, 0)
  return sum / scores.length
}

/**
 * Calculate sentiment distribution percentages
 */
export function calculateSentimentDistribution(
  positive: number,
  negative: number,
  neutral: number
): {
  positive_percent: number
  negative_percent: number
  neutral_percent: number
} {
  const total = positive + negative + neutral

  if (total === 0) {
    return {
      positive_percent: 0,
      negative_percent: 0,
      neutral_percent: 0,
    }
  }

  return {
    positive_percent: Math.round((positive / total) * 100),
    negative_percent: Math.round((negative / total) * 100),
    neutral_percent: Math.round((neutral / total) * 100),
  }
}

/**
 * Map sentiment to badge color for UI
 */
export function getSentimentColor(
  sentiment: "positive" | "negative" | "neutral"
): {
  bg: string
  text: string
  icon: "smile" | "meh" | "frown"
} {
  switch (sentiment) {
    case "positive":
      return {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-700 dark:text-green-400",
        icon: "smile",
      }
    case "negative":
      return {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-700 dark:text-red-400",
        icon: "frown",
      }
    case "neutral":
      return {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-700 dark:text-amber-400",
        icon: "meh",
      }
  }
}


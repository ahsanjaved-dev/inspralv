/**
 * VAPI Sentiment Analysis Retrieval
 * Fetches sentiment data from VAPI calls
 */

import type { AgentProvider } from "@/types/database.types"

export interface VapiSentimentData {
  user_sentiment: "Positive" | "Negative" | "Neutral" | null
  call_successful: boolean
  call_summary?: string
  sentiment_score?: number // Normalized 0-1
}

export interface VapiCallAnalysis {
  call_analysis?: {
    call_summary?: string
    user_sentiment?: "Positive" | "Negative" | "Neutral"
    call_successful?: boolean
    custom_analysis_data?: Record<string, any>
  }
  artifact?: {
    structuredOutputs?: Record<
      string,
      {
        overallSentiment?: "positive" | "negative" | "neutral"
        customerSatisfaction?: number
        emotionalTone?: string[]
        keyMoments?: Array<{
          timestamp: string
          sentiment: "positive" | "negative" | "neutral"
          description: string
        }>
      }
    >
  }
}

/**
 * Fetch sentiment data from VAPI call
 * Uses VAPI's GET /call/{id} endpoint
 */
export async function fetchVapiCallSentiment(
  callId: string,
  apiKey: string
): Promise<VapiSentimentData | null> {
  try {
    const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.error(`[VAPI Sentiment] Failed to fetch call ${callId}:`, response.status)
      return null
    }

    const data: VapiCallAnalysis = await response.json()

    // Extract sentiment from call_analysis or structured outputs
    let userSentiment: string | null = null
    let sentimentScore: number | undefined

    if (data.call_analysis?.user_sentiment) {
      userSentiment = data.call_analysis.user_sentiment
    }

    // Try to extract from structured outputs for more detailed analysis
    if (data.artifact?.structuredOutputs) {
      for (const [_, output] of Object.entries(data.artifact.structuredOutputs)) {
        if (output.overallSentiment) {
          // Map to consistent format
          const sentiment = output.overallSentiment
          userSentiment = sentiment.charAt(0).toUpperCase() + sentiment.slice(1)
          
          // Calculate sentiment score from customer satisfaction (1-10 scale)
          if (output.customerSatisfaction) {
            sentimentScore = Math.min(1, output.customerSatisfaction / 10)
          }
          break
        }
      }
    }

    return {
      user_sentiment: (userSentiment as "Positive" | "Negative" | "Neutral" | null) || null,
      call_successful: data.call_analysis?.call_successful ?? true,
      call_summary: data.call_analysis?.call_summary,
      sentiment_score: sentimentScore,
    }
  } catch (error) {
    console.error("[VAPI Sentiment] Error fetching sentiment:", error)
    return null
  }
}

/**
 * Normalize VAPI sentiment to standard format
 * Returns: "positive", "negative", "neutral"
 */
export function normalizeVapiSentiment(
  vapi_sentiment: string | null
): "positive" | "negative" | "neutral" {
  if (!vapi_sentiment) return "neutral"

  const sentiment = vapi_sentiment.toLowerCase()
  if (sentiment.includes("positive")) return "positive"
  if (sentiment.includes("negative")) return "negative"
  return "neutral"
}

/**
 * Calculate sentiment score (0-1) from VAPI sentiment
 * Returns a normalized score for analytics
 */
export function calculateVapiSentimentScore(sentiment: string | null): number {
  if (!sentiment) return 0.5

  const normalized = sentiment.toLowerCase()
  if (normalized.includes("positive")) return 0.8
  if (normalized.includes("negative")) return 0.2
  return 0.5
}


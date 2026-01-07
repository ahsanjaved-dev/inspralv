/**
 * Retell Sentiment Analysis Retrieval
 * Fetches sentiment data from Retell calls
 */

export interface RetellSentimentData {
  user_sentiment: "Positive" | "Negative" | "Neutral" | null
  call_successful: boolean
  call_summary?: string
  sentiment_score?: number // Normalized 0-1
}

export interface RetellCallAnalysis {
  call_analysis?: {
    call_summary?: string
    user_sentiment?: "Positive" | "Negative" | "Neutral"
    call_successful?: boolean
  }
}

/**
 * Fetch sentiment data from Retell call using GET /v2/get-call/{call_id}
 * or POST /v2/list-calls endpoint
 */
export async function fetchRetellCallSentiment(
  callId: string,
  apiKey: string
): Promise<RetellSentimentData | null> {
  try {
    // Use GET endpoint for individual call
    const response = await fetch(`https://api.retellai.com/v2/get-call/${callId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.error(
        `[Retell Sentiment] Failed to fetch call ${callId}:`,
        response.status,
        response.statusText
      )
      return null
    }

    const data: RetellCallAnalysis = await response.json()

    // Extract sentiment from call_analysis
    const userSentiment = data.call_analysis?.user_sentiment || null
    const callSuccessful = data.call_analysis?.call_successful ?? true

    return {
      user_sentiment: userSentiment as "Positive" | "Negative" | "Neutral" | null,
      call_successful: callSuccessful,
      call_summary: data.call_analysis?.call_summary,
      sentiment_score: calculateRetellSentimentScore(userSentiment),
    }
  } catch (error) {
    console.error("[Retell Sentiment] Error fetching sentiment:", error)
    return null
  }
}

/**
 * Fetch multiple calls with sentiment filtering (List Calls endpoint)
 * Useful for bulk operations or specific sentiment filtering
 */
export async function fetchRetellCallsBySentiment(
  apiKey: string,
  options?: {
    user_sentiment?: "Positive" | "Negative" | "Neutral"
    limit?: number
    skip?: number
  }
): Promise<RetellCallAnalysis[] | null> {
  try {
    const body: Record<string, any> = {
      limit: options?.limit || 100,
      skip: options?.skip || 0,
    }

    if (options?.user_sentiment) {
      body.filter_criteria = {
        user_sentiment: options.user_sentiment,
      }
    }

    const response = await fetch("https://api.retellai.com/v2/list-calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error("[Retell Sentiment] Failed to list calls:", response.status)
      return null
    }

    const data = await response.json()
    return data.calls || []
  } catch (error) {
    console.error("[Retell Sentiment] Error listing calls:", error)
    return null
  }
}

/**
 * Normalize Retell sentiment to standard format
 * Returns: "positive", "negative", "neutral"
 */
export function normalizeRetellSentiment(
  retell_sentiment: string | null
): "positive" | "negative" | "neutral" {
  if (!retell_sentiment) return "neutral"

  const sentiment = retell_sentiment.toLowerCase()
  if (sentiment.includes("positive")) return "positive"
  if (sentiment.includes("negative")) return "negative"
  return "neutral"
}

/**
 * Calculate sentiment score (0-1) from Retell sentiment
 * Returns a normalized score for analytics
 */
export function calculateRetellSentimentScore(sentiment: string | null): number {
  if (!sentiment) return 0.5

  const normalized = sentiment.toLowerCase()
  if (normalized.includes("positive")) return 0.8
  if (normalized.includes("negative")) return 0.2
  return 0.5
}


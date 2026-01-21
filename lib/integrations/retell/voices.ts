/**
 * Retell Voices API Integration
 * Fetches available voices from Retell API
 * Reference: https://docs.retellai.com/api-references/list-voices
 */

const RETELL_BASE_URL = "https://api.retellai.com"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice response from Retell API
 */
export interface RetellVoiceResponse {
  voice_id: string
  voice_name: string
  provider: "elevenlabs" | "openai" | "deepgram" | "cartesia" | "minimax"
  gender: "male" | "female"
  accent?: string
  age?: string
  preview_audio_url?: string
}

/**
 * Normalized voice for UI consumption
 */
export interface RetellVoice {
  /** Unique voice ID (e.g., "11labs-Adrian") */
  id: string
  /** Display name */
  name: string
  /** Voice provider */
  provider: string
  /** Gender of the voice */
  gender: "Male" | "Female"
  /** Accent annotation */
  accent: string
  /** Age annotation */
  age: string
  /** URL to preview audio */
  previewAudioUrl?: string
}

export interface ListRetellVoicesResponse {
  success: boolean
  data?: RetellVoice[]
  error?: string
}

// ============================================================================
// FETCH VOICES FROM RETELL API
// ============================================================================

/**
 * Fetches all available voices from Retell API
 * Filters to only return ElevenLabs voices
 */
export async function listRetellVoices(apiKey: string): Promise<ListRetellVoicesResponse> {
  try {
    if (!apiKey) {
      return {
        success: false,
        error: "No Retell API key provided",
      }
    }

    console.log("[RetellVoices] Fetching voices from Retell API")

    const response = await fetch(`${RETELL_BASE_URL}/list-voices`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: Record<string, unknown> = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      console.error("[RetellVoices] API error:", response.status, errorData)
      return {
        success: false,
        error: (errorData.message as string) || `Retell API error: ${response.status}`,
      }
    }

    const voices: RetellVoiceResponse[] = await response.json()
    console.log("[RetellVoices] Fetched", voices.length, "total voices")

    // Filter for ElevenLabs voices only and normalize the data
    const elevenLabsVoices = voices
      .filter((voice) => voice.provider === "elevenlabs")
      .map(normalizeRetellVoice)

    console.log("[RetellVoices] Filtered to", elevenLabsVoices.length, "ElevenLabs voices")

    return {
      success: true,
      data: elevenLabsVoices,
    }
  } catch (error) {
    console.error("[RetellVoices] Exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error fetching voices",
    }
  }
}

/**
 * Fetches all voices (all providers) from Retell API
 */
export async function listAllRetellVoices(apiKey: string): Promise<ListRetellVoicesResponse> {
  try {
    if (!apiKey) {
      return {
        success: false,
        error: "No Retell API key provided",
      }
    }

    console.log("[RetellVoices] Fetching all voices from Retell API")

    const response = await fetch(`${RETELL_BASE_URL}/list-voices`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: Record<string, unknown> = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      console.error("[RetellVoices] API error:", response.status, errorData)
      return {
        success: false,
        error: (errorData.message as string) || `Retell API error: ${response.status}`,
      }
    }

    const voices: RetellVoiceResponse[] = await response.json()
    console.log("[RetellVoices] Fetched", voices.length, "voices")

    return {
      success: true,
      data: voices.map(normalizeRetellVoice),
    }
  } catch (error) {
    console.error("[RetellVoices] Exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error fetching voices",
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalizes Retell API voice response to our internal format
 */
function normalizeRetellVoice(voice: RetellVoiceResponse): RetellVoice {
  return {
    id: voice.voice_id,
    name: voice.voice_name,
    provider: voice.provider,
    gender: voice.gender === "male" ? "Male" : "Female",
    accent: voice.accent || "Unknown",
    age: voice.age || "Unknown",
    previewAudioUrl: voice.preview_audio_url,
  }
}


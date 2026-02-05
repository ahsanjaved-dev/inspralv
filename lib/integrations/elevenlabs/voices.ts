/**
 * ElevenLabs Voices API Integration
 * Fetches available voices directly from ElevenLabs API
 * Reference: https://api.elevenlabs.io/docs#/voices/Get_voices_v1_voices_get
 */

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice response from ElevenLabs API
 */
export interface ElevenLabsVoiceResponse {
  voice_id: string
  name: string
  category?: string
  description?: string
  labels?: {
    accent?: string
    age?: string
    gender?: string
    description?: string
    use_case?: string
  }
  preview_url?: string
  available_for_tiers?: string[]
  settings?: {
    stability?: number
    similarity_boost?: number
    style?: number
    use_speaker_boost?: boolean
  }
  fine_tuning?: {
    is_allowed_to_fine_tune?: boolean
    finetuning_state?: string
  }
}

/**
 * API response wrapper from ElevenLabs
 */
export interface ElevenLabsVoicesApiResponse {
  voices: ElevenLabsVoiceResponse[]
}

/**
 * Normalized voice for UI consumption
 */
export interface ElevenLabsVoice {
  /** Unique voice ID from ElevenLabs */
  id: string
  /** Display name */
  name: string
  /** Voice category (premade, cloned, etc.) */
  category: string
  /** Gender of the voice */
  gender: "Male" | "Female" | "Unknown"
  /** Accent annotation */
  accent: string
  /** Age annotation */
  age: string
  /** Description of the voice */
  description: string
  /** URL to preview audio */
  previewAudioUrl?: string
  /** Provider (always "elevenlabs" for this integration) */
  provider: "elevenlabs"
}

export interface ListElevenLabsVoicesResponse {
  success: boolean
  data?: ElevenLabsVoice[]
  error?: string
}

// ============================================================================
// FETCH VOICES FROM ELEVENLABS API
// ============================================================================

/**
 * Fetches all available voices from ElevenLabs API
 * Can use either a direct ElevenLabs API key or a VAPI API key
 * (VAPI uses ElevenLabs voices, so we need to get the key from VAPI integration)
 */
export async function listElevenLabsVoices(apiKey: string): Promise<ListElevenLabsVoicesResponse> {
  try {
    if (!apiKey) {
      return {
        success: false,
        error: "No ElevenLabs API key provided",
      }
    }

    console.log("[ElevenLabsVoices] Fetching voices from ElevenLabs API")

    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
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
      console.error("[ElevenLabsVoices] API error:", response.status, errorData)
      return {
        success: false,
        error: (errorData.detail?.message as string) || (errorData.message as string) || `ElevenLabs API error: ${response.status}`,
      }
    }

    const data: ElevenLabsVoicesApiResponse = await response.json()
    console.log("[ElevenLabsVoices] Fetched", data.voices?.length || 0, "voices")

    // Normalize the data
    const normalizedVoices = (data.voices || []).map(normalizeElevenLabsVoice)

    // Sort by name for better UX
    normalizedVoices.sort((a, b) => a.name.localeCompare(b.name))

    return {
      success: true,
      data: normalizedVoices,
    }
  } catch (error) {
    console.error("[ElevenLabsVoices] Exception:", error)
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
 * Normalizes ElevenLabs API voice response to our internal format
 */
function normalizeElevenLabsVoice(voice: ElevenLabsVoiceResponse): ElevenLabsVoice {
  // Extract gender from labels, default to Unknown
  let gender: "Male" | "Female" | "Unknown" = "Unknown"
  if (voice.labels?.gender) {
    const genderLower = voice.labels.gender.toLowerCase()
    if (genderLower === "male") gender = "Male"
    else if (genderLower === "female") gender = "Female"
  }

  return {
    id: voice.voice_id,
    name: voice.name,
    category: voice.category || "premade",
    gender,
    accent: voice.labels?.accent || "Unknown",
    age: voice.labels?.age || "Unknown",
    description: voice.labels?.description || voice.description || "",
    previewAudioUrl: voice.preview_url,
    provider: "elevenlabs",
  }
}


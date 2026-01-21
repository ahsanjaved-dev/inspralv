/**
 * Voice Configuration for VAPI and Retell
 * Centralized voice definitions for AI agents
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceOption {
  /** Unique identifier for the voice */
  id: string
  /** Display name */
  name: string
  /** Gender of the voice */
  gender: "Male" | "Female"
  /** Accent or origin */
  accent: string
  /** Age of the voice persona */
  age: number
  /** Brief description of voice characteristics */
  characteristics: string
  /** Provider-specific voice ID (if different from id) */
  providerId?: string
}

export interface VoiceConfig {
  provider: "vapi" | "retell"
  voices: VoiceOption[]
}

// ============================================================================
// VAPI VOICES (Using ElevenLabs provider)
// Reference: https://docs.vapi.ai/providers/voice/elevenlabs
// NOTE: VAPI built-in voices are ALL deprecated as of Jan 2026
// We now use ElevenLabs voices which are fully supported
// ElevenLabs voice IDs are used with provider: "11labs"
// ============================================================================

export const VAPI_VOICES: VoiceOption[] = [
  {
    id: "rachel",
    name: "Rachel",
    gender: "Female",
    accent: "American",
    age: 28,
    characteristics: "Warm, professional, clear",
    providerId: "21m00Tcm4TlvDq8ikWAM",
  },
  {
    id: "drew",
    name: "Drew",
    gender: "Male",
    accent: "American",
    age: 30,
    characteristics: "Well-rounded, informative, professional",
    providerId: "29vD33N1CtxCmqQRPOHJ",
  },
  {
    id: "clyde",
    name: "Clyde",
    gender: "Male",
    accent: "American",
    age: 35,
    characteristics: "War veteran, deep, gruff",
    providerId: "2EiwWnXFnvU5JabPnv8n",
  },
  {
    id: "paul",
    name: "Paul",
    gender: "Male",
    accent: "American",
    age: 32,
    characteristics: "Ground reporter, calm, authoritative",
    providerId: "5Q0t7uMcjvnagumLfvZi",
  },
  {
    id: "domi",
    name: "Domi",
    gender: "Female",
    accent: "American",
    age: 25,
    characteristics: "Strong, confident, assertive",
    providerId: "AZnzlk1XvdvUeBnXmlld",
  },
  {
    id: "dave",
    name: "Dave",
    gender: "Male",
    accent: "British-Essex",
    age: 28,
    characteristics: "Conversational, video games, young",
    providerId: "CYw3kZ02Hs0563khs1Fj",
  },
  {
    id: "fin",
    name: "Fin",
    gender: "Male",
    accent: "Irish",
    age: 35,
    characteristics: "Sailor, gruff, intense",
    providerId: "D38z5RcWu1voky8WS1ja",
  },
  {
    id: "bella",
    name: "Bella",
    gender: "Female",
    accent: "American",
    age: 26,
    characteristics: "Soft, pleasant, warm",
    providerId: "EXAVITQu4vr4xnSDxMaL",
  },
  {
    id: "antoni",
    name: "Antoni",
    gender: "Male",
    accent: "American",
    age: 29,
    characteristics: "Well-rounded, calm, professional",
    providerId: "ErXwobaYiN019PkySvjV",
  },
  {
    id: "thomas",
    name: "Thomas",
    gender: "Male",
    accent: "American",
    age: 32,
    characteristics: "Calm, collected, professional",
    providerId: "GBv7mTt0atIp3Br8iCZE",
  },
  {
    id: "charlie",
    name: "Charlie",
    gender: "Male",
    accent: "Australian",
    age: 26,
    characteristics: "Casual, conversational, friendly",
    providerId: "IKne3meq5aSn9XLyUdCD",
  },
  {
    id: "emily",
    name: "Emily",
    gender: "Female",
    accent: "American",
    age: 24,
    characteristics: "Calm, gentle, soft-spoken",
    providerId: "LcfcDJNUP1GQjkzn1xUU",
  },
  {
    id: "elli",
    name: "Elli",
    gender: "Female",
    accent: "American",
    age: 27,
    characteristics: "Emotional, expressive, warm",
    providerId: "MF3mGyEYCl7XYWbV9V6O",
  },
  {
    id: "callum",
    name: "Callum",
    gender: "Male",
    accent: "Transatlantic",
    age: 30,
    characteristics: "Video character, intense, hoarse",
    providerId: "N2lVS1w4EtoT3dr4eOWO",
  },
  {
    id: "patrick",
    name: "Patrick",
    gender: "Male",
    accent: "American",
    age: 28,
    characteristics: "Should, confident, professional",
    providerId: "ODq5zmih8GrVes37Dizd",
  },
  {
    id: "harry",
    name: "Harry",
    gender: "Male",
    accent: "American",
    age: 32,
    characteristics: "Anxious, soft, nervous",
    providerId: "SOYHLrjzK2X1ezoPC6cr",
  },
  {
    id: "josh",
    name: "Josh",
    gender: "Male",
    accent: "American",
    age: 28,
    characteristics: "Deep, narrative, articulate",
    providerId: "TxGEqnHWrfWFTfGW9XjX",
  },
  {
    id: "arnold",
    name: "Arnold",
    gender: "Male",
    accent: "American",
    age: 40,
    characteristics: "Crisp, narrative, authoritative",
    providerId: "VR6AewLTigWG4xSOukaG",
  },
  {
    id: "charlotte",
    name: "Charlotte",
    gender: "Female",
    accent: "English-Swedish",
    age: 30,
    characteristics: "Seductive, video games, mysterious",
    providerId: "XB0fDUnXU5powFXDhCwa",
  },
  {
    id: "matilda",
    name: "Matilda",
    gender: "Female",
    accent: "American",
    age: 28,
    characteristics: "Warm, friendly, pleasant",
    providerId: "XrExE9yKIg1WjnnlVkGX",
  },
  {
    id: "james",
    name: "James",
    gender: "Male",
    accent: "Australian",
    age: 35,
    characteristics: "Calm, old, news presenter",
    providerId: "ZQe5CZNOzWyzPSCn5a3c",
  },
  {
    id: "joseph",
    name: "Joseph",
    gender: "Male",
    accent: "British",
    age: 40,
    characteristics: "News anchor, authoritative, clear",
    providerId: "Zlb1dXrM653N07WRdFW3",
  },
  {
    id: "adam",
    name: "Adam",
    gender: "Male",
    accent: "American",
    age: 30,
    characteristics: "Deep, narrative, professional",
    providerId: "pNInz6obpgDQGcFmaJgB",
  },
  {
    id: "sam",
    name: "Sam",
    gender: "Male",
    accent: "American",
    age: 28,
    characteristics: "Raspy, young, dynamic",
    providerId: "yoZ06aMxZJJ28mfd3POQ",
  },
]

// ============================================================================
// RETELL VOICES
// Reference: https://docs.retellai.com/api-references/list-voices
// Currently only Adrian is supported
// ============================================================================

export const RETELL_VOICES: VoiceOption[] = [
  {
    id: "11labs-Adrian",
    name: "Adrian",
    gender: "Male",
    accent: "American",
    age: 25, // Young
    characteristics: "Professional, clear, confident voice from ElevenLabs",
    providerId: "11labs-Adrian",
  },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get available voices for VAPI provider
 */
export function getVapiVoices(): VoiceOption[] {
  return VAPI_VOICES
}

/**
 * Get available voices for Retell provider
 */
export function getRetellVoices(): VoiceOption[] {
  return RETELL_VOICES
}

/**
 * Get voices for a specific provider
 */
export function getVoicesForProvider(provider: "vapi" | "retell"): VoiceOption[] {
  switch (provider) {
    case "vapi":
      return getVapiVoices()
    case "retell":
      return getRetellVoices()
    default:
      return []
  }
}

/**
 * Find a voice by ID for a specific provider
 */
export function findVoiceById(provider: "vapi" | "retell", voiceId: string): VoiceOption | undefined {
  const voices = getVoicesForProvider(provider)
  return voices.find((v) => v.id === voiceId)
}

/**
 * Get the provider-specific voice ID (for API calls)
 */
export function getProviderVoiceId(provider: "vapi" | "retell", voiceId: string): string {
  const voice = findVoiceById(provider, voiceId)
  if (!voice) {
    // Return default voices if not found
    return provider === "vapi" ? "harry" : "11labs-Adrian"
  }
  return voice.providerId || voice.id
}

/**
 * Get the default voice for a provider
 */
export function getDefaultVoice(provider: "vapi" | "retell"): VoiceOption {
  const voices = getVoicesForProvider(provider)
  if (voices.length === 0) {
    // This should never happen, but throw an error to satisfy TypeScript
    throw new Error(`No voices available for provider: ${provider}`)
  }
  return voices[0]! // First voice is default (non-null assertion safe because we checked length)
}

/**
 * Get UI color for voice card based on gender
 */
export function getVoiceCardColor(gender: "Male" | "Female"): { bg: string; text: string } {
  return gender === "Female"
    ? { bg: "bg-pink-100", text: "text-pink-600" }
    : { bg: "bg-blue-100", text: "text-blue-600" }
}


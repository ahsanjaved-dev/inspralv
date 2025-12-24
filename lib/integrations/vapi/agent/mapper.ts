/**
 * VAPI Agent Mapper
 * Transforms internal AIAgent schema to/from VAPI format
 */

import type { AIAgent, AgentConfig } from "@/types/database.types"

// ============================================================================
// DEFAULT VOICE ID
// ============================================================================

// Default ElevenLabs voice ID (Rachel - female, American)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"

// Validates if a string looks like a valid ElevenLabs voice ID
// ElevenLabs IDs are 20-character alphanumeric strings
function isValidElevenLabsVoiceId(voiceId: string | undefined): boolean {
  if (!voiceId) return false
  // ElevenLabs voice IDs are exactly 20 characters, alphanumeric
  return /^[a-zA-Z0-9]{20,}$/.test(voiceId)
}

// ============================================================================
// VAPI PAYLOAD TYPES
// ============================================================================

export interface VapiAssistantPayload {
  name: string
  firstMessage?: string
  voice?: {
    provider: string
    voiceId: string
    stability?: number
    similarityBoost?: number
    speed?: number
  }
  model?: {
    provider: string
    model: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }
  transcriber?: {
    provider: string
    model?: string
    language?: string
  }
  endCallPhrases?: string[]
  maxDurationSeconds?: number
  metadata?: Record<string, unknown>
}

// ============================================================================
// VAPI RESPONSE TYPES
// ============================================================================

export interface VapiAssistantResponse {
  id: string
  name: string
  voice?: {
    provider?: string
    voiceId?: string
    stability?: number
    similarityBoost?: number
    speed?: number
  }
  model?: {
    provider?: string
    model?: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }
  transcriber?: {
    provider?: string
    model?: string
    language?: string
  }
  firstMessage?: string
  endCallPhrases?: string[]
  maxDurationSeconds?: number
  createdAt?: string
  updatedAt?: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// UPDATE TYPE (for reverse mapping)
// ============================================================================

export interface VapiAgentUpdate {
  external_agent_id: string
  config?: Partial<AgentConfig>
  voice_provider?: string
  model_provider?: string
  transcriber_provider?: string
}

// ============================================================================
// PROVIDER MAPPING HELPERS
// Maps internal provider names to VAPI's expected values
// ============================================================================

function mapVoiceProviderToVapi(provider: string | null | undefined): string {
  const mapping: Record<string, string> = {
    elevenlabs: "11labs",
    deepgram: "deepgram",
    azure: "azure",
    openai: "openai",
    cartesia: "cartesia",
  }
  return mapping[provider || ""] || "11labs"
}

function mapTranscriberProviderToVapi(provider: string | null | undefined): string {
  const mapping: Record<string, string> = {
    deepgram: "deepgram",
    assemblyai: "assembly-ai",
    openai: "openai",
  }
  return mapping[provider || ""] || "deepgram"
}

// Reverse mapping: VAPI values to internal values
function mapVoiceProviderFromVapi(provider: string | null | undefined): string {
  const mapping: Record<string, string> = {
    "11labs": "elevenlabs",
    deepgram: "deepgram",
    azure: "azure",
    openai: "openai",
    cartesia: "cartesia",
  }
  return mapping[provider || ""] || provider || "elevenlabs"
}

function mapTranscriberProviderFromVapi(provider: string | null | undefined): string {
  const mapping: Record<string, string> = {
    deepgram: "deepgram",
    "assembly-ai": "assemblyai",
    openai: "openai",
  }
  return mapping[provider || ""] || provider || "deepgram"
}

// ============================================================================
// MAPPER: Internal Schema → VAPI
// ============================================================================

export function mapToVapi(agent: AIAgent): VapiAssistantPayload {
  const config = agent.config || {}

  const payload: VapiAssistantPayload = {
    name: agent.name,
    metadata: {
      internal_agent_id: agent.id,
      workspace_id: agent.workspace_id,
    },
  }

  // First message / greeting
  if (config.first_message) {
    payload.firstMessage = config.first_message
  }

  // Voice configuration - ALWAYS include with validated voice ID
  // Use the provided voice_id only if it looks like a valid ElevenLabs ID
  const voiceId = isValidElevenLabsVoiceId(config.voice_id)
    ? config.voice_id!
    : DEFAULT_VOICE_ID

  payload.voice = {
    provider: mapVoiceProviderToVapi(agent.voice_provider),
    voiceId: voiceId,
  }

  if (config.voice_settings) {
    payload.voice.stability = config.voice_settings.stability
    payload.voice.similarityBoost = config.voice_settings.similarity_boost
    payload.voice.speed = config.voice_settings.speed
  }

  // Model configuration
  if (agent.model_provider || config.model_settings) {
    payload.model = {
      provider: agent.model_provider || "openai",
      model: config.model_settings?.model || "gpt-4",
    }

    if (config.system_prompt) {
      payload.model.systemPrompt = config.system_prompt
    }

    if (config.model_settings) {
      payload.model.temperature = config.model_settings.temperature
      payload.model.maxTokens = config.model_settings.max_tokens
    }
  }

  // Transcriber configuration
  if (agent.transcriber_provider || config.transcriber_settings) {
    payload.transcriber = {
      provider: mapTranscriberProviderToVapi(agent.transcriber_provider),
    }

    if (config.transcriber_settings) {
      payload.transcriber.model = config.transcriber_settings.model
      payload.transcriber.language = config.transcriber_settings.language
    }
  }

  // Call settings
  if (config.end_call_phrases && config.end_call_phrases.length > 0) {
    payload.endCallPhrases = config.end_call_phrases
  }

  if (config.max_duration_seconds) {
    payload.maxDurationSeconds = config.max_duration_seconds
  }

  return payload
}

// ============================================================================
// MAPPER: VAPI Response → Internal Schema Update
// ============================================================================

export function mapFromVapi(response: VapiAssistantResponse): VapiAgentUpdate {
  const update: VapiAgentUpdate = {
    external_agent_id: response.id,
  }

  const configUpdates: Partial<AgentConfig> = {}

  if (response.firstMessage) {
    configUpdates.first_message = response.firstMessage
  }

  if (response.model?.systemPrompt) {
    configUpdates.system_prompt = response.model.systemPrompt
  }

  if (response.voice?.voiceId) {
    configUpdates.voice_id = response.voice.voiceId
  }

  if (response.voice) {
    configUpdates.voice_settings = {
      stability: response.voice.stability,
      similarity_boost: response.voice.similarityBoost,
      speed: response.voice.speed,
    }
  }

  if (response.model) {
    configUpdates.model_settings = {
      model: response.model.model,
      temperature: response.model.temperature,
      max_tokens: response.model.maxTokens,
    }
  }

  if (response.transcriber) {
    configUpdates.transcriber_settings = {
      model: response.transcriber.model,
      language: response.transcriber.language,
    }
  }

  if (response.endCallPhrases) {
    configUpdates.end_call_phrases = response.endCallPhrases
  }

  if (response.maxDurationSeconds) {
    configUpdates.max_duration_seconds = response.maxDurationSeconds
  }

  if (Object.keys(configUpdates).length > 0) {
    update.config = configUpdates
  }

  if (response.voice?.provider) {
    update.voice_provider = mapVoiceProviderFromVapi(response.voice.provider)
  }

  if (response.model?.provider) {
    update.model_provider = response.model.provider
  }

  if (response.transcriber?.provider) {
    update.transcriber_provider = mapTranscriberProviderFromVapi(response.transcriber.provider)
  }

  return update
}
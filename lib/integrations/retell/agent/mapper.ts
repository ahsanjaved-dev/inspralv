/**
 * Retell Agent Mapper
 * Transforms internal AIAgent schema to/from Retell format
 */

import type { AIAgent, AgentConfig } from "@/types/database.types"

// ============================================================================
// RETELL LLM PAYLOAD TYPES
// ============================================================================

export interface RetellLLMPayload {
  model: string
  general_prompt?: string
  general_tools?: Record<string, unknown>[]
  begin_message?: string
  starting_state?: string
  states?: Record<string, unknown>[]
}

export interface RetellLLMResponse {
  llm_id: string
  model: string
  general_prompt?: string
  begin_message?: string
  last_modification_timestamp?: number
}

// ============================================================================
// RETELL AGENT PAYLOAD TYPES
// ============================================================================

export interface RetellAgentPayload {
  agent_name: string
  response_engine: {
    type: "retell-llm"
    llm_id: string
  }
  voice_id: string
  language?: string
  voice_model?: string
  voice_temperature?: number
  voice_speed?: number
  responsiveness?: number
  interruption_sensitivity?: number
  enable_backchannel?: boolean
  backchannel_frequency?: number
  backchannel_words?: string[]
  reminder_trigger_ms?: number
  reminder_max_count?: number
  ambient_sound?: string
  ambient_sound_volume?: number
  end_call_after_silence_ms?: number
  max_call_duration_ms?: number
  normalize_for_speech?: boolean
  opt_out_sensitive_data_storage?: boolean
  pronunciation_dictionary?: Record<string, string>[]
  webhook_url?: string
}

// ============================================================================
// RETELL AGENT RESPONSE TYPES
// ============================================================================

export interface RetellAgentResponse {
  agent_id: string
  agent_name: string
  response_engine?: {
    type: string
    llm_id: string
  }
  voice_id?: string
  voice_model?: string
  voice_temperature?: number
  voice_speed?: number
  language?: string
  responsiveness?: number
  interruption_sensitivity?: number
  enable_backchannel?: boolean
  backchannel_frequency?: number
  backchannel_words?: string[]
  reminder_trigger_ms?: number
  reminder_max_count?: number
  ambient_sound?: string
  ambient_sound_volume?: number
  webhook_url?: string
  end_call_after_silence_ms?: number
  max_call_duration_ms?: number
  last_modification_timestamp?: number
}

// ============================================================================
// UPDATE TYPE (for reverse mapping)
// ============================================================================

export interface RetellAgentUpdate {
  external_agent_id: string
  config?: Partial<AgentConfig>
  voice_provider?: string
}

// ============================================================================
// DEFAULT VOICE
// ============================================================================

const RETELL_DEFAULT_VOICE_ID = "11labs-Adrian"

// ============================================================================
// MAPPER: Internal Schema → Retell LLM
// ============================================================================

export function mapToRetellLLM(agent: AIAgent): RetellLLMPayload {
  const config = agent.config || {}

  // Map model provider to Retell model name
  const modelMap: Record<string, string> = {
    openai: "gpt-4o",
    anthropic: "claude-3-5-sonnet",
    google: "gemini-1.5-pro",
    groq: "llama-3.1-70b",
  }

  const payload: RetellLLMPayload = {
    model: modelMap[agent.model_provider || "openai"] || "gpt-4o",
  }

  // System prompt
  if (config.system_prompt) {
    payload.general_prompt = config.system_prompt
  }

  // Begin message / greeting
  if (config.first_message) {
    payload.begin_message = config.first_message
  }

  return payload
}

// ============================================================================
// MAPPER: Internal Schema → Retell Agent (requires llm_id)
// ============================================================================

export function mapToRetellAgent(agent: AIAgent, llmId: string): RetellAgentPayload {
  const config = agent.config || {}

  const payload: RetellAgentPayload = {
    agent_name: agent.name,
    response_engine: {
      type: "retell-llm",
      llm_id: llmId,
    },
    // Always use 11labs-Adrian as voice_id
    voice_id: RETELL_DEFAULT_VOICE_ID,
  }

  // Voice settings
  if (config.voice_settings) {
    if (config.voice_settings.speed !== undefined) {
      payload.voice_speed = config.voice_settings.speed
    }
    if (config.voice_settings.stability !== undefined) {
      payload.voice_temperature = config.voice_settings.stability
    }
  }

  // Language
  if (config.transcriber_settings?.language) {
    payload.language = config.transcriber_settings.language
  }

  // Call duration
  if (config.max_duration_seconds) {
    payload.max_call_duration_ms = config.max_duration_seconds * 1000
  }

  return payload
}

// ============================================================================
// MAPPER: Retell Response → Internal Schema Update
// ============================================================================

export function mapFromRetell(
  agentResponse: RetellAgentResponse,
  llmResponse?: RetellLLMResponse
): RetellAgentUpdate {
  const update: RetellAgentUpdate = {
    external_agent_id: agentResponse.agent_id,
  }

  const configUpdates: Partial<AgentConfig> = {}

  // Store llm_id for future updates
  if (agentResponse.response_engine?.llm_id || llmResponse?.llm_id) {
    configUpdates.retell_llm_id = agentResponse.response_engine?.llm_id || llmResponse?.llm_id
  }

  if (llmResponse?.begin_message) {
    configUpdates.first_message = llmResponse.begin_message
  }

  if (llmResponse?.general_prompt) {
    configUpdates.system_prompt = llmResponse.general_prompt
  }

  if (agentResponse.voice_id) {
    configUpdates.voice_id = agentResponse.voice_id
  }

  if (agentResponse.voice_speed !== undefined || agentResponse.voice_temperature !== undefined) {
    configUpdates.voice_settings = {
      speed: agentResponse.voice_speed,
      stability: agentResponse.voice_temperature,
    }
  }

  if (agentResponse.language) {
    configUpdates.transcriber_settings = {
      language: agentResponse.language,
    }
  }

  if (agentResponse.max_call_duration_ms) {
    configUpdates.max_duration_seconds = Math.floor(agentResponse.max_call_duration_ms / 1000)
  }

  if (Object.keys(configUpdates).length > 0) {
    update.config = configUpdates
  }

  update.voice_provider = "elevenlabs"

  return update
}
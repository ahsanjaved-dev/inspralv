/**
 * VAPI Agent Mapper
 * Transforms internal AIAgent schema to/from VAPI format
 */

import type {
  AIAgent,
  AgentConfig,
  FunctionTool,
  FunctionToolParameters,
} from "@/types/database.types"

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
// VAPI TOOL TYPES (Legacy - kept for backward compatibility)
// For new code, use types from @/lib/integrations/function_tools/vapi
// ============================================================================

/**
 * VAPI Tool Message - spoken during tool execution
 * @deprecated Use VapiToolMessage from function_tools instead
 */
export interface VapiToolMessage {
  type: "request-start" | "request-response-delayed" | "request-complete" | "request-failed"
  content?: string
  /** Whether to block/wait for this message before proceeding */
  blocking?: boolean
}

/**
 * VAPI Function Definition
 * @deprecated Use types from function_tools instead
 */
export interface VapiFunctionDefinition {
  name: string
  description: string
  parameters:
    | FunctionToolParameters
    | { type: "object"; properties: Record<string, never>; required?: string[] }
}

/**
 * VAPI Tool Server Configuration
 * @deprecated Use ToolServer from function_tools instead
 */
export interface VapiToolServer {
  url: string
  timeoutSeconds?: number
  secret?: string
}

/**
 * VAPI Built-in Tool Types
 * @deprecated Use VapiToolType from function_tools instead
 */
export type VapiToolType = "function" | "endCall" | "transferCall" | "dtmf"

/**
 * VAPI Tool - Supports both custom functions and built-in tools
 * Reference: https://docs.vapi.ai/tools
 * @deprecated Use VapiTool from function_tools instead
 */
export interface VapiTool {
  type: VapiToolType
  messages?: VapiToolMessage[]
  function?: VapiFunctionDefinition
  async?: boolean
  server?: VapiToolServer
  name?: string
  description?: string
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
    /**
     * Tool IDs attached via the VAPI Tool API (/tool).
     * This is the "API Alternative" integration path.
     */
    toolIds?: string[]
    tools?: VapiTool[]
  }
  transcriber?: {
    provider: string
    model?: string
    language?: string
  }
  endCallPhrases?: string[]
  maxDurationSeconds?: number
  metadata?: Record<string, unknown>
  /** Server URL for tool calls (fallback if not specified per-tool) */
  serverUrl?: string
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
// TOOL MAPPING: Internal FunctionTool → VAPI Tool
// Now uses the centralized function_tools module
// ============================================================================

// Re-export for backward compatibility
export {
  mapFunctionToolsToVapi as mapToolsToVapi,
  mapFunctionToolToVapi as mapToolToVapi,
  createEndCallTool,
  DEFAULT_END_CALL_TOOL,
} from "@/lib/integrations/function_tools/vapi"

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
  const voiceId = isValidElevenLabsVoiceId(config.voice_id) ? config.voice_id! : DEFAULT_VOICE_ID

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
  // NOTE: We create a model block if any model-related settings OR tools are present,
  // because toolIds/tools live under `model`.
  if (
    agent.model_provider ||
    config.model_settings ||
    config.system_prompt ||
    (config.tools && config.tools.length > 0)
  ) {
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

    // Tools: support both inline tools and API-managed toolIds.
    // - Native/built-in tools (endCall, transferCall, dtmf, handoff, etc.) are sent inline in `model.tools`
    // - Custom "function" tools can be created via VAPI /tool and attached via `model.toolIds`
    const allTools = (config.tools || []) as FunctionTool[]
    const enabledTools = allTools.filter((t) => t.enabled !== false)

    const functionToolIds = enabledTools
      .filter((t) => (t.tool_type ?? "function") === "function" && !!t.external_tool_id)
      .map((t) => t.external_tool_id!) // eslint-disable-line @typescript-eslint/no-non-null-assertion

    const inlineToolsSource = enabledTools.filter((t) => {
      const isFunction = (t.tool_type ?? "function") === "function"
      // If it has an external_tool_id, we prefer toolIds over inline tool definitions
      return !(isFunction && t.external_tool_id)
    })

    const vapiTools = mapFunctionToolsToVapi(inlineToolsSource, {
      defaultServerUrl: config.tools_server_url,
      autoAddEndCall: true,
    })

    if (functionToolIds.length > 0) {
      payload.model.toolIds = functionToolIds
    }

    if (vapiTools.length > 0) {
      // These types are structurally compatible with the legacy VapiTool interface
      payload.model.tools = vapiTools as unknown as VapiTool[]
    }
  }

  // Set server URL for webhooks and tool calls
  // Priority: 1. Custom tools_server_url from config, 2. App URL from env, 3. Hardcoded fallback
  const baseUrl = env.appUrl || "https://genius365.vercel.app"
  const defaultWebhookUrl = `${baseUrl}/api/webhooks/vapi`
  payload.serverUrl = config.tools_server_url || defaultWebhookUrl

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

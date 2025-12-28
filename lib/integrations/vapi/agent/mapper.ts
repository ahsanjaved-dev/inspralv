/**
 * VAPI Agent Mapper
 * Transforms internal AIAgent schema to/from VAPI format
 */

import type { AIAgent, AgentConfig, FunctionTool, FunctionToolParameters } from "@/types/database.types"

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
// VAPI TOOL TYPES
// ============================================================================

/**
 * VAPI Tool Message - spoken during tool execution
 */
export interface VapiToolMessage {
  type: 'request-start' | 'request-response-delayed' | 'request-complete' | 'request-failed'
  content?: string
  /** Whether to block/wait for this message before proceeding */
  blocking?: boolean
}

/**
 * VAPI Function Definition
 */
export interface VapiFunctionDefinition {
  name: string
  description: string
  parameters: FunctionToolParameters | { type: 'object'; properties: Record<string, never>; required?: string[] }
}

/**
 * VAPI Tool Server Configuration
 */
export interface VapiToolServer {
  url: string
  timeoutSeconds?: number
  secret?: string
}

/**
 * VAPI Built-in Tool Types
 */
export type VapiToolType = 'function' | 'endCall' | 'transferCall' | 'dtmf'

/**
 * VAPI Tool - Supports both custom functions and built-in tools
 * Reference: https://docs.vapi.ai/tools
 */
export interface VapiTool {
  type: VapiToolType
  messages?: VapiToolMessage[]
  function?: VapiFunctionDefinition
  async?: boolean
  server?: VapiToolServer
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
// ============================================================================

/**
 * Creates a VAPI endCall tool
 * This built-in tool allows the AI to end the call when appropriate
 */
export function createEndCallTool(description?: string, executionMessage?: string): VapiTool {
  return {
    type: 'endCall',
    function: {
      name: 'end_call_tool',
      description: description || 'Use this tool to end the call when the customer says goodbye, thanks, or the conversation is naturally complete.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    messages: [
      {
        type: 'request-start',
        content: executionMessage || 'Thank you for calling. Goodbye!',
        blocking: true, // IMPORTANT: Must be true for endCall to actually end the call
      },
    ],
  }
}

/**
 * Maps an internal FunctionTool to VAPI Tool format
 * Supports both custom functions and built-in tools like endCall
 */
export function mapToolToVapi(tool: FunctionTool, defaultServerUrl?: string): VapiTool {
  // Handle built-in endCall tool
  if (tool.tool_type === 'endCall') {
    return createEndCallTool(tool.description, tool.execution_message)
  }

  // Handle built-in transferCall tool
  if (tool.tool_type === 'transferCall') {
    return {
      type: 'transferCall',
      function: {
        name: tool.name || 'transfer_call_tool',
        description: tool.description || 'Transfer the call to another number or agent.',
        parameters: tool.parameters,
      },
      messages: tool.execution_message
        ? [{ type: 'request-start', content: tool.execution_message, blocking: true }]
        : undefined,
    }
  }

  // Handle built-in dtmf tool
  if (tool.tool_type === 'dtmf') {
    return {
      type: 'dtmf',
      function: {
        name: tool.name || 'dtmf_tool',
        description: tool.description || 'Send DTMF tones.',
        parameters: tool.parameters,
      },
    }
  }

  // Handle custom function tools (default behavior)
  const vapiTool: VapiTool = {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }

  // Set async mode if specified
  if (tool.async !== undefined) {
    vapiTool.async = tool.async
  }

  // Set server URL (tool-specific or default)
  const serverUrl = tool.server_url || defaultServerUrl
  if (serverUrl) {
    vapiTool.server = {
      url: serverUrl,
    }
  }

  // Add execution message if specified
  if (tool.speak_during_execution && tool.execution_message) {
    vapiTool.messages = [
      {
        type: 'request-start',
        content: tool.execution_message,
        blocking: false,
      },
    ]
  }

  return vapiTool
}

/**
 * Maps an array of internal FunctionTools to VAPI Tools format
 */
export function mapToolsToVapi(tools: FunctionTool[], defaultServerUrl?: string): VapiTool[] {
  return tools
    .filter((tool) => tool.enabled !== false)
    .map((tool) => mapToolToVapi(tool, defaultServerUrl))
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

    // Add tools to model configuration
    const allTools: VapiTool[] = []
    
    if (config.tools && config.tools.length > 0) {
      const vapiTools = mapToolsToVapi(config.tools, config.tools_server_url)
      allTools.push(...vapiTools)
    }
    
    // Check if endCall tool is already included in user-defined tools
    const hasEndCallTool = (config.tools || []).some(
      (tool) => tool.tool_type === 'endCall' || tool.name === 'end_call_tool'
    )
    
    // Always include endCall tool for proper call termination (unless already defined)
    if (!hasEndCallTool) {
      allTools.push(createEndCallTool())
    }
    
    if (allTools.length > 0) {
      payload.model.tools = allTools
    }
  }

  // Set server URL for tool calls (used as fallback)
  if (config.tools_server_url) {
    payload.serverUrl = config.tools_server_url
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
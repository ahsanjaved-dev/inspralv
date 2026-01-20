/**
 * Retell Agent Mapper
 * Transforms internal AIAgent schema to/from Retell format
 */

import type { AIAgent, AgentConfig, FunctionTool } from "@/types/database.types"
import { mapFunctionToolsToRetell } from "@/lib/integrations/function_tools/retell"
import type { RetellGeneralTool } from "@/lib/integrations/function_tools/retell/types"
import { getRetellVoices, getDefaultVoice } from "@/lib/voice"
import { env } from "@/lib/env"

// Re-export for backwards compatibility
export type { RetellGeneralTool }

// ============================================================================
// RETELL LLM PAYLOAD TYPES
// ============================================================================

export interface RetellLLMPayload {
  model: string
  general_prompt?: string
  /** Custom function tools for the LLM */
  general_tools?: RetellGeneralTool[]
  begin_message?: string
  starting_state?: string
  states?: Record<string, unknown>[]
  /** Webhook URL for function calls (used as default if not specified per-tool) */
  webhook_url?: string
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

// Get available Retell voices for validation
const RETELL_VOICE_IDS = getRetellVoices().map((v) => v.id)

// Default Retell voice (Adrian - professional, clear, confident)
const RETELL_DEFAULT_VOICE_ID = getDefaultVoice("retell").id

/**
 * Validates if a voice ID is a valid Retell voice
 */
function isValidRetellVoiceId(voiceId: string | undefined): boolean {
  if (!voiceId) return false
  return RETELL_VOICE_IDS.includes(voiceId)
}

// ============================================================================
// TOOL MAPPING: Internal FunctionTool → Retell General Tool
// Now uses the centralized function_tools module
// ============================================================================

// Re-export for backward compatibility
export { 
  mapFunctionToolsToRetell as mapToolsToRetell,
  mapFunctionToolToRetell as mapToolToRetell,
} from "@/lib/integrations/function_tools/retell"

// ============================================================================
// MAPPER: Internal Schema → Retell LLM
// ============================================================================

/**
 * Maps model provider to Retell model name
 * Reference: https://docs.retellai.com/api-references/create-retell-llm
 * 
 * Available models:
 * - OpenAI: gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-5, gpt-5-mini, gpt-5-nano
 * - Anthropic: claude-4.5-sonnet, claude-4.5-haiku
 * - Google: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-3.0-flash
 */
const MODEL_MAP: Record<string, string> = {
  // OpenAI models
  openai: "gpt-4.1",
  "gpt-4": "gpt-4.1",
  "gpt-4o": "gpt-4.1",
  "gpt-4o-mini": "gpt-4.1-mini",
  "gpt-3.5-turbo": "gpt-4.1-mini",
  // Anthropic models
  anthropic: "claude-4.5-sonnet",
  "claude-3-5-sonnet": "claude-4.5-sonnet",
  "claude-3-opus": "claude-4.5-sonnet",
  "claude-3-haiku": "claude-4.5-haiku",
  // Google models
  google: "gemini-2.5-flash",
  "gemini-pro": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-2.5-flash",
  "gemini-1.5-flash": "gemini-2.5-flash-lite",
  // Groq (maps to fastest available)
  groq: "gpt-4.1-mini",
  "llama-3.1-70b": "gpt-4.1",
}

/**
 * Generate a function description block for the system prompt
 * Custom functions are described in the prompt so the LLM knows to call them
 */
function generateCustomFunctionPrompt(tools: FunctionTool[]): string {
  const customTools = tools.filter(
    t => t.enabled !== false && 
    (t.tool_type === 'function' || t.tool_type === 'custom_function')
  )
  
  if (customTools.length === 0) return ""
  
  let prompt = "\n\n## Available Functions\n"
  prompt += "You have access to the following functions. Call them when appropriate:\n\n"
  
  for (const tool of customTools) {
    prompt += `### ${tool.name}\n`
    prompt += `${tool.description || 'No description provided.'}\n`
    
    if (tool.parameters?.properties) {
      prompt += `Parameters:\n`
      for (const [paramName, paramDef] of Object.entries(tool.parameters.properties)) {
        const required = tool.parameters.required?.includes(paramName) ? ' (required)' : ' (optional)'
        const paramType = (paramDef as any).type || 'string'
        const paramDesc = (paramDef as any).description || ''
        prompt += `- ${paramName}: ${paramType}${required}${paramDesc ? ` - ${paramDesc}` : ''}\n`
      }
    }
    prompt += "\n"
  }
  
  prompt += "To call a function, state that you're calling it and provide the parameters."
  
  return prompt
}

export function mapToRetellLLM(agent: AIAgent): RetellLLMPayload {
  const config = agent.config || {}

  // Map model to Retell model name
  const modelKey = agent.model_provider || (config as any).model || "openai"
  const model = MODEL_MAP[modelKey] || MODEL_MAP["openai"]

  const payload: RetellLLMPayload = {
    model: model as string,
  }

  // System prompt with custom function descriptions appended
  let systemPrompt = config.system_prompt || ""
  
  // Add custom function descriptions to the system prompt
  // Custom functions in Retell are executed via webhook, not general_tools
  if (config.tools && config.tools.length > 0) {
    const customFunctionPrompt = generateCustomFunctionPrompt(config.tools)
    if (customFunctionPrompt) {
      systemPrompt += customFunctionPrompt
    }
  }
  
  if (systemPrompt) {
    payload.general_prompt = systemPrompt
  }

  // Begin message / greeting
  if (config.first_message) {
    payload.begin_message = config.first_message
  }

  // Add native tools to LLM configuration using the function_tools mapper
  // Only native Retell tools (end_call, transfer_call, etc.) go in general_tools
  // Custom functions are handled via webhook and described in the prompt
  if (config.tools && config.tools.length > 0) {
    const retellTools = mapFunctionToolsToRetell(config.tools)
    if (retellTools.length > 0) {
      payload.general_tools = retellTools
    }
  }

  // Set webhook URL for tool calls
  // NEW: Use workspace-level webhook URL so we can route by workspace
  // Format: {APP_URL}/api/webhooks/w/{workspaceId}/retell
  let baseUrl = (env.appUrl || "https://genius365.vercel.app").replace(/\/$/, "")
  
  // Ensure URL has https:// protocol
  if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`
  }
  
  // If workspace_id is available, use workspace-level webhook
  // Otherwise fall back to user's custom URL
  const webhookUrl = agent.workspace_id
    ? `${baseUrl}/api/webhooks/w/${agent.workspace_id}/retell`
    : config.tools_server_url
  
  // Use user's custom tools_server_url if configured, otherwise use our webhook
  payload.webhook_url = config.tools_server_url || webhookUrl

  return payload
}

// ============================================================================
// MAPPER: Internal Schema → Retell Agent (requires llm_id)
// ============================================================================

export function mapToRetellAgent(agent: AIAgent, llmId: string): RetellAgentPayload {
  const config = agent.config || {}

  // Determine voice_id: use from config if valid, otherwise use default
  const voiceId = isValidRetellVoiceId(config.voice_id)
    ? config.voice_id!
    : RETELL_DEFAULT_VOICE_ID

  const payload: RetellAgentPayload = {
    agent_name: agent.name,
    response_engine: {
      type: "retell-llm",
      llm_id: llmId,
    },
    voice_id: voiceId,
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

  // Set webhook URL at agent level for call events (call_started, call_ended, etc)
  // NEW: Use workspace-level webhook URL for call events
  // This is separate from LLM webhook_url which handles function calls
  const baseUrl = env.appUrl || "https://genius365.vercel.app"
  
  // If workspace_id is available, use workspace-level webhook
  const webhookUrl = agent.workspace_id
    ? `${baseUrl}/api/webhooks/w/${agent.workspace_id}/retell`
    : config.tools_server_url
  
  // Use our workspace webhook for call events, fallback to user's custom URL
  payload.webhook_url = webhookUrl || config.tools_server_url

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
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
import { mapFunctionToolsToVapi } from "@/lib/integrations/function_tools/vapi/mapper"
import { DEFAULT_END_CALL_TOOL } from "@/lib/integrations/function_tools/vapi/tools/call-control/end-call"
import type { VapiTool as FunctionToolsVapiTool } from "@/lib/integrations/function_tools/vapi/types"
import { env } from "@/lib/env"
import { getVapiVoices, getDefaultVoice, findVoiceById } from "@/lib/voice"
import { generateCalendarSystemPromptContext, CALENDAR_TOOL_NAMES } from "@/lib/integrations/calendar/vapi-tools"
import { generateCalcomSystemPromptContext, CALCOM_TOOL_NAMES } from "@/lib/integrations/calcom"

// ============================================================================
// DEFAULT VOICE (Using ElevenLabs)
// ============================================================================

// Get available VAPI voices for validation (these are now ElevenLabs voices)
const VAPI_VOICE_OPTIONS = getVapiVoices()
const VAPI_VOICE_IDS = VAPI_VOICE_OPTIONS.map((v) => v.id)

// Default voice (Rachel - warm, professional, clear - ElevenLabs)
const DEFAULT_VOICE = getDefaultVoice("vapi")
const DEFAULT_ELEVENLABS_VOICE_ID = DEFAULT_VOICE.providerId || "21m00Tcm4TlvDq8ikWAM"

/**
 * Gets the ElevenLabs voice ID for a given internal voice ID
 * Returns the providerId (ElevenLabs ID) for the voice, or default if not found
 * 
 * Supports two voice ID formats:
 * 1. Short names from static VAPI_VOICES list (e.g., "rachel") - maps to providerId
 * 2. Actual ElevenLabs voice IDs from dynamic API fetch (e.g., "21m00Tcm4TlvDq8ikWAM") - used directly
 */
function getElevenLabsVoiceId(voiceId: string | undefined): string {
  if (!voiceId) return DEFAULT_ELEVENLABS_VOICE_ID
  
  // First, check if this matches a static voice by short name (id)
  const voiceByShortName = VAPI_VOICE_OPTIONS.find(
    (v) => v.id.toLowerCase() === voiceId.toLowerCase()
  )
  if (voiceByShortName?.providerId) {
    return voiceByShortName.providerId
  }
  
  // Second, check if this matches a static voice by providerId (ElevenLabs ID)
  // This handles cases where the voice_id is already an ElevenLabs ID from the static list
  const voiceByProviderId = VAPI_VOICE_OPTIONS.find(
    (v) => v.providerId?.toLowerCase() === voiceId.toLowerCase()
  )
  if (voiceByProviderId?.providerId) {
    return voiceByProviderId.providerId
  }
  
  // If not found in static list, assume it's a dynamically fetched ElevenLabs voice ID
  // ElevenLabs voice IDs are alphanumeric strings (typically 20+ characters)
  // Pass through directly to support voices from the dynamic ElevenLabs API
  console.log("[VapiMapper] Using dynamic ElevenLabs voice ID:", voiceId)
  return voiceId
}

/**
 * Validates if a voice ID is a valid voice option
 * Accepts both short names from static list and actual ElevenLabs voice IDs
 */
function isValidVoiceId(voiceId: string | undefined): boolean {
  if (!voiceId) return false
  
  // Check static voice short names
  if (VAPI_VOICE_IDS.some((id) => id.toLowerCase() === voiceId.toLowerCase())) {
    return true
  }
  
  // Check static voice providerIds
  if (VAPI_VOICE_OPTIONS.some((v) => v.providerId?.toLowerCase() === voiceId.toLowerCase())) {
    return true
  }
  
  // For dynamic ElevenLabs voices, any non-empty string is considered valid
  // ElevenLabs voice IDs are alphanumeric strings
  return voiceId.length > 0
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
  /** Filter which webhook events VAPI sends to serverUrl */
  serverMessages?: string[]
  /** Enable recording and transcript collection */
  artifactPlan?: {
    recordingEnabled?: boolean
    transcriptPlan?: {
      enabled?: boolean
      assistantName?: string
      userName?: string
    }
  }
  /** Enable call analysis (summary, sentiment, etc.) */
  analysisPlan?: {
    summaryPlan?: {
      enabled?: boolean
    }
    structuredDataPlan?: {
      enabled?: boolean
    }
    successEvaluationPlan?: {
      enabled?: boolean
    }
  }
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
// NOTE: VAPI's built-in voice provider maps to "elevenlabs" in our database
// since "vapi" is not a valid voice_provider enum value in the database
function mapVoiceProviderFromVapi(provider: string | null | undefined): string {
  const mapping: Record<string, string> = {
    "11labs": "elevenlabs",
    vapi: "elevenlabs", // VAPI's built-in voices map to elevenlabs in DB
    deepgram: "deepgram",
    azure: "azure",
    openai: "openai",
    cartesia: "cartesia",
  }
  return mapping[provider || ""] || "elevenlabs"
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
} from "@/lib/integrations/function_tools/vapi/mapper"

export {
  createEndCallTool,
  DEFAULT_END_CALL_TOOL,
} from "@/lib/integrations/function_tools/vapi/tools/call-control/end-call"

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
      agent_direction: agent.agent_direction || "inbound",
    },
  }

  // First message / greeting
  // IMPORTANT: For OUTBOUND agents, we DON'T set firstMessage so the agent waits
  // for the user (recipient) to speak first after answering the call.
  // This is the expected behavior for outbound campaigns where the recipient says "Hello?"
  // and then the agent responds based on the system prompt instructions.
  const isOutbound = agent.agent_direction === "outbound"
  
  if (config.first_message && !isOutbound) {
    // Only set firstMessage for INBOUND agents
    payload.firstMessage = config.first_message
  }
  
  // Log the decision for debugging
  console.log("[VapiMapper] Agent direction:", agent.agent_direction, "| firstMessage:", isOutbound ? "SKIPPED (outbound)" : (config.first_message ? "SET" : "NOT SET"))

  // Voice configuration - Using ElevenLabs (11labs) provider
  // NOTE: VAPI built-in voices are ALL deprecated as of Jan 2026
  // We now use ElevenLabs voices which are fully supported
  const elevenLabsVoiceId = getElevenLabsVoiceId(config.voice_id)
  
  payload.voice = {
    provider: "11labs",
    voiceId: elevenLabsVoiceId,
  }
  
  // Add voice settings if provided (ElevenLabs supports these)
  if (config.voice_settings) {
    if (config.voice_settings.stability !== undefined) {
      payload.voice.stability = config.voice_settings.stability
    }
    if (config.voice_settings.similarity_boost !== undefined) {
      payload.voice.similarityBoost = config.voice_settings.similarity_boost
    }
    // Note: ElevenLabs doesn't support speed setting directly
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

    // Check if agent has calendar or Cal.com tools to inject date context
    const allTools = (config.tools || []) as FunctionTool[]
    const hasCalendarTools = allTools.some((t) => 
      CALENDAR_TOOL_NAMES.includes(t.name as typeof CALENDAR_TOOL_NAMES[number])
    )
    const hasCalcomTools = allTools.some((t) => 
      CALCOM_TOOL_NAMES.includes(t.name as typeof CALCOM_TOOL_NAMES[number])
    )

    // Build system prompt with calendar/Cal.com context if needed
    let systemPrompt = config.system_prompt || ""
    
    // Inject Google Calendar context if calendar tools are present
    if (hasCalendarTools) {
      // Get timezone from calendar settings if available
      const calendarTimezone = (config as any)?.calendar_settings?.timezone || "UTC"
      
      // Append calendar context with current date
      const calendarContext = generateCalendarSystemPromptContext(calendarTimezone)
      systemPrompt = systemPrompt + calendarContext
      
      console.log("[VapiMapper] Agent has calendar tools, injecting date context. Today:", new Date().toISOString().split("T")[0])
    }

    // Inject Cal.com context if Cal.com tools are present
    if (hasCalcomTools) {
      // Get timezone from the first Cal.com tool or calendar settings
      const calcomTool = allTools.find((t) => 
        CALCOM_TOOL_NAMES.includes(t.name as typeof CALCOM_TOOL_NAMES[number])
      )
      const calcomTimezone = (calcomTool as any)?.timezone || (config as any)?.calendar_settings?.timezone || "UTC"
      
      // Append Cal.com context with current date
      const calcomContext = generateCalcomSystemPromptContext(calcomTimezone)
      systemPrompt = systemPrompt + calcomContext
      
      console.log("[VapiMapper] Agent has Cal.com tools, injecting date context. Today:", new Date().toISOString().split("T")[0])
    }

    if (systemPrompt) {
      payload.model.systemPrompt = systemPrompt
    }

    if (config.model_settings) {
      payload.model.temperature = config.model_settings.temperature
      payload.model.maxTokens = config.model_settings.max_tokens
    }

    // Tools: support both inline tools and API-managed toolIds.
    // - Native/built-in tools (endCall, transferCall, dtmf, handoff, etc.) are sent inline in `model.tools`
    // - Custom "function" tools can be created via VAPI /tool and attached via `model.toolIds`
    // Note: allTools is already defined above for calendar check
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
  // NEW: Use workspace-level webhook URL so we can route by workspace
  // The webhook URL is constructed using workspace_id from agent metadata
  // Format: {APP_URL}/api/webhooks/w/{workspaceId}/vapi
  let baseUrl = (env.appUrl || "https://genius365.vercel.app").replace(/\/$/, "")
  
  // Ensure URL has https:// protocol (VAPI requires valid URL with protocol)
  if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`
  }
  
  // If workspace_id is available, use workspace-level webhook
  // Otherwise fall back to legacy global webhook
  const webhookUrl = agent.workspace_id
    ? `${baseUrl}/api/webhooks/w/${agent.workspace_id}/vapi`
    : `${baseUrl}/api/webhooks/vapi`
  
  console.log("[VapiMapper] Webhook URL:", {
    workspace_id: agent.workspace_id,
    webhookUrl,
    baseUrl,
  })
  
  // Store the generated webhook URL in metadata for reference
  payload.metadata = {
    ...payload.metadata,
    webhook_url: webhookUrl,
  }
  
  // Use user's custom tools_server_url if configured, otherwise use our webhook
  payload.serverUrl = config.tools_server_url || webhookUrl
  console.log("[VapiMapper] Setting serverUrl:", payload.serverUrl)

  // Filter webhook events: only send essential events to avoid webhook spam
  // Valid values from VAPI API:
  // assistant.started, conversation-update, end-of-call-report, function-call,
  // hang, language-changed, language-change-detected, model-output, phone-call-control,
  // speech-update, status-update, transcript, tool-calls, transfer-update, etc.
  payload.serverMessages = [
    "status-update",        // Call status changes (queued, ringing, in-progress, ended)
    "end-of-call-report",   // Complete call summary with transcript and recording
    "function-call",        // When functions are called (singular!)
    "tool-calls",           // When tools are called
    "transfer-update",      // When transfers occur
  ]

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

  // Enable recording, transcript, and analysis by default
  payload.artifactPlan = {
    recordingEnabled: true,
    transcriptPlan: {
      enabled: true,
      assistantName: "Agent",
      userName: "Customer",
    },
  }

  // Enable call analysis for summary, structured data, and success evaluation
  payload.analysisPlan = {
    summaryPlan: {
      enabled: true,
    },
    structuredDataPlan: {
      enabled: true,
    },
    successEvaluationPlan: {
      enabled: true,
    },
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

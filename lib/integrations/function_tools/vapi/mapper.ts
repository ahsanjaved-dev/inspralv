/**
 * VAPI Tool Mapper
 * Maps internal FunctionTool format to VAPI Tool format
 */

import type { FunctionTool } from '@/types/database.types'
import type { VapiTool, VapiFunctionTool, VapiEndCallTool, VapiTransferCallTool, VapiDtmfTool, VapiHandoffTool, VapiApiRequestTool, VapiCodeTool } from './types'
import type { VapiToolMessage, ToolParameterSchema, TransferDestination } from '../types'
import { createEndCallTool, DEFAULT_END_CALL_TOOL } from './tools/call-control/end-call'
import { createTransferCallTool } from './tools/call-control/transfer-call'
import { createDtmfTool } from './tools/call-control/dtmf'
import { createFunctionTool } from './tools/api/function'
import { createApiRequestTool } from './tools/api/api-request'
import { createCodeTool } from './tools/code/code'
import { 
  CALENDAR_TOOL_NAMES, 
  getBookAppointmentTool, 
  getCancelAppointmentTool, 
  getRescheduleAppointmentTool, 
  getCheckAvailabilityTool 
} from '@/lib/integrations/calendar/vapi-tools'
import {
  CALCOM_TOOL_NAMES,
  getCalcomCheckAvailabilityTool,
  getCalcomBookAppointmentTool,
} from '@/lib/integrations/calcom'

// Integration tool types that require a credential
const INTEGRATION_TOOL_TYPES = [
  'googleCalendarCreateEvent',
  'googleCalendarCheckAvailability',
  'googleSheetsRowAppend',
  'slackSendMessage',
  'smsSend',
  'goHighLevelCalendarAvailability',
  'goHighLevelCalendarEventCreate',
  'goHighLevelContactCreate',
  'goHighLevelContactGet',
  'query',
  'mcp',
] as const

function isIntegrationToolType(type: string): boolean {
  return INTEGRATION_TOOL_TYPES.includes(type as typeof INTEGRATION_TOOL_TYPES[number])
}

/**
 * Check if a tool is a Google Calendar tool
 */
function isCalendarTool(toolName: string): boolean {
  return CALENDAR_TOOL_NAMES.includes(toolName as typeof CALENDAR_TOOL_NAMES[number])
}

/**
 * Check if a tool is a Cal.com tool
 */
function isCalcomToolType(toolName: string): boolean {
  return CALCOM_TOOL_NAMES.includes(toolName as typeof CALCOM_TOOL_NAMES[number])
}

/**
 * Get dynamic calendar tool definition with today's date
 * This ensures the AI always knows the current date when using calendar tools
 */
function getDynamicCalendarToolDescription(toolName: string): string | undefined {
  switch (toolName) {
    case 'book_appointment':
      return getBookAppointmentTool().description
    case 'cancel_appointment':
      return getCancelAppointmentTool().description
    case 'reschedule_appointment':
      return getRescheduleAppointmentTool().description
    case 'check_availability':
      return getCheckAvailabilityTool().description
    default:
      return undefined
  }
}

/**
 * Get dynamic Cal.com tool definition with today's date
 * This ensures the AI always knows the current date when using Cal.com tools
 */
function getDynamicCalcomToolDescription(toolName: string): string | undefined {
  switch (toolName) {
    case 'calcom_check_availability':
      return getCalcomCheckAvailabilityTool().description
    case 'calcom_book_appointment':
      return getCalcomBookAppointmentTool().description
    default:
      return undefined
  }
}

// ============================================================================
// INTERNAL TO VAPI MAPPING
// ============================================================================

/**
 * Maps an internal FunctionTool to VAPI Tool format
 */
export function mapFunctionToolToVapi(
  tool: FunctionTool,
  defaultServerUrl?: string
): VapiTool {
  const toolType = tool.tool_type || 'function'
  const stripDescription = <T extends { description?: string }>(obj: T): T => {
    if (obj && 'description' in obj) {
      delete obj.description
    }
    return obj
  }

  // Handle endCall tool - NOTE: VAPI built-in tools don't accept 'name' property
  if (toolType === 'endCall') {
    const t = createEndCallTool({
      description: tool.description,
      endMessage: tool.execution_message,
    })
    return stripDescription(t)
  }

  // Handle transferCall tool - NOTE: VAPI built-in tools don't accept 'name' property
  if (toolType === 'transferCall') {
    // Parse destinations if provided in parameters
    const destinations = parseTransferDestinations(tool)
    
    const t = createTransferCallTool({
      description: tool.description,
      destinations,
      transferMessage: tool.execution_message,
    })
    return stripDescription(t)
  }

  // Handle DTMF tool - NOTE: VAPI built-in tools don't accept 'name' property
  if (toolType === 'dtmf') {
    const t = createDtmfTool({
      description: tool.description,
      dtmfMessage: tool.execution_message,
      speakMessage: tool.speak_during_execution,
    })
    return stripDescription(t)
  }

  // Handle Handoff tool - NOTE: VAPI built-in tools don't accept 'name' property
  if (toolType === 'handoff') {
    return stripDescription({
      type: 'handoff',
      description: tool.description,
      assistantId: tool.assistant_id,
      squadId: tool.squad_id,
      messages: tool.execution_message ? [{
        type: 'request-start' as const,
        content: tool.execution_message,
        blocking: true,
      }] : undefined,
    })
  }

  // Handle API Request tool
  if (toolType === 'apiRequest') {
    // Convert Record<string, string> headers to ToolParameterSchema
    let headersSchema: ToolParameterSchema | undefined
    if (tool.headers) {
      headersSchema = {
        type: 'object',
        properties: Object.entries(tool.headers).reduce((acc, [key, value]) => {
          acc[key] = { type: 'string', default: value }
          return acc
        }, {} as Record<string, ToolParameterSchema>),
      }
    } else if (tool.headers_schema) {
      headersSchema = tool.headers_schema as ToolParameterSchema
    }

    return createApiRequestTool({
      name: tool.name,
      description: tool.description,
      method: (tool.method || 'POST') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: tool.url || '',
      headers: headersSchema,
      body: tool.body_schema as ToolParameterSchema | undefined,
      timeoutSeconds: tool.timeout_seconds,
      credentialId: tool.credential_id,
      requestMessage: tool.speak_during_execution ? tool.execution_message : undefined,
    })
  }

  // Handle Code Execution tool
  if (toolType === 'code') {
    return createCodeTool({
      name: tool.name,
      description: tool.description,
      runtime: (tool.runtime || 'node18') as 'node18' | 'python3.11',
      code: tool.code || '',
      parameters: tool.parameters as ToolParameterSchema,
      timeoutSeconds: tool.timeout_seconds,
    })
  }

  // Handle integration tools (Google, GHL, Slack, etc.)
  if (isIntegrationToolType(toolType)) {
    return {
      type: toolType,
      name: tool.name,
      description: tool.description,
      credentialId: tool.credential_id,
    } as VapiTool
  }

  // Handle custom function tools
  // For calendar and Cal.com tools, use dynamic descriptions that include today's date
  let toolDescription = tool.description
  
  // Check for Google Calendar tools
  if (isCalendarTool(tool.name)) {
    const dynamicDescription = getDynamicCalendarToolDescription(tool.name)
    if (dynamicDescription) {
      toolDescription = dynamicDescription
      console.log(`[VapiMapper] Using dynamic description for calendar tool: ${tool.name}, today: ${new Date().toISOString().split('T')[0]}`)
    }
  }
  
  // Check for Cal.com tools
  if (isCalcomToolType(tool.name)) {
    const dynamicDescription = getDynamicCalcomToolDescription(tool.name)
    if (dynamicDescription) {
      toolDescription = dynamicDescription
      console.log(`[VapiMapper] Using dynamic description for Cal.com tool: ${tool.name}, today: ${new Date().toISOString().split('T')[0]}`)
    }
  }
  
  return createFunctionTool({
    name: tool.name,
    description: toolDescription,
    parameters: tool.parameters as ToolParameterSchema,
    server: tool.server_url || defaultServerUrl
      ? { url: tool.server_url || defaultServerUrl! }
      : undefined,
    async: tool.async,
    executionMessage: tool.speak_during_execution ? tool.execution_message : undefined,
  })
}

/**
 * Parse transfer destinations from tool parameters
 */
function parseTransferDestinations(tool: FunctionTool): TransferDestination[] | undefined {
  // Check if tool has destinations in a custom field
  const toolAny = tool as FunctionTool & { destinations?: TransferDestination[] }
  if (toolAny.destinations) {
    return toolAny.destinations
  }

  // Check if destinations are defined in parameters enum
  const destParam = tool.parameters?.properties?.destination
  if (destParam?.enum) {
    return destParam.enum.map((dest: string) => ({
      type: 'number' as const,
      number: dest,
      description: `Transfer to ${dest}`,
    }))
  }

  return undefined
}

/**
 * Maps an array of FunctionTools to VAPI format
 */
export function mapFunctionToolsToVapi(
  tools: FunctionTool[],
  options: {
    defaultServerUrl?: string
    autoAddEndCall?: boolean
  } = {}
): VapiTool[] {
  const { defaultServerUrl, autoAddEndCall = true } = options

  // Filter enabled tools and map them
  const vapiTools = tools
    .filter((tool) => tool.enabled !== false)
    .map((tool) => mapFunctionToolToVapi(tool, defaultServerUrl))

  // Auto-add endCall tool if not present
  if (autoAddEndCall) {
    const hasEndCall = tools.some(
      (t) =>
        t.tool_type === 'endCall' ||
        t.name === 'end_call' ||
        t.name === 'end_call_tool'
    )
    if (!hasEndCall) {
      vapiTools.push(DEFAULT_END_CALL_TOOL)
    }
  }

  return vapiTools
}

// ============================================================================
// VAPI TO INTERNAL MAPPING
// ============================================================================

/**
 * Maps a VAPI Tool back to internal FunctionTool format
 */
export function mapVapiToolToInternal(
  vapiTool: VapiTool,
  id?: string
): FunctionTool {
  const baseTool: FunctionTool = {
    id: id || generateToolId(),
    name: vapiTool.name || vapiTool.type,
    description: vapiTool.description || '',
    parameters: { type: 'object', properties: {} },
    tool_type: vapiTool.type as FunctionTool['tool_type'],
    enabled: true,
  }

  // Extract execution message from messages
  const startMessage = vapiTool.messages?.find((m) => m.type === 'request-start')
  if (startMessage?.content) {
    baseTool.execution_message = startMessage.content
    baseTool.speak_during_execution = true
  }

  // Handle function tool specifics
  if (vapiTool.type === 'function') {
    const funcTool = vapiTool as VapiFunctionTool
    if (funcTool.function?.name) {
      baseTool.name = funcTool.function.name
    }
    if (funcTool.function?.description) {
      baseTool.description = funcTool.function.description
    }
    if (funcTool.function?.parameters) {
      baseTool.parameters = funcTool.function.parameters as FunctionTool['parameters']
    }
    if (funcTool.server?.url) {
      baseTool.server_url = funcTool.server.url
    }
    baseTool.async = funcTool.async
  }

  // Handle transfer call specifics
  if (vapiTool.type === 'transferCall') {
    const transferTool = vapiTool as VapiTransferCallTool
    if (transferTool.destinations) {
      // Store destinations in parameters enum
      const numbers = transferTool.destinations
        .filter((d) => d.number)
        .map((d) => d.number!)
      if (numbers.length > 0) {
        baseTool.parameters = {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              description: 'Transfer destination',
              enum: numbers,
            },
          },
          required: ['destination'],
        }
      }
    }
  }

  return baseTool
}

/**
 * Maps an array of VAPI Tools to internal format
 */
export function mapVapiToolsToInternal(vapiTools: VapiTool[]): FunctionTool[] {
  return vapiTools.map((tool) => mapVapiToolToInternal(tool))
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a unique tool ID
 */
function generateToolId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Validate that a tool configuration is complete
 */
export function validateToolForVapi(tool: FunctionTool): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!tool.name) {
    errors.push('Tool name is required')
  }

  if (!tool.description) {
    errors.push('Tool description is required')
  }

  // Function tools require a server URL
  if (tool.tool_type === 'function' || !tool.tool_type) {
    if (!tool.server_url) {
      errors.push('Server URL is required for function tools')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get tools that require a webhook server
 */
export function getWebhookRequiredTools(tools: FunctionTool[]): FunctionTool[] {
  return tools.filter(
    (tool) =>
      tool.tool_type === 'function' ||
      tool.tool_type === 'apiRequest' ||
      !tool.tool_type
  )
}

/**
 * Get native (built-in) tools that don't require a webhook
 */
export function getNativeToolsFromList(tools: FunctionTool[]): FunctionTool[] {
  const nativeTypes = ['endCall', 'transferCall', 'dtmf', 'handoff']
  return tools.filter((tool) => nativeTypes.includes(tool.tool_type || ''))
}


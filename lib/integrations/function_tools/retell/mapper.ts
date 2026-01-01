/**
 * Retell Tool Mapper
 * Maps internal FunctionTool format to Retell GeneralTool format
 */

import type { FunctionTool } from '@/types/database.types'
import type {
  RetellGeneralTool,
  RetellTransferDestination,
} from './types'

// ============================================================================
// INTERNAL TO RETELL MAPPING
// ============================================================================

/**
 * Retell validates tool parameter JSON schema strictly and rejects some common
 * JSON Schema metadata fields (notably `description` under `properties`).
 * Strip these fields before sending to Retell.
 */
function stripUnsupportedSchemaFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUnsupportedSchemaFields(v)) as unknown as T
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      // Retell rejects per-property `description` (and `title` is also metadata).
      if (key === 'description' || key === 'title') continue
      out[key] = stripUnsupportedSchemaFields(v)
    }
    return out as T
  }

  return value
}

/**
 * Maps an internal FunctionTool to Retell GeneralTool format.
 *
 * IMPORTANT:
 * Retell's `create-retell-llm` / `update-retell-llm` endpoints validate `general_tools`
 * strictly. Based on live API validation errors, `custom_function` is NOT accepted
 * inside `general_tools`, so we only map Retell pre-built tools here.
 */
export function mapFunctionToolToRetell(
  tool: FunctionTool,
  defaultWebhookUrl?: string
): RetellGeneralTool | null {
  const toolType = tool.tool_type || 'function'

  // --------------------------------------------------------------------------
  // Retell pre-built tools (general_tools)
  // --------------------------------------------------------------------------
  if (toolType === 'end_call' || toolType === 'endCall') {
    return {
      type: 'end_call',
      name: tool.name || 'end_call',
      description: tool.description || 'End the call with user.',
    }
  }

  if (toolType === 'transfer_call' || toolType === 'transferCall') {
    const transferDestination: RetellTransferDestination | undefined =
      tool.transfer_destination?.number
        ? { type: 'predefined', number: tool.transfer_destination.number }
        : undefined

    if (!transferDestination) {
      console.warn('[RetellMapper] transfer_call requires transfer_destination.number')
      return null
    }

    return {
      type: 'transfer_call',
      name: tool.name,
      description: tool.description,
      transfer_destination: transferDestination,
    }
  }

  if (toolType === 'book_appointment_cal') {
    if (!tool.cal_api_key || !tool.event_type_id || !tool.timezone) {
      console.warn('[RetellMapper] book_appointment_cal requires cal_api_key, event_type_id, timezone')
      return null
    }
    return {
      type: 'book_appointment_cal',
      name: tool.name,
      description: tool.description,
      cal_api_key: tool.cal_api_key,
      event_type_id: tool.event_type_id,
      timezone: tool.timezone,
    }
  }

  // Anything else (including internal `function`) is currently not supported in
  // Retell LLM `general_tools` for the endpoints we use.
  if (toolType === 'function') {
    console.warn("[RetellMapper] Skipping custom function tool for Retell (custom_function not accepted in general_tools).")
    return null
  }

  console.warn(`[RetellMapper] Tool type '${toolType}' is not supported by Retell`)
  return null
}

/**
 * Maps an array of FunctionTools to Retell format
 */
export function mapFunctionToolsToRetell(
  tools: FunctionTool[],
  defaultWebhookUrl?: string
): RetellGeneralTool[] {
  return tools
    .filter((tool) => tool.enabled !== false)
    .map((tool) => mapFunctionToolToRetell(tool, defaultWebhookUrl))
    .filter((tool): tool is RetellGeneralTool => tool !== null)
}

/**
 * Check if a tool type is supported by Retell
 */
export function isToolSupportedByRetell(toolType: string): boolean {
  const supported = [
    'end_call',
    'transfer_call',
    'book_appointment_cal',
  ]
  return supported.includes(toolType)
}


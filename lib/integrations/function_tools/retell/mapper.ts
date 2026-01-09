/**
 * Retell Tool Mapper
 * Maps internal FunctionTool format to Retell GeneralTool format
 * Reference: https://docs.retellai.com/api-references/create-retell-llm
 */

import type { FunctionTool } from '@/types/database.types'
import type {
  RetellGeneralTool,
  RetellTransferDestination,
  RetellTransferOption,
  RetellEndCallTool,
  RetellTransferCallTool,
  RetellPressDigitsTool,
  RetellCheckAvailabilityCalTool,
  RetellBookAppointmentCalTool,
  RetellSendSmsTool,
} from './types'

// ============================================================================
// TOOL TYPE MAPPERS
// ============================================================================

/**
 * Map to End Call Tool
 */
function mapToEndCallTool(tool: FunctionTool): RetellEndCallTool {
  return {
    type: 'end_call',
    name: tool.name || 'end_call',
    description: tool.description || 'End the call with user.',
  }
}

/**
 * Map to Transfer Call Tool
 */
function mapToTransferCallTool(tool: FunctionTool): RetellTransferCallTool | null {
  const transferDestination: RetellTransferDestination | undefined =
    tool.transfer_destination?.number
      ? {
          type: 'predefined',
          number: tool.transfer_destination.number,
          ignore_e164_validation: tool.transfer_destination.ignore_e164_validation,
        }
      : undefined

  if (!transferDestination) {
    console.warn('[RetellMapper] transfer_call requires transfer_destination.number')
    return null
  }

  const result: RetellTransferCallTool = {
    type: 'transfer_call',
    name: tool.name || 'transfer_call',
    description: tool.description || 'Transfer the call to another number.',
    transfer_destination: transferDestination,
  }

  // Add transfer options if provided
  if (tool.transfer_option) {
    result.transfer_option = {
      type: tool.transfer_option.type || 'cold_transfer',
      show_transferee_as_caller: tool.transfer_option.show_transferee_as_caller,
    }
  }

  return result
}

/**
 * Map to Press Digits Tool
 */
function mapToPressDigitsTool(tool: FunctionTool): RetellPressDigitsTool {
  return {
    type: 'press_digit',
    name: tool.name || 'press_digit',
    description: tool.description || 'Press digits on the phone keypad.',
  }
}

/**
 * Map to Check Availability Cal Tool
 */
function mapToCheckAvailabilityCalTool(tool: FunctionTool): RetellCheckAvailabilityCalTool | null {
  if (!tool.cal_api_key || !tool.event_type_id || !tool.timezone) {
    console.warn('[RetellMapper] check_availability_cal requires cal_api_key, event_type_id, timezone')
    return null
  }

  return {
    type: 'check_availability_cal',
    name: tool.name || 'check_availability',
    description: tool.description || 'Check calendar availability.',
    cal_api_key: tool.cal_api_key,
    event_type_id: tool.event_type_id,
    timezone: tool.timezone,
  }
}

/**
 * Map to Book Appointment Cal Tool
 */
function mapToBookAppointmentCalTool(tool: FunctionTool): RetellBookAppointmentCalTool | null {
  if (!tool.cal_api_key || !tool.event_type_id || !tool.timezone) {
    console.warn('[RetellMapper] book_appointment_cal requires cal_api_key, event_type_id, timezone')
    return null
  }

  return {
    type: 'book_appointment_cal',
    name: tool.name || 'book_appointment',
    description: tool.description || 'Book an appointment.',
    cal_api_key: tool.cal_api_key,
    event_type_id: tool.event_type_id,
    timezone: tool.timezone,
  }
}

/**
 * Map to Send SMS Tool
 */
function mapToSendSmsTool(tool: FunctionTool): RetellSendSmsTool {
  return {
    type: 'send_sms',
    name: tool.name || 'send_sms',
    description: tool.description || 'Send an SMS message.',
    from_number: tool.from_number,
  }
}

// ============================================================================
// MAIN MAPPER FUNCTION
// ============================================================================

/**
 * Maps an internal FunctionTool to Retell GeneralTool format.
 * 
 * Supports all Retell tool types:
 * - end_call: End the call
 * - transfer_call: Transfer to another number
 * - press_digit: Send DTMF tones
 * - check_availability_cal: Check Cal.com availability
 * - book_appointment_cal: Book on Cal.com
 * - send_sms: Send SMS message
 */
export function mapFunctionToolToRetell(
  tool: FunctionTool,
): RetellGeneralTool | null {
  const toolType = tool.tool_type || 'function'

  // --------------------------------------------------------------------------
  // End Call
  // --------------------------------------------------------------------------
  if (toolType === 'end_call' || toolType === 'endCall') {
    return mapToEndCallTool(tool)
  }

  // --------------------------------------------------------------------------
  // Transfer Call
  // --------------------------------------------------------------------------
  if (toolType === 'transfer_call' || toolType === 'transferCall') {
    return mapToTransferCallTool(tool)
  }

  // --------------------------------------------------------------------------
  // Press Digits / DTMF
  // --------------------------------------------------------------------------
  if (toolType === 'press_digit' || toolType === 'press_digits' || toolType === 'dtmf') {
    return mapToPressDigitsTool(tool)
  }

  // --------------------------------------------------------------------------
  // Check Availability Cal
  // --------------------------------------------------------------------------
  if (toolType === 'check_availability_cal') {
    return mapToCheckAvailabilityCalTool(tool)
  }

  // --------------------------------------------------------------------------
  // Book Appointment Cal
  // --------------------------------------------------------------------------
  if (toolType === 'book_appointment_cal') {
    return mapToBookAppointmentCalTool(tool)
  }

  // --------------------------------------------------------------------------
  // Send SMS
  // --------------------------------------------------------------------------
  if (toolType === 'send_sms' || toolType === 'smsSend') {
    return mapToSendSmsTool(tool)
  }

  // --------------------------------------------------------------------------
  // Unsupported tool type
  // --------------------------------------------------------------------------
  console.warn(
    `[RetellMapper] Tool type '${toolType}' is not supported by Retell. ` +
    `Supported types: end_call, transfer_call, press_digit, check_availability_cal, ` +
    `book_appointment_cal, send_sms. ` +
    `Tool name: '${tool.name}'. Skipping.`
  )
  return null
}

// ============================================================================
// BATCH MAPPER
// ============================================================================

/**
 * Maps an array of FunctionTools to Retell format.
 * 
 * Maps ALL supported tool types including:
 * - Native Retell tools: end_call, transfer_call, press_digit, check_availability_cal, 
 *   book_appointment_cal, send_sms
 * 
 * Filters out disabled tools and null results.
 */
export function mapFunctionToolsToRetell(
  tools: FunctionTool[],
): RetellGeneralTool[] {
  const mappedTools = tools
    .filter((tool) => tool.enabled !== false)
    .map((tool) => {
      // Skip unsupported tool types (e.g. internal custom functions) for Retell.
      // This mapper only emits Retell-native general_tools.
      return mapFunctionToolToRetell(tool)
    })
    .filter((tool): tool is RetellGeneralTool => tool !== null)
  
  return mappedTools
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * All supported Retell tool types
 */
export const SUPPORTED_RETELL_TOOL_TYPES = [
  'end_call',
  'endCall',
  'transfer_call',
  'transferCall',
  'press_digit',
  'press_digits',
  'dtmf',
  'check_availability_cal',
  'book_appointment_cal',
  'send_sms',
  'smsSend',
] as const

/**
 * Check if a tool type is supported by Retell
 */
export function isToolSupportedByRetell(toolType: string): boolean {
  return SUPPORTED_RETELL_TOOL_TYPES.includes(toolType as typeof SUPPORTED_RETELL_TOOL_TYPES[number])
}

/**
 * Validate a tool before mapping
 */
export function validateToolForRetell(tool: FunctionTool): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  const toolType = tool.tool_type || 'function'

  if (!tool.name) {
    errors.push('Tool name is required')
  }

  if (!tool.description) {
    errors.push('Tool description is required')
  }

  // Type-specific validation
  if (toolType === 'transfer_call' || toolType === 'transferCall') {
    if (!tool.transfer_destination?.number) {
      errors.push('Transfer destination number is required')
    }
  }

  if (toolType === 'check_availability_cal' || toolType === 'book_appointment_cal') {
    if (!tool.cal_api_key) errors.push('Cal.com API key is required')
    if (!tool.event_type_id) errors.push('Event type ID is required')
    if (!tool.timezone) errors.push('Timezone is required')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

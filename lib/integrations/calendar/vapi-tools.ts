/**
 * VAPI Calendar Tool Definitions
 * Custom function tools for calendar operations via VAPI
 */

import type { FunctionTool, FunctionToolParameters } from '@/types/database.types'

// =============================================================================
// TOOL PARAMETERS
// =============================================================================

const bookAppointmentParameters: FunctionToolParameters = {
  type: 'object',
  required: ['attendee_name', 'attendee_email', 'preferred_date', 'preferred_time'],
  properties: {
    attendee_name: {
      type: 'string',
      description: 'Full name of the person booking the appointment',
    },
    attendee_email: {
      type: 'string',
      description: 'Email address of the person booking the appointment',
    },
    attendee_phone: {
      type: 'string',
      description: 'Phone number of the person booking (optional)',
    },
    preferred_date: {
      type: 'string',
      description: 'Preferred date for the appointment in YYYY-MM-DD format',
    },
    preferred_time: {
      type: 'string',
      description: 'Preferred time for the appointment in HH:MM format (24-hour)',
    },
    notes: {
      type: 'string',
      description: 'Additional notes or reason for the appointment',
    },
  },
}

const cancelAppointmentParameters: FunctionToolParameters = {
  type: 'object',
  required: ['attendee_email', 'cancellation_reason'],
  properties: {
    attendee_email: {
      type: 'string',
      description: 'Email address of the person who booked the appointment',
    },
    attendee_name: {
      type: 'string',
      description: 'Name of the person who booked the appointment (helps with lookup)',
    },
    appointment_date: {
      type: 'string',
      description: 'Date of the appointment to cancel in YYYY-MM-DD format (helps if multiple appointments)',
    },
    cancellation_reason: {
      type: 'string',
      description: 'Reason for cancellation',
    },
  },
}

const rescheduleAppointmentParameters: FunctionToolParameters = {
  type: 'object',
  required: ['attendee_email', 'new_date', 'new_time'],
  properties: {
    attendee_email: {
      type: 'string',
      description: 'Email address of the person who booked the appointment',
    },
    attendee_name: {
      type: 'string',
      description: 'Name of the person who booked the appointment (helps with lookup)',
    },
    current_appointment_date: {
      type: 'string',
      description: 'Date of the current appointment in YYYY-MM-DD format',
    },
    new_date: {
      type: 'string',
      description: 'New preferred date in YYYY-MM-DD format',
    },
    new_time: {
      type: 'string',
      description: 'New preferred time in HH:MM format (24-hour)',
    },
  },
}

const checkAvailabilityParameters: FunctionToolParameters = {
  type: 'object',
  required: ['date'],
  properties: {
    date: {
      type: 'string',
      description: 'Date to check availability for in YYYY-MM-DD format',
    },
    time: {
      type: 'string',
      description: 'Specific time to check in HH:MM format (optional, if not provided returns all available slots)',
    },
  },
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

/**
 * Book Appointment Tool Definition
 */
export const BOOK_APPOINTMENT_TOOL: Omit<FunctionTool, 'id'> = {
  name: 'book_appointment',
  description:
    'Book a new appointment for the caller. Use this when the caller wants to schedule or book an appointment. ' +
    'You must collect the caller\'s full name, email address, preferred date and time before using this tool. ' +
    'If the requested time is not available, the tool will return alternative available slots.',
  parameters: bookAppointmentParameters,
  tool_type: 'function',
  enabled: true,
}

/**
 * Cancel Appointment Tool Definition
 */
export const CANCEL_APPOINTMENT_TOOL: Omit<FunctionTool, 'id'> = {
  name: 'cancel_appointment',
  description:
    'Cancel an existing appointment. Use this when the caller wants to cancel their scheduled appointment. ' +
    'You need at least the caller\'s email to look up their appointment. ' +
    'If they have multiple appointments, ask for the appointment date to identify the correct one.',
  parameters: cancelAppointmentParameters,
  tool_type: 'function',
  enabled: true,
}

/**
 * Reschedule Appointment Tool Definition
 */
export const RESCHEDULE_APPOINTMENT_TOOL: Omit<FunctionTool, 'id'> = {
  name: 'reschedule_appointment',
  description:
    'Reschedule an existing appointment to a new date and time. Use this when the caller wants to change their appointment. ' +
    'You need the caller\'s email to find their existing appointment, and the new preferred date and time. ' +
    'If the new time is not available, the tool will return alternative available slots.',
  parameters: rescheduleAppointmentParameters,
  tool_type: 'function',
  enabled: true,
}

/**
 * Check Availability Tool Definition
 */
export const CHECK_AVAILABILITY_TOOL: Omit<FunctionTool, 'id'> = {
  name: 'check_availability',
  description:
    'Check available appointment slots for a specific date. Use this to find available times before booking. ' +
    'Returns available time slots within the agent\'s configured business hours.',
  parameters: checkAvailabilityParameters,
  tool_type: 'function',
  enabled: true,
}

/**
 * All calendar tools grouped
 */
export const CALENDAR_TOOLS = [
  BOOK_APPOINTMENT_TOOL,
  CANCEL_APPOINTMENT_TOOL,
  RESCHEDULE_APPOINTMENT_TOOL,
  CHECK_AVAILABILITY_TOOL,
] as const

/**
 * Calendar tool names for lookup
 */
export const CALENDAR_TOOL_NAMES = [
  'book_appointment',
  'cancel_appointment',
  'reschedule_appointment',
  'check_availability',
] as const

export type CalendarToolName = (typeof CALENDAR_TOOL_NAMES)[number]

/**
 * Check if a tool is a calendar tool
 */
export function isCalendarTool(toolName: string): toolName is CalendarToolName {
  return CALENDAR_TOOL_NAMES.includes(toolName as CalendarToolName)
}

/**
 * Get calendar tool by name
 */
export function getCalendarToolByName(name: CalendarToolName): Omit<FunctionTool, 'id'> | undefined {
  switch (name) {
    case 'book_appointment':
      return BOOK_APPOINTMENT_TOOL
    case 'cancel_appointment':
      return CANCEL_APPOINTMENT_TOOL
    case 'reschedule_appointment':
      return RESCHEDULE_APPOINTMENT_TOOL
    case 'check_availability':
      return CHECK_AVAILABILITY_TOOL
    default:
      return undefined
  }
}

// =============================================================================
// VAPI TOOL FORMAT CONVERSION
// =============================================================================

/**
 * Convert calendar tool to VAPI function tool format
 */
export function calendarToolToVapiFormat(
  tool: Omit<FunctionTool, 'id'>,
  serverUrl: string
): {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
  server?: {
    url: string
  }
  async?: boolean
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
    server: {
      url: serverUrl,
    },
    async: false, // Calendar operations should be synchronous for better UX
  }
}

/**
 * Generate all calendar tools in VAPI format
 */
export function generateVapiCalendarTools(serverUrl: string): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
  server?: {
    url: string
  }
  async?: boolean
}> {
  return CALENDAR_TOOLS.map((tool) => calendarToolToVapiFormat(tool, serverUrl))
}

// =============================================================================
// RETELL/MCP TOOL FORMAT CONVERSION
// =============================================================================

import type { MCPToolInput, ToolParameters } from '@/lib/integrations/mcp'

/**
 * MCP Tool Input format for Retell integration
 * Re-export for backwards compatibility
 */
export type MCPCalendarToolInput = MCPToolInput

/**
 * Convert calendar tool to MCP format for Retell
 * These tools will be registered with the MCP server and executed via /api/webhooks/mcp/execute
 */
export function calendarToolToMCPFormat(
  tool: Omit<FunctionTool, 'id'>,
  webhookUrl: string
): MCPToolInput {
  return {
    name: tool.name,
    description: tool.description || '',
    parameters: (tool.parameters as ToolParameters) || {
      type: 'object',
      properties: {},
    },
    webhook_url: webhookUrl,
    enabled: true,
  }
}

/**
 * Generate all calendar tools in MCP format for Retell
 * @param webhookUrl - The MCP execute webhook URL (e.g., /api/webhooks/mcp/execute)
 * @returns Array of calendar tools in MCP format
 */
export function generateMCPCalendarTools(webhookUrl: string): MCPToolInput[] {
  return CALENDAR_TOOLS.map((tool) => calendarToolToMCPFormat(tool, webhookUrl))
}

/**
 * Get calendar tools for MCP registration based on enabled tool names
 * @param enabledTools - Array of tool names that are enabled for this agent
 * @param webhookUrl - The MCP execute webhook URL
 * @returns Array of enabled calendar tools in MCP format
 */
export function getEnabledCalendarToolsForMCP(
  enabledTools: string[],
  webhookUrl: string
): MCPToolInput[] {
  return CALENDAR_TOOLS
    .filter((tool) => enabledTools.includes(tool.name))
    .map((tool) => calendarToolToMCPFormat(tool, webhookUrl))
}


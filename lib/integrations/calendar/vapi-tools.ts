/**
 * VAPI Calendar Tool Definitions
 * Custom function tools for calendar operations via VAPI
 */

import type { FunctionTool, FunctionToolParameters } from '@/types/database.types'

// =============================================================================
// DATE HELPERS
// =============================================================================

/**
 * Get today's date in YYYY-MM-DD format
 * Used to inject current date into tool descriptions so AI knows the correct date
 */
function getTodayDate(): string {
  const now = new Date()
  return now.toISOString().split('T')[0]!
}

/**
 * Get formatted today's date for display (e.g., "Monday, February 9, 2026")
 */
function getFormattedTodayDate(): string {
  const now = new Date()
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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
      description: 'Preferred date for the appointment in YYYY-MM-DD format. MUST be today or a future date.',
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
// TOOL DEFINITIONS (with dynamic date injection)
// =============================================================================

/**
 * Generate Book Appointment Tool Definition with current date
 * The date is injected dynamically so the AI knows what "today" is
 */
export function getBookAppointmentTool(): Omit<FunctionTool, 'id'> {
  const today = getTodayDate()
  const formattedToday = getFormattedTodayDate()
  
  return {
    name: 'book_appointment',
    description:
      `Book a new appointment for the caller. Use this when the caller wants to schedule or book an appointment. ` +
      `IMPORTANT: Today's date is ${formattedToday} (${today}). All dates MUST be ${today} or later. ` +
      `NEVER book appointments in the past. If the caller mentions a date that seems like it might be in the past, clarify with them. ` +
      `You must collect the caller's full name, email address, preferred date and time before using this tool. ` +
      `If the requested time is not available, the tool will return alternative available slots.`,
    parameters: bookAppointmentParameters,
    tool_type: 'function',
    enabled: true,
  }
}

/**
 * Generate Cancel Appointment Tool Definition
 */
export function getCancelAppointmentTool(): Omit<FunctionTool, 'id'> {
  return {
    name: 'cancel_appointment',
    description:
      'Cancel an existing appointment. Use this when the caller wants to cancel their scheduled appointment. ' +
      'You need at least the caller\'s email to look up their appointment. ' +
      'If they have multiple appointments, ask for the appointment date to identify the correct one.',
    parameters: cancelAppointmentParameters,
    tool_type: 'function',
    enabled: true,
  }
}

/**
 * Generate Reschedule Appointment Tool Definition with current date
 */
export function getRescheduleAppointmentTool(): Omit<FunctionTool, 'id'> {
  const today = getTodayDate()
  const formattedToday = getFormattedTodayDate()
  
  return {
    name: 'reschedule_appointment',
    description:
      `Reschedule an existing appointment to a new date and time. Use this when the caller wants to change their appointment. ` +
      `IMPORTANT: Today's date is ${formattedToday} (${today}). The NEW date MUST be ${today} or later. ` +
      `You need the caller's email to find their existing appointment, and the new preferred date and time. ` +
      `If the new time is not available, the tool will return alternative available slots.`,
    parameters: rescheduleAppointmentParameters,
    tool_type: 'function',
    enabled: true,
  }
}

/**
 * Generate Check Availability Tool Definition with current date
 */
export function getCheckAvailabilityTool(): Omit<FunctionTool, 'id'> {
  const today = getTodayDate()
  const formattedToday = getFormattedTodayDate()
  
  return {
    name: 'check_availability',
    description:
      `Check available appointment slots for a specific date. Use this to find available times before booking. ` +
      `IMPORTANT: Today's date is ${formattedToday} (${today}). Only check availability for ${today} or future dates. ` +
      `Returns available time slots within the agent's configured business hours.`,
    parameters: checkAvailabilityParameters,
    tool_type: 'function',
    enabled: true,
  }
}

/**
 * Static tool definitions for backwards compatibility
 * NOTE: These use static descriptions. Prefer using the get*Tool() functions above
 * for dynamic date injection.
 */
export const BOOK_APPOINTMENT_TOOL: Omit<FunctionTool, 'id'> = {
  name: 'book_appointment',
  description:
    'Book a new appointment for the caller. Use this when the caller wants to schedule or book an appointment. ' +
    'IMPORTANT: Only book appointments for TODAY or FUTURE dates. NEVER book in the past. ' +
    'You must collect the caller\'s full name, email address, preferred date and time before using this tool. ' +
    'If the requested time is not available, the tool will return alternative available slots.',
  parameters: bookAppointmentParameters,
  tool_type: 'function',
  enabled: true,
}

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

export const RESCHEDULE_APPOINTMENT_TOOL: Omit<FunctionTool, 'id'> = {
  name: 'reschedule_appointment',
  description:
    'Reschedule an existing appointment to a new date and time. Use this when the caller wants to change their appointment. ' +
    'IMPORTANT: The NEW date must be TODAY or in the FUTURE. NEVER reschedule to a past date. ' +
    'You need the caller\'s email to find their existing appointment, and the new preferred date and time. ' +
    'If the new time is not available, the tool will return alternative available slots.',
  parameters: rescheduleAppointmentParameters,
  tool_type: 'function',
  enabled: true,
}

export const CHECK_AVAILABILITY_TOOL: Omit<FunctionTool, 'id'> = {
  name: 'check_availability',
  description:
    'Check available appointment slots for a specific date. Use this to find available times before booking. ' +
    'IMPORTANT: Only check dates that are TODAY or in the FUTURE. ' +
    'Returns available time slots within the agent\'s configured business hours.',
  parameters: checkAvailabilityParameters,
  tool_type: 'function',
  enabled: true,
}

/**
 * Get all calendar tools with dynamic date injection
 * Use this function instead of CALENDAR_TOOLS for proper date awareness
 */
export function getCalendarTools(): Omit<FunctionTool, 'id'>[] {
  return [
    getBookAppointmentTool(),
    getCancelAppointmentTool(),
    getRescheduleAppointmentTool(),
    getCheckAvailabilityTool(),
  ]
}

/**
 * All calendar tools grouped (static - for backwards compatibility)
 * NOTE: Prefer using getCalendarTools() for dynamic date injection
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
 * Generate all calendar tools in VAPI format with dynamic date injection
 * This ensures the AI knows today's date when making calendar decisions
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
  // Use dynamic tool definitions with current date
  const dynamicTools = getCalendarTools()
  return dynamicTools.map((tool) => calendarToolToVapiFormat(tool, serverUrl))
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
 * Generate all calendar tools in MCP format for Retell with dynamic date injection
 * @param webhookUrl - The MCP execute webhook URL (e.g., /api/webhooks/mcp/execute)
 * @returns Array of calendar tools in MCP format
 */
export function generateMCPCalendarTools(webhookUrl: string): MCPToolInput[] {
  // Use dynamic tool definitions with current date
  const dynamicTools = getCalendarTools()
  return dynamicTools.map((tool) => calendarToolToMCPFormat(tool, webhookUrl))
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
  // Use dynamic tool definitions with current date
  const dynamicTools = getCalendarTools()
  return dynamicTools
    .filter((tool) => enabledTools.includes(tool.name))
    .map((tool) => calendarToolToMCPFormat(tool, webhookUrl))
}

// =============================================================================
// CALENDAR SYSTEM PROMPT CONTEXT
// =============================================================================

/**
 * Generate calendar context to be appended to agent system prompts
 * This ensures the AI knows today's date and follows proper date validation
 */
export function generateCalendarSystemPromptContext(timezone?: string): string {
  const today = getTodayDate()
  const formattedToday = getFormattedTodayDate()
  const tz = timezone || 'UTC'
  
  return `

## CALENDAR & APPOINTMENT BOOKING RULES

**CRITICAL DATE INFORMATION:**
- Today's date is: ${formattedToday}
- Today in YYYY-MM-DD format: ${today}
- Timezone: ${tz}

**MANDATORY RULES:**
1. ALL appointments MUST be scheduled for TODAY (${today}) or FUTURE dates
2. NEVER accept or book appointments for dates before ${today}
3. If a caller mentions a date like "February 10" without a year, assume the CURRENT or NEXT occurrence of that date (never past)
4. If a date sounds like it might be in the past, ASK the caller to confirm: "Just to confirm, you'd like to schedule for [date] in [year], correct?"
5. Always verify availability BEFORE confirming any booking

**DATE FORMAT:**
- Use YYYY-MM-DD format for dates (e.g., ${today})
- Use HH:MM format for times in 24-hour format (e.g., 14:30 for 2:30 PM)

**BOOKING FLOW:**
1. Collect: Full name, email, preferred date and time
2. Check availability using check_availability tool
3. If available, book using book_appointment tool
4. If not available, suggest alternative times from the response
`
}


/**
 * Cal.com Tool Definitions for VAPI
 * Custom function tool definitions for Cal.com booking and availability
 */

import type { FunctionToolParameters } from "@/types/database.types"

// =============================================================================
// DATE HELPERS
// =============================================================================

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  const now = new Date()
  return now.toISOString().split("T")[0]!
}

/**
 * Get formatted today's date for display
 */
function getFormattedTodayDate(): string {
  const now = new Date()
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// =============================================================================
// TOOL NAMES
// =============================================================================

export const CALCOM_TOOL_NAMES = [
  "calcom_check_availability",
  "calcom_book_appointment",
] as const

export type CalcomToolName = (typeof CALCOM_TOOL_NAMES)[number]

/**
 * Check if a tool name is a Cal.com tool
 */
export function isCalcomTool(toolName: string): toolName is CalcomToolName {
  return CALCOM_TOOL_NAMES.includes(toolName as CalcomToolName)
}

// =============================================================================
// PARAMETER DEFINITIONS
// =============================================================================

/**
 * Parameters for check_availability tool
 */
const checkAvailabilityParameters: FunctionToolParameters = {
  type: "object",
  required: ["date"],
  properties: {
    date: {
      type: "string",
      description:
        "The date to check availability for in YYYY-MM-DD format. MUST be today or a future date.",
    },
    end_date: {
      type: "string",
      description:
        "Optional end date for checking a date range in YYYY-MM-DD format. If not provided, only the single date will be checked.",
    },
  },
}

/**
 * Parameters for book_appointment tool
 */
const bookAppointmentParameters: FunctionToolParameters = {
  type: "object",
  required: ["attendee_name", "attendee_email", "preferred_date", "preferred_time"],
  properties: {
    attendee_name: {
      type: "string",
      description: "Full name of the person booking the appointment.",
    },
    attendee_email: {
      type: "string",
      description: "Email address of the person booking the appointment.",
    },
    attendee_phone: {
      type: "string",
      description: "Phone number of the person booking (optional).",
    },
    preferred_date: {
      type: "string",
      description:
        "Preferred date for the appointment in YYYY-MM-DD format. MUST be today or a future date.",
    },
    preferred_time: {
      type: "string",
      description:
        "Preferred time for the appointment in HH:MM format (24-hour). For example: 09:00, 14:30, 16:00.",
    },
    notes: {
      type: "string",
      description: "Additional notes or reason for the appointment (optional).",
    },
  },
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export interface CalcomToolDefinition {
  name: CalcomToolName
  description: string
  parameters: FunctionToolParameters
  tool_type: string
  enabled: boolean
}

/**
 * Get check_availability tool definition with dynamic date injection
 */
export function getCalcomCheckAvailabilityTool(): CalcomToolDefinition {
  const today = getTodayDate()
  const formattedToday = getFormattedTodayDate()

  return {
    name: "calcom_check_availability",
    description:
      `Check available appointment time slots on Cal.com. ` +
      `BEFORE calling this function, you MUST ask the caller what date they want and wait for their response. ` +
      `DO NOT call this function without a specific date from the caller. ` +
      `The 'date' parameter is REQUIRED - if you don't have a date, ask the caller first. ` +
      `Today's date is ${formattedToday} (${today}). Only check availability for ${today} or future dates. ` +
      `Returns available time slots that the caller can choose from.`,
    parameters: checkAvailabilityParameters,
    tool_type: "calcom_check_availability",
    enabled: true,
  }
}

/**
 * Get book_appointment tool definition with dynamic date injection
 */
export function getCalcomBookAppointmentTool(): CalcomToolDefinition {
  const today = getTodayDate()
  const formattedToday = getFormattedTodayDate()

  return {
    name: "calcom_book_appointment",
    description:
      `Book an appointment through Cal.com. Use this when the caller wants to schedule an appointment. ` +
      `IMPORTANT: Today's date is ${formattedToday} (${today}). All appointments MUST be scheduled for ${today} or later. ` +
      `NEVER book appointments in the past. Before using this tool, you should: ` +
      `1. Collect the caller's full name and email address ` +
      `2. Confirm their preferred date and time ` +
      `3. Optionally check availability first using calcom_check_availability ` +
      `If the requested time is not available, suggest checking availability for alternative times.`,
    parameters: bookAppointmentParameters,
    tool_type: "calcom_book_appointment",
    enabled: true,
  }
}

/**
 * Get all Cal.com tools with dynamic date injection
 */
export function getCalcomTools(): CalcomToolDefinition[] {
  return [getCalcomCheckAvailabilityTool(), getCalcomBookAppointmentTool()]
}

/**
 * Get Cal.com tool by name
 */
export function getCalcomToolByName(name: CalcomToolName): CalcomToolDefinition | undefined {
  switch (name) {
    case "calcom_check_availability":
      return getCalcomCheckAvailabilityTool()
    case "calcom_book_appointment":
      return getCalcomBookAppointmentTool()
    default:
      return undefined
  }
}

// =============================================================================
// VAPI TOOL FORMAT CONVERSION
// =============================================================================

/**
 * Convert Cal.com tool to VAPI function tool format
 */
export function calcomToolToVapiFormat(
  tool: CalcomToolDefinition,
  serverUrl: string
): {
  type: "function"
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
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
    server: {
      url: serverUrl,
    },
    async: false, // Cal.com operations should be synchronous for better UX
  }
}

/**
 * Generate Cal.com system prompt context
 * Injected into agent prompts when Cal.com tools are enabled
 */
export function generateCalcomSystemPromptContext(timezone: string): string {
  const today = getTodayDate()
  const formattedToday = getFormattedTodayDate()

  return `

## CAL.COM APPOINTMENT BOOKING RULES

**CRITICAL DATE INFORMATION:**
- Today's date is: ${formattedToday}
- Today in YYYY-MM-DD format: ${today}
- Timezone: ${timezone}

**MANDATORY RULES:**
1. ALL appointments MUST be scheduled for TODAY (${today}) or FUTURE dates
2. NEVER accept or book appointments for dates before ${today}
3. If a caller mentions a date like "February 10" without a year, assume the CURRENT or NEXT occurrence of that date (never past)
4. If a date sounds like it might be in the past, ASK the caller to confirm: "Just to confirm, you'd like to schedule for [date] in [year], correct?"
5. ALWAYS check availability before confirming a booking

**BOOKING WORKFLOW:**
1. Greet the caller and ask how you can help
2. When they want to book: Ask "What date would you like to book?" and WAIT for their answer
3. ONLY AFTER they provide a date, use calcom_check_availability with that date
4. Present the available times to the caller
5. Collect: Full name, email address
6. Confirm the details with the caller
7. Use calcom_book_appointment to complete the booking
8. Confirm the booking details with the caller

**CRITICAL: NEVER call calcom_check_availability without a date. If the user hasn't given you a specific date, ASK THEM FIRST.**

**DATE FORMAT:**
- Use YYYY-MM-DD format for dates (e.g., ${today})
- Use HH:MM format for times in 24-hour format (e.g., 14:30 for 2:30 PM)
`
}


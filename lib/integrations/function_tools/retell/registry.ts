/**
 * Retell Tool Registry
 * Registry of Retell-supported tools (general_tools) with metadata for UI.
 * Reference: https://docs.retellai.com/api-references/create-retell-llm
 * 
 * Native tools go into general_tools array.
 * Custom functions are handled via MCP (Model Context Protocol).
 * 
 * NOTE: transfer_call has been intentionally excluded from the UI.
 */

import type { BuiltInToolDefinition } from "@/lib/integrations/function_tools/types"

/**
 * Tools Retell supports natively via `general_tools` + custom functions via MCP.
 */
export const RETELL_TOOL_REGISTRY: Record<string, BuiltInToolDefinition> = {
  // ========================================
  // CUSTOM FUNCTION (via MCP)
  // ========================================
  custom_function: {
    key: "custom_function",
    displayName: "Custom Function",
    type: "function",
    category: "custom",
    providers: { vapi: true, retell: true },
    isNative: false,
    description: "Create a custom function that calls your webhook. Executed via MCP server.",
    icon: "Code",
  },

  // ========================================
  // CALL CONTROL
  // ========================================
  end_call: {
    key: "end_call",
    displayName: "End Call",
    type: "end_call",
    category: "call_control",
    providers: { vapi: false, retell: true },
    isNative: true,
    description: "End the call gracefully when the conversation is complete.",
    icon: "PhoneOff",
  },
  press_digit: {
    key: "press_digit",
    displayName: "Press Digits (DTMF)",
    type: "press_digit",
    category: "call_control",
    providers: { vapi: false, retell: true },
    isNative: true,
    description: "Send DTMF tones (keypad digits) during the call.",
    icon: "Grid3X3",
  },

  // ========================================
  // CALENDAR INTEGRATION (Google Calendar - Custom via MCP)
  // These tools use our custom Google Calendar integration
  // executed via MCP server (same functionality as VAPI)
  // ========================================
  book_appointment: {
    key: "book_appointment",
    displayName: "Book Appointment",
    type: "book_appointment",
    category: "calendar",
    providers: { vapi: true, retell: true },
    isNative: false,
    description: "Book a new appointment on Google Calendar.",
    icon: "CalendarPlus",
  },
  cancel_appointment: {
    key: "cancel_appointment",
    displayName: "Cancel Appointment",
    type: "cancel_appointment",
    category: "calendar",
    providers: { vapi: true, retell: true },
    isNative: false,
    description: "Cancel an existing appointment.",
    icon: "CalendarX",
  },
  reschedule_appointment: {
    key: "reschedule_appointment",
    displayName: "Reschedule Appointment",
    type: "reschedule_appointment",
    category: "calendar",
    providers: { vapi: true, retell: true },
    isNative: false,
    description: "Reschedule an appointment to a new time.",
    icon: "CalendarClock",
  },

  // ========================================
  // CAL.COM INTEGRATION (Coming Soon)
  // ========================================
  calcom_check_availability: {
    key: "calcom_check_availability",
    displayName: "Cal.com - Check Availability",
    type: "calcom_check_availability",
    category: "calendar",
    providers: { vapi: true, retell: true },
    isNative: false,
    description: "Check available time slots on Cal.com.",
    icon: "CalendarSearch",
  },
  calcom_book_appointment: {
    key: "calcom_book_appointment",
    displayName: "Cal.com - Book Appointment",
    type: "calcom_book_appointment",
    category: "calendar",
    providers: { vapi: true, retell: true },
    isNative: false,
    description: "Book an appointment through Cal.com.",
    icon: "CalendarPlus",
  },

  // ========================================
  // GENERAL AVAILABILITY CHECK (Coming Soon)
  // ========================================
  check_availability: {
    key: "check_availability",
    displayName: "Check Availability",
    type: "check_availability",
    category: "calendar",
    providers: { vapi: true, retell: true },
    isNative: false,
    description: "Check available time slots for scheduling.",
    icon: "CalendarCheck",
  },
}

/**
 * Get all Retell tools as an array
 */
export function getRetellToolsArray(): BuiltInToolDefinition[] {
  return Object.values(RETELL_TOOL_REGISTRY)
}

/**
 * Get Retell tools by category
 */
export function getRetellToolsByCategory(category: string): BuiltInToolDefinition[] {
  return Object.values(RETELL_TOOL_REGISTRY).filter(
    (tool) => tool.category === category
  )
}

/**
 * Get a specific Retell tool definition
 */
export function getRetellToolDefinition(key: string): BuiltInToolDefinition | undefined {
  return RETELL_TOOL_REGISTRY[key]
}

/**
 * Check if a tool key is valid for Retell
 */
export function isValidRetellTool(key: string): boolean {
  return key in RETELL_TOOL_REGISTRY
}

/**
 * Get supported tool types for Retell (for validation messages)
 */
export function getSupportedRetellToolTypes(): string[] {
  return Object.values(RETELL_TOOL_REGISTRY).map((tool) => tool.type as string)
}

/**
 * Retell tool categories for UI organization
 */
export const RETELL_TOOL_CATEGORIES = {
  custom: {
    key: "custom",
    displayName: "Custom Functions",
    description: "Create custom functions that call your webhooks",
    icon: "Code",
  },
  call_control: {
    key: "call_control",
    displayName: "Call Control",
    description: "Tools for managing call flow",
    icon: "Phone",
  },
  calendar: {
    key: "calendar",
    displayName: "Calendar",
    description: "Google Calendar appointment scheduling",
    icon: "Calendar",
  },
  communication: {
    key: "communication",
    displayName: "Communication",
    description: "Tools for messaging and communication",
    icon: "MessageCircle",
  },
} as const


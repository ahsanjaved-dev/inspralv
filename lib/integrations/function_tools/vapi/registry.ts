/**
 * VAPI Tool Registry
 * Registry of available VAPI tools with metadata for UI
 * 
 * NOTE: Some tools have been intentionally excluded from the UI:
 * - handoff, transferCall, code, bash, computer, textEditor, googleSheetsRowAppend, mcp
 */

import type { ToolCategory, BuiltInToolDefinition } from '../types'

// Re-export for external use
export type { BuiltInToolDefinition }

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Registry of VAPI tools shown in the UI
 */
export const VAPI_TOOL_REGISTRY: Record<string, BuiltInToolDefinition> = {
  // ========================================
  // CALL CONTROL
  // ========================================
  endCall: {
    key: 'endCall',
    displayName: 'End Call',
    type: 'endCall',
    category: 'call_control',
    providers: { vapi: true, retell: false },
    isNative: true,
    description: 'End the call gracefully when the conversation is complete.',
    icon: 'PhoneOff',
  },
  dtmf: {
    key: 'dtmf',
    displayName: 'DTMF Tones',
    type: 'dtmf',
    category: 'call_control',
    providers: { vapi: true, retell: false },
    isNative: true,
    description: 'Send dial-tone multi-frequency signals (keypad tones).',
    icon: 'Grid3X3',
  },

  // ========================================
  // API INTEGRATION
  // ========================================
  apiRequest: {
    key: 'apiRequest',
    displayName: 'API Request',
    type: 'apiRequest',
    category: 'api_integration',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Make HTTP API requests to external services.',
    icon: 'Globe',
  },
  function: {
    key: 'function',
    displayName: 'Custom Function',
    type: 'function',
    category: 'api_integration',
    providers: { vapi: true, retell: true },
    isNative: false,
    description: 'Call a custom webhook function.',
    icon: 'Code',
  },

  // ========================================
  // CALENDAR (Custom Implementation - Google Calendar)
  // Calendar tools use our custom Google Calendar integration
  // Configured via CalendarToolsSelector component
  // Works with both VAPI and Retell (via MCP)
  // ========================================
  book_appointment: {
    key: 'book_appointment',
    displayName: 'Book Appointment',
    type: 'book_appointment',
    category: 'calendar',
    providers: { vapi: true, retell: true },
    isNative: false,
    description: 'Book a new appointment on Google Calendar.',
    icon: 'CalendarPlus',
  },
  cancel_appointment: {
    key: 'cancel_appointment',
    displayName: 'Cancel Appointment',
    type: 'cancel_appointment',
    category: 'calendar',
    providers: { vapi: true, retell: true },
    isNative: false,
    description: 'Cancel an existing appointment.',
    icon: 'CalendarX',
  },
  reschedule_appointment: {
    key: 'reschedule_appointment',
    displayName: 'Reschedule Appointment',
    type: 'reschedule_appointment',
    category: 'calendar',
    providers: { vapi: true, retell: true },
    isNative: false,
    description: 'Reschedule an appointment to a new time.',
    icon: 'CalendarClock',
  },

  // ========================================
  // CAL.COM INTEGRATION (Coming Soon)
  // ========================================
  calcom_check_availability: {
    key: 'calcom_check_availability',
    displayName: 'Cal.com - Check Availability',
    type: 'calcom_check_availability',
    category: 'calendar',
    providers: { vapi: true, retell: true },
    isNative: false,
    description: 'Check available time slots on Cal.com.',
    icon: 'CalendarSearch',
  },
  calcom_book_appointment: {
    key: 'calcom_book_appointment',
    displayName: 'Cal.com - Book Appointment',
    type: 'calcom_book_appointment',
    category: 'calendar',
    providers: { vapi: true, retell: true },
    isNative: false,
    description: 'Book an appointment through Cal.com.',
    icon: 'CalendarPlus',
  },

  // ========================================
  // GENERAL AVAILABILITY CHECK (Coming Soon)
  // ========================================
  check_availability: {
    key: 'check_availability',
    displayName: 'Check Availability',
    type: 'check_availability',
    category: 'calendar',
    providers: { vapi: true, retell: true },
    isNative: false,
    description: 'Check available time slots for scheduling.',
    icon: 'CalendarCheck',
  },

  // ========================================
  // GOHIGHLEVEL
  // ========================================
  goHighLevelCalendarAvailability: {
    key: 'goHighLevelCalendarAvailability',
    displayName: 'GHL - Calendar Availability',
    type: 'goHighLevelCalendarAvailability',
    category: 'ghl',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Check availability in GoHighLevel calendar.',
    icon: 'CalendarCheck',
  },
  goHighLevelCalendarEventCreate: {
    key: 'goHighLevelCalendarEventCreate',
    displayName: 'GHL - Create Event',
    type: 'goHighLevelCalendarEventCreate',
    category: 'ghl',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Create appointments in GoHighLevel.',
    icon: 'CalendarPlus',
  },
  goHighLevelContactCreate: {
    key: 'goHighLevelContactCreate',
    displayName: 'GHL - Create Contact',
    type: 'goHighLevelContactCreate',
    category: 'ghl',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Create contacts in GoHighLevel CRM.',
    icon: 'UserPlus',
  },
  goHighLevelContactGet: {
    key: 'goHighLevelContactGet',
    displayName: 'GHL - Get Contact',
    type: 'goHighLevelContactGet',
    category: 'ghl',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Lookup contacts in GoHighLevel CRM.',
    icon: 'UserSearch',
  },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all tools in a specific category
 */
export function getToolsByCategory(category: ToolCategory): BuiltInToolDefinition[] {
  return Object.values(VAPI_TOOL_REGISTRY).filter((tool) => tool.category === category)
}

/**
 * Get all native (built-in) tools
 */
export function getNativeTools(): BuiltInToolDefinition[] {
  return Object.values(VAPI_TOOL_REGISTRY).filter((tool) => tool.isNative)
}

/**
 * Get all tools that require a webhook/credential
 */
export function getIntegrationTools(): BuiltInToolDefinition[] {
  return Object.values(VAPI_TOOL_REGISTRY).filter((tool) => !tool.isNative)
}

/**
 * Get tool definition by type
 */
export function getToolDefinition(type: string): BuiltInToolDefinition | undefined {
  return VAPI_TOOL_REGISTRY[type]
}

/**
 * Check if a tool type is valid (exists in registry)
 */
export function isValidToolType(type: string): boolean {
  return type in VAPI_TOOL_REGISTRY
}

/**
 * Get all available categories
 */
export function getToolCategories(): ToolCategory[] {
  const categories = new Set<ToolCategory>()
  Object.values(VAPI_TOOL_REGISTRY).forEach((tool) => categories.add(tool.category))
  return Array.from(categories)
}

/**
 * Category display names
 */
export const CATEGORY_DISPLAY_NAMES: Record<ToolCategory, string> = {
  call_control: 'Call Control',
  api_integration: 'API Integration',
  code_execution: 'Code Execution',
  data: 'Data & Knowledge',
  calendar: 'Calendar',
  google: 'Google',
  communication: 'Communication',
  ghl: 'GoHighLevel',
  custom: 'Custom',
  other: 'Other',
}

/**
 * Category icons
 */
export const CATEGORY_ICONS: Record<ToolCategory, string> = {
  call_control: 'Phone',
  api_integration: 'Globe',
  code_execution: 'Terminal',
  data: 'Database',
  calendar: 'Calendar',
  google: 'Chrome',
  communication: 'MessageSquare',
  ghl: 'Building',
  custom: 'Code',
  other: 'MoreHorizontal',
}


/**
 * VAPI Tool Registry
 * Registry of all available VAPI tools with metadata for UI
 */

import type { VapiToolType, ToolCategory, BuiltInToolDefinition } from '../types'

// Re-export for external use
export type { BuiltInToolDefinition }

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

/**
 * Complete registry of all VAPI tool types
 */
export const VAPI_TOOL_REGISTRY: Record<VapiToolType, BuiltInToolDefinition> = {
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
  transferCall: {
    key: 'transferCall',
    displayName: 'Transfer Call',
    type: 'transferCall',
    category: 'call_control',
    providers: { vapi: true, retell: false },
    isNative: true,
    description: 'Transfer the call to another number or agent.',
    icon: 'PhoneForwarded',
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
  handoff: {
    key: 'handoff',
    displayName: 'Handoff',
    type: 'handoff',
    category: 'call_control',
    providers: { vapi: true, retell: false },
    isNative: true,
    description: 'Hand off to another AI assistant or squad member.',
    icon: 'ArrowRightLeft',
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
  // CODE EXECUTION
  // ========================================
  code: {
    key: 'code',
    displayName: 'Code Execution',
    type: 'code',
    category: 'code_execution',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Execute Node.js or Python code.',
    icon: 'Terminal',
  },
  bash: {
    key: 'bash',
    displayName: 'Bash Command',
    type: 'bash',
    category: 'code_execution',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Execute bash shell commands.',
    icon: 'TerminalSquare',
  },
  computer: {
    key: 'computer',
    displayName: 'Computer Use',
    type: 'computer',
    category: 'code_execution',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Computer automation and screen interaction.',
    icon: 'Monitor',
  },
  textEditor: {
    key: 'textEditor',
    displayName: 'Text Editor',
    type: 'textEditor',
    category: 'code_execution',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Edit text files using a code editor.',
    icon: 'FileText',
  },

  // ========================================
  // DATA
  // ========================================
  query: {
    key: 'query',
    displayName: 'Knowledge Query',
    type: 'query',
    category: 'data',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Query knowledge bases for information.',
    icon: 'Search',
  },

  // ========================================
  // GOOGLE INTEGRATION
  // ========================================
  googleCalendarCreateEvent: {
    key: 'googleCalendarCreateEvent',
    displayName: 'Google Calendar - Create Event',
    type: 'googleCalendarCreateEvent',
    category: 'google',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Create events on Google Calendar.',
    icon: 'Calendar',
  },
  googleCalendarCheckAvailability: {
    key: 'googleCalendarCheckAvailability',
    displayName: 'Google Calendar - Check Availability',
    type: 'googleCalendarCheckAvailability',
    category: 'google',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Check available time slots on Google Calendar.',
    icon: 'CalendarSearch',
  },
  googleSheetsRowAppend: {
    key: 'googleSheetsRowAppend',
    displayName: 'Google Sheets - Append Row',
    type: 'googleSheetsRowAppend',
    category: 'google',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Add rows to Google Sheets.',
    icon: 'Table',
  },

  // ========================================
  // COMMUNICATION
  // ========================================
  slackSendMessage: {
    key: 'slackSendMessage',
    displayName: 'Slack - Send Message',
    type: 'slackSendMessage',
    category: 'communication',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Send messages to Slack channels.',
    icon: 'MessageSquare',
  },
  smsSend: {
    key: 'smsSend',
    displayName: 'SMS - Send Message',
    type: 'smsSend',
    category: 'communication',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Send SMS text messages.',
    icon: 'MessageCircle',
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

  // ========================================
  // OTHER
  // ========================================
  mcp: {
    key: 'mcp',
    displayName: 'MCP Tool',
    type: 'mcp',
    category: 'other',
    providers: { vapi: true, retell: false },
    isNative: false,
    description: 'Model Context Protocol integration.',
    icon: 'Puzzle',
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
export function getToolDefinition(type: VapiToolType): BuiltInToolDefinition | undefined {
  return VAPI_TOOL_REGISTRY[type]
}

/**
 * Check if a tool type is valid
 */
export function isValidToolType(type: string): type is VapiToolType {
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
  google: 'Google',
  communication: 'Communication',
  ghl: 'GoHighLevel',
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
  google: 'Chrome',
  communication: 'MessageSquare',
  ghl: 'Building',
  other: 'MoreHorizontal',
}


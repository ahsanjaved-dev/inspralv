/**
 * VAPI Integration Tools
 * Export all third-party integration tool builders
 */

// Google Tools
export {
  createGoogleCalendarEventTool,
  createGoogleCalendarAvailabilityTool,
  createGoogleSheetsAppendTool,
  type GoogleCalendarCreateEventOptions,
  type GoogleCalendarCheckAvailabilityOptions,
  type GoogleSheetsRowAppendOptions,
} from './google'

// GoHighLevel Tools
export {
  createGhlCalendarAvailabilityTool,
  createGhlCalendarEventTool,
  createGhlContactCreateTool,
  createGhlContactGetTool,
  type GhlCalendarAvailabilityOptions,
  type GhlCalendarEventCreateOptions,
  type GhlContactCreateOptions,
  type GhlContactGetOptions,
} from './ghl'

// Communication Tools
export {
  createSlackMessageTool,
  createSmsSendTool,
  createSmsConfirmationTool,
  createSmsReminderTool,
  type SlackSendMessageOptions,
  type SmsSendOptions,
} from './communication'

// Query Tool
export {
  createQueryTool,
  createFaqSearchTool,
  createProductSearchTool,
  createPolicySearchTool,
  DEFAULT_QUERY_TOOL,
  type QueryToolOptions,
} from './query'

// MCP Tool
export {
  createMcpTool,
  createMcpToolsFromServer,
  type McpToolOptions,
} from './mcp'


/**
 * Function Tools - Shared Type Definitions
 * Provider-agnostic types for function tools
 */

// ============================================================================
// VAPI TOOL TYPES
// ============================================================================

/**
 * All supported VAPI tool types
 */
export type VapiToolType =
  // Call Control
  | 'endCall'
  | 'transferCall'
  | 'dtmf'
  | 'handoff'
  // API Integration
  | 'apiRequest'
  | 'function'
  // Code Execution
  | 'code'
  | 'bash'
  | 'computer'
  | 'textEditor'
  // Data
  | 'query'
  // Calendar (Custom Implementation - Google Calendar)
  | 'book_appointment'
  | 'cancel_appointment'
  | 'reschedule_appointment'
  // Calendar (Coming Soon - Cal.com)
  | 'calcom_check_availability'
  | 'calcom_book_appointment'
  // Calendar (Coming Soon - General)
  | 'check_availability'
  // Google (Other)
  | 'googleSheetsRowAppend'
  // Communication
  | 'slackSendMessage'
  | 'smsSend'
  // GoHighLevel
  | 'goHighLevelCalendarAvailability'
  | 'goHighLevelCalendarEventCreate'
  | 'goHighLevelContactCreate'
  | 'goHighLevelContactGet'
  // Other
  | 'mcp'

// ============================================================================
// RETELL TOOL TYPES
// ============================================================================

/**
 * Retell tool types (general_tools).
 * Reference: https://docs.retellai.com/api-references/create-retell-llm
 *
 * Call Control:
 * - 'end_call': End the call
 * - 'transfer_call': Transfer to another number
 * - 'press_digit': Send DTMF tones
 *
 * Calendar Integration (Google Calendar via MCP):
 * - 'book_appointment': Book a new appointment
 * - 'cancel_appointment': Cancel an existing appointment
 * - 'reschedule_appointment': Reschedule an appointment
 *
 * Communication:
 * - 'send_sms': Send SMS message
 *
 * Custom Integration:
 * - 'custom_function': Call external webhook/API
 */
export type RetellToolType =
  // Call Control
  | 'end_call'
  | 'transfer_call'
  | 'press_digit'
  // Calendar Integration (Google Calendar via MCP)
  | 'book_appointment'
  | 'cancel_appointment'
  | 'reschedule_appointment'
  // Calendar (Coming Soon - Cal.com)
  | 'calcom_check_availability'
  | 'calcom_book_appointment'
  // Calendar (Coming Soon - General)
  | 'check_availability'
  // Communication
  | 'send_sms'
  // Custom Integration
  | 'custom_function'

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

/**
 * Tool category for UI organization
 */
export type ToolCategory =
  | 'call_control'
  | 'api_integration'
  | 'code_execution'
  | 'data'
  | 'calendar'
  | 'google'
  | 'communication'
  | 'ghl'
  | 'custom'
  | 'other'

/**
 * Mapping of tool types to categories
 */
export const TOOL_CATEGORY_MAP: Record<VapiToolType, ToolCategory> = {
  // Call Control
  endCall: 'call_control',
  transferCall: 'call_control',
  dtmf: 'call_control',
  handoff: 'call_control',
  // API Integration
  apiRequest: 'api_integration',
  function: 'api_integration',
  // Code Execution
  code: 'code_execution',
  bash: 'code_execution',
  computer: 'code_execution',
  textEditor: 'code_execution',
  // Data
  query: 'data',
  // Calendar (Google Calendar)
  book_appointment: 'calendar',
  cancel_appointment: 'calendar',
  reschedule_appointment: 'calendar',
  // Calendar (Cal.com - Coming Soon)
  calcom_check_availability: 'calendar',
  calcom_book_appointment: 'calendar',
  // Calendar (General - Coming Soon)
  check_availability: 'calendar',
  // Google (Other)
  googleSheetsRowAppend: 'google',
  // Communication
  slackSendMessage: 'communication',
  smsSend: 'communication',
  // GoHighLevel
  goHighLevelCalendarAvailability: 'ghl',
  goHighLevelCalendarEventCreate: 'ghl',
  goHighLevelContactCreate: 'ghl',
  goHighLevelContactGet: 'ghl',
  // Other
  mcp: 'other',
}

// ============================================================================
// TOOL MESSAGE TYPES
// ============================================================================

/**
 * Message condition for conditional tool messages
 */
export interface ToolMessageCondition {
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'
  param: string
  value: string
}

/**
 * Tool message content item (for multi-language support)
 */
export interface ToolMessageContent {
  type: 'text'
  text: string
  language?: string
}

/**
 * Tool message - spoken during tool execution
 */
export interface VapiToolMessage {
  type: 'request-start' | 'request-response-delayed' | 'request-complete' | 'request-failed'
  /** Message content (simple string) */
  content?: string
  /** Multi-language content items */
  contents?: ToolMessageContent[]
  /** Whether to block/wait for this message before proceeding */
  blocking?: boolean
  /** Conditions for when to use this message */
  conditions?: ToolMessageCondition[]
}

// ============================================================================
// PARAMETER SCHEMA TYPES
// ============================================================================

/**
 * JSON Schema types for tool parameters
 */
export type ParameterSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'

/**
 * JSON Schema format hints
 */
export type ParameterSchemaFormat = 'date-time' | 'date' | 'time' | 'email' | 'uri' | 'uuid'

/**
 * JSON Schema for tool parameters
 */
export interface ToolParameterSchema {
  type: ParameterSchemaType
  description?: string
  title?: string
  items?: ToolParameterSchema
  properties?: Record<string, ToolParameterSchema>
  required?: string[]
  enum?: string[]
  pattern?: string
  format?: ParameterSchemaFormat
  default?: unknown
}

// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

/**
 * Server configuration for function tools
 */
export interface ToolServer {
  /** Webhook URL to call */
  url: string
  /** Timeout in seconds (default: 20) */
  timeoutSeconds?: number
  /** Secret for request signing */
  secret?: string
}

// ============================================================================
// BACKOFF / RETRY CONFIGURATION
// ============================================================================

/**
 * Backoff plan for retries on failed requests
 */
export interface BackoffPlan {
  /** Backoff type */
  type: 'fixed' | 'exponential'
  /** Maximum number of retries */
  maxRetries?: number
  /** Base delay in seconds */
  baseDelaySeconds?: number
  /** Status codes to exclude from retry */
  excludedStatusCodes?: number[]
}

// ============================================================================
// VARIABLE EXTRACTION
// ============================================================================

/**
 * Variable extraction plan for extracting data from tool responses
 */
export interface VariableExtractionPlan {
  /** Schema for variables to extract */
  schema: ToolParameterSchema
  /** Aliases for variable names */
  aliases?: Array<{ key: string; value: string }>
}

// ============================================================================
// REJECTION PLAN
// ============================================================================

/**
 * Rejection condition for blocking certain inputs
 */
export interface RejectionCondition {
  type: 'regex' | 'contains' | 'eq'
  regex?: string
  value?: string
}

/**
 * Rejection plan for blocking certain tool calls
 */
export interface RejectionPlan {
  conditions: RejectionCondition[]
}

// ============================================================================
// TOOL METADATA
// ============================================================================

/**
 * Metadata returned from VAPI for created tools
 */
export interface VapiToolMetadata {
  id: string
  orgId: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// TRANSFER DESTINATIONS
// ============================================================================

/**
 * Transfer call destination
 */
export interface TransferDestination {
  type: 'number' | 'sip'
  /** Phone number (for type: 'number') */
  number?: string
  /** SIP URI (for type: 'sip') */
  sipUri?: string
  /** Human-readable description */
  description?: string
  /** Transfer mode */
  transferMode?: 'blind' | 'warm'
}

// ============================================================================
// PROVIDER SUPPORT
// ============================================================================

/**
 * Provider support information for a tool type
 */
export interface ToolProviderSupport {
  vapi: boolean
  retell: boolean
}

/**
 * Built-in tool definition (for registry)
 */
export interface BuiltInToolDefinition {
  /** Unique key for the tool */
  key: string
  /** Display name for UI */
  displayName: string
  /** Tool type */
  type: VapiToolType | RetellToolType
  /** Category for organization */
  category: ToolCategory
  /** Provider support */
  providers: ToolProviderSupport
  /** Whether this is a provider-native tool (no webhook needed) */
  isNative: boolean
  /** Description */
  description: string
  /** Icon name (for UI) */
  icon?: string
}


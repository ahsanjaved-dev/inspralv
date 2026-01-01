/**
 * VAPI Tool Type Definitions
 * Complete type definitions for all VAPI tool types
 */

import type {
  VapiToolMessage,
  ToolParameterSchema,
  ToolServer,
  BackoffPlan,
  VariableExtractionPlan,
  RejectionPlan,
  TransferDestination,
  VapiToolMetadata,
} from '../types'

// ============================================================================
// BASE TOOL INTERFACE
// ============================================================================

/**
 * Base interface for all VAPI tools
 */
interface VapiToolBase {
  /** Tool messages spoken during execution */
  messages?: VapiToolMessage[]
  /** Tool name (for identification) */
  name?: string
  /** Tool description (helps LLM decide when to use) */
  description?: string
}

// ============================================================================
// CALL CONTROL TOOLS
// ============================================================================

/**
 * EndCall Tool - Ends the call
 */
export interface VapiEndCallTool extends VapiToolBase {
  type: 'endCall'
}

/**
 * TransferCall Tool - Transfers the call to another number/agent
 */
export interface VapiTransferCallTool extends VapiToolBase {
  type: 'transferCall'
  /** Available transfer destinations */
  destinations?: TransferDestination[]
}

/**
 * DTMF Tool - Sends DTMF tones
 */
export interface VapiDtmfTool extends VapiToolBase {
  type: 'dtmf'
}

/**
 * Handoff Tool - Hands off to another assistant
 */
export interface VapiHandoffTool extends VapiToolBase {
  type: 'handoff'
  /** Assistant ID to handoff to */
  assistantId?: string
  /** Phone number ID to handoff to */
  phoneNumberId?: string
  /** Squad ID for multi-agent scenarios */
  squadId?: string
}

// ============================================================================
// API INTEGRATION TOOLS
// ============================================================================

/**
 * HTTP methods for API requests
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * ApiRequest Tool - Makes HTTP API requests
 */
export interface VapiApiRequestTool extends VapiToolBase {
  type: 'apiRequest'
  /** HTTP method */
  method: HttpMethod
  /** Target URL */
  url: string
  /** Request timeout in seconds (default: 20) */
  timeoutSeconds?: number
  /** Credential ID for authentication */
  credentialId?: string
  /** Paths to encrypt in the request */
  encryptedPaths?: string[]
  /** Request body schema */
  body?: ToolParameterSchema
  /** Request headers schema */
  headers?: ToolParameterSchema
  /** Retry configuration */
  backoffPlan?: BackoffPlan
  /** Extract variables from response */
  variableExtractionPlan?: VariableExtractionPlan
  /** Rejection conditions */
  rejectionPlan?: RejectionPlan
}

/**
 * Function Tool - Custom function (webhook)
 */
export interface VapiFunctionTool extends VapiToolBase {
  type: 'function'
  /**
   * Function definition (Vapi API format)
   * Ref: https://api.vapi.ai/tool (Create Tool) and docs.vapi.ai/tools
   */
  function: {
    /** Function name */
    name: string
    /** Description for the LLM */
    description?: string
    /** Function parameters schema */
    parameters?: ToolParameterSchema
  }
  /** Server to call */
  server?: ToolServer
  /** Run asynchronously */
  async?: boolean
}

// ============================================================================
// CODE EXECUTION TOOLS
// ============================================================================

/**
 * Code Tool runtime options
 */
export type CodeToolRuntime = 'node18' | 'python3.11'

/**
 * Code Tool - Executes code
 */
export interface VapiCodeTool extends VapiToolBase {
  type: 'code'
  /** Runtime environment */
  runtime: CodeToolRuntime
  /** Code to execute */
  code: string
  /** Timeout in seconds */
  timeoutSeconds?: number
  /** Input parameters schema */
  parameters?: ToolParameterSchema
  /** Dependencies to install */
  dependencies?: string[]
}

/**
 * Bash Tool - Executes bash commands
 */
export interface VapiBashTool extends VapiToolBase {
  type: 'bash'
  /** Command to execute */
  command?: string
  /** Timeout in seconds */
  timeoutSeconds?: number
  /** Working directory */
  workingDirectory?: string
}

/**
 * Computer Tool - Computer use automation
 */
export interface VapiComputerTool extends VapiToolBase {
  type: 'computer'
  /** Display width */
  displayWidthPx?: number
  /** Display height */
  displayHeightPx?: number
  /** Display number */
  displayNumber?: number
}

/**
 * TextEditor Tool - Text editing
 */
export interface VapiTextEditorTool extends VapiToolBase {
  type: 'textEditor'
  /** Editor type */
  editorType?: 'vscode' | 'vim' | 'nano'
}

// ============================================================================
// DATA TOOLS
// ============================================================================

/**
 * Query Tool - Queries knowledge base
 */
export interface VapiQueryTool extends VapiToolBase {
  type: 'query'
  /** Knowledge base IDs to query */
  knowledgeBaseIds?: string[]
  /** Number of results to return */
  topK?: number
}

// ============================================================================
// GOOGLE INTEGRATION TOOLS
// ============================================================================

/**
 * Google Calendar Create Event Tool
 */
export interface VapiGoogleCalendarCreateEventTool extends VapiToolBase {
  type: 'googleCalendarCreateEvent'
  /** Google OAuth credential ID */
  credentialId: string
}

/**
 * Google Calendar Check Availability Tool
 */
export interface VapiGoogleCalendarCheckAvailabilityTool extends VapiToolBase {
  type: 'googleCalendarCheckAvailability'
  /** Google OAuth credential ID */
  credentialId: string
}

/**
 * Google Sheets Row Append Tool
 */
export interface VapiGoogleSheetsRowAppendTool extends VapiToolBase {
  type: 'googleSheetsRowAppend'
  /** Google OAuth credential ID */
  credentialId: string
}

// ============================================================================
// COMMUNICATION TOOLS
// ============================================================================

/**
 * Slack Send Message Tool
 */
export interface VapiSlackSendMessageTool extends VapiToolBase {
  type: 'slackSendMessage'
  /** Slack OAuth credential ID */
  credentialId: string
}

/**
 * SMS Send Tool
 */
export interface VapiSmsSendTool extends VapiToolBase {
  type: 'smsSend'
  /** Twilio/messaging credential ID */
  credentialId: string
}

// ============================================================================
// GOHIGHLEVEL TOOLS
// ============================================================================

/**
 * GoHighLevel Calendar Availability Tool
 */
export interface VapiGoHighLevelCalendarAvailabilityTool extends VapiToolBase {
  type: 'goHighLevelCalendarAvailability'
  /** GHL OAuth credential ID */
  credentialId: string
}

/**
 * GoHighLevel Calendar Event Create Tool
 */
export interface VapiGoHighLevelCalendarEventCreateTool extends VapiToolBase {
  type: 'goHighLevelCalendarEventCreate'
  /** GHL OAuth credential ID */
  credentialId: string
}

/**
 * GoHighLevel Contact Create Tool
 */
export interface VapiGoHighLevelContactCreateTool extends VapiToolBase {
  type: 'goHighLevelContactCreate'
  /** GHL OAuth credential ID */
  credentialId: string
}

/**
 * GoHighLevel Contact Get Tool
 */
export interface VapiGoHighLevelContactGetTool extends VapiToolBase {
  type: 'goHighLevelContactGet'
  /** GHL OAuth credential ID */
  credentialId: string
}

// ============================================================================
// MCP TOOL
// ============================================================================

/**
 * MCP Tool - Model Context Protocol integration
 */
export interface VapiMcpTool extends VapiToolBase {
  type: 'mcp'
  /** MCP server URL */
  serverUrl: string
  /** Tool name from MCP server */
  toolName: string
  /** MCP server arguments */
  arguments?: Record<string, unknown>
}

// ============================================================================
// UNION TYPES
// ============================================================================

/**
 * All VAPI tool types (for inline/assistant tools)
 */
export type VapiTool =
  // Call Control
  | VapiEndCallTool
  | VapiTransferCallTool
  | VapiDtmfTool
  | VapiHandoffTool
  // API Integration
  | VapiApiRequestTool
  | VapiFunctionTool
  // Code Execution
  | VapiCodeTool
  | VapiBashTool
  | VapiComputerTool
  | VapiTextEditorTool
  // Data
  | VapiQueryTool
  // Google
  | VapiGoogleCalendarCreateEventTool
  | VapiGoogleCalendarCheckAvailabilityTool
  | VapiGoogleSheetsRowAppendTool
  // Communication
  | VapiSlackSendMessageTool
  | VapiSmsSendTool
  // GoHighLevel
  | VapiGoHighLevelCalendarAvailabilityTool
  | VapiGoHighLevelCalendarEventCreateTool
  | VapiGoHighLevelContactCreateTool
  | VapiGoHighLevelContactGetTool
  // Other
  | VapiMcpTool

/**
 * VAPI Tool with metadata (response from API)
 */
export type VapiToolWithMetadata = VapiTool & VapiToolMetadata

// ============================================================================
// API PAYLOADS
// ============================================================================

/**
 * Create tool request payload
 */
export type CreateVapiToolPayload = VapiTool

/**
 * Update tool request payload
 */
export type UpdateVapiToolPayload = Partial<VapiTool>

/**
 * Tool ID reference (for assistant configuration)
 */
export interface VapiToolIdReference {
  type: 'toolId'
  toolId: string
}

/**
 * Tool reference - can be inline tool or ID reference
 */
export type VapiToolReference = VapiTool | VapiToolIdReference


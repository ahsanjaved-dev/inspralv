/**
 * Function Tools Integration
 * Main entry point for provider-agnostic function tools
 */

// Shared Types
export * from './types'

// VAPI Tools
export * as vapi from './vapi'

// Re-export commonly used types
export type {
  VapiToolType,
  ToolCategory,
  VapiToolMessage,
  ToolParameterSchema,
  ToolServer,
  TransferDestination,
  BuiltInToolDefinition,
} from './types'


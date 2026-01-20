/**
 * Retell Tool Type Definitions
 * Type definitions for Retell's tool format
 * Reference: https://docs.retellai.com/api-references/create-retell-llm
 */

import type { ToolParameterSchema } from '../types'

// ============================================================================
// RETELL PARAMETER SCHEMA
// ============================================================================

/**
 * Retell parameters must have root type: 'object'
 * This is stricter than the general ToolParameterSchema
 */
export interface RetellParameterSchema {
  type: 'object'
  properties?: Record<string, ToolParameterSchema>
  required?: string[]
  description?: string
}

// ============================================================================
// RETELL TRANSFER DESTINATION
// ============================================================================

/**
 * Transfer destination configuration
 */
export interface RetellTransferDestination {
  type: 'predefined'
  number: string
  /** If true, bypass E.164 phone number format validation */
  ignore_e164_validation?: boolean
}

/**
 * Transfer call options
 */
export interface RetellTransferOption {
  type: 'cold_transfer' | 'warm_transfer'
  /** If true, show the transferee as the caller */
  show_transferee_as_caller?: boolean
}

// ============================================================================
// RETELL GENERAL TOOLS
// Reference: https://docs.retellai.com/api-references/create-retell-llm
// ============================================================================

/**
 * End Call Tool - Ends the call gracefully
 */
export interface RetellEndCallTool {
  type: 'end_call'
  name: string
  description: string
}

/**
 * Transfer Call Tool - Transfers the call to another number
 */
export interface RetellTransferCallTool {
  type: 'transfer_call'
  name: string
  description: string
  transfer_destination: RetellTransferDestination
  transfer_option?: RetellTransferOption
}

/**
 * Press Digits Tool - Sends DTMF tones
 */
export interface RetellPressDigitsTool {
  type: 'press_digit'
  name: string
  description: string
}

/**
 * Check Availability Cal Tool - Check calendar availability on Cal.com
 */
export interface RetellCheckAvailabilityCalTool {
  type: 'check_availability_cal'
  name: string
  description: string
  cal_api_key: string
  event_type_id: number
  timezone: string
}

/**
 * Book Appointment Cal Tool - Book appointment on Cal.com
 */
export interface RetellBookAppointmentCalTool {
  type: 'book_appointment_cal'
  name: string
  description: string
  cal_api_key: string
  event_type_id: number
  timezone: string
}

/**
 * Send SMS Tool - Send SMS message (requires Twilio integration)
 */
export interface RetellSendSmsTool {
  type: 'send_sms'
  name: string
  description: string
  /** Twilio phone number to send SMS from */
  from_number?: string
}

/**
 * Custom Function Tool - webhook-based custom function
 * 
 * NOTE: Retell's general_tools array does NOT support custom function types.
 * Custom functions are executed via webhook callbacks to the webhook_url.
 * 
 * How it works:
 * 1. Agent is configured with a system prompt that mentions available functions
 * 2. When the LLM decides to call a function, Retell sends a POST to webhook_url
 * 3. The webhook handler executes the function and returns the result
 * 
 * This type is used for internal tracking, not sent to Retell API.
 */
export interface RetellCustomFunctionTool {
  type: 'custom_function'
  name: string
  description: string
  /** JSON Schema for function parameters */
  parameters?: RetellParameterSchema
  /** Optional webhook URL override (defaults to LLM's webhook_url) */
  server_url?: string
  /** Timeout in milliseconds for webhook execution */
  timeout_ms?: number
}

/**
 * Retell General Tool - union of all supported `general_tools`.
 */
export type RetellGeneralTool =
  | RetellEndCallTool
  | RetellTransferCallTool
  | RetellPressDigitsTool
  | RetellCheckAvailabilityCalTool
  | RetellBookAppointmentCalTool
  | RetellSendSmsTool

/**
 * Retell Tool Type - string literal types for native tools
 */
export type RetellNativeToolType =
  | 'end_call'
  | 'transfer_call'
  | 'press_digit'
  | 'check_availability_cal'
  | 'book_appointment_cal'
  | 'send_sms'

/**
 * Retell Tool Type - includes custom functions
 */
export type RetellToolType = RetellNativeToolType | 'custom_function' | 'custom' | 'function'

// ============================================================================
// RETELL LLM PAYLOAD
// ============================================================================

/**
 * Retell LLM Payload with tools
 */
export interface RetellLLMToolsPayload {
  /** Custom function tools for the LLM */
  general_tools?: RetellGeneralTool[]
  /** Webhook URL for function calls (used as default if not specified per-tool) */
  webhook_url?: string
}

// ============================================================================
// RETELL TOOL RESPONSE
// ============================================================================

/**
 * Retell tool call response format
 */
export interface RetellToolCallResponse {
  /** Tool/function name that was called */
  name: string
  /** Arguments passed to the function */
  arguments: Record<string, unknown>
  /** Call ID for tracking */
  call_id?: string
}


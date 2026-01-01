/**
 * Retell Tool Type Definitions
 * Type definitions for Retell's tool format
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
// RETELL GENERAL TOOL
// ============================================================================

/**
 * Retell General Tool - Custom function tool format
 * Reference: https://docs.retellai.com/api-references/llm/create-llm
 */
export type RetellTransferDestination =
  | {
      type: 'predefined'
      number: string
    }

export interface RetellEndCallTool {
  type: 'end_call'
  name: string
  description: string
}

export interface RetellTransferCallTool {
  type: 'transfer_call'
  name: string
  description: string
  transfer_destination: RetellTransferDestination
}

export interface RetellBookAppointmentCalTool {
  type: 'book_appointment_cal'
  name: string
  description: string
  cal_api_key: string
  event_type_id: number
  timezone: string
}

export interface RetellCustomFunctionTool {
  /** Tool type for webhook-based function calls */
  type: 'custom_function'
  name: string
  description: string
  parameters: RetellParameterSchema
  url?: string
  execution_timeout_ms?: number
  speak_during_execution?: boolean
  speak_on_send?: string
  speak_on_error?: string
}

/**
 * Retell General Tool - union of supported `general_tools`.
 */
export type RetellGeneralTool =
  | RetellEndCallTool
  | RetellTransferCallTool
  | RetellBookAppointmentCalTool
  | RetellCustomFunctionTool

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


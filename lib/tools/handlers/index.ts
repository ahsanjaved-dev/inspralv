/**
 * Tool Handlers
 * 
 * This module provides utilities for tool execution.
 * With the new dynamic architecture, actual execution is done by forwarding
 * requests to user-configured API URLs. This file provides helper types
 * and any pre/post processing needed.
 */

import { logger } from "@/lib/logger"

const log = logger.child({ module: "ToolHandlers" })

// ============================================================================
// TYPES
// ============================================================================

export interface ToolExecutionContext {
  agentId: string
  workspaceId?: string
  partnerId?: string
  callId?: string
  toolId: string
  timestamp: string
}

export interface ToolExecutionResult {
  success: boolean
  message?: string
  result?: Record<string, unknown>
  error?: string
}

export interface ToolConfig {
  apiUrl: string
  authToken?: string
  parameters: Array<{
    name: string
    type: string
    description: string
    required: boolean
  }>
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format tool result for Retell response
 * Ensures the result is in a format that the AI can speak
 */
export function formatResultForSpeech(result: ToolExecutionResult): string {
  if (!result.success) {
    return result.error || "Sorry, there was an error processing your request."
  }
  
  return result.message || "Done."
}

/**
 * Validate tool arguments against expected parameters
 */
export function validateArguments(
  args: Record<string, unknown>,
  parameters: Array<{ name: string; type: string; required: boolean }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const param of parameters) {
    if (param.required && !(param.name in args)) {
      errors.push(`Missing required parameter: ${param.name}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Log tool execution for analytics
 */
export function logToolExecution(
  toolName: string,
  context: ToolExecutionContext,
  result: ToolExecutionResult,
  duration: number
): void {
  log.info(`Tool executed: ${toolName}`, {
    toolName,
    agentId: context.agentId,
    callId: context.callId,
    success: result.success,
    duration,
  })
}

// ============================================================================
// DEPRECATED - Kept for backwards compatibility
// ============================================================================

/**
 * @deprecated Use the forwarding mechanism instead
 */
export function hasHandler(_toolName: string): boolean {
  // All tools are now handled by forwarding to user APIs
  return true
}

/**
 * @deprecated Use the forwarding mechanism instead
 */
export async function executeTool(
  toolName: string,
  _args: Record<string, unknown>,
  context: ToolExecutionContext,
  _settings?: Record<string, unknown>
): Promise<ToolExecutionResult> {
  log.warn(`Direct executeTool called for ${toolName} - this is deprecated`)
  return {
    success: false,
    error: `Tool "${toolName}" execution should be forwarded to user API`,
  }
}

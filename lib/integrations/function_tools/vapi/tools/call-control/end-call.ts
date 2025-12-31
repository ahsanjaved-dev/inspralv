/**
 * VAPI EndCall Tool
 * Built-in tool for ending calls gracefully
 * 
 * NOTE: VAPI built-in tools do NOT accept a 'name' property.
 * Only type, description, and messages are allowed.
 */

import type { VapiEndCallTool } from '../../types'
import type { VapiToolMessage } from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface EndCallToolOptions {
  /** Description for the LLM */
  description?: string
  /** Message to speak when ending the call */
  endMessage?: string
  /** Whether to block until message is spoken */
  blocking?: boolean
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI EndCall tool configuration
 * NOTE: VAPI built-in tools don't accept 'name' property
 */
export function createEndCallTool(options: EndCallToolOptions = {}): VapiEndCallTool {
  const {
    description,
    endMessage = 'Thank you for calling. Have a great day. Goodbye!',
    blocking = true,
  } = options

  const tool: VapiEndCallTool = {
    type: 'endCall',
  }

  // Only add description if provided
  if (description) {
    tool.description = description
  }

  // Always add the end message
  tool.messages = [
    {
      type: 'request-start',
      content: endMessage,
      blocking,
    },
  ]

  return tool
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Default EndCall tool
 */
export const DEFAULT_END_CALL_TOOL = createEndCallTool()

/**
 * EndCall tool with short goodbye
 */
export const SHORT_END_CALL_TOOL = createEndCallTool({
  endMessage: 'Goodbye!',
})

/**
 * EndCall tool for support calls
 */
export const SUPPORT_END_CALL_TOOL = createEndCallTool({
  description: 'End the support call when the issue is resolved or the customer is satisfied.',
  endMessage: 'Thank you for contacting support. Is there anything else I can help you with before we end this call?',
})

/**
 * EndCall tool for sales calls
 */
export const SALES_END_CALL_TOOL = createEndCallTool({
  description: 'End the sales call when the conversation is complete.',
  endMessage: "Thank you for your time today. We'll be in touch soon. Have a great day!",
})

// ============================================================================
// CONDITIONAL END CALL
// ============================================================================

/**
 * Creates an EndCall tool with conditional messages based on outcome
 */
export function createConditionalEndCallTool(
  conditions: Array<{
    outcome: 'resolved' | 'escalated' | 'callback' | 'voicemail' | 'no_answer' | 'default'
    message: string
  }>
): VapiEndCallTool {
  const messages: VapiToolMessage[] = conditions.map(({ outcome, message }) => ({
    type: 'request-start' as const,
    content: message,
    blocking: true,
    conditions:
      outcome !== 'default'
        ? [{ operator: 'eq' as const, param: 'outcome', value: outcome }]
        : undefined,
  }))

  return {
    type: 'endCall',
    description: 'End the call appropriately based on the conversation outcome.',
    messages,
  }
}

/**
 * Default conditional EndCall tool with common outcomes
 */
export const CONDITIONAL_END_CALL_TOOL = createConditionalEndCallTool([
  { outcome: 'resolved', message: 'Great, I\'m glad I could help! Thank you for calling. Goodbye!' },
  { outcome: 'escalated', message: 'I\'ve escalated your issue. Someone will be in touch shortly. Goodbye!' },
  { outcome: 'callback', message: 'We\'ll call you back as scheduled. Thank you. Goodbye!' },
  { outcome: 'default', message: 'Thank you for calling. Have a great day. Goodbye!' },
])

/**
 * VAPI Handoff Tool
 * Built-in tool for handing off to another assistant or squad member
 * 
 * NOTE: VAPI built-in tools do NOT accept a 'name' property.
 * Only type, description, messages, assistantId, phoneNumberId, squadId are allowed.
 */

import type { VapiHandoffTool } from '../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface HandoffToolOptions {
  /** Description for the LLM */
  description?: string
  /** Assistant ID to handoff to */
  assistantId?: string
  /** Phone number ID to handoff to */
  phoneNumberId?: string
  /** Squad ID for multi-agent scenarios */
  squadId?: string
  /** Message to speak during handoff */
  handoffMessage?: string
  /** Whether to speak a message */
  speakMessage?: boolean
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI Handoff tool configuration
 * NOTE: VAPI built-in tools don't accept 'name' property
 */
export function createHandoffTool(options: HandoffToolOptions = {}): VapiHandoffTool {
  const {
    description,
    assistantId,
    phoneNumberId,
    squadId,
    handoffMessage = 'I am connecting you with a specialist who can better assist you.',
    speakMessage = true,
  } = options

  const tool: VapiHandoffTool = {
    type: 'handoff',
  }

  if (description) {
    tool.description = description
  }

  if (assistantId) {
    tool.assistantId = assistantId
  }

  if (phoneNumberId) {
    tool.phoneNumberId = phoneNumberId
  }

  if (squadId) {
    tool.squadId = squadId
  }

  if (speakMessage && handoffMessage) {
    tool.messages = [
      {
        type: 'request-start',
        content: handoffMessage,
        blocking: true,
      },
    ]
  }

  return tool
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Default Handoff tool (requires assistantId to be set)
 */
export const DEFAULT_HANDOFF_TOOL = createHandoffTool()

/**
 * Handoff tool for specialist routing
 */
export const SPECIALIST_HANDOFF_TOOL = createHandoffTool({
  description: 'Connect the caller with a specialized AI assistant for complex queries.',
  handoffMessage: 'Let me connect you with our specialist assistant who can better help with your specific needs.',
})

/**
 * Handoff tool for language routing
 */
export const LANGUAGE_HANDOFF_TOOL = createHandoffTool({
  description: 'Hand off to an assistant who speaks the caller\'s preferred language.',
  handoffMessage: 'I am connecting you with an assistant who can communicate in your preferred language.',
})

/**
 * Handoff tool for department routing
 */
export const DEPARTMENT_HANDOFF_TOOL = createHandoffTool({
  description: 'Hand off to the appropriate department assistant based on the caller\'s needs.',
  handoffMessage: 'I am transferring you to the right department. One moment please.',
})

// ============================================================================
// FACTORY FOR SPECIFIC ASSISTANT
// ============================================================================

/**
 * Creates a handoff tool for a specific assistant
 */
export function createAssistantHandoffTool(
  assistantId: string,
  options: Omit<HandoffToolOptions, 'assistantId'> = {}
): VapiHandoffTool {
  return createHandoffTool({
    ...options,
    assistantId,
  })
}

/**
 * Creates a handoff tool for a specific squad
 */
export function createSquadHandoffTool(
  squadId: string,
  options: Omit<HandoffToolOptions, 'squadId'> = {}
): VapiHandoffTool {
  return createHandoffTool({
    ...options,
    squadId,
    description: options.description || 'Hand off to another member of the squad who can assist.',
  })
}

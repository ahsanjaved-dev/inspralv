/**
 * VAPI TransferCall Tool
 * Built-in tool for transferring calls to other numbers/agents
 * 
 * NOTE: VAPI built-in tools do NOT accept a 'name' property.
 * Only type, description, messages, and destinations are allowed.
 */

import type { VapiTransferCallTool } from '../../types'
import type { VapiToolMessage, TransferDestination } from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface TransferCallToolOptions {
  /** Description for the LLM */
  description?: string
  /** Available transfer destinations */
  destinations?: TransferDestination[]
  /** Message to speak during transfer */
  transferMessage?: string
  /** Whether to block until message is spoken */
  blocking?: boolean
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI TransferCall tool configuration
 * NOTE: VAPI built-in tools don't accept 'name' property
 */
export function createTransferCallTool(options: TransferCallToolOptions = {}): VapiTransferCallTool {
  const {
    description,
    destinations,
    transferMessage = 'I am transferring you now. Please hold.',
    blocking = true,
  } = options

  const tool: VapiTransferCallTool = {
    type: 'transferCall',
  }

  if (description) {
    tool.description = description
  }

  tool.messages = [
    {
      type: 'request-start',
      content: transferMessage,
      blocking,
    },
  ]

  if (destinations && destinations.length > 0) {
    tool.destinations = destinations
  }

  return tool
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Default TransferCall tool (no predefined destinations)
 */
export const DEFAULT_TRANSFER_CALL_TOOL = createTransferCallTool()

/**
 * TransferCall tool with warm transfer message
 */
export const WARM_TRANSFER_CALL_TOOL = createTransferCallTool({
  transferMessage: 'Let me connect you with someone who can better assist you. Please hold while I brief them on your situation.',
})

/**
 * TransferCall tool for emergency escalation
 */
export const EMERGENCY_TRANSFER_TOOL = createTransferCallTool({
  description: 'Transfer the call immediately in case of emergency or urgent matters.',
  transferMessage: 'I am connecting you to our emergency line right away. Please stay on the line.',
})

// ============================================================================
// DEPARTMENT TRANSFER
// ============================================================================

/**
 * Creates a TransferCall tool with predefined department destinations
 */
export function createDepartmentTransferTool(
  departments: Array<{
    name: string
    number: string
    description?: string
  }>
): VapiTransferCallTool {
  const destinations: TransferDestination[] = departments.map((dept) => ({
    type: 'number',
    number: dept.number,
    description: dept.description || `Transfer to ${dept.name}`,
  }))

  const deptNames = departments.map((d) => d.name).join(', ')

  return createTransferCallTool({
    description: `Transfer the call to a specific department. Available departments: ${deptNames}`,
    destinations,
    transferMessage: 'I am transferring you to the appropriate department. Please hold.',
  })
}

// ============================================================================
// SIP TRANSFER
// ============================================================================

/**
 * Creates a TransferCall tool for SIP transfers
 */
export function createSipTransferTool(
  sipDestinations: Array<{
    name: string
    sipUri: string
    description?: string
  }>
): VapiTransferCallTool {
  const destinations: TransferDestination[] = sipDestinations.map((dest) => ({
    type: 'sip',
    sipUri: dest.sipUri,
    description: dest.description || `Transfer to ${dest.name}`,
  }))

  return createTransferCallTool({
    description: 'Transfer the call via SIP to another agent or system.',
    destinations,
  })
}

// ============================================================================
// CONDITIONAL TRANSFER
// ============================================================================

/**
 * Creates a TransferCall tool with conditional messages
 */
export function createConditionalTransferTool(
  destinations: TransferDestination[],
  conditions: Array<{
    reason: string
    message: string
  }>
): VapiTransferCallTool {
  const messages: VapiToolMessage[] = conditions.map(({ reason, message }) => ({
    type: 'request-start' as const,
    content: message,
    blocking: true,
    conditions: [{ operator: 'eq' as const, param: 'reason', value: reason }],
  }))

  // Add default message
  messages.push({
    type: 'request-start',
    content: 'I am transferring you now. Please hold.',
    blocking: true,
  })

  return {
    type: 'transferCall',
    description: 'Transfer the call with appropriate message based on the reason.',
    messages,
    destinations,
  }
}

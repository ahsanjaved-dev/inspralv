/**
 * VAPI DTMF Tool
 * Built-in tool for sending DTMF tones
 * 
 * NOTE: VAPI built-in tools do NOT accept a 'name' property.
 * Only type, description, and messages are allowed.
 */

import type { VapiDtmfTool } from '../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface DtmfToolOptions {
  /** Description for the LLM */
  description?: string
  /** Message to speak when sending DTMF */
  dtmfMessage?: string
  /** Whether to speak a message */
  speakMessage?: boolean
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI DTMF tool configuration
 * NOTE: VAPI built-in tools don't accept 'name' property
 */
export function createDtmfTool(options: DtmfToolOptions = {}): VapiDtmfTool {
  const {
    description,
    dtmfMessage,
    speakMessage = false,
  } = options

  const tool: VapiDtmfTool = {
    type: 'dtmf',
  }

  if (description) {
    tool.description = description
  }

  if (speakMessage && dtmfMessage) {
    tool.messages = [
      {
        type: 'request-start',
        content: dtmfMessage,
        blocking: false,
      },
    ]
  }

  return tool
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Default DTMF tool
 */
export const DEFAULT_DTMF_TOOL = createDtmfTool()

/**
 * DTMF tool for IVR navigation
 */
export const IVR_DTMF_TOOL = createDtmfTool({
  description: 'Navigate through the phone menu by pressing the appropriate number. Use 1-9, *, or # as needed.',
  speakMessage: true,
  dtmfMessage: 'Navigating the menu...',
})

/**
 * DTMF tool for entering account numbers
 */
export const ACCOUNT_ENTRY_DTMF_TOOL = createDtmfTool({
  description: 'Enter an account number or PIN using the dial pad.',
  speakMessage: true,
  dtmfMessage: 'Entering your information...',
})

/**
 * DTMF tool for pressing extension
 */
export const EXTENSION_DTMF_TOOL = createDtmfTool({
  description: 'Dial a phone extension number.',
  speakMessage: true,
  dtmfMessage: 'Dialing the extension...',
})

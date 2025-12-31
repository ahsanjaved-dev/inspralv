/**
 * VAPI Communication Tools
 * Tools for Slack and SMS
 */

import type {
  VapiSlackSendMessageTool,
  VapiSmsSendTool,
} from '../../types'
import type { VapiToolMessage } from '../../../types'

// ============================================================================
// SLACK - SEND MESSAGE
// ============================================================================

export interface SlackSendMessageOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Slack OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during sending */
  sendingMessage?: string
  /** Message on success */
  successMessage?: string
}

/**
 * Creates a Slack Send Message tool
 */
export function createSlackMessageTool(
  options: SlackSendMessageOptions
): VapiSlackSendMessageTool {
  const {
    name = 'send_slack_message',
    description = 'Send a message to a Slack channel or user.',
    credentialId,
    sendingMessage = 'Sending the message to Slack...',
    successMessage = 'Your message has been sent to Slack.',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: sendingMessage,
      blocking: false,
    },
    {
      type: 'request-complete',
      content: successMessage,
      blocking: false,
    },
  ]

  return {
    type: 'slackSendMessage',
    name,
    description,
    credentialId,
    messages,
  }
}

// ============================================================================
// SMS - SEND
// ============================================================================

export interface SmsSendOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Twilio/messaging credential ID (required) */
  credentialId: string
  /** Message to speak during sending */
  sendingMessage?: string
  /** Message on success */
  successMessage?: string
  /** Message on failure */
  failureMessage?: string
}

/**
 * Creates an SMS Send tool
 */
export function createSmsSendTool(
  options: SmsSendOptions
): VapiSmsSendTool {
  const {
    name = 'send_sms',
    description = 'Send an SMS text message to a phone number.',
    credentialId,
    sendingMessage = 'Sending you a text message now...',
    successMessage = 'The text message has been sent.',
    failureMessage = 'I was unable to send the text message. Please verify the phone number.',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: sendingMessage,
      blocking: false,
    },
    {
      type: 'request-complete',
      content: successMessage,
      blocking: false,
    },
    {
      type: 'request-failed',
      content: failureMessage,
      blocking: false,
    },
  ]

  return {
    type: 'smsSend',
    name,
    description,
    credentialId,
    messages,
  }
}

/**
 * Creates an SMS confirmation tool
 */
export function createSmsConfirmationTool(credentialId: string): VapiSmsSendTool {
  return createSmsSendTool({
    name: 'send_confirmation_sms',
    description: 'Send a confirmation text message to the customer with appointment or order details.',
    credentialId,
    sendingMessage: 'Sending you a confirmation text...',
    successMessage: "I've sent you a confirmation text message.",
    failureMessage: "I couldn't send the confirmation text. Would you like me to try a different number?",
  })
}

/**
 * Creates an SMS reminder tool
 */
export function createSmsReminderTool(credentialId: string): VapiSmsSendTool {
  return createSmsSendTool({
    name: 'send_reminder_sms',
    description: 'Send a reminder text message to the customer.',
    credentialId,
    sendingMessage: "I'll send you a reminder text...",
    successMessage: 'Reminder text has been scheduled.',
  })
}


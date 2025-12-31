/**
 * VAPI Function Tool
 * Custom function tool that calls your webhook
 */

import type { VapiFunctionTool } from '../../types'
import type { VapiToolMessage, ToolParameterSchema, ToolServer } from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface FunctionToolOptions {
  /** Function name */
  name: string
  /** Description for the LLM */
  description: string
  /** Function parameters schema */
  parameters?: ToolParameterSchema
  /** Server to call */
  server?: ToolServer
  /** Run asynchronously */
  async?: boolean
  /** Message to speak during execution */
  executionMessage?: string
  /** Message on success */
  successMessage?: string
  /** Message on failure */
  failureMessage?: string
  /** Message when response is delayed */
  delayedMessage?: string
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI Function tool configuration
 */
export function createFunctionTool(options: FunctionToolOptions): VapiFunctionTool {
  const {
    name,
    description,
    parameters,
    server,
    async: isAsync = false,
    executionMessage,
    successMessage,
    failureMessage,
    delayedMessage,
  } = options

  const tool: VapiFunctionTool = {
    type: 'function',
    function: {
      name,
      description,
      parameters,
    },
    async: isAsync,
  }

  if (server) tool.server = server

  // Build messages
  const messages: VapiToolMessage[] = []

  if (executionMessage) {
    messages.push({
      type: 'request-start',
      content: executionMessage,
      blocking: false,
    })
  }

  if (delayedMessage) {
    messages.push({
      type: 'request-response-delayed',
      content: delayedMessage,
      blocking: false,
    })
  }

  if (successMessage) {
    messages.push({
      type: 'request-complete',
      content: successMessage,
      blocking: false,
    })
  }

  if (failureMessage) {
    messages.push({
      type: 'request-failed',
      content: failureMessage,
      blocking: false,
    })
  }

  if (messages.length > 0) {
    tool.messages = messages
  }

  return tool
}

// ============================================================================
// COMMON PRESETS
// ============================================================================

/**
 * Creates a book appointment function tool
 */
export function createBookAppointmentTool(webhookUrl: string): VapiFunctionTool {
  return createFunctionTool({
    name: 'book_appointment',
    description: 'Book an appointment for the customer with the requested date, time, and service.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The appointment date in YYYY-MM-DD format',
        },
        time: {
          type: 'string',
          description: 'The appointment time in HH:MM format (24-hour)',
        },
        service: {
          type: 'string',
          description: 'The type of service or appointment',
        },
        customer_name: {
          type: 'string',
          description: 'Customer full name',
        },
        customer_phone: {
          type: 'string',
          description: 'Customer phone number',
        },
        customer_email: {
          type: 'string',
          description: 'Customer email address',
        },
        notes: {
          type: 'string',
          description: 'Additional notes or special requests',
        },
      },
      required: ['date', 'time', 'customer_name'],
    },
    server: { url: webhookUrl },
    executionMessage: 'Let me check availability and book that appointment for you.',
    successMessage: 'Great, your appointment has been confirmed.',
    failureMessage: "I'm sorry, I couldn't book that appointment. Would you like to try a different time?",
  })
}

/**
 * Creates a check availability function tool
 */
export function createCheckAvailabilityTool(webhookUrl: string): VapiFunctionTool {
  return createFunctionTool({
    name: 'check_availability',
    description: 'Check available appointment slots for a specific date or date range.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The date to check in YYYY-MM-DD format',
        },
        service: {
          type: 'string',
          description: 'The type of service to check availability for',
        },
      },
      required: ['date'],
    },
    server: { url: webhookUrl },
    executionMessage: 'Let me check our availability for that date.',
    delayedMessage: 'Still checking, one moment please.',
  })
}

/**
 * Creates a lookup customer function tool
 */
export function createLookupCustomerTool(webhookUrl: string): VapiFunctionTool {
  return createFunctionTool({
    name: 'lookup_customer',
    description: 'Look up customer information using their phone number, email, or customer ID.',
    parameters: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Customer phone number',
        },
        email: {
          type: 'string',
          description: 'Customer email address',
        },
        customer_id: {
          type: 'string',
          description: 'Customer ID or account number',
        },
      },
    },
    server: { url: webhookUrl },
    executionMessage: 'Let me pull up your account information.',
    failureMessage: "I couldn't find that account. Could you please verify the information?",
  })
}

/**
 * Creates a send confirmation function tool
 */
export function createSendConfirmationTool(webhookUrl: string): VapiFunctionTool {
  return createFunctionTool({
    name: 'send_confirmation',
    description: 'Send a confirmation message via email or SMS to the customer.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of confirmation to send',
          enum: ['email', 'sms', 'both'],
        },
        recipient: {
          type: 'string',
          description: 'Email address or phone number',
        },
        message_type: {
          type: 'string',
          description: 'Type of message',
          enum: ['appointment', 'order', 'general'],
        },
        details: {
          type: 'string',
          description: 'Details to include in the confirmation',
        },
      },
      required: ['type', 'recipient'],
    },
    server: { url: webhookUrl },
    executionMessage: 'Sending you a confirmation now.',
    successMessage: 'Your confirmation has been sent.',
    failureMessage: "I wasn't able to send the confirmation. Please check the contact information.",
  })
}

/**
 * Creates a process payment function tool
 */
export function createProcessPaymentTool(webhookUrl: string): VapiFunctionTool {
  return createFunctionTool({
    name: 'process_payment',
    description: 'Process a payment for an order or service.',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Payment amount in dollars',
        },
        payment_method: {
          type: 'string',
          description: 'Payment method',
          enum: ['card_on_file', 'new_card', 'invoice'],
        },
        description: {
          type: 'string',
          description: 'Description of what the payment is for',
        },
        customer_id: {
          type: 'string',
          description: 'Customer ID for the payment',
        },
      },
      required: ['amount', 'payment_method'],
    },
    server: { url: webhookUrl },
    executionMessage: 'Processing your payment now.',
    successMessage: 'Your payment has been processed successfully.',
    failureMessage: 'There was an issue processing your payment. Please try again or use a different payment method.',
  })
}

/**
 * Creates a create ticket/case function tool
 */
export function createSupportTicketTool(webhookUrl: string): VapiFunctionTool {
  return createFunctionTool({
    name: 'create_support_ticket',
    description: 'Create a support ticket for the customer issue.',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Brief subject line for the ticket',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the issue',
        },
        priority: {
          type: 'string',
          description: 'Ticket priority',
          enum: ['low', 'medium', 'high', 'urgent'],
        },
        category: {
          type: 'string',
          description: 'Issue category',
        },
        customer_id: {
          type: 'string',
          description: 'Customer ID',
        },
      },
      required: ['subject', 'description'],
    },
    server: { url: webhookUrl },
    executionMessage: 'Creating a support ticket for you.',
    successMessage: 'Your support ticket has been created. Someone will be in touch soon.',
    failureMessage: 'I was unable to create the ticket. Please try again.',
  })
}

/**
 * Creates a generic webhook function tool
 */
export function createGenericFunctionTool(
  name: string,
  description: string,
  webhookUrl: string,
  parameters?: ToolParameterSchema,
  options: Partial<FunctionToolOptions> = {}
): VapiFunctionTool {
  return createFunctionTool({
    name,
    description,
    parameters: parameters || {
      type: 'object',
      properties: {},
    },
    server: { url: webhookUrl },
    ...options,
  })
}


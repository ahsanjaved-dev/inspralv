/**
 * VAPI ApiRequest Tool
 * Tool for making HTTP API requests during calls
 */

import type { VapiApiRequestTool, HttpMethod } from '../../types'
import type {
  VapiToolMessage,
  ToolParameterSchema,
  BackoffPlan,
  VariableExtractionPlan,
  RejectionPlan,
} from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface ApiRequestToolOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** HTTP method */
  method: HttpMethod
  /** Target URL */
  url: string
  /** Request timeout in seconds (default: 20) */
  timeoutSeconds?: number
  /** Credential ID for authentication */
  credentialId?: string
  /** Paths to encrypt in the request */
  encryptedPaths?: string[]
  /** Request body schema */
  body?: ToolParameterSchema
  /** Request headers schema */
  headers?: ToolParameterSchema
  /** Retry configuration */
  backoffPlan?: BackoffPlan
  /** Extract variables from response */
  variableExtractionPlan?: VariableExtractionPlan
  /** Rejection conditions */
  rejectionPlan?: RejectionPlan
  /** Message to speak during request */
  requestMessage?: string
  /** Message on success */
  successMessage?: string
  /** Message on failure */
  failureMessage?: string
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI ApiRequest tool configuration
 */
export function createApiRequestTool(options: ApiRequestToolOptions): VapiApiRequestTool {
  const {
    name = 'api_request',
    description = 'Make an API request to fetch or send data.',
    method,
    url,
    timeoutSeconds = 20,
    credentialId,
    encryptedPaths,
    body,
    headers,
    backoffPlan,
    variableExtractionPlan,
    rejectionPlan,
    requestMessage,
    successMessage,
    failureMessage,
  } = options

  const tool: VapiApiRequestTool = {
    type: 'apiRequest',
    name,
    description,
    method,
    url,
    timeoutSeconds,
  }

  if (credentialId) tool.credentialId = credentialId
  if (encryptedPaths) tool.encryptedPaths = encryptedPaths
  if (body) tool.body = body
  if (headers) tool.headers = headers
  if (backoffPlan) tool.backoffPlan = backoffPlan
  if (variableExtractionPlan) tool.variableExtractionPlan = variableExtractionPlan
  if (rejectionPlan) tool.rejectionPlan = rejectionPlan

  // Build messages
  const messages: VapiToolMessage[] = []
  
  if (requestMessage) {
    messages.push({
      type: 'request-start',
      content: requestMessage,
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
 * Creates a GET API request tool
 */
export function createGetApiTool(
  url: string,
  options: Omit<ApiRequestToolOptions, 'method' | 'url'> = {}
): VapiApiRequestTool {
  return createApiRequestTool({
    ...options,
    method: 'GET',
    url,
    name: options.name || 'fetch_data',
    description: options.description || 'Fetch data from an external API.',
  })
}

/**
 * Creates a POST API request tool
 */
export function createPostApiTool(
  url: string,
  body: ToolParameterSchema,
  options: Omit<ApiRequestToolOptions, 'method' | 'url' | 'body'> = {}
): VapiApiRequestTool {
  return createApiRequestTool({
    ...options,
    method: 'POST',
    url,
    body,
    name: options.name || 'send_data',
    description: options.description || 'Send data to an external API.',
  })
}

// ============================================================================
// WEBHOOK PRESET
// ============================================================================

/**
 * Creates a webhook notification tool
 */
export function createWebhookTool(
  webhookUrl: string,
  options: {
    name?: string
    description?: string
    bodySchema?: ToolParameterSchema
    requestMessage?: string
  } = {}
): VapiApiRequestTool {
  return createApiRequestTool({
    name: options.name || 'send_webhook',
    description: options.description || 'Send a notification to the webhook.',
    method: 'POST',
    url: webhookUrl,
    body: options.bodySchema || {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          description: 'Event type',
        },
        data: {
          type: 'object',
          description: 'Event data',
        },
      },
    },
    requestMessage: options.requestMessage,
    timeoutSeconds: 10,
    backoffPlan: {
      type: 'exponential',
      maxRetries: 2,
      baseDelaySeconds: 1,
      excludedStatusCodes: [400, 401, 403, 404],
    },
  })
}

// ============================================================================
// CRM INTEGRATION PRESET
// ============================================================================

/**
 * Creates a CRM lookup tool
 */
export function createCrmLookupTool(
  apiUrl: string,
  credentialId?: string
): VapiApiRequestTool {
  return createApiRequestTool({
    name: 'lookup_customer',
    description: 'Look up customer information from the CRM using their phone number, email, or customer ID.',
    method: 'GET',
    url: apiUrl,
    credentialId,
    requestMessage: 'Let me pull up your information...',
    successMessage: 'I found your account.',
    failureMessage: "I couldn't find that information. Could you please verify the details?",
    variableExtractionPlan: {
      schema: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Customer ID' },
          customerName: { type: 'string', description: 'Customer name' },
          accountStatus: { type: 'string', description: 'Account status' },
        },
      },
    },
  })
}

/**
 * Creates a CRM update tool
 */
export function createCrmUpdateTool(
  apiUrl: string,
  credentialId?: string
): VapiApiRequestTool {
  return createApiRequestTool({
    name: 'update_customer',
    description: 'Update customer information in the CRM.',
    method: 'PATCH',
    url: apiUrl,
    credentialId,
    body: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID to update' },
        updates: { type: 'object', description: 'Fields to update' },
      },
      required: ['customerId', 'updates'],
    },
    requestMessage: 'Updating your information...',
    successMessage: 'Your information has been updated.',
    failureMessage: 'I was unable to update your information. Please try again later.',
  })
}


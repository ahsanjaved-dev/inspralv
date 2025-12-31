/**
 * VAPI API Integration Tools
 * Export all API integration tool builders and presets
 */

// ApiRequest Tool
export {
  createApiRequestTool,
  createGetApiTool,
  createPostApiTool,
  createWebhookTool,
  createCrmLookupTool,
  createCrmUpdateTool,
  type ApiRequestToolOptions,
} from './api-request'

// Function Tool
export {
  createFunctionTool,
  createBookAppointmentTool,
  createCheckAvailabilityTool,
  createLookupCustomerTool,
  createSendConfirmationTool,
  createProcessPaymentTool,
  createSupportTicketTool,
  createGenericFunctionTool,
  type FunctionToolOptions,
} from './function'


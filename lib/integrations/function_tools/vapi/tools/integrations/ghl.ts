/**
 * VAPI GoHighLevel Integration Tools
 * Tools for GoHighLevel CRM integration
 */

import type {
  VapiGoHighLevelCalendarAvailabilityTool,
  VapiGoHighLevelCalendarEventCreateTool,
  VapiGoHighLevelContactCreateTool,
  VapiGoHighLevelContactGetTool,
} from '../../types'
import type { VapiToolMessage } from '../../../types'

// ============================================================================
// GHL CALENDAR - CHECK AVAILABILITY
// ============================================================================

export interface GhlCalendarAvailabilityOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** GHL OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during check */
  checkingMessage?: string
}

/**
 * Creates a GoHighLevel Calendar Availability tool
 */
export function createGhlCalendarAvailabilityTool(
  options: GhlCalendarAvailabilityOptions
): VapiGoHighLevelCalendarAvailabilityTool {
  const {
    name = 'check_ghl_availability',
    description = 'Check available appointment slots in GoHighLevel calendar.',
    credentialId,
    checkingMessage = 'Let me check the available times...',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: checkingMessage,
      blocking: false,
    },
  ]

  return {
    type: 'goHighLevelCalendarAvailability',
    name,
    description,
    credentialId,
    messages,
  }
}

// ============================================================================
// GHL CALENDAR - CREATE EVENT
// ============================================================================

export interface GhlCalendarEventCreateOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** GHL OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during creation */
  creatingMessage?: string
  /** Message on success */
  successMessage?: string
}

/**
 * Creates a GoHighLevel Calendar Event Create tool
 */
export function createGhlCalendarEventTool(
  options: GhlCalendarEventCreateOptions
): VapiGoHighLevelCalendarEventCreateTool {
  const {
    name = 'book_ghl_appointment',
    description = 'Book an appointment in GoHighLevel calendar.',
    credentialId,
    creatingMessage = 'Booking your appointment now...',
    successMessage = 'Your appointment has been booked successfully.',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: creatingMessage,
      blocking: false,
    },
    {
      type: 'request-complete',
      content: successMessage,
      blocking: false,
    },
  ]

  return {
    type: 'goHighLevelCalendarEventCreate',
    name,
    description,
    credentialId,
    messages,
  }
}

// ============================================================================
// GHL CONTACT - CREATE
// ============================================================================

export interface GhlContactCreateOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** GHL OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during creation */
  creatingMessage?: string
  /** Message on success */
  successMessage?: string
}

/**
 * Creates a GoHighLevel Contact Create tool
 */
export function createGhlContactCreateTool(
  options: GhlContactCreateOptions
): VapiGoHighLevelContactCreateTool {
  const {
    name = 'create_ghl_contact',
    description = 'Create a new contact in GoHighLevel CRM.',
    credentialId,
    creatingMessage = 'Adding your information to our system...',
    successMessage = 'Your contact information has been saved.',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: creatingMessage,
      blocking: false,
    },
    {
      type: 'request-complete',
      content: successMessage,
      blocking: false,
    },
  ]

  return {
    type: 'goHighLevelContactCreate',
    name,
    description,
    credentialId,
    messages,
  }
}

// ============================================================================
// GHL CONTACT - GET
// ============================================================================

export interface GhlContactGetOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** GHL OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during lookup */
  lookingUpMessage?: string
}

/**
 * Creates a GoHighLevel Contact Get tool
 */
export function createGhlContactGetTool(
  options: GhlContactGetOptions
): VapiGoHighLevelContactGetTool {
  const {
    name = 'lookup_ghl_contact',
    description = 'Look up contact information from GoHighLevel CRM.',
    credentialId,
    lookingUpMessage = 'Let me look up your information...',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: lookingUpMessage,
      blocking: false,
    },
  ]

  return {
    type: 'goHighLevelContactGet',
    name,
    description,
    credentialId,
    messages,
  }
}


/**
 * VAPI Google Integration Tools
 * Tools for Google Calendar and Google Sheets
 */

import type {
  VapiGoogleCalendarCreateEventTool,
  VapiGoogleCalendarCheckAvailabilityTool,
  VapiGoogleSheetsRowAppendTool,
} from '../../types'
import type { VapiToolMessage } from '../../../types'

// ============================================================================
// GOOGLE CALENDAR - CREATE EVENT
// ============================================================================

export interface GoogleCalendarCreateEventOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Google OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during creation */
  creatingMessage?: string
  /** Message on success */
  successMessage?: string
}

/**
 * Creates a Google Calendar Create Event tool
 */
export function createGoogleCalendarEventTool(
  options: GoogleCalendarCreateEventOptions
): VapiGoogleCalendarCreateEventTool {
  const {
    name = 'create_calendar_event',
    description = 'Create a new event on Google Calendar with the specified details.',
    credentialId,
    creatingMessage = 'Creating your calendar event...',
    successMessage = 'Your calendar event has been created.',
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
    type: 'googleCalendarCreateEvent',
    name,
    description,
    credentialId,
    messages,
  }
}

// ============================================================================
// GOOGLE CALENDAR - CHECK AVAILABILITY
// ============================================================================

export interface GoogleCalendarCheckAvailabilityOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Google OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during check */
  checkingMessage?: string
}

/**
 * Creates a Google Calendar Check Availability tool
 */
export function createGoogleCalendarAvailabilityTool(
  options: GoogleCalendarCheckAvailabilityOptions
): VapiGoogleCalendarCheckAvailabilityTool {
  const {
    name = 'check_calendar_availability',
    description = 'Check available time slots on Google Calendar for scheduling.',
    credentialId,
    checkingMessage = 'Let me check the calendar availability...',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: checkingMessage,
      blocking: false,
    },
  ]

  return {
    type: 'googleCalendarCheckAvailability',
    name,
    description,
    credentialId,
    messages,
  }
}

// ============================================================================
// GOOGLE SHEETS - ROW APPEND
// ============================================================================

export interface GoogleSheetsRowAppendOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Google OAuth credential ID (required) */
  credentialId: string
  /** Message to speak during append */
  appendingMessage?: string
  /** Message on success */
  successMessage?: string
}

/**
 * Creates a Google Sheets Row Append tool
 */
export function createGoogleSheetsAppendTool(
  options: GoogleSheetsRowAppendOptions
): VapiGoogleSheetsRowAppendTool {
  const {
    name = 'append_to_sheet',
    description = 'Add a new row of data to a Google Sheet.',
    credentialId,
    appendingMessage = 'Adding the information to the spreadsheet...',
    successMessage = 'The information has been recorded.',
  } = options

  const messages: VapiToolMessage[] = [
    {
      type: 'request-start',
      content: appendingMessage,
      blocking: false,
    },
    {
      type: 'request-complete',
      content: successMessage,
      blocking: false,
    },
  ]

  return {
    type: 'googleSheetsRowAppend',
    name,
    description,
    credentialId,
    messages,
  }
}


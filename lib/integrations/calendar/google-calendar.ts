/**
 * Google Calendar Service
 * Handles all Google Calendar API operations
 */

import type {
  GoogleCalendarEvent,
  GoogleCalendarEventInput,
  GoogleCalendarList,
  CalendarServiceResult,
  GoogleCalendarCredential,
  ReminderSetting,
} from './types'
import { decrypt, encrypt } from './encryption'

// =============================================================================
// CONSTANTS
// =============================================================================

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Required scopes for calendar operations
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
]

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
  refresh_token?: string
}

/**
 * Refresh Google OAuth access token
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<CalendarServiceResult<TokenResponse>> {
  try {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('[GoogleCalendar] Token refresh failed:', error)
      return {
        success: false,
        error: error.error_description || 'Failed to refresh token',
        code: error.error,
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('[GoogleCalendar] Token refresh exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Validate that a token looks like a valid Google access token
 * Google access tokens always start with 'ya29.'
 */
function isValidGoogleToken(token: string | null | undefined): boolean {
  return !!token && token.startsWith('ya29.')
}

// Minimal credential type for token operations
type TokenCredential = Pick<GoogleCalendarCredential, 'access_token' | 'refresh_token' | 'client_id' | 'client_secret' | 'token_expiry'>

/**
 * Get a valid access token, refreshing if necessary
 * Includes automatic recovery if stored token is corrupted
 */
export async function getValidAccessToken(
  credential: TokenCredential,
  updateTokenCallback?: (accessToken: string, expiry: Date) => Promise<void>
): Promise<CalendarServiceResult<string>> {
  // Check if current token is still valid (with 5 min buffer)
  const now = new Date()
  const tokenExpiry = credential.token_expiry ? new Date(credential.token_expiry) : null
  const bufferTime = new Date(Date.now() + 5 * 60 * 1000)
  
  const tokenNotExpired = tokenExpiry && tokenExpiry > bufferTime
  
  console.log('[GoogleCalendar] Token check:', {
    hasAccessToken: !!credential.access_token,
    tokenExpiry: tokenExpiry?.toISOString(),
    now: now.toISOString(),
    isValid: tokenNotExpired,
  })
  
  // Try to use cached token if not expired
  if (credential.access_token && tokenNotExpired) {
    try {
      const decryptedToken = decrypt(credential.access_token)
      
      // Validate the decrypted token looks correct
      if (isValidGoogleToken(decryptedToken)) {
        console.log('[GoogleCalendar] Using cached token (valid)')
        return { success: true, data: decryptedToken }
      }
      
      // Token decrypted but is invalid/corrupted - force refresh
      console.warn('[GoogleCalendar] Cached token corrupted (starts with:', decryptedToken?.substring(0, 10), '), forcing refresh...')
    } catch (decryptError) {
      console.warn('[GoogleCalendar] Token decryption failed, forcing refresh...')
    }
  }

  // Need to refresh (expired, missing, or corrupted)
  console.log('[GoogleCalendar] Refreshing token...')
  
  if (!credential.refresh_token) {
    console.error('[GoogleCalendar] No refresh token available!')
    return { success: false, error: 'No refresh token available. Please reconnect Google Calendar.' }
  }

  try {
    const clientSecret = decrypt(credential.client_secret)
    const refreshToken = decrypt(credential.refresh_token)
    
    // Validate refresh token looks reasonable
    if (!refreshToken || refreshToken.length < 20) {
      console.error('[GoogleCalendar] Refresh token appears corrupted')
      return { success: false, error: 'Refresh token corrupted. Please reconnect Google Calendar.' }
    }

    const result = await refreshAccessToken(
      credential.client_id,
      clientSecret,
      refreshToken
    )

    if (!result.success || !result.data) {
      console.error('[GoogleCalendar] Token refresh failed:', result.error)
      return { success: false, error: result.error }
    }

    const newToken = result.data.access_token
    
    // Validate the new token
    if (!isValidGoogleToken(newToken)) {
      console.error('[GoogleCalendar] Received invalid token from Google:', newToken?.substring(0, 20))
      return { success: false, error: 'Received invalid token from Google' }
    }

    console.log('[GoogleCalendar] Token refreshed successfully')

    // Calculate expiry
    const expiry = new Date(Date.now() + result.data.expires_in * 1000)

    // Save new token if callback provided
    if (updateTokenCallback) {
      const encryptedToken = encrypt(newToken)
      await updateTokenCallback(encryptedToken, expiry)
      console.log('[GoogleCalendar] New token saved to database')
    }

    return { success: true, data: newToken }
  } catch (error) {
    console.error('[GoogleCalendar] Error during token refresh:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Token refresh failed' 
    }
  }
}

// =============================================================================
// CALENDAR OPERATIONS
// =============================================================================

/**
 * List available calendars
 */
export async function listCalendars(
  accessToken: string
): Promise<CalendarServiceResult<GoogleCalendarList>> {
  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || 'Failed to list calendars',
        code: error.error?.code?.toString(),
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('[GoogleCalendar] List calendars exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create a new secondary calendar
 * Used for creating per-agent calendars programmatically
 */
export async function createCalendar(
  accessToken: string,
  calendarName: string,
  timezone: string = 'UTC',
  description?: string
): Promise<CalendarServiceResult<{ id: string; summary: string }>> {
  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: calendarName,
        description: description || `Appointments calendar for ${calendarName}`,
        timeZone: timezone,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('[GoogleCalendar] Create calendar failed:', error)
      return {
        success: false,
        error: error.error?.message || 'Failed to create calendar',
        code: error.error?.code?.toString(),
      }
    }

    const data = await response.json()
    console.log('[GoogleCalendar] Created calendar:', data.id, data.summary)
    return { 
      success: true, 
      data: { id: data.id, summary: data.summary } 
    }
  } catch (error) {
    console.error('[GoogleCalendar] Create calendar exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete a calendar
 * Used when deleting an agent to clean up its calendar
 */
export async function deleteCalendar(
  accessToken: string,
  calendarId: string
): Promise<CalendarServiceResult<void>> {
  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok && response.status !== 204) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || 'Failed to delete calendar',
        code: error.error?.code?.toString(),
      }
    }

    console.log('[GoogleCalendar] Deleted calendar:', calendarId)
    return { success: true, data: undefined }
  } catch (error) {
    console.error('[GoogleCalendar] Delete calendar exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get events from a calendar
 */
export async function getEvents(
  accessToken: string,
  calendarId: string,
  options: {
    timeMin?: string // ISO 8601 datetime
    timeMax?: string // ISO 8601 datetime
    maxResults?: number
    singleEvents?: boolean
    orderBy?: 'startTime' | 'updated'
  } = {}
): Promise<CalendarServiceResult<GoogleCalendarEvent[]>> {
  try {
    const params = new URLSearchParams()
    
    if (options.timeMin) params.set('timeMin', options.timeMin)
    if (options.timeMax) params.set('timeMax', options.timeMax)
    if (options.maxResults) params.set('maxResults', options.maxResults.toString())
    if (options.singleEvents !== undefined) params.set('singleEvents', options.singleEvents.toString())
    if (options.orderBy) params.set('orderBy', options.orderBy)

    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || 'Failed to get events',
        code: error.error?.code?.toString(),
      }
    }

    const data = await response.json()
    return { success: true, data: data.items || [] }
  } catch (error) {
    console.error('[GoogleCalendar] Get events exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Create a new calendar event
 */
export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleCalendarEventInput
): Promise<CalendarServiceResult<GoogleCalendarEvent>> {
  try {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('[GoogleCalendar] Create event failed:', error)
      return {
        success: false,
        error: error.error?.message || 'Failed to create event',
        code: error.error?.code?.toString(),
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('[GoogleCalendar] Create event exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Update an existing calendar event
 */
export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEventInput>
): Promise<CalendarServiceResult<GoogleCalendarEvent>> {
  try {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || 'Failed to update event',
        code: error.error?.code?.toString(),
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('[GoogleCalendar] Update event exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete a calendar event
 */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<CalendarServiceResult<void>> {
  try {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok && response.status !== 204) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || 'Failed to delete event',
        code: error.error?.code?.toString(),
      }
    }

    return { success: true }
  } catch (error) {
    console.error('[GoogleCalendar] Delete event exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get a specific event by ID
 */
export async function getEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<CalendarServiceResult<GoogleCalendarEvent>> {
  try {
    const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return {
        success: false,
        error: error.error?.message || 'Failed to get event',
        code: error.error?.code?.toString(),
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('[GoogleCalendar] Get event exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert ReminderSetting to minutes
 */
export function reminderToMinutes(reminder: ReminderSetting): number {
  switch (reminder.unit) {
    case 'minutes':
      return reminder.value
    case 'hours':
      return reminder.value * 60
    case 'days':
      return reminder.value * 24 * 60
    default:
      return reminder.value
  }
}

/**
 * Build Google Calendar event from appointment data
 * Google Calendar will automatically send email notifications to attendees
 * 
 * IMPORTANT: Reminders are only set if email notifications are enabled AND email is provided.
 * This is because reminders are sent via email - no email = no reminders needed.
 */
export function buildCalendarEvent(params: {
  summary: string
  description?: string
  startDateTime: Date
  endDateTime: Date
  timezone: string
  attendeeEmail: string
  attendeeName: string
  // Owner email notification settings
  enableOwnerEmail?: boolean
  ownerEmail?: string
  // Legacy reminder settings (backwards compatible)
  send24hReminder?: boolean
  send1hReminder?: boolean
  // New dynamic reminder settings
  enableReminders?: boolean
  reminders?: ReminderSetting[]
}): GoogleCalendarEventInput {
  // Build reminder overrides based on config
  // ONLY set reminders if email notifications are enabled AND email is provided
  const reminderOverrides: Array<{ method: 'email' | 'popup'; minutes: number }> = []
  
  // Check if email notifications are enabled and email is provided
  const hasOwnerEmailEnabled = params.enableOwnerEmail && params.ownerEmail
  
  if (hasOwnerEmailEnabled) {
    // Check if using new dynamic reminders
    if (params.enableReminders && params.reminders && params.reminders.length > 0) {
      // Use the new dynamic reminder settings
      for (const reminder of params.reminders) {
        const minutes = reminderToMinutes(reminder)
        reminderOverrides.push({ method: 'email', minutes })
        reminderOverrides.push({ method: 'popup', minutes })
      }
    } else {
      // Fall back to legacy reminder settings only if owner email is enabled
      if (params.send24hReminder !== false) {
        reminderOverrides.push({ method: 'email', minutes: 24 * 60 }) // 24 hours
      }
      if (params.send1hReminder !== false) {
        reminderOverrides.push({ method: 'email', minutes: 60 }) // 1 hour
      }
    }
  }
  
  // Always add a popup reminder for calendar users (this shows in Google Calendar UI)
  // This is useful even without email - it appears as a notification in Google Calendar
  if (reminderOverrides.length === 0) {
    reminderOverrides.push({ method: 'popup', minutes: 30 })
  }

  // Build attendees list
  const attendees: Array<{ email: string; displayName?: string }> = [
    {
      email: params.attendeeEmail,
      displayName: params.attendeeName,
    },
  ]
  
  // Add owner email if enabled
  if (hasOwnerEmailEnabled) {
    attendees.push({
      email: params.ownerEmail!,
      displayName: 'Calendar Owner',
    })
  }

  return {
    summary: params.summary,
    description: params.description,
    start: {
      dateTime: params.startDateTime.toISOString(),
      timeZone: params.timezone,
    },
    end: {
      dateTime: params.endDateTime.toISOString(),
      timeZone: params.timezone,
    },
    attendees,
    // Allow guests to see other attendees and invite others
    guestsCanSeeOtherGuests: true,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    reminders: {
      useDefault: false,
      overrides: reminderOverrides,
    },
  }
}

/**
 * Parse date from Google Calendar event
 */
export function parseEventDateTime(event: GoogleCalendarEvent): {
  start: Date | null
  end: Date | null
} {
  let start: Date | null = null
  let end: Date | null = null

  if (event.start?.dateTime) {
    start = new Date(event.start.dateTime)
  } else if (event.start?.date) {
    start = new Date(event.start.date)
  }

  if (event.end?.dateTime) {
    end = new Date(event.end.dateTime)
  } else if (event.end?.date) {
    end = new Date(event.end.date)
  }

  return { start, end }
}


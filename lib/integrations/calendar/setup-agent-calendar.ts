/**
 * Agent Calendar Setup Helper
 * Creates a Google Calendar and configures it for an agent
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { 
  getValidAccessToken, 
  createCalendar,
  decrypt,
  encrypt,
  DecryptionError
} from './index'

export interface SetupAgentCalendarParams {
  agentId: string
  agentName: string
  workspaceId: string
  workspaceName: string // Required for calendar naming
  partnerId: string
  timezone: string
  slot_duration_minutes?: number
  buffer_between_slots_minutes?: number
  preferred_days?: string[]
  preferred_hours_start?: string
  preferred_hours_end?: string
  min_notice_hours?: number
  max_advance_days?: number
  // Email notification settings
  enable_owner_email?: boolean
  owner_email?: string
  // If true, use the primary calendar instead of creating a new one
  usePrimaryCalendar?: boolean
  // If provided, use this existing calendar instead of creating a new one
  existingCalendarId?: string
  existingCalendarName?: string
}

export interface SetupAgentCalendarResult {
  success: boolean
  error?: string
  data?: {
    calendar_id: string
    calendar_name: string
    config_id: string
  }
}

/**
 * Sets up a Google Calendar for an agent
 * - Creates a new calendar in Google Calendar
 * - Creates an agent_calendar_configs record
 */
/**
 * Generate calendar name in the format: workspacename-agentname
 * Sanitizes names to be safe for Google Calendar
 */
function generateCalendarName(workspaceName: string, agentName: string): string {
  // Sanitize both names - remove special characters that might cause issues
  const sanitize = (str: string) => str.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ')
  const sanitizedWorkspace = sanitize(workspaceName)
  const sanitizedAgent = sanitize(agentName)
  return `${sanitizedWorkspace}-${sanitizedAgent}`
}

export async function setupAgentCalendar(params: SetupAgentCalendarParams): Promise<SetupAgentCalendarResult> {
  const {
    agentId,
    agentName,
    workspaceId,
    workspaceName,
    partnerId,
    timezone,
    slot_duration_minutes = 30,
    buffer_between_slots_minutes = 0,
    preferred_days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    preferred_hours_start = '09:00',
    preferred_hours_end = '17:00',
    min_notice_hours = 0, // Allow immediate bookings by default
    max_advance_days = 60,
    enable_owner_email = false,
    owner_email,
    usePrimaryCalendar = false,
    existingCalendarId,
    existingCalendarName,
  } = params

  if (!timezone) {
    return { success: false, error: 'Timezone is required' }
  }

  // Log what we received
  console.log(`[CalendarSetup] Setting up calendar for agent ${agentId}:`, {
    existingCalendarId: existingCalendarId || 'none (will create new)',
    existingCalendarName: existingCalendarName || 'none',
    usePrimaryCalendar,
    timezone,
    enable_owner_email,
    owner_email: owner_email || 'not set',
  })

  const supabase = createAdminClient()

  try {
    // 1. Check if calendar config already exists
    const { data: existingConfig } = await supabase
      .from('agent_calendar_configs')
      .select('id, calendar_id, calendar_name')
      .eq('agent_id', agentId)
      .single()

    if (existingConfig) {
      console.log(`[CalendarSetup] Calendar already configured for agent ${agentId}`)
      return {
        success: true,
        data: {
          calendar_id: existingConfig.calendar_id,
          calendar_name: existingConfig.calendar_name || generateCalendarName(workspaceName, agentName),
          config_id: existingConfig.id,
        }
      }
    }

    // 2. Get Google credentials for this partner
    const { data: credential, error: credError } = await supabase
      .from('google_calendar_credentials')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('is_active', true)
      .single()

    if (credError || !credential) {
      console.log(`[CalendarSetup] No Google credentials found for partner ${partnerId}`)
      return {
        success: false,
        error: 'Google Calendar not connected. Please connect Google in Organization > Integrations first.'
      }
    }

    // 3. Decrypt credentials
    let decryptedCredentials: {
      access_token: string
      refresh_token: string
      client_secret: string
    }

    try {
      decryptedCredentials = {
        access_token: credential.access_token ? decrypt(credential.access_token) : '',
        refresh_token: credential.refresh_token ? decrypt(credential.refresh_token) : '',
        client_secret: credential.client_secret ? decrypt(credential.client_secret) : '',
      }
    } catch (error) {
      if (error instanceof DecryptionError && error.isKeyMismatch) {
        console.error(`[CalendarSetup] Encryption key mismatch - credentials need to be re-saved`)
        return {
          success: false,
          error: 'Google Calendar credentials are invalid. Please disconnect and reconnect Google Calendar in Organization > Integrations.'
        }
      }
      throw error
    }

    // 4. Get valid access token
    const tokenResult = await getValidAccessToken(
      {
        access_token: decryptedCredentials.access_token,
        refresh_token: decryptedCredentials.refresh_token,
        client_id: credential.client_id,
        client_secret: decryptedCredentials.client_secret,
        token_expiry: credential.token_expiry,
      },
      async (newToken, expiry) => {
        // Update token in database
        await supabase
          .from('google_calendar_credentials')
          .update({
            access_token: encrypt(newToken),
            token_expiry: expiry.toISOString(),
            last_used_at: new Date().toISOString(),
          })
          .eq('id', credential.id)
      }
    )

    if (!tokenResult.success || !tokenResult.data) {
      console.error(`[CalendarSetup] Failed to get access token:`, tokenResult.error)
      return {
        success: false,
        error: tokenResult.error || 'Failed to get Google access token'
      }
    }

    const accessToken = tokenResult.data

    // 4. Get or create calendar
    let calendarId: string
    let calendarName: string

    if (existingCalendarId) {
      // Use an existing calendar from the workspace
      calendarId = existingCalendarId
      calendarName = existingCalendarName || generateCalendarName(workspaceName, agentName)
      console.log(`[CalendarSetup] Using existing calendar for agent ${agentId}:`, calendarId)
    } else if (usePrimaryCalendar) {
      // Use primary calendar - this ensures Google sends email notifications
      // Primary calendar ID is always 'primary' or the user's email
      calendarId = 'primary'
      calendarName = 'Primary Calendar'
      console.log(`[CalendarSetup] Using primary calendar for agent ${agentId} (email notifications enabled)`)
    } else {
      // Create a new secondary calendar (email notifications won't work)
      // Calendar name format: workspacename-agentname
      calendarName = generateCalendarName(workspaceName, agentName)
      const calendarResult = await createCalendar(
        accessToken,
        calendarName,
        timezone,
        `Appointments calendar for AI agent: ${agentName} in workspace: ${workspaceName}`
      )

      if (!calendarResult.success || !calendarResult.data) {
        console.error(`[CalendarSetup] Failed to create calendar:`, calendarResult.error)
        return {
          success: false,
          error: calendarResult.error || 'Failed to create Google Calendar'
        }
      }

      calendarId = calendarResult.data.id
      console.log(`[CalendarSetup] Created secondary calendar for agent ${agentId}:`, calendarId, 'with name:', calendarName)
      console.warn(`[CalendarSetup] Note: Secondary calendars do not send email notifications`)
    }

    const newCalendarId = calendarId

    // 5. Create agent_calendar_configs record
    const configData = {
      agent_id: agentId,
      workspace_id: workspaceId,
      google_credential_id: credential.id,
      calendar_id: newCalendarId,
      calendar_name: calendarName, // Store the human-readable calendar name
      timezone,
      slot_duration_minutes,
      buffer_between_slots_minutes,
      preferred_days,
      preferred_hours_start,
      preferred_hours_end,
      min_notice_hours,
      max_advance_days,
      enable_owner_email,
      owner_email: owner_email || null,
      is_active: true,
    }

    const { data: calendarConfig, error: insertError } = await supabase
      .from('agent_calendar_configs')
      .insert(configData)
      .select('id')
      .single()

    if (insertError) {
      console.error('[CalendarSetup] Failed to create config:', insertError)
      // Note: Calendar was created in Google but config failed to save
      // We could try to delete the calendar here, but leaving it is safer
      return {
        success: false,
        error: 'Failed to save calendar configuration'
      }
    }

    console.log(`[CalendarSetup] Successfully created calendar for agent ${agentId}:`, {
      calendarId: newCalendarId,
      calendarName,
      configId: calendarConfig.id,
    })

    return {
      success: true,
      data: {
        calendar_id: newCalendarId,
        calendar_name: calendarName,
        config_id: calendarConfig.id,
      }
    }

  } catch (error) {
    console.error('[CalendarSetup] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}


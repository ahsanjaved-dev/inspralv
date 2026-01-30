/**
 * Agent Calendar Setup Helper
 * Creates a Google Calendar and configures it for an agent
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { 
  getValidAccessToken, 
  createCalendar,
  decrypt,
  encrypt
} from './index'

export interface SetupAgentCalendarParams {
  agentId: string
  agentName: string
  workspaceId: string
  partnerId: string
  timezone: string
  slot_duration_minutes?: number
  buffer_between_slots_minutes?: number
  preferred_days?: string[]
  preferred_hours_start?: string
  preferred_hours_end?: string
  min_notice_hours?: number
  max_advance_days?: number
  // If true, use the primary calendar instead of creating a new one
  usePrimaryCalendar?: boolean
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
export async function setupAgentCalendar(params: SetupAgentCalendarParams): Promise<SetupAgentCalendarResult> {
  const {
    agentId,
    agentName,
    workspaceId,
    partnerId,
    timezone,
    slot_duration_minutes = 30,
    buffer_between_slots_minutes = 0,
    preferred_days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    preferred_hours_start = '09:00',
    preferred_hours_end = '17:00',
    min_notice_hours = 1,
    max_advance_days = 60,
    usePrimaryCalendar = false,
  } = params

  if (!timezone) {
    return { success: false, error: 'Timezone is required' }
  }

  const supabase = createAdminClient()

  try {
    // 1. Check if calendar config already exists
    const { data: existingConfig } = await supabase
      .from('agent_calendar_configs')
      .select('id, calendar_id')
      .eq('agent_id', agentId)
      .single()

    if (existingConfig) {
      console.log(`[CalendarSetup] Calendar already configured for agent ${agentId}`)
      return {
        success: true,
        data: {
          calendar_id: existingConfig.calendar_id,
          calendar_name: `Appointments - ${agentName}`,
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

    // 3. Get valid access token
    const tokenResult = await getValidAccessToken(
      {
        access_token: credential.access_token ? decrypt(credential.access_token) : '',
        refresh_token: credential.refresh_token ? decrypt(credential.refresh_token) : '',
        client_id: credential.client_id,
        client_secret: credential.client_secret ? decrypt(credential.client_secret) : '',
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

    if (usePrimaryCalendar) {
      // Use primary calendar - this ensures Google sends email notifications
      // Primary calendar ID is always 'primary' or the user's email
      calendarId = 'primary'
      calendarName = 'Primary Calendar'
      console.log(`[CalendarSetup] Using primary calendar for agent ${agentId} (email notifications enabled)`)
    } else {
      // Create a new secondary calendar (email notifications won't work)
      calendarName = `Appointments - ${agentName}`
      const calendarResult = await createCalendar(
        accessToken,
        calendarName,
        timezone,
        `Appointments calendar for AI agent: ${agentName}`
      )

      if (!calendarResult.success || !calendarResult.data) {
        console.error(`[CalendarSetup] Failed to create calendar:`, calendarResult.error)
        return {
          success: false,
          error: calendarResult.error || 'Failed to create Google Calendar'
        }
      }

      calendarId = calendarResult.data.id
      console.log(`[CalendarSetup] Created secondary calendar for agent ${agentId}:`, calendarId)
      console.warn(`[CalendarSetup] Note: Secondary calendars do not send email notifications`)
    }

    const newCalendarId = calendarId

    // 5. Create agent_calendar_configs record
    const configData = {
      agent_id: agentId,
      workspace_id: workspaceId,
      google_credential_id: credential.id,
      calendar_id: newCalendarId,
      timezone,
      slot_duration_minutes,
      buffer_between_slots_minutes,
      preferred_days,
      preferred_hours_start,
      preferred_hours_end,
      min_notice_hours,
      max_advance_days,
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


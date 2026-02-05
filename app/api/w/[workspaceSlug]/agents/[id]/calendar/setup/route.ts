/**
 * Agent Calendar Auto-Setup API
 * POST: Creates a Google Calendar and configures it for the agent
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext } from '@/lib/api/workspace-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { 
  getValidAccessToken, 
  createCalendar,
  decrypt 
} from '@/lib/integrations/calendar'

interface RouteParams {
  params: Promise<{
    workspaceSlug: string
    id: string // agent ID
  }>
}

interface SetupRequestBody {
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
  owner_email?: string | null
  // For using an existing calendar
  use_existing_calendar?: boolean
  existing_calendar_id?: string
  existing_calendar_name?: string
}

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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SetupRequestBody = await request.json()
    const {
      timezone,
      slot_duration_minutes = 30,
      buffer_between_slots_minutes = 0,
      preferred_days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      preferred_hours_start = '09:00',
      preferred_hours_end = '17:00',
      min_notice_hours = 1,
      max_advance_days = 60,
      // Email notification settings
      enable_owner_email = false,
      owner_email = null,
      // Existing calendar options
      use_existing_calendar = false,
      existing_calendar_id,
      existing_calendar_name,
    } = body

    if (!timezone) {
      return NextResponse.json(
        { error: 'Timezone is required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // 1. Verify agent belongs to this workspace
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id, name, workspace_id')
      .eq('id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // 2. Check if calendar config already exists
    const { data: existingConfig } = await supabase
      .from('agent_calendar_configs')
      .select('id, calendar_id')
      .eq('agent_id', agentId)
      .single()

    if (existingConfig) {
      return NextResponse.json({
        success: true,
        message: 'Calendar already configured for this agent',
        data: existingConfig,
      })
    }

    // 3. Get Google credentials for this partner
    const partnerId = ctx.workspace.partner_id
    if (!partnerId) {
      return NextResponse.json(
        { error: 'Partner not found for workspace' },
        { status: 400 }
      )
    }

    const { data: credential, error: credError } = await supabase
      .from('google_calendar_credentials')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('is_active', true)
      .single()

    if (credError || !credential) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Please connect Google in Organization > Integrations first.' },
        { status: 400 }
      )
    }

    // 4. Get valid access token
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
        const { encrypt } = await import('@/lib/integrations/calendar')
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
      return NextResponse.json(
        { error: tokenResult.error || 'Failed to get Google access token' },
        { status: 500 }
      )
    }

    const accessToken = tokenResult.data

    // 5. Get or create calendar
    let calendarId: string
    let calendarName: string

    if (use_existing_calendar && existing_calendar_id) {
      // Use an existing calendar from the workspace
      calendarId = existing_calendar_id
      calendarName = existing_calendar_name || generateCalendarName(ctx.workspace.name, agent.name)
      console.log(`[CalendarSetup] Using existing calendar for agent ${agentId}:`, calendarId)
    } else {
      // Create a new Google Calendar with format: workspacename-agentname
      calendarName = generateCalendarName(ctx.workspace.name, agent.name)
      const calendarResult = await createCalendar(
        accessToken,
        calendarName,
        timezone,
        `Appointments calendar for AI agent: ${agent.name} in workspace: ${ctx.workspace.name}`
      )

      if (!calendarResult.success || !calendarResult.data) {
        return NextResponse.json(
          { error: calendarResult.error || 'Failed to create Google Calendar' },
          { status: 500 }
        )
      }

      calendarId = calendarResult.data.id
      console.log(`[CalendarSetup] Created new calendar for agent ${agentId}:`, calendarId, 'with name:', calendarName)
    }

    const newCalendarId = calendarId

    // 6. Create agent_calendar_configs record
    const configData = {
      agent_id: agentId,
      workspace_id: ctx.workspace.id,
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
      // Email notification settings
      enable_owner_email,
      owner_email: enable_owner_email ? owner_email : null,
      is_active: true,
    }

    const { data: calendarConfig, error: insertError } = await supabase
      .from('agent_calendar_configs')
      .insert(configData)
      .select()
      .single()

    if (insertError) {
      console.error('[CalendarSetup] Failed to create config:', insertError)
      // Try to clean up the created calendar (only if we created a new one)
      if (!use_existing_calendar) {
        const { deleteCalendar } = await import('@/lib/integrations/calendar')
        await deleteCalendar(accessToken, newCalendarId)
      }
      return NextResponse.json(
        { error: 'Failed to save calendar configuration' },
        { status: 500 }
      )
    }

    console.log('[CalendarSetup] Successfully created calendar for agent:', {
      agentId,
      agentName: agent.name,
      calendarId: newCalendarId,
      calendarName,
    })

    return NextResponse.json({
      success: true,
      message: 'Calendar created and configured successfully',
      data: {
        calendar_id: newCalendarId,
        calendar_name: calendarName,
        config: calendarConfig,
      },
    })

  } catch (error) {
    console.error('[CalendarSetup] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


/**
 * Workspace Calendars API
 * GET: List all calendars configured in the workspace
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext } from '@/lib/api/workspace-auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: Promise<{
    workspaceSlug: string
  }>
}

export interface WorkspaceCalendar {
  calendar_id: string
  calendar_name: string | null
  agent_id: string
  agent_name: string
  timezone: string
  slot_duration_minutes: number
  buffer_between_slots_minutes: number
  preferred_days: string[]
  preferred_hours_start: string
  preferred_hours_end: string
  min_notice_hours: number
  max_advance_days: number
  enable_owner_email: boolean
  owner_email: string | null
  is_active: boolean
  created_at: string
}

// =============================================================================
// GET - List all calendars in the workspace
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    // Get all calendar configs for this workspace with agent info
    const { data: calendars, error } = await supabase
      .from('agent_calendar_configs')
      .select(`
        calendar_id,
        calendar_name,
        agent_id,
        timezone,
        slot_duration_minutes,
        buffer_between_slots_minutes,
        preferred_days,
        preferred_hours_start,
        preferred_hours_end,
        min_notice_hours,
        max_advance_days,
        enable_owner_email,
        owner_email,
        is_active,
        created_at,
        ai_agents!agent_id (
          id,
          name
        )
      `)
      .eq('workspace_id', ctx.workspace.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[CalendarsAPI] List calendars error:', error)
      return NextResponse.json({ error: 'Failed to list calendars' }, { status: 500 })
    }

    // Transform the data to flatten the agent info
    const workspaceCalendars: WorkspaceCalendar[] = (calendars || []).map((cal: any) => ({
      calendar_id: cal.calendar_id,
      calendar_name: cal.calendar_name,
      agent_id: cal.agent_id,
      agent_name: cal.ai_agents?.name || 'Unknown Agent',
      timezone: cal.timezone,
      slot_duration_minutes: cal.slot_duration_minutes,
      buffer_between_slots_minutes: cal.buffer_between_slots_minutes,
      preferred_days: cal.preferred_days,
      preferred_hours_start: cal.preferred_hours_start,
      preferred_hours_end: cal.preferred_hours_end,
      min_notice_hours: cal.min_notice_hours,
      max_advance_days: cal.max_advance_days,
      enable_owner_email: cal.enable_owner_email || false,
      owner_email: cal.owner_email,
      is_active: cal.is_active,
      created_at: cal.created_at,
    }))

    // Group calendars by calendar_id to get unique calendars
    // (multiple agents might share the same calendar)
    const uniqueCalendars = workspaceCalendars.reduce((acc, cal) => {
      const existing = acc.find(c => c.calendar_id === cal.calendar_id)
      if (!existing) {
        acc.push({
          ...cal,
          agents_using: [{ id: cal.agent_id, name: cal.agent_name }],
        })
      } else {
        // Add this agent to the existing calendar's agents list
        (existing as any).agents_using.push({ id: cal.agent_id, name: cal.agent_name })
      }
      return acc
    }, [] as (WorkspaceCalendar & { agents_using: { id: string; name: string }[] })[])

    return NextResponse.json({
      success: true,
      data: {
        calendars: uniqueCalendars,
        total: uniqueCalendars.length,
      },
    })
  } catch (error) {
    console.error('[CalendarsAPI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


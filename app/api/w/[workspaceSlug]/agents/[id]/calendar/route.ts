/**
 * Agent Calendar Configuration API
 * GET: Get calendar config
 * POST: Create/update calendar config
 * DELETE: Remove calendar config
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext } from '@/lib/api/workspace-auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: Promise<{
    workspaceSlug: string
    id: string // agent ID
  }>
}

// =============================================================================
// GET - Get calendar configuration for an agent
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    // Get calendar config for agent
    const { data: calendarConfig, error } = await supabase
      .from('agent_calendar_configs')
      .select(`
        *,
        google_calendar_credentials:google_calendar_credentials (
          id,
          client_id,
          is_active,
          last_used_at
        )
      `)
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[CalendarAPI] Get config error:', error)
      return NextResponse.json({ error: 'Failed to get calendar config' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: calendarConfig || null,
    })
  } catch (error) {
    console.error('[CalendarAPI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// POST - Create or update calendar configuration
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      google_credential_id,
      calendar_id,
      calendar_name, // Human-readable name: workspacename-agentname
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
    } = body

    // Validate required fields
    if (!google_credential_id || !calendar_id || !timezone) {
      return NextResponse.json(
        { error: 'Missing required fields: google_credential_id, calendar_id, timezone' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Verify agent belongs to this workspace
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id, workspace_id')
      .eq('id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Verify Google credential belongs to this partner
    const partnerId = ctx.workspace.partner_id
    if (!partnerId) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 400 })
    }

    const { data: credential, error: credError } = await supabase
      .from('google_calendar_credentials')
      .select('id, partner_id')
      .eq('id', google_credential_id)
      .eq('partner_id', partnerId)
      .single()

    if (credError || !credential) {
      return NextResponse.json({ error: 'Google credential not found' }, { status: 404 })
    }

    // Check if calendar config already exists
    const { data: existingConfig } = await supabase
      .from('agent_calendar_configs')
      .select('id')
      .eq('agent_id', agentId)
      .single()

    const configData = {
      agent_id: agentId,
      workspace_id: ctx.workspace.id,
      google_credential_id,
      calendar_id,
      calendar_name: calendar_name || null, // Store human-readable calendar name
      timezone,
      slot_duration_minutes,
      buffer_between_slots_minutes,
      preferred_days,
      preferred_hours_start,
      preferred_hours_end,
      min_notice_hours,
      max_advance_days,
      // Email notification settings - always save email so it's not lost when toggling
      enable_owner_email,
      owner_email: owner_email || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    let result
    if (existingConfig) {
      // Update existing config
      result = await supabase
        .from('agent_calendar_configs')
        .update(configData)
        .eq('id', existingConfig.id)
        .select()
        .single()
    } else {
      // Create new config
      result = await supabase
        .from('agent_calendar_configs')
        .insert(configData)
        .select()
        .single()
    }

    if (result.error) {
      console.error('[CalendarAPI] Save config error:', result.error)
      return NextResponse.json({ error: 'Failed to save calendar config' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (error) {
    console.error('[CalendarAPI] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Remove calendar configuration
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    // Delete calendar config (this will cascade to appointments)
    const { error } = await supabase
      .from('agent_calendar_configs')
      .delete()
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)

    if (error) {
      console.error('[CalendarAPI] Delete config error:', error)
      return NextResponse.json({ error: 'Failed to delete calendar config' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CalendarAPI] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


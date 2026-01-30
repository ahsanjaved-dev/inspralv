/**
 * Calendar Availability API
 * GET: Get available time slots for a date
 * POST: Check if a specific slot is available
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext } from '@/lib/api/workspace-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getAvailableSlots,
  checkSlotAvailability,
  getAvailableSlotsMultipleDays,
  findNextAvailableSlot,
  getValidAccessToken,
} from '@/lib/integrations/calendar'
import type { AgentCalendarConfig, GoogleCalendarCredential } from '@/lib/integrations/calendar'

interface RouteParams {
  params: Promise<{
    workspaceSlug: string
    id: string // agent ID
  }>
}

// =============================================================================
// GET - Get available slots for a date or date range
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)

    const date = searchParams.get('date') // YYYY-MM-DD
    const days = parseInt(searchParams.get('days') || '1') // Number of days to check
    const findNext = searchParams.get('find_next') === 'true' // Find next available

    // Get calendar config
    const { data: calendarConfig, error: configError } = await supabase
      .from('agent_calendar_configs')
      .select('*, google_calendar_credentials:google_calendar_credentials(*)')
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .eq('is_active', true)
      .single()

    if (configError || !calendarConfig) {
      return NextResponse.json(
        { error: 'Calendar not configured for this agent' },
        { status: 404 }
      )
    }

    const config = calendarConfig as AgentCalendarConfig & {
      google_calendar_credentials: GoogleCalendarCredential
    }

    // Get valid access token
    const tokenResult = await getValidAccessToken(
      config.google_calendar_credentials,
      async (newToken, expiry) => {
        await supabase
          .from('google_calendar_credentials')
          .update({
            access_token: newToken,
            token_expiry: expiry.toISOString(),
            last_used_at: new Date().toISOString(),
          })
          .eq('id', config.google_credential_id)
      }
    )

    if (!tokenResult.success || !tokenResult.data) {
      return NextResponse.json(
        { error: tokenResult.error || 'Failed to authenticate with Google' },
        { status: 500 }
      )
    }

    const accessToken = tokenResult.data

    // Find next available slot
    if (findNext) {
      const nextSlot = await findNextAvailableSlot(accessToken, config, date || undefined)
      return NextResponse.json({
        success: true,
        data: { nextAvailableSlot: nextSlot },
      })
    }

    // Get slots for multiple days
    if (days > 1) {
      const startDate = date || new Date().toISOString().split('T')[0]!
      const slotsMap = await getAvailableSlotsMultipleDays(accessToken, config, startDate, days)
      
      // Convert Map to object for JSON serialization
      const slots: Record<string, unknown[]> = {}
      slotsMap.forEach((value, key) => {
        slots[key] = value
      })

      return NextResponse.json({
        success: true,
        data: {
          slots,
          timezone: config.timezone,
        },
      })
    }

    // Get slots for single day
    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      )
    }

    const availability = await getAvailableSlots(accessToken, config, date)

    return NextResponse.json({
      success: true,
      data: availability,
    })
  } catch (error) {
    console.error('[AvailabilityAPI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// POST - Check specific slot availability
// =============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { date, time } = body

    if (!date || !time) {
      return NextResponse.json(
        { error: 'Missing required fields: date, time' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Get calendar config
    const { data: calendarConfig, error: configError } = await supabase
      .from('agent_calendar_configs')
      .select('*, google_calendar_credentials:google_calendar_credentials(*)')
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .eq('is_active', true)
      .single()

    if (configError || !calendarConfig) {
      return NextResponse.json(
        { error: 'Calendar not configured for this agent' },
        { status: 404 }
      )
    }

    const config = calendarConfig as AgentCalendarConfig & {
      google_calendar_credentials: GoogleCalendarCredential
    }

    // Get valid access token
    const tokenResult = await getValidAccessToken(
      config.google_calendar_credentials,
      async (newToken, expiry) => {
        await supabase
          .from('google_calendar_credentials')
          .update({
            access_token: newToken,
            token_expiry: expiry.toISOString(),
            last_used_at: new Date().toISOString(),
          })
          .eq('id', config.google_credential_id)
      }
    )

    if (!tokenResult.success || !tokenResult.data) {
      return NextResponse.json(
        { error: tokenResult.error || 'Failed to authenticate with Google' },
        { status: 500 }
      )
    }

    const accessToken = tokenResult.data

    // Check slot availability
    const slotCheck = await checkSlotAvailability(accessToken, config, date, time)

    return NextResponse.json({
      success: true,
      data: slotCheck,
    })
  } catch (error) {
    console.error('[AvailabilityAPI] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


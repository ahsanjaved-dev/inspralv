/**
 * Agent Appointments API
 * GET: List appointments
 * POST: Create appointment manually (admin use)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext } from '@/lib/api/workspace-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookAppointment } from '@/lib/integrations/calendar'

interface RouteParams {
  params: Promise<{
    workspaceSlug: string
    id: string // agent ID
  }>
}

// =============================================================================
// GET - List appointments for an agent
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

    // Parse filters
    const status = searchParams.get('status')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const attendeeEmail = searchParams.get('email')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('appointments')
      .select('*', { count: 'exact' })
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)

    if (status) {
      query = query.eq('status', status)
    }

    if (startDate) {
      query = query.gte('scheduled_start', new Date(startDate).toISOString())
    }

    if (endDate) {
      query = query.lte('scheduled_start', new Date(endDate).toISOString())
    }

    if (attendeeEmail) {
      query = query.eq('attendee_email', attendeeEmail)
    }

    // Order by most recent first
    query = query
      .order('scheduled_start', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: appointments, error, count } = await query

    if (error) {
      console.error('[AppointmentsAPI] List error:', error)
      return NextResponse.json({ error: 'Failed to get appointments' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: appointments || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('[AppointmentsAPI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// POST - Create appointment manually (admin function)
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
      attendee_name,
      attendee_email,
      attendee_phone,
      preferred_date,
      preferred_time,
      notes,
    } = body

    // Validate required fields
    if (!attendee_name || !attendee_email || !preferred_date || !preferred_time) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Book the appointment
    const result = await bookAppointment({
      agentId,
      attendeeName: attendee_name,
      attendeeEmail: attendee_email,
      attendeePhone: attendee_phone,
      preferredDate: preferred_date,
      preferredTime: preferred_time,
      notes,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          alternativeSlots: result.alternativeSlots,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.appointment,
    })
  } catch (error) {
    console.error('[AppointmentsAPI] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


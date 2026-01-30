/**
 * Single Appointment API
 * GET: Get appointment details
 * PATCH: Update appointment (reschedule)
 * DELETE: Cancel appointment
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext } from '@/lib/api/workspace-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelAppointment, rescheduleAppointment } from '@/lib/integrations/calendar'

interface RouteParams {
  params: Promise<{
    workspaceSlug: string
    id: string // agent ID
    appointmentId: string
  }>
}

// =============================================================================
// GET - Get single appointment details
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId, appointmentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: appointment, error } = await supabase
      .from('appointments')
      .select('*, agent_calendars(timezone)')
      .eq('id', appointmentId)
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .single()

    if (error || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: appointment,
    })
  } catch (error) {
    console.error('[AppointmentAPI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// PATCH - Update appointment (reschedule or mark complete)
// =============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId, appointmentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { new_date, new_time, status } = body

    const supabase = createAdminClient()

    // Get the appointment first
    const { data: appointment, error: findError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .single()

    if (findError || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // Handle status update (mark as complete)
    if (status) {
      const allowedStatuses = ['completed', 'scheduled', 'cancelled']
      if (!allowedStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` },
          { status: 400 }
        )
      }

      const { data: updatedAppointment, error: updateError } = await supabase
        .from('appointments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update appointment status' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        data: updatedAppointment,
      })
    }

    // Handle reschedule
    if (!new_date || !new_time) {
      return NextResponse.json(
        { error: 'Missing required fields: new_date, new_time (or status)' },
        { status: 400 }
      )
    }

    // Reschedule
    const result = await rescheduleAppointment({
      agentId,
      attendeeEmail: appointment.attendee_email,
      attendeeName: appointment.attendee_name,
      newDate: new_date,
      newTime: new_time,
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
      data: result.newAppointment,
    })
  } catch (error) {
    console.error('[AppointmentAPI] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Cancel appointment
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceSlug, id: agentId, appointmentId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const reason = searchParams.get('reason') || 'Cancelled by admin'

    // Get the appointment first
    const { data: appointment, error: findError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .eq('agent_id', agentId)
      .eq('workspace_id', ctx.workspace.id)
      .single()

    if (findError || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // Cancel
    const result = await cancelAppointment({
      agentId,
      attendeeEmail: appointment.attendee_email,
      cancellationReason: reason,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.appointment,
    })
  } catch (error) {
    console.error('[AppointmentAPI] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


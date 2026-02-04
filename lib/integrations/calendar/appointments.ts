/**
 * Appointment Service
 * Handles booking, canceling, and rescheduling appointments
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getValidAccessToken,
  buildCalendarEvent,
  buildEventDescription,
} from './google-calendar'
import { checkSlotAvailability, formatAvailableSlotsForLLM, findNextAvailableSlot } from './availability'
import { decrypt } from './encryption'
import type {
  BookAppointmentInput,
  BookAppointmentResult,
  CancelAppointmentInput,
  CancelAppointmentResult,
  RescheduleAppointmentInput,
  RescheduleAppointmentResult,
  Appointment,
  AgentCalendarConfig,
  GoogleCalendarCredential,
} from './types'

// =============================================================================
// FLEXIBLE APPOINTMENT SEARCH
// =============================================================================

interface FlexibleSearchParams {
  email?: string
  name?: string
  date?: string  // YYYY-MM-DD
  time?: string  // HH:MM
}

/**
 * Flexibly search for appointments matching 2+ of: email, date, time
 * Status is always 'scheduled'
 * Returns best matching appointment(s)
 */
async function findAppointmentFlexible(
  supabase: ReturnType<typeof createAdminClient>,
  params: FlexibleSearchParams
): Promise<(Appointment & { agent_calendar_configs: AgentCalendarConfig & { google_calendar_credentials: GoogleCalendarCredential } })[]> {
  const { email, name, date, time } = params
  
  // Get all scheduled appointments, we'll score them in memory
  let query = supabase
    .from('appointments')
    .select('*, agent_calendar_configs!calendar_config_id(*, google_calendar_credentials!google_credential_id(*))')
    .eq('status', 'scheduled')
    .order('scheduled_start', { ascending: true })
    .limit(50) // Reasonable limit
  
  // If email provided, filter by it (most reliable identifier)
  if (email) {
    query = query.eq('attendee_email', email)
  }
  
  // If name provided, do fuzzy match
  if (name) {
    query = query.ilike('attendee_name', `%${name}%`)
  }

  const { data: appointments, error } = await query

  if (error || !appointments || appointments.length === 0) {
    return []
  }

  // Score each appointment based on how many criteria match
  const scoredAppointments = appointments.map(apt => {
    let score = 1 // Base score for status='scheduled' match
    
    // Email match
    if (email && apt.attendee_email?.toLowerCase() === email.toLowerCase()) {
      score += 2
    }
    
    // Name match
    if (name && apt.attendee_name?.toLowerCase().includes(name.toLowerCase())) {
      score += 1
    }
    
    // Date match (check if appointment falls on the given date)
    if (date) {
      const aptDate = new Date(apt.scheduled_start).toISOString().split('T')[0]
      // Exact date match
      if (aptDate === date) {
        score += 2
      }
      // Same month/day different year (common AI mistake)
      else if (aptDate?.slice(5) === date.slice(5)) {
        score += 1 // Partial credit for month/day match
      }
    }
    
    // Time match (within 1 hour tolerance)
    if (time && apt.scheduled_start) {
      const aptTime = new Date(apt.scheduled_start)
      const timeParts = time.split(':').map(Number)
      const targetHour = timeParts[0] ?? 0
      const targetMin = timeParts[1] ?? 0
      const aptHour = aptTime.getHours()
      const aptMin = aptTime.getMinutes()
      
      // Exact time match
      if (aptHour === targetHour && aptMin === targetMin) {
        score += 2
      }
      // Within 1 hour
      else if (Math.abs(aptHour - targetHour) <= 1) {
        score += 1
      }
    }
    
    return { appointment: apt, score }
  })

  // Filter to only those with score >= 3 (at least 2 criteria matched beyond status)
  // Sort by score descending, then by date ascending
  const filtered = scoredAppointments
    .filter(s => s.score >= 3)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return new Date(a.appointment.scheduled_start).getTime() - new Date(b.appointment.scheduled_start).getTime()
    })
    .map(s => s.appointment as Appointment & { 
      agent_calendar_configs: AgentCalendarConfig & { 
        google_calendar_credentials: GoogleCalendarCredential 
      } 
    })

  console.log(`[AppointmentSearch] Found ${filtered.length} matching appointments (scored >= 3)`)
  
  return filtered
}

// =============================================================================
// APPOINTMENT BOOKING
// =============================================================================

/**
 * Book a new appointment
 */
export async function bookAppointment(
  input: BookAppointmentInput
): Promise<BookAppointmentResult> {
  const supabase = createAdminClient()

  try {
    // 1. Get agent calendar configuration with agent name
    const { data: calendarConfig, error: configError } = await supabase
      .from('agent_calendar_configs')
      .select(`
        *,
        google_calendar_credentials:google_calendar_credentials(*),
        agent:ai_agents!agent_id(id, name)
      `)
      .eq('agent_id', input.agentId)
      .eq('is_active', true)
      .single()

    if (configError || !calendarConfig) {
      return {
        success: false,
        error: 'Calendar not configured for this agent',
      }
    }

    const config = calendarConfig as AgentCalendarConfig & {
      google_calendar_credentials: GoogleCalendarCredential
      agent?: { id: string; name: string }
    }
    
    const agentName = config.agent?.name || 'AI Agent'

    // 2. Get valid access token
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
      return {
        success: false,
        error: tokenResult.error || 'Failed to get access token',
      }
    }

    const accessToken = tokenResult.data

    // 3. Check slot availability
    const slotCheck = await checkSlotAvailability(
      accessToken,
      config,
      input.preferredDate,
      input.preferredTime
    )

    if (!slotCheck.available) {
      return {
        success: false,
        error: slotCheck.reason || 'Requested slot is not available',
        alternativeSlots: slotCheck.alternativeSlots,
      }
    }

    // 4. Create Google Calendar event
    // Google Calendar will automatically send email notifications to attendees when sendUpdates=all
    const eventStart = slotCheck.requestedSlot.start
    const eventEnd = slotCheck.requestedSlot.end

    // Generate a unique booking ID for reference
    const bookingId = `APT-${Date.now().toString(36).toUpperCase()}`
    
    const calendarEvent = buildCalendarEvent({
      summary: `Appointment with ${input.attendeeName}`,
      startDateTime: eventStart,
      endDateTime: eventEnd,
      timezone: config.timezone,
      // Attendee details
      attendeeEmail: input.attendeeEmail,
      attendeeName: input.attendeeName,
      attendeePhone: input.attendeePhone,
      // Additional context for rich description
      agentName,
      bookingId,
      notes: input.notes,
      // Pass owner email notification settings
      enableOwnerEmail: config.enable_owner_email,
      ownerEmail: config.owner_email || undefined,
      // Pass reminder settings
      enableReminders: config.enable_reminders,
      reminders: config.reminders as any,
    })

    const eventResult = await createEvent(accessToken, config.calendar_id, calendarEvent)

    if (!eventResult.success || !eventResult.data) {
      return {
        success: false,
        error: eventResult.error || 'Failed to create calendar event',
      }
    }

    // 5. Save appointment to database
    const appointmentData = {
      agent_id: input.agentId,
      workspace_id: config.workspace_id,
      calendar_config_id: config.id,
      conversation_id: input.conversationId || null,
      google_event_id: eventResult.data.id,
      calendar_id: config.calendar_id,
      attendee_name: input.attendeeName,
      attendee_email: input.attendeeEmail,
      attendee_phone: input.attendeePhone || null,
      appointment_type: 'book' as const,
      status: 'scheduled' as const,
      scheduled_start: eventStart.toISOString(),
      scheduled_end: eventEnd.toISOString(),
      timezone: config.timezone,
      duration_minutes: config.slot_duration_minutes,
      notes: input.notes || null,
      custom_fields: input.customFields || {},
      extracted_from_transcript: !!input.conversationId,
    }

    const { data: appointment, error: insertError } = await supabase
      .from('appointments')
      .insert(appointmentData)
      .select()
      .single()

    if (insertError) {
      // Try to clean up the calendar event since DB insert failed
      await deleteEvent(accessToken, config.calendar_id, eventResult.data.id)
      return {
        success: false,
        error: 'Failed to save appointment to database',
      }
    }

    return {
      success: true,
      appointment: appointment as Appointment,
      googleEvent: eventResult.data,
    }
  } catch (error) {
    console.error('[AppointmentService] Book appointment error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// APPOINTMENT CANCELLATION
// =============================================================================

/**
 * Cancel an existing appointment
 */
export async function cancelAppointment(
  input: CancelAppointmentInput
): Promise<CancelAppointmentResult> {
  const supabase = createAdminClient()

  try {
    // 1. Find appointment using flexible search (matches 2+ of: email, date, time, name)
    const appointments = await findAppointmentFlexible(supabase, {
      email: input.attendeeEmail,
      name: input.attendeeName,
      date: input.appointmentDate,
    })

    if (appointments.length === 0) {
      return {
        success: false,
        notFound: true,
        error: 'No matching appointment found',
      }
    }

    const appointment = appointments[0]!

    const config = appointment.agent_calendar_configs
    const credential = config.google_calendar_credentials

    // 2. Get valid access token
    const tokenResult = await getValidAccessToken(
      credential,
      async (newToken, expiry) => {
        await supabase
          .from('google_calendar_credentials')
          .update({
            access_token: newToken,
            token_expiry: expiry.toISOString(),
            last_used_at: new Date().toISOString(),
          })
          .eq('id', credential.id)
      }
    )

    if (!tokenResult.success || !tokenResult.data) {
      return {
        success: false,
        error: tokenResult.error || 'Failed to get access token',
      }
    }

    const accessToken = tokenResult.data

    // 3. Delete Google Calendar event
    if (appointment.google_event_id) {
      const deleteResult = await deleteEvent(
        accessToken,
        appointment.calendar_id,
        appointment.google_event_id
      )

      if (!deleteResult.success) {
        console.warn('[AppointmentService] Failed to delete calendar event:', deleteResult.error)
      }
    }

    // 4. Update appointment status in database
    const { data: updatedAppointment, error: updateError } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: input.cancellationReason || 'Cancelled by user',
      })
      .eq('id', appointment.id)
      .select()
      .single()

    if (updateError) {
      return {
        success: false,
        error: 'Failed to update appointment status',
      }
    }

    return {
      success: true,
      appointment: updatedAppointment as Appointment,
    }
  } catch (error) {
    console.error('[AppointmentService] Cancel appointment error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// APPOINTMENT RESCHEDULING
// =============================================================================

/**
 * Reschedule an existing appointment
 */
export async function rescheduleAppointment(
  input: RescheduleAppointmentInput
): Promise<RescheduleAppointmentResult> {
  const supabase = createAdminClient()

  try {
    // 1. Find appointment using flexible search (matches 2+ of: email, date, time, name)
    const appointments = await findAppointmentFlexible(supabase, {
      email: input.attendeeEmail,
      name: input.attendeeName,
      date: input.currentAppointmentDate,
    })

    if (appointments.length === 0) {
      return {
        success: false,
        notFound: true,
        error: 'No matching appointment found to reschedule',
      }
    }

    const originalAppointment = appointments[0]!

    const config = originalAppointment.agent_calendar_configs
    const credential = config.google_calendar_credentials

    // 2. Get valid access token
    const tokenResult = await getValidAccessToken(
      credential,
      async (newToken, expiry) => {
        await supabase
          .from('google_calendar_credentials')
          .update({
            access_token: newToken,
            token_expiry: expiry.toISOString(),
            last_used_at: new Date().toISOString(),
          })
          .eq('id', credential.id)
      }
    )

    if (!tokenResult.success || !tokenResult.data) {
      return {
        success: false,
        error: tokenResult.error || 'Failed to get access token',
      }
    }

    const accessToken = tokenResult.data

    // 3. Check new slot availability
    const slotCheck = await checkSlotAvailability(
      accessToken,
      config,
      input.newDate,
      input.newTime
    )

    if (!slotCheck.available) {
      return {
        success: false,
        error: slotCheck.reason || 'Requested new slot is not available',
        alternativeSlots: slotCheck.alternativeSlots,
      }
    }

    const newStart = slotCheck.requestedSlot.start
    const newEnd = slotCheck.requestedSlot.end

    // 4. Update Google Calendar event
    if (originalAppointment.google_event_id) {
      // Build attendees list for the rescheduled event
      const attendees: Array<{ email: string; displayName?: string }> = [
        {
          email: originalAppointment.attendee_email,
          displayName: originalAppointment.attendee_name,
        },
      ]
      
      // Add owner email if enabled - ensures owner gets reschedule notification
      if (config.enable_owner_email && config.owner_email) {
        attendees.push({
          email: config.owner_email,
          displayName: 'Calendar Owner',
        })
      }

      // Build enhanced description for reschedule with multi-timezone support
      const description = buildEventDescription({
        attendeeName: originalAppointment.attendee_name,
        attendeeEmail: originalAppointment.attendee_email,
        attendeePhone: originalAppointment.attendee_phone || undefined,
        notes: `📅 RESCHEDULED\nOriginal time: ${new Date(originalAppointment.scheduled_start).toLocaleString()}\n\n${originalAppointment.notes || ''}`,
        timezone: config.timezone,
        startDateTime: newStart,
        endDateTime: newEnd,
      })

      const updateResult = await updateEvent(
        accessToken,
        originalAppointment.calendar_id,
        originalAppointment.google_event_id,
        {
          start: {
            dateTime: newStart.toISOString(),
            timeZone: config.timezone,
          },
          end: {
            dateTime: newEnd.toISOString(),
            timeZone: config.timezone,
          },
          summary: `Appointment with ${originalAppointment.attendee_name}`,
          description,
          attendees,
        }
      )

      if (!updateResult.success) {
        console.warn('[AppointmentService] Failed to update calendar event:', updateResult.error)
      }
    }

    // 5. Update the existing appointment with new time (no duplication)
    const { data: updatedAppointment, error: updateError } = await supabase
      .from('appointments')
      .update({
        scheduled_start: newStart.toISOString(),
        scheduled_end: newEnd.toISOString(),
        appointment_type: 'reschedule',
        rescheduled_from: originalAppointment.scheduled_start,
        updated_at: new Date().toISOString(),
      })
      .eq('id', originalAppointment.id)
      .select()
      .single()

    if (updateError) {
      return {
        success: false,
        error: 'Failed to update appointment',
      }
    }

    return {
      success: true,
      originalAppointment: originalAppointment as Appointment,
      newAppointment: updatedAppointment as Appointment,
    }
  } catch (error) {
    console.error('[AppointmentService] Reschedule appointment error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// APPOINTMENT LOOKUP
// =============================================================================

/**
 * Find appointments for a specific attendee
 */
export async function findAppointments(params: {
  agentId: string
  attendeeEmail?: string
  attendeeName?: string
  status?: string
  startDate?: string
  endDate?: string
}): Promise<Appointment[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('appointments')
    .select('*')
    .eq('agent_id', params.agentId)

  if (params.attendeeEmail) {
    query = query.eq('attendee_email', params.attendeeEmail)
  }

  if (params.attendeeName) {
    query = query.ilike('attendee_name', `%${params.attendeeName}%`)
  }

  if (params.status) {
    query = query.eq('status', params.status)
  }

  if (params.startDate) {
    query = query.gte('scheduled_start', new Date(params.startDate).toISOString())
  }

  if (params.endDate) {
    query = query.lte('scheduled_start', new Date(params.endDate).toISOString())
  }

  query = query.order('scheduled_start', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('[AppointmentService] Find appointments error:', error)
    return []
  }

  return data as Appointment[]
}

/**
 * Get upcoming appointments for an agent
 */
export async function getUpcomingAppointments(
  agentId: string,
  limit: number = 10
): Promise<Appointment[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('agent_id', agentId)
    .eq('status', 'scheduled')
    .gte('scheduled_start', new Date().toISOString())
    .order('scheduled_start', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[AppointmentService] Get upcoming appointments error:', error)
    return []
  }

  return data as Appointment[]
}

/**
 * Get appointment by ID
 */
export async function getAppointmentById(
  appointmentId: string,
  agentId: string
): Promise<Appointment | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('agent_id', agentId) // Security: ensure agent owns this appointment
    .single()

  if (error) {
    console.error('[AppointmentService] Get appointment error:', error)
    return null
  }

  return data as Appointment
}


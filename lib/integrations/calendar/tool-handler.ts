/**
 * Calendar Tool Handler
 * Processes calendar tool invocations from VAPI webhooks
 */

import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from './appointments'
import {
  checkSlotAvailability,
  getAvailableSlots,
  formatAvailableSlotsForLLM,
} from './availability'
import { getValidAccessToken } from './google-calendar'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CalendarToolName,
  BookAppointmentInput,
  CancelAppointmentInput,
  RescheduleAppointmentInput,
  AgentCalendarConfig,
  GoogleCalendarCredential,
} from './types'
import { isCalendarTool } from './vapi-tools'

// =============================================================================
// TYPES
// =============================================================================

interface ToolCallPayload {
  name: string
  arguments: Record<string, unknown>
}

interface ToolCallResult {
  success: boolean
  result?: string
  error?: string
}

interface CalendarToolContext {
  agentId: string
  conversationId?: string
  callId?: string
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Handle calendar tool execution
 * Called by VAPI webhook when calendar tools are invoked
 */
export async function handleCalendarToolCall(
  toolCall: ToolCallPayload,
  context: CalendarToolContext
): Promise<ToolCallResult> {
  const { name, arguments: args } = toolCall
  const { agentId, conversationId } = context

  if (!isCalendarTool(name)) {
    return {
      success: false,
      error: `Unknown calendar tool: ${name}`,
    }
  }

  console.log(`[CalendarToolHandler] Executing ${name} for agent ${agentId}`)

  try {
    switch (name) {
      case 'book_appointment':
        return await handleBookAppointment(agentId, args, conversationId)

      case 'cancel_appointment':
        return await handleCancelAppointment(agentId, args)

      case 'reschedule_appointment':
        return await handleRescheduleAppointment(agentId, args)

      case 'check_availability':
        return await handleCheckAvailability(agentId, args)

      default:
        return {
          success: false,
          error: `Unsupported calendar tool: ${name}`,
        }
    }
  } catch (error) {
    console.error(`[CalendarToolHandler] Error executing ${name}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An error occurred',
    }
  }
}

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/**
 * Handle book_appointment tool
 */
async function handleBookAppointment(
  agentId: string,
  args: Record<string, unknown>,
  conversationId?: string
): Promise<ToolCallResult> {
  const input: BookAppointmentInput = {
    agentId,
    attendeeName: args.attendee_name as string,
    attendeeEmail: args.attendee_email as string,
    attendeePhone: args.attendee_phone as string | undefined,
    preferredDate: args.preferred_date as string,
    preferredTime: args.preferred_time as string,
    notes: args.notes as string | undefined,
    conversationId,
  }

  // Validate required fields
  if (!input.attendeeName || !input.attendeeEmail || !input.preferredDate || !input.preferredTime) {
    return {
      success: false,
      error: 'Missing required information. Please provide: name, email, preferred date (YYYY-MM-DD), and preferred time (HH:MM)',
    }
  }

  const result = await bookAppointment(input)

  if (!result.success) {
    // If slot not available, provide alternatives
    if (result.alternativeSlots && result.alternativeSlots.length > 0) {
      const calendarConfig = await getAgentCalendarConfig(agentId)
      const timezone = calendarConfig?.timezone || 'UTC'
      
      const alternativesText = formatAvailableSlotsForLLM(
        result.alternativeSlots,
        timezone,
        5
      )
      
      return {
        success: false,
        error: `The requested time slot is not available. Here are some alternative times:\n${alternativesText}\n\nWould you like to book one of these times instead?`,
      }
    }
    
    return {
      success: false,
      error: result.error || 'Failed to book appointment',
    }
  }

  const appointment = result.appointment!
  const startTime = new Date(appointment.scheduled_start).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: appointment.timezone,
  })

  return {
    success: true,
    result: `I've successfully booked your appointment for ${startTime}. A confirmation email has been sent to ${appointment.attendee_email}. You'll also receive reminder emails 24 hours and 1 hour before your appointment.`,
  }
}

/**
 * Handle cancel_appointment tool
 */
async function handleCancelAppointment(
  agentId: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const input: CancelAppointmentInput = {
    agentId,
    attendeeEmail: args.attendee_email as string,
    attendeeName: args.attendee_name as string | undefined,
    appointmentDate: args.appointment_date as string | undefined,
    cancellationReason: args.cancellation_reason as string | undefined,
  }

  // Validate required fields
  if (!input.attendeeEmail) {
    return {
      success: false,
      error: 'I need your email address to look up your appointment. What email did you use when booking?',
    }
  }

  const result = await cancelAppointment(input)

  if (!result.success) {
    if (result.notFound) {
      return {
        success: false,
        error: `I couldn't find an appointment with that email address. Could you please confirm the email you used when booking, or let me know the date of your appointment?`,
      }
    }
    
    return {
      success: false,
      error: result.error || 'Failed to cancel appointment',
    }
  }

  return {
    success: true,
    result: `Your appointment has been successfully cancelled. A cancellation confirmation has been sent to ${input.attendeeEmail}.`,
  }
}

/**
 * Handle reschedule_appointment tool
 */
async function handleRescheduleAppointment(
  agentId: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const input: RescheduleAppointmentInput = {
    agentId,
    attendeeEmail: args.attendee_email as string,
    attendeeName: args.attendee_name as string | undefined,
    currentAppointmentDate: args.current_appointment_date as string | undefined,
    newDate: args.new_date as string,
    newTime: args.new_time as string,
  }

  // Validate required fields
  if (!input.attendeeEmail) {
    return {
      success: false,
      error: 'I need your email address to find your appointment. What email did you use when booking?',
    }
  }

  if (!input.newDate || !input.newTime) {
    return {
      success: false,
      error: 'I need the new date and time you\'d like to reschedule to. What date and time works best for you?',
    }
  }

  const result = await rescheduleAppointment(input)

  if (!result.success) {
    if (result.notFound) {
      return {
        success: false,
        error: `I couldn't find an appointment with that email address. Could you please confirm the email you used when booking?`,
      }
    }

    // If new slot not available, provide alternatives
    if (result.alternativeSlots && result.alternativeSlots.length > 0) {
      const calendarConfig = await getAgentCalendarConfig(agentId)
      const timezone = calendarConfig?.timezone || 'UTC'
      
      const alternativesText = formatAvailableSlotsForLLM(
        result.alternativeSlots,
        timezone,
        5
      )
      
      return {
        success: false,
        error: `The requested time slot is not available. Here are some alternative times:\n${alternativesText}\n\nWould you like to reschedule to one of these times instead?`,
      }
    }
    
    return {
      success: false,
      error: result.error || 'Failed to reschedule appointment',
    }
  }

  const newAppointment = result.newAppointment!
  const newTime = new Date(newAppointment.scheduled_start).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: newAppointment.timezone,
  })

  return {
    success: true,
    result: `Your appointment has been rescheduled to ${newTime}. A confirmation email has been sent to ${newAppointment.attendee_email}.`,
  }
}

/**
 * Handle check_availability tool
 */
async function handleCheckAvailability(
  agentId: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  const date = args.date as string
  const time = args.time as string | undefined

  if (!date) {
    return {
      success: false,
      error: 'Please specify a date to check availability for.',
    }
  }

  // Get agent calendar config
  const calendarConfig = await getAgentCalendarConfig(agentId)

  if (!calendarConfig) {
    return {
      success: false,
      error: 'Calendar is not configured for this agent.',
    }
  }

  // Get access token
  const tokenResult = await getValidAccessToken(
    calendarConfig.google_calendar_credentials,
    async (newToken, expiry) => {
      const supabase = createAdminClient()
      await supabase
        .from('google_calendar_credentials')
        .update({
          access_token: newToken,
          token_expiry: expiry.toISOString(),
          last_used_at: new Date().toISOString(),
        })
        .eq('id', calendarConfig.google_credential_id)
    }
  )

  if (!tokenResult.success || !tokenResult.data) {
    return {
      success: false,
      error: 'Failed to connect to calendar. Please try again.',
    }
  }

  const accessToken = tokenResult.data

  // Check specific time or get all slots
  if (time) {
    const slotCheck = await checkSlotAvailability(accessToken, calendarConfig, date, time)
    
    if (slotCheck.available) {
      return {
        success: true,
        result: `The ${time} slot on ${date} is available. Would you like me to book that for you?`,
      }
    } else {
      const alternativesText = slotCheck.alternativeSlots
        ? formatAvailableSlotsForLLM(slotCheck.alternativeSlots, calendarConfig.timezone, 5)
        : 'No alternative slots available.'
      
      return {
        success: true,
        result: `The ${time} slot on ${date} is not available. ${slotCheck.reason || ''}\n\nHere are some available times:\n${alternativesText}`,
      }
    }
  } else {
    // Get all available slots for the day
    const availability = await getAvailableSlots(accessToken, calendarConfig, date)
    const availableSlots = availability.slots.filter((s) => s.available)

    if (availableSlots.length === 0) {
      return {
        success: true,
        result: `Unfortunately, there are no available slots on ${date}. Our available days are: ${calendarConfig.preferred_days.join(', ')}. Would you like to check another date?`,
      }
    }

    const slotsText = formatAvailableSlotsForLLM(availableSlots, calendarConfig.timezone, 10)
    
    return {
      success: true,
      result: `Here are the available appointment times on ${date}:\n${slotsText}\n\nWhich time would you prefer?`,
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get agent calendar configuration with credentials
 */
async function getAgentCalendarConfig(agentId: string): Promise<
  | (AgentCalendarConfig & { google_calendar_credentials: GoogleCalendarCredential })
  | null
> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('agent_calendar_configs')
    .select('*, google_calendar_credentials:google_calendar_credentials(*)')
    .eq('agent_id', agentId)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return null
  }

  return data as AgentCalendarConfig & { google_calendar_credentials: GoogleCalendarCredential }
}

/**
 * Check if agent has calendar configured
 */
export async function isCalendarConfigured(agentId: string): Promise<boolean> {
  const config = await getAgentCalendarConfig(agentId)
  return !!config
}


/**
 * Calendar Integration - Type Definitions
 * Types for Google Calendar integration with VAPI agents
 */

// =============================================================================
// DATABASE TYPES
// =============================================================================

export type AppointmentStatus = 'scheduled' | 'cancelled' | 'rescheduled' | 'completed' | 'no_show'
export type AppointmentType = 'book' | 'reschedule' | 'cancel'
export type CalendarToolName = 'book_appointment' | 'cancel_appointment' | 'reschedule_appointment' | 'check_availability'

export interface GoogleCalendarCredential {
  id: string
  partner_id: string
  client_id: string
  client_secret: string
  refresh_token?: string | null
  access_token?: string | null
  token_expiry?: Date | null
  scopes: string[]
  is_active: boolean
  last_used_at?: Date | null
  last_error?: string | null
  created_by?: string | null
  created_at: Date
  updated_at: Date
}

export interface ReminderSetting {
  id: string
  value: number
  unit: 'minutes' | 'hours' | 'days'
}

export interface AgentCalendarConfig {
  id: string
  agent_id: string
  workspace_id: string
  google_credential_id: string
  calendar_id: string
  timezone: string
  slot_duration_minutes: number
  buffer_between_slots_minutes: number
  preferred_days: string[]
  preferred_hours_start: string
  preferred_hours_end: string
  min_notice_hours: number
  max_advance_days: number
  // Legacy fields (kept for backwards compatibility with existing data)
  send_24h_reminder?: boolean
  send_1h_reminder?: boolean
  reminder_email_template?: string | null
  enable_owner_email?: boolean
  owner_email?: string | null
  enable_reminders?: boolean
  reminders?: ReminderSetting[]
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface Appointment {
  id: string
  agent_id: string
  workspace_id: string
  calendar_config_id: string
  conversation_id?: string | null
  google_event_id?: string | null
  calendar_id: string
  attendee_name: string
  attendee_email: string
  attendee_phone?: string | null
  appointment_type: AppointmentType
  status: AppointmentStatus
  scheduled_start: Date
  scheduled_end: Date
  timezone: string
  duration_minutes: number
  original_appointment_id?: string | null
  rescheduled_from?: Date | null
  rescheduled_to?: Date | null
  cancelled_at?: Date | null
  cancellation_reason?: string | null
  reminder_24h_sent: boolean
  reminder_24h_sent_at?: Date | null
  reminder_1h_sent: boolean
  reminder_1h_sent_at?: Date | null
  notes?: string | null
  custom_fields: Record<string, unknown>
  extracted_from_transcript: boolean
  created_at: Date
  updated_at: Date
}

// =============================================================================
// GOOGLE CALENDAR API TYPES
// =============================================================================

export interface GoogleCalendarEvent {
  id: string
  summary?: string
  description?: string
  start: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: string
  }>
  status?: string
  htmlLink?: string
  created?: string
  updated?: string
}

export interface GoogleCalendarEventInput {
  summary: string
  description?: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
  }>
  reminders?: {
    useDefault: boolean
    overrides?: Array<{
      method: 'email' | 'popup'
      minutes: number
    }>
  }
  conferenceData?: {
    createRequest?: {
      requestId: string
    }
  }
  guestsCanSeeOtherGuests?: boolean
  guestsCanInviteOthers?: boolean
  guestsCanModify?: boolean
}

export interface GoogleCalendarList {
  kind: string
  etag: string
  nextSyncToken?: string
  items: Array<{
    id: string
    summary: string
    description?: string
    timeZone?: string
    accessRole: string
    primary?: boolean
  }>
}

// =============================================================================
// AVAILABILITY TYPES
// =============================================================================

export interface TimeSlot {
  start: Date
  end: Date
  available: boolean
}

export interface AvailabilityRequest {
  date: string // YYYY-MM-DD
  timezone: string
  agentId: string
}

export interface AvailabilityResponse {
  date: string
  timezone: string
  slots: TimeSlot[]
  preferredSlots: TimeSlot[] // Slots within preferred hours
}

export interface SlotCheckRequest {
  date: string // YYYY-MM-DD
  time: string // HH:MM
  timezone: string
  agentId: string
}

export interface SlotCheckResponse {
  available: boolean
  requestedSlot: TimeSlot
  alternativeSlots?: TimeSlot[]
  reason?: string
}

// =============================================================================
// APPOINTMENT OPERATION TYPES
// =============================================================================

export interface BookAppointmentInput {
  agentId: string
  attendeeName: string
  attendeeEmail: string
  attendeePhone?: string
  preferredDate: string // YYYY-MM-DD
  preferredTime: string // HH:MM
  notes?: string
  conversationId?: string
  customFields?: Record<string, unknown>
}

export interface BookAppointmentResult {
  success: boolean
  appointment?: Appointment
  googleEvent?: GoogleCalendarEvent
  error?: string
  alternativeSlots?: TimeSlot[]
}

export interface CancelAppointmentInput {
  agentId: string
  attendeeEmail: string
  attendeeName?: string
  appointmentDate?: string // YYYY-MM-DD
  cancellationReason?: string
}

export interface CancelAppointmentResult {
  success: boolean
  appointment?: Appointment
  error?: string
  notFound?: boolean
}

export interface RescheduleAppointmentInput {
  agentId: string
  attendeeEmail: string
  attendeeName?: string
  currentAppointmentDate?: string // YYYY-MM-DD
  newDate: string // YYYY-MM-DD
  newTime: string // HH:MM
}

export interface RescheduleAppointmentResult {
  success: boolean
  originalAppointment?: Appointment
  newAppointment?: Appointment
  googleEvent?: GoogleCalendarEvent
  error?: string
  notFound?: boolean
  alternativeSlots?: TimeSlot[]
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface CalendarConfigInput {
  calendarId: string
  timezone: string
  slotDurationMinutes?: number
  bufferBetweenSlotsMinutes?: number
  preferredDays?: string[]
  preferredHoursStart?: string
  preferredHoursEnd?: string
  minNoticeHours?: number
  maxAdvanceDays?: number
  send24hReminder?: boolean
  send1hReminder?: boolean
  reminderEmailTemplate?: string
  // New settings
  enableOwnerEmail?: boolean
  ownerEmail?: string
  enableReminders?: boolean
  reminders?: ReminderSetting[]
}

export interface GoogleCredentialInput {
  clientId: string
  clientSecret: string
  refreshToken?: string
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface CalendarServiceResult<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
}


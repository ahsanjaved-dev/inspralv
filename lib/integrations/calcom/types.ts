/**
 * Cal.com Integration Types
 * Types for Cal.com API v2 integration
 */

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface CalcomApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  statusCode?: number
}

// =============================================================================
// AVAILABILITY TYPES
// =============================================================================

/**
 * Cal.com available slot from API v2
 */
export interface CalcomSlot {
  time: string // ISO 8601 format (UTC)
}

/**
 * Cal.com slots response
 */
export interface CalcomSlotsResponse {
  slots: Record<string, CalcomSlot[]> // Date -> slots mapping
}

/**
 * Formatted slot for display
 */
export interface FormattedSlot {
  date: string // YYYY-MM-DD
  time: string // HH:MM (in target timezone)
  datetime: string // ISO 8601
  displayTime: string // Human-readable time
}

// =============================================================================
// BOOKING TYPES
// =============================================================================

/**
 * Cal.com attendee for booking
 */
export interface CalcomAttendee {
  name: string
  email: string
  timeZone: string
  language?: string
}

/**
 * Cal.com booking location
 */
export interface CalcomLocation {
  type: "phone" | "integrations:google:meet" | "integrations:zoom" | "link" | "inPerson"
  value?: string
}

/**
 * Cal.com booking request (API v2)
 */
export interface CalcomBookingRequest {
  eventTypeId: number
  start: string // ISO 8601 UTC format
  attendee: CalcomAttendee
  location?: CalcomLocation
  metadata?: Record<string, unknown>
  responses?: Record<string, string | number | boolean>
}

/**
 * Cal.com booking response
 */
export interface CalcomBookingResponse {
  id: number
  uid: string
  title: string
  description?: string
  startTime: string
  endTime: string
  status: "ACCEPTED" | "PENDING" | "CANCELLED" | "REJECTED"
  attendees: Array<{
    id: number
    email: string
    name: string
    timeZone: string
  }>
  user?: {
    id: number
    email: string
    name: string
  }
  location?: string
  meetingUrl?: string
}

// =============================================================================
// TOOL CONFIGURATION TYPES
// =============================================================================

/**
 * Cal.com custom field definition
 */
export interface CalcomCustomField {
  name: string
  type: "text" | "email" | "phone" | "number" | "textarea" | "select"
  label: string
  required: boolean
  options?: string[]
}

/**
 * Cal.com tool configuration stored in FunctionTool
 */
export interface CalcomToolConfig {
  event_type_id: number
  timezone?: string
  custom_fields?: CalcomCustomField[]
}

// =============================================================================
// TOOL HANDLER TYPES
// =============================================================================

/**
 * Context for Cal.com tool execution
 */
export interface CalcomToolContext {
  workspaceId: string
  agentId: string
  callId?: string
  conversationId?: string
}

/**
 * Result from Cal.com tool execution
 */
export interface CalcomToolResult {
  success: boolean
  result?: string
  error?: string
  data?: unknown
}

/**
 * Check availability input
 */
export interface CheckAvailabilityInput {
  eventTypeId: number
  startDate: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD (defaults to startDate)
  timezone: string
}

/**
 * Book appointment input
 */
export interface BookAppointmentInput {
  eventTypeId: number
  startTime: string // ISO 8601 or "YYYY-MM-DD HH:MM"
  attendeeName: string
  attendeeEmail: string
  attendeePhone?: string
  timezone: string
  notes?: string
  metadata?: Record<string, unknown>
}


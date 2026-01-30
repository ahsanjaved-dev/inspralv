/**
 * Calendar Integration Module
 * Main entry point for calendar functionality
 */

// Types
export * from './types'

// Encryption utilities
export { encrypt, decrypt, encryptCredentials, decryptCredentials } from './encryption'

// Google Calendar API operations
export {
  GOOGLE_CALENDAR_SCOPES,
  refreshAccessToken,
  getValidAccessToken,
  listCalendars,
  createCalendar,
  deleteCalendar,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  buildCalendarEvent,
  parseEventDateTime,
  reminderToMinutes,
} from './google-calendar'

// Availability checking
export {
  getAvailableSlots,
  checkSlotAvailability,
  getAvailableSlotsMultipleDays,
  findNextAvailableSlot,
  formatTimeSlot,
  formatDate,
  formatAvailableSlotsForLLM,
} from './availability'

// Appointment operations
export {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  findAppointments,
  getUpcomingAppointments,
  getAppointmentById,
} from './appointments'

// VAPI Tool definitions
export {
  BOOK_APPOINTMENT_TOOL,
  CANCEL_APPOINTMENT_TOOL,
  RESCHEDULE_APPOINTMENT_TOOL,
  CHECK_AVAILABILITY_TOOL,
  CALENDAR_TOOLS,
  CALENDAR_TOOL_NAMES,
  isCalendarTool,
  getCalendarToolByName,
  calendarToolToVapiFormat,
  generateVapiCalendarTools,
} from './vapi-tools'
export type { CalendarToolName } from './vapi-tools'

// Tool handler
export { handleCalendarToolCall, isCalendarConfigured } from './tool-handler'

// Agent calendar setup helper
export { setupAgentCalendar } from './setup-agent-calendar'
export type { SetupAgentCalendarParams, SetupAgentCalendarResult } from './setup-agent-calendar'

// Transcript extraction
export {
  extractAppointmentDetails,
  processTranscriptForAppointments,
  linkAppointmentToConversation,
} from './transcript-extraction'
export type { ExtractedAppointmentDetails } from './transcript-extraction'

// Note: Email reminders are handled automatically by Google Calendar
// See lib/integrations/calendar/reminders.ts for details


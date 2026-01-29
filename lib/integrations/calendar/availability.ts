/**
 * Calendar Availability Service
 * Handles slot availability checking and time slot management
 */

import { getEvents, parseEventDateTime } from './google-calendar'
import type {
  TimeSlot,
  AvailabilityResponse,
  SlotCheckResponse,
  AgentCalendarConfig,
  GoogleCalendarEvent,
} from './types'

// =============================================================================
// CONSTANTS
// =============================================================================

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const

// =============================================================================
// AVAILABILITY CHECKING
// =============================================================================

/**
 * Get available time slots for a specific date
 */
export async function getAvailableSlots(
  accessToken: string,
  config: AgentCalendarConfig,
  date: string // YYYY-MM-DD
): Promise<AvailabilityResponse> {
  const timezone = config.timezone
  const dateObj = new Date(date + 'T00:00:00')
  const dayOfWeek = DAYS_OF_WEEK[dateObj.getDay()]!

  // Check if this day is in preferred days
  const isPreferredDay = config.preferred_days.includes(dayOfWeek)

  // Parse preferred hours
  const [prefStartHour, prefStartMin] = parseTime(config.preferred_hours_start)
  const [prefEndHour, prefEndMin] = parseTime(config.preferred_hours_end)

  // Create time range for the day
  const dayStart = new Date(date + 'T00:00:00')
  const dayEnd = new Date(date + 'T23:59:59')

  // Fetch existing events for this day
  const eventsResult = await getEvents(accessToken, config.calendar_id, {
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  const existingEvents = eventsResult.success ? eventsResult.data || [] : []

  // Generate all possible slots
  const allSlots: TimeSlot[] = []
  const preferredSlots: TimeSlot[] = []

  // Start from preferred hours start or beginning of day
  let currentTime = new Date(date)
  currentTime.setHours(prefStartHour, prefStartMin, 0, 0)

  const endOfPreferred = new Date(date)
  endOfPreferred.setHours(prefEndHour, prefEndMin, 0, 0)

  // Generate slots within preferred hours
  while (currentTime < endOfPreferred) {
    const slotEnd = new Date(currentTime.getTime() + config.slot_duration_minutes * 60 * 1000)
    
    // Check if slot exceeds preferred end time
    if (slotEnd > endOfPreferred) break

    const isAvailable = !isSlotBooked(currentTime, slotEnd, existingEvents)
    const isMinNoticeOk = checkMinNotice(currentTime, config.min_notice_hours)
    
    const slot: TimeSlot = {
      start: new Date(currentTime),
      end: slotEnd,
      available: isAvailable && isMinNoticeOk,
    }

    allSlots.push(slot)
    
    if (isPreferredDay) {
      preferredSlots.push(slot)
    }

    // Move to next slot (including buffer)
    currentTime = new Date(slotEnd.getTime() + config.buffer_between_slots_minutes * 60 * 1000)
  }

  return {
    date,
    timezone,
    slots: allSlots,
    preferredSlots,
  }
}

/**
 * Check if a specific time slot is available
 */
export async function checkSlotAvailability(
  accessToken: string,
  config: AgentCalendarConfig,
  date: string, // YYYY-MM-DD
  time: string  // HH:MM
): Promise<SlotCheckResponse> {
  const timezone = config.timezone
  
  // Parse requested time
  const [reqHour, reqMin] = parseTime(time)
  const slotStart = new Date(date)
  slotStart.setHours(reqHour, reqMin, 0, 0)
  
  const slotEnd = new Date(slotStart.getTime() + config.slot_duration_minutes * 60 * 1000)

  // Validate against min notice
  if (!checkMinNotice(slotStart, config.min_notice_hours)) {
    // Get alternative slots
    const availability = await getAvailableSlots(accessToken, config, date)
    const alternativeSlots = availability.slots.filter(s => s.available).slice(0, 5)

    return {
      available: false,
      requestedSlot: { start: slotStart, end: slotEnd, available: false },
      alternativeSlots,
      reason: `Appointments must be booked at least ${config.min_notice_hours} hours in advance`,
    }
  }

  // Validate against max advance days
  const maxAdvanceDate = new Date()
  maxAdvanceDate.setDate(maxAdvanceDate.getDate() + config.max_advance_days)
  
  if (slotStart > maxAdvanceDate) {
    return {
      available: false,
      requestedSlot: { start: slotStart, end: slotEnd, available: false },
      reason: `Appointments cannot be booked more than ${config.max_advance_days} days in advance`,
    }
  }

  // Check preferred days
  const dayOfWeek = DAYS_OF_WEEK[slotStart.getDay()]!
  if (!config.preferred_days.includes(dayOfWeek)) {
    const availability = await getAvailableSlots(accessToken, config, date)
    const alternativeSlots = availability.preferredSlots.filter(s => s.available).slice(0, 5)

    return {
      available: false,
      requestedSlot: { start: slotStart, end: slotEnd, available: false },
      alternativeSlots,
      reason: `Appointments are only available on: ${config.preferred_days.join(', ')}`,
    }
  }

  // Check preferred hours
  const [prefStartHour, prefStartMin] = parseTime(config.preferred_hours_start)
  const [prefEndHour, prefEndMin] = parseTime(config.preferred_hours_end)
  
  const prefStart = new Date(slotStart)
  prefStart.setHours(prefStartHour, prefStartMin, 0, 0)
  
  const prefEnd = new Date(slotStart)
  prefEnd.setHours(prefEndHour, prefEndMin, 0, 0)

  if (slotStart < prefStart || slotEnd > prefEnd) {
    const availability = await getAvailableSlots(accessToken, config, date)
    const alternativeSlots = availability.preferredSlots.filter(s => s.available).slice(0, 5)

    return {
      available: false,
      requestedSlot: { start: slotStart, end: slotEnd, available: false },
      alternativeSlots,
      reason: `Appointments are only available between ${config.preferred_hours_start} and ${config.preferred_hours_end}`,
    }
  }

  // Check for conflicts with existing events
  const dayStart = new Date(date + 'T00:00:00')
  const dayEnd = new Date(date + 'T23:59:59')

  const eventsResult = await getEvents(accessToken, config.calendar_id, {
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
  })

  const existingEvents = eventsResult.success ? eventsResult.data || [] : []

  if (isSlotBooked(slotStart, slotEnd, existingEvents)) {
    // Slot is booked - find alternatives
    const availability = await getAvailableSlots(accessToken, config, date)
    const alternativeSlots = availability.slots.filter(s => s.available).slice(0, 5)

    return {
      available: false,
      requestedSlot: { start: slotStart, end: slotEnd, available: false },
      alternativeSlots,
      reason: 'The requested time slot is already booked',
    }
  }

  // Slot is available
  return {
    available: true,
    requestedSlot: { start: slotStart, end: slotEnd, available: true },
  }
}

/**
 * Get available slots for multiple days
 */
export async function getAvailableSlotsMultipleDays(
  accessToken: string,
  config: AgentCalendarConfig,
  startDate: string, // YYYY-MM-DD
  numDays: number = 7
): Promise<Map<string, TimeSlot[]>> {
  const results = new Map<string, TimeSlot[]>()
  
  const start = new Date(startDate)
  
  for (let i = 0; i < numDays; i++) {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    
    // Skip days not in preferred days
    const dayOfWeek = DAYS_OF_WEEK[date.getDay()]!
    if (!config.preferred_days.includes(dayOfWeek)) {
      continue
    }

    // Skip days beyond max advance
    const maxAdvanceDate = new Date()
    maxAdvanceDate.setDate(maxAdvanceDate.getDate() + config.max_advance_days)
    if (date > maxAdvanceDate) {
      break
    }

    const dateStr = date.toISOString().split('T')[0]!
    const availability = await getAvailableSlots(accessToken, config, dateStr)
    
    const availableSlots = availability.slots.filter(s => s.available)
    if (availableSlots.length > 0) {
      results.set(dateStr, availableSlots)
    }
  }

  return results
}

/**
 * Find the next available slot starting from a given date
 */
export async function findNextAvailableSlot(
  accessToken: string,
  config: AgentCalendarConfig,
  startDate?: string // YYYY-MM-DD, defaults to today
): Promise<TimeSlot | null> {
  const start = startDate ? new Date(startDate) : new Date()
  
  // Look ahead up to max_advance_days
  for (let i = 0; i < config.max_advance_days; i++) {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    
    // Skip days not in preferred days
    const dayOfWeek = DAYS_OF_WEEK[date.getDay()]!
    if (!config.preferred_days.includes(dayOfWeek)) {
      continue
    }

    const dateStr = date.toISOString().split('T')[0]!
    const availability = await getAvailableSlots(accessToken, config, dateStr)
    
    const firstAvailable = availability.slots.find(s => s.available)
    if (firstAvailable) {
      return firstAvailable
    }
  }

  return null
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse time string (HH:MM) into hours and minutes
 */
function parseTime(timeStr: string): [number, number] {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return [hours || 0, minutes || 0]
}

/**
 * Check if a slot overlaps with any existing events
 */
function isSlotBooked(
  slotStart: Date,
  slotEnd: Date,
  events: GoogleCalendarEvent[]
): boolean {
  for (const event of events) {
    // Skip cancelled events
    if (event.status === 'cancelled') continue

    const { start: eventStart, end: eventEnd } = parseEventDateTime(event)
    
    if (!eventStart || !eventEnd) continue

    // Check for overlap
    // Slot overlaps if: slotStart < eventEnd AND slotEnd > eventStart
    if (slotStart < eventEnd && slotEnd > eventStart) {
      return true
    }
  }

  return false
}

/**
 * Check if slot meets minimum notice requirement
 */
function checkMinNotice(slotStart: Date, minNoticeHours: number): boolean {
  const now = new Date()
  const minTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000)
  return slotStart >= minTime
}

/**
 * Format time slot for display
 */
export function formatTimeSlot(slot: TimeSlot, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    hour12: true,
  }
  
  const startStr = slot.start.toLocaleTimeString('en-US', options)
  const endStr = slot.end.toLocaleTimeString('en-US', options)
  
  return `${startStr} - ${endStr}`
}

/**
 * Format date for display
 */
export function formatDate(date: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }
  
  return date.toLocaleDateString('en-US', options)
}

/**
 * Format available slots for LLM response
 */
export function formatAvailableSlotsForLLM(
  slots: TimeSlot[],
  timezone: string,
  maxSlots: number = 5
): string {
  if (slots.length === 0) {
    return 'No available time slots found.'
  }

  const limitedSlots = slots.slice(0, maxSlots)
  const formatted = limitedSlots.map(slot => {
    const dateStr = formatDate(slot.start, timezone)
    const timeStr = formatTimeSlot(slot, timezone)
    return `- ${dateStr} at ${timeStr}`
  })

  return formatted.join('\n')
}


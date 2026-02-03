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
// HELPERS
// =============================================================================

/**
 * Get timezone offset in minutes for a given timezone
 * Returns the offset to ADD to UTC to get local time
 */
function getTimezoneOffsetMinutes(timezone: string): number {
  const now = new Date()
  // Get the time in UTC
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  // Get the time in target timezone  
  const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  // Difference in minutes
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60)
}

/**
 * Create a Date object for a specific date/time in a specific timezone
 * This ensures the Date represents the correct moment in time
 */
function createDateInTimezone(
  dateStr: string, // YYYY-MM-DD
  hour: number,
  minute: number,
  timezone: string
): Date {
  // Create a date string in ISO format with the target timezone
  // We'll create it as if it's in UTC, then adjust for timezone
  const dateParts = dateStr.split('-').map(Number)
  const year = dateParts[0] ?? 2000
  const month = dateParts[1] ?? 1
  const day = dateParts[2] ?? 1
  
  // Create a date object using the date formatter approach
  // This is the most reliable way to handle timezones in vanilla JS
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  
  // Start with a rough guess - create date in local time
  const roughDate = new Date(year, month - 1, day, hour, minute, 0, 0)
  
  // Get what this date looks like in the target timezone
  const parts = formatter.formatToParts(roughDate)
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0')
  
  const tzHour = getPart('hour')
  const tzMinute = getPart('minute')
  const tzDay = getPart('day')
  
  // Calculate the difference and adjust
  const hourDiff = hour - tzHour
  const minuteDiff = minute - tzMinute
  const dayDiff = day - tzDay
  
  // Adjust the rough date by the differences
  const adjusted = new Date(roughDate)
  adjusted.setDate(adjusted.getDate() + dayDiff)
  adjusted.setHours(adjusted.getHours() + hourDiff)
  adjusted.setMinutes(adjusted.getMinutes() + minuteDiff)
  
  return adjusted
}

/**
 * Create start and end of day for a date string in a specific timezone
 */
function getDayBoundsInTimezone(date: string, timezone: string): { dayStart: Date; dayEnd: Date } {
  return {
    dayStart: createDateInTimezone(date, 0, 0, timezone),
    dayEnd: createDateInTimezone(date, 23, 59, timezone),
  }
}

// Legacy helpers for backwards compatibility
function parseDateString(date: string): { year: number; month: number; day: number } {
  const parts = date.split('-').map(Number)
  const year = parts[0] ?? 2000
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  return { year, month: month - 1, day }
}

function createLocalDate(date: string, hour = 0, minute = 0): Date {
  const { year, month, day } = parseDateString(date)
  return new Date(year, month, day, hour, minute, 0, 0)
}

function getDayBounds(date: string): { dayStart: Date; dayEnd: Date } {
  const { year, month, day } = parseDateString(date)
  return {
    dayStart: new Date(year, month, day, 0, 0, 0, 0),
    dayEnd: new Date(year, month, day, 23, 59, 59, 999),
  }
}

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
  
  // Parse date in the config timezone
  const dateObj = createDateInTimezone(date, 12, 0, timezone) // noon to avoid day boundary issues
  const dayOfWeek = DAYS_OF_WEEK[dateObj.getDay()]!

  // Check if this day is in preferred days
  const isPreferredDay = config.preferred_days.includes(dayOfWeek)

  // Parse preferred hours
  const [prefStartHour, prefStartMin] = parseTime(config.preferred_hours_start)
  const [prefEndHour, prefEndMin] = parseTime(config.preferred_hours_end)

  // Create time range for the day (in config timezone)
  const { dayStart, dayEnd } = getDayBoundsInTimezone(date, timezone)

  // Fetch existing events for this day
  const eventsResult = await getEvents(accessToken, config.calendar_id, {
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  const existingEvents = eventsResult.success ? eventsResult.data || [] : []

  // Generate all possible slots (in config timezone)
  const allSlots: TimeSlot[] = []
  const preferredSlots: TimeSlot[] = []

  // Start from preferred hours start (in config timezone)
  let currentTime = createDateInTimezone(date, prefStartHour, prefStartMin, timezone)
  const endOfPreferred = createDateInTimezone(date, prefEndHour, prefEndMin, timezone)

  // Generate slots within preferred hours
  while (currentTime < endOfPreferred) {
    const slotEnd = new Date(currentTime.getTime() + config.slot_duration_minutes * 60 * 1000)
    
    // Check if slot exceeds preferred end time
    if (slotEnd > endOfPreferred) break

    const isAvailable = !isSlotBooked(currentTime, slotEnd, existingEvents)
    // Skip min notice check if min_notice_hours is 0
    const isMinNoticeOk = config.min_notice_hours === 0 || checkMinNotice(currentTime, config.min_notice_hours)
    
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
  
  // Parse requested time and create slot start/end in config timezone
  const [reqHour, reqMin] = parseTime(time)
  const slotStart = createDateInTimezone(date, reqHour, reqMin, timezone)
  const slotEnd = new Date(slotStart.getTime() + config.slot_duration_minutes * 60 * 1000)

  // Check if date is in the past (more than 1 hour ago to avoid timezone edge cases)
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  if (slotStart < oneHourAgo) {
    return {
      available: false,
      requestedSlot: { start: slotStart, end: slotEnd, available: false },
      reason: `The requested date ${date} is in the past. Please provide a future date.`,
    }
  }

  // Validate against min notice (only if min_notice_hours > 0)
  if (config.min_notice_hours > 0 && !checkMinNotice(slotStart, config.min_notice_hours)) {
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

  // Check preferred hours (must use timezone-aware comparison)
  const [prefStartHour, prefStartMin] = parseTime(config.preferred_hours_start)
  const [prefEndHour, prefEndMin] = parseTime(config.preferred_hours_end)
  
  // Create preferred time bounds in the agent's timezone
  const prefStart = createDateInTimezone(date, prefStartHour, prefStartMin, timezone)
  const prefEnd = createDateInTimezone(date, prefEndHour, prefEndMin, timezone)

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
  const { dayStart, dayEnd } = getDayBoundsInTimezone(date, timezone)

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


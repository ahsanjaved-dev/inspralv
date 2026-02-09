/**
 * Cal.com Tool Handler
 * Processes Cal.com tool invocations from VAPI webhooks
 */

import { getWorkspaceCalcomIntegration } from "./index"
import { getAvailableSlots, formatSlotsForLLM, formatAvailableSlotsText } from "./api/availability"
import { createBooking, formatBookingConfirmation, parseTimeString, formatTime24 } from "./api/booking"
import { isCalcomTool, type CalcomToolName } from "./tool-definitions"
import type {
  CalcomToolContext,
  CalcomToolResult,
  CalcomBookingRequest,
} from "./types"

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Handle Cal.com tool execution
 * Called by VAPI webhook when Cal.com tools are invoked
 */
export async function handleCalcomToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: CalcomToolContext
): Promise<CalcomToolResult> {
  const { workspaceId } = context

  if (!isCalcomTool(toolName)) {
    return {
      success: false,
      error: `Unknown Cal.com tool: ${toolName}`,
    }
  }

  console.log(`[CalcomToolHandler] Executing ${toolName} for workspace ${workspaceId}`)

  // Get Cal.com integration for workspace
  const integration = await getWorkspaceCalcomIntegration(workspaceId)
  if (!integration) {
    return {
      success: false,
      error: "Cal.com is not configured for this workspace. Please connect your Cal.com account in Settings > Integrations.",
    }
  }

  const apiKey = integration.api_keys?.default_secret_key
  if (!apiKey) {
    return {
      success: false,
      error: "Cal.com API key not found. Please reconnect your Cal.com account.",
    }
  }

  // Get event type ID and timezone from tool config in args (passed from agent config)
  const eventTypeId = args._event_type_id as number | undefined
  const timezone = (args._timezone as string) || "UTC"

  if (!eventTypeId) {
    return {
      success: false,
      error: "Event type not configured for this Cal.com tool. Please configure the event type ID in agent settings.",
    }
  }

  try {
    switch (toolName as CalcomToolName) {
      case "calcom_check_availability":
        return await handleCheckAvailability(apiKey, eventTypeId, timezone, args)

      case "calcom_book_appointment":
        return await handleBookAppointment(apiKey, eventTypeId, timezone, args)

      default:
        return {
          success: false,
          error: `Unsupported Cal.com tool: ${toolName}`,
        }
    }
  } catch (error) {
    console.error(`[CalcomToolHandler] Error executing ${toolName}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    }
  }
}

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/**
 * Get today's date info for validation
 */
function getTodayInfo(): { isoDate: string; formatted: string; year: number } {
  const now = new Date()
  return {
    isoDate: now.toISOString().split("T")[0]!,
    formatted: now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    year: now.getFullYear(),
  }
}

/**
 * Auto-correct date if the year is in the past
 */
function autoCorrectDateYear(dateStr: string): { corrected: string; wasCorrected: boolean } {
  const { isoDate: today, year: currentYear } = getTodayInfo()

  const parts = dateStr.split("-").map(Number)
  const providedYear = parts[0] ?? currentYear
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1

  // If year is in the past, correct it
  if (providedYear < currentYear) {
    let correctedDate = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

    // If corrected date is still in the past, use next year
    if (correctedDate < today) {
      correctedDate = `${currentYear + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }

    console.log(`[CalcomToolHandler] Auto-corrected date year: ${dateStr} → ${correctedDate}`)
    return { corrected: correctedDate, wasCorrected: true }
  }

  // If year is current but date is in the past, assume next year
  const inputDate = `${providedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  if (providedYear === currentYear && inputDate < today) {
    const correctedDate = `${currentYear + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    console.log(`[CalcomToolHandler] Date in past for current year, using next year: ${dateStr} → ${correctedDate}`)
    return { corrected: correctedDate, wasCorrected: true }
  }

  return { corrected: dateStr, wasCorrected: false }
}

/**
 * Check if date is in the past
 */
function isDateInPast(dateStr: string): boolean {
  const today = new Date().toISOString().split("T")[0]!
  return dateStr < today
}

/**
 * Handle calcom_check_availability tool
 */
async function handleCheckAvailability(
  apiKey: string,
  eventTypeId: number,
  timezone: string,
  args: Record<string, unknown>
): Promise<CalcomToolResult> {
  let date = args.date as string
  const endDate = (args.end_date as string) || date

  if (!date) {
    const { isoDate: today, formatted: todayFormatted } = getTodayInfo()
    return {
      success: false,
      error: `I need to know which date you'd like to check. Today is ${todayFormatted} (${today}). What date works for you?`,
    }
  }

  // Auto-correct year if needed
  const { corrected: correctedDate } = autoCorrectDateYear(date)
  date = correctedDate

  const { corrected: correctedEndDate } = autoCorrectDateYear(endDate)
  const finalEndDate = correctedEndDate

  // Validate date is not in the past
  const { isoDate: today, formatted: todayFormatted } = getTodayInfo()
  if (isDateInPast(date)) {
    return {
      success: false,
      error: `I can't check availability for past dates. ${date} has already passed. Today is ${todayFormatted}. Would you like to check a future date?`,
    }
  }

  // Fetch available slots from Cal.com
  const result = await getAvailableSlots(apiKey, eventTypeId, date, finalEndDate, timezone)

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || "Unable to check availability at this time. Please try again.",
    }
  }

  // Format slots for display
  const slots = formatSlotsForLLM(result.data, timezone, 15)

  if (slots.length === 0) {
    return {
      success: true,
      result: `I checked ${date} but unfortunately there are no available time slots. Would you like me to check a different date?`,
    }
  }

  const slotsText = formatAvailableSlotsText(slots, timezone)

  return {
    success: true,
    result: `Here are the available appointment times:\n${slotsText}\n\nWhich time would work best for you?`,
    data: slots,
  }
}

/**
 * Handle calcom_book_appointment tool
 */
async function handleBookAppointment(
  apiKey: string,
  eventTypeId: number,
  timezone: string,
  args: Record<string, unknown>
): Promise<CalcomToolResult> {
  const attendeeName = args.attendee_name as string
  const attendeeEmail = args.attendee_email as string
  const attendeePhone = args.attendee_phone as string | undefined
  let preferredDate = args.preferred_date as string
  const preferredTime = args.preferred_time as string
  const notes = args.notes as string | undefined

  // Validate required fields
  if (!attendeeName) {
    return {
      success: false,
      error: "I need your name to complete the booking. What name should I use for the appointment?",
    }
  }

  if (!attendeeEmail) {
    return {
      success: false,
      error: "I need your email address to send the confirmation. What email should I use?",
    }
  }

  if (!preferredDate || !preferredTime) {
    const { formatted: todayFormatted } = getTodayInfo()
    return {
      success: false,
      error: `I need both a date and time for your appointment. Today is ${todayFormatted}. When would you like to schedule?`,
    }
  }

  // Auto-correct year if needed
  const { corrected: correctedDate, wasCorrected } = autoCorrectDateYear(preferredDate)
  preferredDate = correctedDate

  // Validate date is not in the past
  const { isoDate: today, formatted: todayFormatted } = getTodayInfo()
  if (isDateInPast(preferredDate)) {
    return {
      success: false,
      error: `I can't book appointments in the past. ${preferredDate} has already passed. Today is ${todayFormatted}. Please choose a date that's today or later.`,
    }
  }

  // Parse and validate time
  const parsedTime = parseTimeString(preferredTime)
  if (!parsedTime) {
    return {
      success: false,
      error: `I couldn't understand the time "${preferredTime}". Please provide the time in format like "2:30 PM" or "14:30".`,
    }
  }

  const time24 = formatTime24(parsedTime.hour, parsedTime.minute)

  // Convert to ISO 8601 UTC format for Cal.com API
  // Cal.com expects start time in UTC
  const startDateTime = convertToUTC(preferredDate, time24, timezone)

  // Build booking request
  const bookingRequest: CalcomBookingRequest = {
    eventTypeId,
    start: startDateTime,
    attendee: {
      name: attendeeName,
      email: attendeeEmail,
      timeZone: timezone,
      language: "en",
    },
    metadata: {
      phone: attendeePhone,
      notes,
      source: "genius365_voice_agent",
    },
  }

  // If phone provided, include in location
  if (attendeePhone) {
    bookingRequest.location = {
      type: "phone",
      value: attendeePhone,
    }
  }

  // Create the booking
  const result = await createBooking(apiKey, bookingRequest)

  if (!result.success || !result.data) {
    // Check if it's an availability issue
    if (result.error?.toLowerCase().includes("slot") || result.error?.toLowerCase().includes("available")) {
      return {
        success: false,
        error: `That time slot is no longer available. Would you like me to check what times are available on ${preferredDate}?`,
      }
    }

    return {
      success: false,
      error: result.error || "Unable to complete the booking. Please try again.",
    }
  }

  // Format confirmation
  const confirmedTime = formatBookingConfirmation(result.data, timezone)

  return {
    success: true,
    result: `Great news! I've successfully booked your appointment for ${confirmedTime}. ` +
      `A confirmation email has been sent to ${attendeeEmail}. ` +
      `Is there anything else I can help you with?`,
    data: result.data,
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert local date/time to UTC ISO string
 */
function convertToUTC(date: string, time: string, timezone: string): string {
  try {
    // Create a date string in the local timezone
    const [hours, minutes] = time.split(":").map(Number)
    const [year, month, day] = date.split("-").map(Number)

    // Create date in the specified timezone
    const localDate = new Date(year!, month! - 1, day!, hours, minutes, 0)

    // Get timezone offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    // Use a reference date to calculate offset
    const now = new Date()
    const utcNow = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }))
    const tzNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }))
    const offsetMs = tzNow.getTime() - utcNow.getTime()

    // Adjust local date to UTC
    const utcDate = new Date(localDate.getTime() - offsetMs)

    return utcDate.toISOString()
  } catch (error) {
    console.error("[CalcomToolHandler] Date conversion error:", error)
    // Fallback: assume date/time is in UTC
    return new Date(`${date}T${time}:00Z`).toISOString()
  }
}

/**
 * Check if Cal.com is configured for a workspace
 */
export async function isCalcomConfigured(workspaceId: string): Promise<boolean> {
  const integration = await getWorkspaceCalcomIntegration(workspaceId)
  return !!integration?.api_keys?.default_secret_key
}


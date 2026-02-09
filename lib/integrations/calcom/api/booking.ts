/**
 * Cal.com Booking API
 * POST /v2/bookings endpoint
 */

import type {
  CalcomApiResponse,
  CalcomBookingRequest,
  CalcomBookingResponse,
} from "../types"

// =============================================================================
// CONSTANTS
// =============================================================================

const CALCOM_API_BASE = "https://api.cal.com"
const CALCOM_API_VERSION = "2024-08-13"

// =============================================================================
// CREATE BOOKING
// =============================================================================

/**
 * Create a booking via Cal.com API v2
 * 
 * @param apiKey - Cal.com API key
 * @param booking - Booking request data
 */
export async function createBooking(
  apiKey: string,
  booking: CalcomBookingRequest
): Promise<CalcomApiResponse<CalcomBookingResponse>> {
  try {
    console.log("[Cal.com API] Creating booking:", {
      eventTypeId: booking.eventTypeId,
      start: booking.start,
      attendeeEmail: booking.attendee.email,
      timezone: booking.attendee.timeZone,
    })

    const response = await fetch(`${CALCOM_API_BASE}/v2/bookings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "cal-api-version": CALCOM_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(booking),
    })

    const responseData = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error("[Cal.com API] Create booking error:", response.status, responseData)
      
      // Extract error message as string (responseData.error can be an object)
      let errorMessage = `Booking failed: ${response.status}`
      if (typeof responseData.error === "string") {
        errorMessage = responseData.error
      } else if (responseData.error?.message) {
        errorMessage = responseData.error.message
      } else if (responseData.message) {
        errorMessage = responseData.message
      }
      
      // Handle common error cases
      if (response.status === 400) {
        if (errorMessage.toLowerCase().includes("slot")) {
          errorMessage = "The requested time slot is no longer available. Please choose a different time."
        } else if (errorMessage.toLowerCase().includes("event type")) {
          errorMessage = "Invalid event type. Please contact support."
        }
      } else if (response.status === 401) {
        errorMessage = "Calendar integration authentication failed. Please reconnect Cal.com."
      } else if (response.status === 409) {
        errorMessage = "This time slot has just been booked by someone else. Please choose a different time."
      }

      return {
        success: false,
        error: errorMessage,
        statusCode: response.status,
      }
    }

    // Cal.com API v2 returns { status: "success", data: {...} }
    const bookingData = responseData.data || responseData

    console.log("[Cal.com API] Booking created:", {
      id: bookingData.id,
      uid: bookingData.uid,
      status: bookingData.status,
    })

    return {
      success: true,
      data: bookingData,
      statusCode: response.status,
    }
  } catch (error) {
    console.error("[Cal.com API] Create booking exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert date and time to ISO 8601 UTC format for Cal.com API
 * 
 * @param date - Date in YYYY-MM-DD format
 * @param time - Time in HH:MM format (24-hour)
 * @param timezone - Source timezone
 */
export function toCalcomDateTimeFormat(
  date: string,
  time: string,
  timezone: string
): string {
  try {
    // Create date string in the specified timezone
    const dateTimeStr = `${date}T${time}:00`
    
    // Parse with timezone consideration
    // Create a date object and convert to UTC
    const localDate = new Date(dateTimeStr)
    
    // Get the offset for the target timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    
    // Parse the date in the target timezone and convert to UTC
    const parts = formatter.formatToParts(localDate)
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || "00"
    
    // Build UTC date
    const year = parseInt(getPart("year"))
    const month = parseInt(getPart("month")) - 1
    const day = parseInt(getPart("day"))
    const hour = parseInt(getPart("hour"))
    const minute = parseInt(getPart("minute"))
    
    // Create date in local timezone interpretation
    const tzDate = new Date(year, month, day, hour, minute, 0)
    
    // Calculate timezone offset difference
    const localOffset = localDate.getTimezoneOffset()
    const tzOffset = getTimezoneOffset(timezone)
    const offsetDiff = tzOffset - localOffset
    
    // Adjust to get UTC
    const utcDate = new Date(tzDate.getTime() + offsetDiff * 60 * 1000)
    
    return utcDate.toISOString()
  } catch (error) {
    console.error("[Cal.com] Date conversion error:", error)
    // Fallback: assume the date/time is already in a parseable format
    return new Date(`${date}T${time}:00Z`).toISOString()
  }
}

/**
 * Get timezone offset in minutes
 */
function getTimezoneOffset(timezone: string): number {
  const now = new Date()
  const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }))
  const tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }))
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60)
}

/**
 * Format booking confirmation for display
 */
export function formatBookingConfirmation(
  booking: CalcomBookingResponse,
  timezone: string
): string {
  const startDate = new Date(booking.startTime)
  
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const formattedDate = dateFormatter.format(startDate)
  const formattedTime = timeFormatter.format(startDate)
  
  return `${formattedDate} at ${formattedTime}`
}

/**
 * Parse time string in various formats
 * Supports: "HH:MM", "H:MM", "HH:MM AM/PM", "H AM/PM"
 */
export function parseTimeString(timeStr: string): { hour: number; minute: number } | null {
  const cleanTime = timeStr.trim().toUpperCase()
  
  // Try 24-hour format first (HH:MM or H:MM)
  const match24 = cleanTime.match(/^(\d{1,2}):(\d{2})$/)
  if (match24) {
    return {
      hour: parseInt(match24[1]!),
      minute: parseInt(match24[2]!),
    }
  }
  
  // Try 12-hour format with AM/PM
  const match12 = cleanTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (match12) {
    let hour = parseInt(match12[1]!)
    const minute = match12[2] ? parseInt(match12[2]) : 0
    const period = match12[3]
    
    if (period === "PM" && hour !== 12) {
      hour += 12
    } else if (period === "AM" && hour === 12) {
      hour = 0
    }
    
    return { hour, minute }
  }
  
  return null
}

/**
 * Format time to HH:MM 24-hour format
 */
export function formatTime24(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
}


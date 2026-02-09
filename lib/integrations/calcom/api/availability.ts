/**
 * Cal.com Availability API
 * GET /v2/slots endpoint
 */

import type {
  CalcomApiResponse,
  CalcomSlotsResponse,
  FormattedSlot,
} from "../types"

// =============================================================================
// CONSTANTS
// =============================================================================

const CALCOM_API_BASE = "https://api.cal.com"
const CALCOM_API_VERSION = "2024-08-13"

// =============================================================================
// GET AVAILABLE SLOTS
// =============================================================================

/**
 * Get available time slots from Cal.com
 * 
 * @param apiKey - Cal.com API key
 * @param eventTypeId - Event type ID
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param timezone - Target timezone for slots
 */
export async function getAvailableSlots(
  apiKey: string,
  eventTypeId: number,
  startDate: string,
  endDate: string,
  timezone: string
): Promise<CalcomApiResponse<CalcomSlotsResponse>> {
  try {
    const params = new URLSearchParams({
      eventTypeId: eventTypeId.toString(),
      startTime: startDate,
      endTime: endDate,
      timeZone: timezone,
    })

    const url = `${CALCOM_API_BASE}/v2/slots/available?${params}`

    console.log("[Cal.com API] Fetching slots:", {
      eventTypeId,
      startDate,
      endDate,
      timezone,
    })

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "cal-api-version": CALCOM_API_VERSION,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[Cal.com API] Get slots error:", response.status, errorData)
      
      // Extract error message as string (errorData.error can be an object)
      let errorMessage = `Cal.com API error: ${response.status}`
      if (typeof errorData.error === "string") {
        errorMessage = errorData.error
      } else if (errorData.error?.message) {
        errorMessage = errorData.error.message
      } else if (errorData.message) {
        errorMessage = errorData.message
      }
      
      return {
        success: false,
        error: errorMessage,
        statusCode: response.status,
      }
    }

    const data = await response.json()
    console.log("[Cal.com API] Slots response:", {
      datesWithSlots: Object.keys(data.data?.slots || data.slots || {}).length,
    })

    // Cal.com API v2 returns { status: "success", data: { slots: {...} } }
    // or directly { slots: {...} }
    const slotsData = data.data || data

    return {
      success: true,
      data: slotsData,
      statusCode: response.status,
    }
  } catch (error) {
    console.error("[Cal.com API] Get slots exception:", error)
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
 * Format slots for LLM response
 * Converts raw slots to human-readable format
 */
export function formatSlotsForLLM(
  slotsResponse: CalcomSlotsResponse,
  timezone: string,
  maxSlots: number = 10
): FormattedSlot[] {
  const formattedSlots: FormattedSlot[] = []
  const slots = slotsResponse.slots || {}

  for (const [date, dateSlots] of Object.entries(slots)) {
    if (formattedSlots.length >= maxSlots) break

    for (const slot of dateSlots) {
      if (formattedSlots.length >= maxSlots) break

      try {
        const slotDate = new Date(slot.time)
        
        // Format time in target timezone
        const timeFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })

        const dateFormatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          weekday: "long",
          month: "long",
          day: "numeric",
        })

        const time24 = new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(slotDate)

        formattedSlots.push({
          date,
          time: time24,
          datetime: slot.time,
          displayTime: `${dateFormatter.format(slotDate)} at ${timeFormatter.format(slotDate)}`,
        })
      } catch (e) {
        console.warn("[Cal.com] Failed to format slot:", slot, e)
      }
    }
  }

  return formattedSlots
}

/**
 * Format available slots as a readable string for the AI
 */
export function formatAvailableSlotsText(
  slots: FormattedSlot[],
  timezone: string
): string {
  if (slots.length === 0) {
    return "No available time slots found for the requested dates."
  }

  const lines: string[] = []
  let currentDate = ""

  for (const slot of slots) {
    if (slot.date !== currentDate) {
      currentDate = slot.date
      // Add date header
      const dateObj = new Date(slot.datetime)
      const dateStr = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(dateObj)
      lines.push(`\n📅 ${dateStr}:`)
    }

    // Add time slot
    const timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(slot.datetime))
    
    lines.push(`  • ${timeStr}`)
  }

  return lines.join("\n").trim()
}

/**
 * Check if a specific time slot is available
 */
export function isSlotAvailable(
  slotsResponse: CalcomSlotsResponse,
  targetDate: string,
  targetTime: string,
  timezone: string
): { available: boolean; exactMatch?: FormattedSlot; nearbySlots?: FormattedSlot[] } {
  const slots = slotsResponse.slots || {}
  const dateSlots = slots[targetDate] || []

  // Convert target time to compare
  const targetDateTime = new Date(`${targetDate}T${targetTime}:00`)
  
  for (const slot of dateSlots) {
    const slotDate = new Date(slot.time)
    
    // Check for exact match (within 5 minute tolerance)
    const diffMinutes = Math.abs(slotDate.getTime() - targetDateTime.getTime()) / (1000 * 60)
    
    if (diffMinutes <= 5) {
      return {
        available: true,
        exactMatch: {
          date: targetDate,
          time: targetTime,
          datetime: slot.time,
          displayTime: new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(slotDate),
        },
      }
    }
  }

  // Get nearby slots as alternatives
  const allSlots = formatSlotsForLLM(slotsResponse, timezone, 5)
  
  return {
    available: false,
    nearbySlots: allSlots,
  }
}


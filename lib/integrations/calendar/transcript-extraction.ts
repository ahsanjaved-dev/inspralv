/**
 * Transcript Extraction Service
 * Extracts appointment details from call transcripts after call completion
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { Appointment, AppointmentType } from './types'

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractedAppointmentDetails {
  attendeeName?: string
  attendeeEmail?: string
  attendeePhone?: string
  appointmentType?: AppointmentType
  preferredDate?: string
  preferredTime?: string
  notes?: string
  customFields?: Record<string, unknown>
}

interface TranscriptMessage {
  role: 'assistant' | 'user' | 'bot' | 'system' | 'tool'
  message?: string
  content?: string
}

// =============================================================================
// EXTRACTION PATTERNS
// =============================================================================

// Common email patterns
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi

// Phone number patterns
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g

// Date patterns (various formats)
const DATE_PATTERNS = [
  // January 15, 2026
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/gi,
  // Jan 15, 2026
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/gi,
  // 15 January 2026
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
  // Tomorrow, next Monday, etc. handled separately
  // YYYY-MM-DD
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  // MM/DD/YYYY
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
]

// Time patterns
const TIME_PATTERNS = [
  // 3pm, 3:30pm, 3:30 pm
  /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)\b/gi,
  // 15:30
  /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/g,
  // "at three", "at noon", etc.
  /\b(?:at\s+)?(noon|midnight|morning|afternoon|evening)\b/gi,
]

// Appointment type keywords
const BOOKING_KEYWORDS = ['book', 'schedule', 'set up', 'make an appointment', 'appointment for']
const CANCEL_KEYWORDS = ['cancel', 'cancellation', 'cancel my appointment', 'call off']
const RESCHEDULE_KEYWORDS = ['reschedule', 'move', 'change', 'different time', 'change my appointment']

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract appointment details from call transcript
 */
export function extractAppointmentDetails(
  transcript: string | TranscriptMessage[]
): ExtractedAppointmentDetails {
  // Convert to string if array
  const transcriptText = Array.isArray(transcript)
    ? transcript
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'bot')
        .map((m) => `${m.role}: ${m.message || m.content || ''}`)
        .join('\n')
    : transcript

  if (!transcriptText) {
    return {}
  }

  const extracted: ExtractedAppointmentDetails = {}

  // Extract email
  const emails = transcriptText.match(EMAIL_REGEX)
  if (emails && emails.length > 0) {
    // Take the most likely customer email (not agent's company email)
    extracted.attendeeEmail = emails.find((e) => !e.includes('@company.') && !e.includes('@business.')) || emails[0]
  }

  // Extract phone number
  const phones = transcriptText.match(PHONE_REGEX)
  if (phones && phones.length > 0) {
    extracted.attendeePhone = phones[0].replace(/\D/g, '')
  }

  // Extract name from transcript context
  extracted.attendeeName = extractName(transcriptText)

  // Extract appointment type
  extracted.appointmentType = extractAppointmentType(transcriptText)

  // Extract date
  extracted.preferredDate = extractDate(transcriptText)

  // Extract time
  extracted.preferredTime = extractTime(transcriptText)

  // Extract any additional notes
  extracted.notes = extractNotes(transcriptText)

  return extracted
}

// =============================================================================
// HELPER EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Extract name from transcript
 * Looks for patterns like "my name is X", "this is X calling", etc.
 */
function extractName(text: string): string | undefined {
  const namePatterns = [
    /my name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /this is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:calling|speaking)/i,
    /(?:call me|name's|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:for|under|name:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ]

  for (const pattern of namePatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }

  return undefined
}

/**
 * Determine appointment type from transcript
 */
function extractAppointmentType(text: string): AppointmentType | undefined {
  const lowerText = text.toLowerCase()

  // Check for reschedule first (most specific)
  if (RESCHEDULE_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    return 'reschedule'
  }

  // Check for cancel
  if (CANCEL_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    return 'cancel'
  }

  // Check for booking
  if (BOOKING_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    return 'book'
  }

  return undefined
}

/**
 * Extract date from transcript
 */
function extractDate(text: string): string | undefined {
  // Check for relative dates first
  const lowerText = text.toLowerCase()
  const today = new Date()

  if (lowerText.includes('today')) {
    return formatDateYYYYMMDD(today)
  }

  if (lowerText.includes('tomorrow')) {
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDateYYYYMMDD(tomorrow)
  }

  // Check for day of week
  const dayMatch = lowerText.match(
    /\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  )
  if (dayMatch && dayMatch[1]) {
    const targetDay = getDayOfWeek(dayMatch[1])
    const daysUntil = (targetDay - today.getDay() + 7) % 7 || 7 // Next occurrence
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + daysUntil)
    return formatDateYYYYMMDD(targetDate)
  }

  // Try date patterns
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const parsed = parseMatchToDate(match)
      if (parsed) {
        return formatDateYYYYMMDD(parsed)
      }
    }
  }

  return undefined
}

/**
 * Extract time from transcript
 */
function extractTime(text: string): string | undefined {
  const lowerText = text.toLowerCase()

  // Check for named times
  if (lowerText.includes('noon')) return '12:00'
  if (lowerText.includes('midnight')) return '00:00'

  // Try time patterns
  for (const pattern of TIME_PATTERNS) {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      const parsed = parseMatchToTime(match)
      if (parsed) {
        return parsed
      }
    }
  }

  return undefined
}

/**
 * Extract notes/additional context from transcript
 */
function extractNotes(text: string): string | undefined {
  const notePatterns = [
    /(?:reason|purpose|about)\s*:?\s*(.{10,100})/i,
    /(?:i need to|i want to|i would like to)\s+(.{10,100})/i,
    /(?:regarding|for)\s+(.{10,50})/i,
  ]

  for (const pattern of notePatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }

  return undefined
}

// =============================================================================
// DATE/TIME PARSING HELPERS
// =============================================================================

function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayOfWeek(dayName: string): number {
  const days: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  }
  return days[dayName.toLowerCase()] ?? 0
}

function parseMatchToDate(match: RegExpMatchArray): Date | null {
  // Different handling based on pattern
  // This is a simplified version - in production, use a date parsing library
  try {
    const fullMatch = match[0]
    const parsed = new Date(fullMatch)
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
  } catch {
    // Fallback - return null
  }
  return null
}

function parseMatchToTime(match: RegExpMatchArray): string | null {
  try {
    const [, hours, minutes, period] = match
    if (!hours) return null
    let hour = parseInt(hours, 10)
    const min = minutes ? parseInt(minutes, 10) : 0

    // Handle AM/PM
    if (period) {
      const isPM = period.toLowerCase() === 'pm'
      if (isPM && hour < 12) hour += 12
      if (!isPM && hour === 12) hour = 0
    }

    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  } catch {
    return null
  }
}

// =============================================================================
// POST-CALL PROCESSING
// =============================================================================

/**
 * Process transcript after call ends and extract/store appointment details
 * Called from the end-of-call-report webhook handler
 */
export async function processTranscriptForAppointments(
  conversationId: string,
  agentId: string,
  transcript: string | TranscriptMessage[]
): Promise<{ extracted: ExtractedAppointmentDetails; created: boolean }> {
  const supabase = createAdminClient()

  // Extract details
  const extracted = extractAppointmentDetails(transcript)

  console.log(`[TranscriptExtraction] Extracted from conversation ${conversationId}:`, {
    hasEmail: !!extracted.attendeeEmail,
    hasName: !!extracted.attendeeName,
    hasPhone: !!extracted.attendeePhone,
    type: extracted.appointmentType,
    hasDate: !!extracted.preferredDate,
    hasTime: !!extracted.preferredTime,
  })

  // Check if there's already an appointment for this conversation
  const { data: existingAppointment } = await supabase
    .from('appointments')
    .select('id')
    .eq('conversation_id', conversationId)
    .single()

  if (existingAppointment) {
    // Appointment already exists (created during call via tool)
    // Update with any additional extracted data
    await supabase
      .from('appointments')
      .update({
        attendee_name: extracted.attendeeName || undefined,
        attendee_phone: extracted.attendeePhone || undefined,
        notes: extracted.notes || undefined,
        custom_fields: extracted.customFields || {},
        extracted_from_transcript: true,
      })
      .eq('id', existingAppointment.id)

    return { extracted, created: false }
  }

  // If we have enough details to create an appointment record
  // but one wasn't created during the call, we can log it for review
  if (
    extracted.attendeeEmail &&
    extracted.preferredDate &&
    extracted.preferredTime &&
    extracted.appointmentType === 'book'
  ) {
    console.log(
      `[TranscriptExtraction] Found appointment details not processed during call. ` +
        `Consider manual review for conversation: ${conversationId}`
    )
  }

  return { extracted, created: false }
}

/**
 * Link an existing appointment to a conversation
 * Used when appointment was created during call but conversation ID wasn't available
 */
export async function linkAppointmentToConversation(
  appointmentId: string,
  conversationId: string
): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('appointments')
    .update({ conversation_id: conversationId })
    .eq('id', appointmentId)

  if (error) {
    console.error(`[TranscriptExtraction] Failed to link appointment:`, error)
    return false
  }

  return true
}


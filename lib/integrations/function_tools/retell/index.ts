/**
 * Retell Function Tools
 * Main entry point for Retell tool integrations
 * 
 * This module handles mapping internal FunctionTool format to Retell's
 * general_tools format for the LLM configuration.
 * 
 * Supported tool types (API names):
 * - end_call: End the call
 * - transfer_call: Transfer to another number
 * - press_digit: Send DTMF tones
 * - check_availability_cal: Check Cal.com availability
 * - book_appointment_cal: Book on Cal.com
 * - send_sms: Send SMS message
 */

// Types
export * from './types'

// Mapper
export * from './mapper'

// Registry (for UI)
export * from './registry'


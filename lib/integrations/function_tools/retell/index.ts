/**
 * Retell Function Tools
 * Main entry point for Retell tool integrations
 * 
 * This module handles mapping internal FunctionTool format to Retell's
 * general_tools format for the LLM configuration.
 * 
 * Native Retell tool types:
 * - end_call: End the call
 * - transfer_call: Transfer to another number
 * - press_digit: Send DTMF tones
 * - send_sms: Send SMS message
 * 
 * Calendar tools (via MCP):
 * - book_appointment: Book on Google Calendar
 * - cancel_appointment: Cancel appointment
 * - reschedule_appointment: Reschedule appointment
 */

// Types
export * from './types'

// Mapper
export * from './mapper'

// Registry (for UI)
export * from './registry'


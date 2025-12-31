/**
 * Retell Tool Registry
 * Registry of Retell-supported tools (general_tools) with metadata for UI.
 *
 * IMPORTANT:
 * Retell's `create-retell-llm` / `update-retell-llm` endpoints validate `general_tools`
 * strictly. In practice (per live API validation errors), `custom_function` is NOT
 * accepted in `general_tools`, so we do not expose a "Custom Function" tool for Retell
 * agents here.
 */

import type { BuiltInToolDefinition } from "@/lib/integrations/function_tools/types"

/**
 * Tools Retell supports natively via `general_tools`.
 * (Custom functions are represented internally by `function` and mapped to Retell `custom_function`.)
 */
export const RETELL_TOOL_REGISTRY: Record<string, BuiltInToolDefinition> = {
  end_call: {
    key: "end_call",
    displayName: "End Call",
    type: "end_call",
    category: "call_control",
    providers: { vapi: false, retell: true, synthflow: false },
    isNative: true,
    description: "End the call gracefully when the conversation is complete.",
    icon: "PhoneOff",
  },
  transfer_call: {
    key: "transfer_call",
    displayName: "Transfer Call",
    type: "transfer_call",
    category: "call_control",
    providers: { vapi: false, retell: true, synthflow: false },
    isNative: true,
    description: "Transfer the call to another number.",
    icon: "PhoneForwarded",
  },
  book_appointment_cal: {
    key: "book_appointment_cal",
    displayName: "Book Calendar (Cal.com)",
    type: "book_appointment_cal",
    category: "api_integration",
    providers: { vapi: false, retell: true, synthflow: false },
    isNative: true,
    description: "Book an appointment using Cal.com.",
    icon: "CalendarPlus",
  },
}



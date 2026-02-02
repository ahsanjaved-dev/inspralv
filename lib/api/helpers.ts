import { NextResponse } from "next/server"
import type { ZodError } from "zod"
import type { ApiResponse } from "@/types/database.types"

export function apiResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data }, { status })
}

/**
 * Get a user-friendly field name from a Zod path
 */
function formatFieldPath(path: (string | number)[]): string {
  if (path.length === 0) return "Form"
  
  // Map technical field names to user-friendly names
  const fieldNameMap: Record<string, string> = {
    name: "Agent Name",
    description: "Description",
    provider: "Provider",
    voice_provider: "Voice Provider",
    model_provider: "Model Provider",
    transcriber_provider: "Transcriber Provider",
    agent_direction: "Agent Direction",
    allow_outbound: "Allow Outbound",
    assigned_phone_number_id: "Phone Number",
    config: "Configuration",
    system_prompt: "System Prompt",
    first_message: "First Message / Greeting",
    voice_id: "Voice",
    voice_settings: "Voice Settings",
    stability: "Voice Stability",
    similarity_boost: "Voice Similarity",
    speed: "Voice Speed",
    model_settings: "Model Settings",
    model: "AI Model",
    temperature: "Temperature",
    max_tokens: "Max Tokens",
    transcriber_settings: "Transcriber Settings",
    language: "Language",
    max_duration_seconds: "Max Call Duration",
    end_call_phrases: "End Call Phrases",
    tools: "Function Tools",
    tools_server_url: "Webhook URL",
    knowledge_base: "Knowledge Base",
    custom_variables: "Custom Variables",
    calendar_settings: "Calendar Settings",
    is_active: "Active Status",
    tags: "Tags",
    knowledge_document_ids: "Knowledge Documents",
  }
  
  return path
    .map((segment, index) => {
      if (typeof segment === "number") {
        return `#${segment + 1}`
      }
      // Check for nested config fields
      const fieldName = fieldNameMap[segment] || segment.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      return fieldName
    })
    .join(" → ")
}

/**
 * Get a detailed, field-specific validation error message from a Zod error
 * Returns a clear message indicating which field has the issue and what's wrong
 */
export function getValidationError(error: ZodError): string {
  const firstIssue = error.issues[0]
  if (!firstIssue) return "Validation failed"
  
  const fieldPath = formatFieldPath(firstIssue.path as (string | number)[])
  const message = firstIssue.message
  
  // Build a user-friendly error message
  if (firstIssue.path.length === 0) {
    return message || "Validation failed"
  }
  
  // Special handling for common error types
  switch (firstIssue.code) {
    case "invalid_type": {
      const issue = firstIssue as any
      if (issue.received === "undefined") {
        return `${fieldPath} is required`
      }
      return `${fieldPath}: Expected ${issue.expected}, received ${issue.received}`
    }
    
    case "too_small":
      if ((firstIssue as any).minimum === 1 && (firstIssue as any).type === "string") {
        return `${fieldPath} is required`
      }
      return `${fieldPath}: ${message}`
    
    case "too_big":
      return `${fieldPath}: ${message}`
    
    default:
      return `${fieldPath}: ${message}`
  }
}

/**
 * Get all validation errors from a Zod error (for detailed error responses)
 */
export function getAllValidationErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map(issue => ({
    field: formatFieldPath(issue.path as (string | number)[]),
    message: issue.message,
  }))
}

export function apiError(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ error }, { status })
}

export function serverError(message = "Internal server error"): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ error: message }, { status: 500 })
}

export function notFound(resource = "Resource"): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 })
}

export function unauthorized(): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

export function forbidden(message = "Forbidden"): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ error: message }, { status: 403 })
}

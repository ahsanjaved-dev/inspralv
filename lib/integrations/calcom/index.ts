/**
 * Cal.com Integration Module
 * 
 * Provides helper functions for managing Cal.com integrations
 * and fetching Cal.com data (event types, availability, etc.)
 */

import { createClient } from "@supabase/supabase-js"

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Tool definitions
export {
  isCalcomTool,
  getCalcomTools,
  getCalcomToolByName,
  getCalcomCheckAvailabilityTool,
  getCalcomBookAppointmentTool,
  calcomToolToVapiFormat,
  generateCalcomSystemPromptContext,
  CALCOM_TOOL_NAMES,
  type CalcomToolName,
  type CalcomToolDefinition,
} from "./tool-definitions"

// Tool handler
export {
  handleCalcomToolCall,
  isCalcomConfigured,
} from "./tool-handler"

// Types
export type {
  CalcomToolContext,
  CalcomToolResult,
  CalcomCustomField,
  CalcomToolConfig,
  CheckAvailabilityInput,
  BookAppointmentInput,
} from "./types"

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============================================================================
// TYPES
// ============================================================================

export interface CalcomIntegration {
  id: string
  workspace_id: string
  provider: string
  name: string
  api_keys: {
    default_secret_key: string
    default_public_key?: string
  }
  is_active: boolean
  config?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CalcomEventType {
  id: number
  title: string
  slug: string
  length: number
  description?: string
  hidden: boolean
  position: number
}

export interface CalcomUser {
  id: number
  username: string
  name: string
  email: string
  timeZone: string
}

// ============================================================================
// INTEGRATION RETRIEVAL
// ============================================================================

/**
 * Get the Cal.com integration for a workspace
 */
export async function getWorkspaceCalcomIntegration(
  workspaceId: string
): Promise<CalcomIntegration | null> {
  try {
    const supabase = getSupabaseAdmin()
    
    const { data, error } = await supabase
      .from("workspace_integrations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("provider", "calcom")
      .eq("is_active", true)
      .single()

    if (error || !data) {
      console.log("[Cal.com] No integration found for workspace:", workspaceId)
      return null
    }

    return data as CalcomIntegration
  } catch (error) {
    console.error("[Cal.com] Error fetching integration:", error)
    return null
  }
}

// ============================================================================
// API KEY VALIDATION
// ============================================================================

/**
 * Validate a Cal.com API key by calling the /me endpoint
 */
export async function validateCalcomApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.cal.com/v1/me", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    return response.ok
  } catch (error) {
    console.error("[Cal.com] Error validating API key:", error)
    return false
  }
}

/**
 * Validate and get user info for a Cal.com API key
 */
export async function getCalcomUserInfo(apiKey: string): Promise<CalcomUser | null> {
  try {
    const response = await fetch("https://api.cal.com/v1/me", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.user || null
  } catch (error) {
    console.error("[Cal.com] Error fetching user info:", error)
    return null
  }
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Fetch all event types for a Cal.com API key
 */
export async function fetchCalcomEventTypes(apiKey: string): Promise<CalcomEventType[]> {
  try {
    const response = await fetch("https://api.cal.com/v1/event-types", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      console.error("[Cal.com] Failed to fetch event types:", response.status)
      return []
    }

    const data = await response.json()
    return data.event_types || []
  } catch (error) {
    console.error("[Cal.com] Error fetching event types:", error)
    return []
  }
}

/**
 * Fetch a specific event type by ID
 */
export async function fetchCalcomEventType(
  apiKey: string,
  eventTypeId: number
): Promise<CalcomEventType | null> {
  try {
    const response = await fetch(`https://api.cal.com/v1/event-types/${eventTypeId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      console.error("[Cal.com] Failed to fetch event type:", response.status)
      return null
    }

    const data = await response.json()
    return data.event_type || null
  } catch (error) {
    console.error("[Cal.com] Error fetching event type:", error)
    return null
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a workspace has Cal.com integration configured
 */
export async function hasCalcomIntegration(workspaceId: string): Promise<boolean> {
  const integration = await getWorkspaceCalcomIntegration(workspaceId)
  return integration !== null
}

/**
 * Get Cal.com API key for a workspace
 */
export async function getCalcomApiKey(workspaceId: string): Promise<string | null> {
  const integration = await getWorkspaceCalcomIntegration(workspaceId)
  return integration?.api_keys?.default_secret_key || null
}

/**
 * Check if Cal.com tools are available for a workspace
 * Returns true if workspace has an active Cal.com integration
 */
export async function isCalcomAvailable(workspaceId: string): Promise<boolean> {
  return await hasCalcomIntegration(workspaceId)
}


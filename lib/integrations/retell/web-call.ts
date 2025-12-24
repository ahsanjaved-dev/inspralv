/**
 * Retell Web Call
 * Handles web-based test calls via Retell
 * Uses API key to register web call and get access token
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const RETELL_BASE_URL = "https://api.retellai.com"

// ============================================================================
// TYPES
// ============================================================================

export interface RetellWebCallSession {
  success: boolean
  provider: "retell"
  accessToken?: string
  callId?: string
  error?: string
}

interface RetellWebCallResponse {
  access_token: string
  call_id: string
}

// ============================================================================
// CREATE RETELL WEB CALL SESSION
// ============================================================================

export async function createRetellWebCall(
  agentId: string,
  secretKey: string
): Promise<RetellWebCallSession> {
  try {
    if (!secretKey) {
      throw new Error("No Retell secret API key provided.")
    }

    console.log("[RetellWebCall] Creating web call for agent:", agentId)

    // Retell v2 API for web calls
    const response = await fetch(`${RETELL_BASE_URL}/v2/create-web-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        agent_id: agentId,
      }),
    })

    console.log("[RetellWebCall] Response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[RetellWebCall] Raw error response:", errorText)
      
      let errorData: any = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      console.error("[RetellWebCall] Error:", response.status, errorData)
      return {
        success: false,
        provider: "retell",
        error: errorData.message || errorData.error || `Retell API error: ${response.status}`,
      }
    }

    const data: RetellWebCallResponse = await response.json()
    console.log("[RetellWebCall] Session created successfully:", data.call_id)

    return {
      success: true,
      provider: "retell",
      accessToken: data.access_token,
      callId: data.call_id,
    }
  } catch (error) {
    console.error("[RetellWebCall] Exception:", error)
    return {
      success: false,
      provider: "retell",
      error: error instanceof Error ? error.message : "Unknown error creating Retell web call",
    }
  }
}

// ============================================================================
// VALIDATE AGENT FOR WEB CALL
// ============================================================================

export function canMakeRetellWebCall(
  externalAgentId: string | null,
  hasSecretKey: boolean
): { canCall: boolean; reason?: string; solution?: string } {
  if (!externalAgentId) {
    return {
      canCall: false,
      reason: "Agent has not been synced with Retell yet",
      solution: "Configure and save the agent with a valid secret API key to sync.",
    }
  }

  if (!hasSecretKey) {
    return {
      canCall: false,
      reason: "No secret API key configured for Retell",
      solution: "Add a secret API key in the integration settings.",
    }
  }

  return { canCall: true }
}
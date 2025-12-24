/**
 * VAPI Web Call
 * Handles web-based test calls via VAPI
 * Uses PUBLIC API key for client-side calls
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VapiWebCallSession {
  success: boolean
  provider: "vapi"
  publicKey?: string
  token?: string
  error?: string
}

// ============================================================================
// CREATE VAPI WEB CALL SESSION
// ============================================================================

export async function createVapiWebCall(
  assistantId: string,
  publicKey: string
): Promise<VapiWebCallSession> {
  try {
    if (!publicKey) {
      throw new Error("No VAPI public API key provided. Please add a public API key to enable test calls.")
    }

    // For VAPI, the public key is used directly by the client SDK
    // We just validate it exists and return it
    return {
      success: true,
      provider: "vapi",
      publicKey: publicKey,
      token: publicKey, // VAPI web SDK uses the public key as token
    }
  } catch (error) {
    return {
      success: false,
      provider: "vapi",
      error: error instanceof Error ? error.message : "Unknown error creating VAPI web call",
    }
  }
}

// ============================================================================
// VALIDATE AGENT FOR WEB CALL
// ============================================================================

export function canMakeVapiWebCall(
  externalAgentId: string | null,
  hasPublicKey: boolean
): { canCall: boolean; reason?: string; solution?: string } {
  if (!externalAgentId) {
    return {
      canCall: false,
      reason: "Agent has not been synced with VAPI yet",
      solution: "Configure and save the agent with a valid secret API key to sync.",
    }
  }

  if (!hasPublicKey) {
    return {
      canCall: false,
      reason: "No public API key configured for VAPI",
      solution: "Add a public API key in the integration settings or agent configuration.",
    }
  }

  return { canCall: true }
}

/**
 * VAPI Agent Config
 * Handles API communication with VAPI
 */

import type { AgentSecretApiKey } from "@/types/database.types"
import type { VapiAssistantPayload, VapiAssistantResponse } from "./mapper"

// ============================================================================
// CONFIGURATION
// ============================================================================

const VAPI_BASE_URL = "https://api.vapi.ai"

// ============================================================================
// RESPONSE TYPE
// ============================================================================

export interface VapiResponse {
  success: boolean
  data?: VapiAssistantResponse
  error?: string
}

// ============================================================================
// LEGACY API KEY HELPER (for backward compatibility)
// ============================================================================

function getVapiSecretKey(agentSecretApiKeys: AgentSecretApiKey[]): string {
  const apiKey = agentSecretApiKeys.find(
    (key) => key.provider === "vapi" && key.is_active
  )

  if (!apiKey?.key) {
    throw new Error(
      "No active VAPI secret API key found. Please add a VAPI secret API key to the agent."
    )
  }

  return apiKey.key
}

// ============================================================================
// NEW API FUNCTIONS (with direct key parameter)
// ============================================================================

export async function createVapiAgentWithKey(
  payload: VapiAssistantPayload,
  apiKey: string
): Promise<VapiResponse> {
  try {
    console.log("[VapiConfig] Creating agent with payload:", JSON.stringify(payload, null, 2))
    
    const response = await fetch(`${VAPI_BASE_URL}/assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiConfig] Create error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data: VapiAssistantResponse = await response.json()
    console.log("[VapiConfig] Agent created successfully:", data.id)
    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[VapiConfig] Create exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function updateVapiAgentWithKey(
  externalAgentId: string,
  payload: Partial<VapiAssistantPayload>,
  apiKey: string
): Promise<VapiResponse> {
  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant/${externalAgentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data: VapiAssistantResponse = await response.json()
    return {
      success: true,
      data,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function deleteVapiAgentWithKey(
  externalAgentId: string,
  apiKey: string
): Promise<VapiResponse> {
  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant/${externalAgentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    return {
      success: true,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

// ============================================================================
// LEGACY API FUNCTIONS (for backward compatibility)
// ============================================================================

export async function createVapiAgent(
  payload: VapiAssistantPayload,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<VapiResponse> {
  const apiKey = getVapiSecretKey(agentSecretApiKeys)
  return createVapiAgentWithKey(payload, apiKey)
}

export async function updateVapiAgent(
  externalAgentId: string,
  payload: Partial<VapiAssistantPayload>,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<VapiResponse> {
  const apiKey = getVapiSecretKey(agentSecretApiKeys)
  return updateVapiAgentWithKey(externalAgentId, payload, apiKey)
}

export async function deleteVapiAgent(
  externalAgentId: string,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<VapiResponse> {
  const apiKey = getVapiSecretKey(agentSecretApiKeys)
  return deleteVapiAgentWithKey(externalAgentId, apiKey)
}
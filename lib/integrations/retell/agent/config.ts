/**
 * Retell Agent Config
 * Handles API communication with Retell
 */

import type { AgentSecretApiKey } from "@/types/database.types"
import type { 
  RetellAgentPayload, 
  RetellAgentResponse,
  RetellLLMPayload,
  RetellLLMResponse 
} from "./mapper"

// ============================================================================
// CONFIGURATION
// ============================================================================

const RETELL_BASE_URL = "https://api.retellai.com"

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface RetellResponse {
  success: boolean
  data?: RetellAgentResponse
  llmData?: RetellLLMResponse
  error?: string
}

export interface RetellLLMApiResponse {
  success: boolean
  data?: RetellLLMResponse
  error?: string
}

// ============================================================================
// API KEY HELPER (for legacy support)
// ============================================================================

function getRetellSecretKey(agentSecretApiKeys: AgentSecretApiKey[]): string {
  const apiKey = agentSecretApiKeys.find(
    (key) => key.provider === "retell" && key.is_active
  )

  if (!apiKey?.key) {
    throw new Error("No active Retell secret API key found.")
  }

  return apiKey.key
}

// ============================================================================
// CREATE RETELL LLM - WITH KEY
// ============================================================================

export async function createRetellLLMWithKey(
  payload: RetellLLMPayload,
  apiKey: string
): Promise<RetellLLMApiResponse> {
  try {
    console.log("[RetellConfig] Creating LLM with payload:", JSON.stringify(payload, null, 2))

    const response = await fetch(`${RETELL_BASE_URL}/create-retell-llm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[RetellConfig] LLM create error:", errorData)
      return {
        success: false,
        error: errorData.message || errorData.error || `Retell API error: ${response.status}`,
      }
    }

    const data: RetellLLMResponse = await response.json()
    console.log("[RetellConfig] LLM created successfully:", data.llm_id)
    return { success: true, data }
  } catch (error) {
    console.error("[RetellConfig] LLM create exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// UPDATE RETELL LLM - WITH KEY
// ============================================================================

export async function updateRetellLLMWithKey(
  llmId: string,
  payload: Partial<RetellLLMPayload>,
  apiKey: string
): Promise<RetellLLMApiResponse> {
  try {
    const response = await fetch(`${RETELL_BASE_URL}/update-retell-llm/${llmId}`, {
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
        error: errorData.message || errorData.error || `Retell API error: ${response.status}`,
      }
    }

    const data: RetellLLMResponse = await response.json()
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// DELETE RETELL LLM - WITH KEY
// ============================================================================

export async function deleteRetellLLMWithKey(
  llmId: string,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${RETELL_BASE_URL}/delete-retell-llm/${llmId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.message || errorData.error || `Retell API error: ${response.status}`,
      }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// CREATE RETELL AGENT - WITH KEY
// ============================================================================

export async function createRetellAgentWithKey(
  payload: RetellAgentPayload,
  apiKey: string
): Promise<RetellResponse> {
  try {
    console.log("[RetellConfig] Creating agent with payload:", JSON.stringify(payload, null, 2))

    // FIXED: Use correct Retell endpoint (no /v2 prefix per docs)
    const response = await fetch(`${RETELL_BASE_URL}/create-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: any = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      console.error("[RetellConfig] Agent create error:", response.status, errorData)
      return {
        success: false,
        error: errorData.message || errorData.error || `Retell API error: ${response.status}`,
      }
    }

    const data: RetellAgentResponse = await response.json()
    console.log("[RetellConfig] Agent created successfully:", data.agent_id)
    return { success: true, data }
  } catch (error) {
    console.error("[RetellConfig] Agent create exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// UPDATE RETELL AGENT - WITH KEY
// ============================================================================

export async function updateRetellAgentWithKey(
  externalAgentId: string,
  payload: Partial<RetellAgentPayload>,
  apiKey: string
): Promise<RetellResponse> {
  try {
    // FIXED: Use correct Retell endpoint (no /v2 prefix per docs)
    const response = await fetch(`${RETELL_BASE_URL}/update-agent/${externalAgentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: any = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      console.error("[RetellConfig] Agent update error:", response.status, errorData)
      return {
        success: false,
        error: errorData.message || errorData.error || `Retell API error: ${response.status}`,
      }
    }

    const data: RetellAgentResponse = await response.json()
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// DELETE RETELL AGENT - WITH KEY
// ============================================================================

export async function deleteRetellAgentWithKey(
  externalAgentId: string,
  apiKey: string
): Promise<RetellResponse> {
  try {
    // FIXED: Use correct Retell endpoint (no /v2 prefix per docs)
    const response = await fetch(`${RETELL_BASE_URL}/delete-agent/${externalAgentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: any = {}
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      return {
        success: false,
        error: errorData.message || errorData.error || `Retell API error: ${response.status}`,
      }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// LEGACY FUNCTIONS (backward compatibility)
// ============================================================================

export async function createRetellLLM(
  payload: RetellLLMPayload,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<RetellLLMApiResponse> {
  const apiKey = getRetellSecretKey(agentSecretApiKeys)
  return createRetellLLMWithKey(payload, apiKey)
}

export async function updateRetellLLM(
  llmId: string,
  payload: Partial<RetellLLMPayload>,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<RetellLLMApiResponse> {
  const apiKey = getRetellSecretKey(agentSecretApiKeys)
  return updateRetellLLMWithKey(llmId, payload, apiKey)
}

export async function deleteRetellLLM(
  llmId: string,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<{ success: boolean; error?: string }> {
  const apiKey = getRetellSecretKey(agentSecretApiKeys)
  return deleteRetellLLMWithKey(llmId, apiKey)
}

export async function createRetellAgent(
  payload: RetellAgentPayload,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<RetellResponse> {
  const apiKey = getRetellSecretKey(agentSecretApiKeys)
  return createRetellAgentWithKey(payload, apiKey)
}

export async function updateRetellAgent(
  externalAgentId: string,
  payload: Partial<RetellAgentPayload>,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<RetellResponse> {
  const apiKey = getRetellSecretKey(agentSecretApiKeys)
  return updateRetellAgentWithKey(externalAgentId, payload, apiKey)
}

export async function deleteRetellAgent(
  externalAgentId: string,
  agentSecretApiKeys: AgentSecretApiKey[]
): Promise<RetellResponse> {
  const apiKey = getRetellSecretKey(agentSecretApiKeys)
  return deleteRetellAgentWithKey(externalAgentId, apiKey)
}
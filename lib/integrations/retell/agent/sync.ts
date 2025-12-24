/**
 * Retell Sync
 * Orchestrates sync operations between internal agents and Retell
 * Flow: Create LLM → Create Agent (Retell requires LLM first)
 */

import { createClient } from "@supabase/supabase-js"
import type { AIAgent, IntegrationApiKeys } from "@/types/database.types"
import { mapToRetellLLM, mapToRetellAgent } from "./mapper"
import {
  createRetellLLMWithKey,
  updateRetellLLMWithKey,
  deleteRetellLLMWithKey,
  createRetellAgentWithKey,
  updateRetellAgentWithKey,
  deleteRetellAgentWithKey,
} from "./config"
import { processRetellResponse, processRetellDeleteResponse } from "./response"

// ============================================================================
// TYPES
// ============================================================================

export type SyncOperation = "create" | "update" | "delete"

export interface RetellSyncResult {
  success: boolean
  agent?: AIAgent
  error?: string
}

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
// SHOULD SYNC CHECK
// ============================================================================

export function shouldSyncToRetell(agent: AIAgent): boolean {
  if (agent.provider !== "retell") {
    return false
  }

  // Check legacy keys first
  const hasLegacySecretKey = agent.agent_secret_api_key?.some(
    (key) => key.provider === "retell" && key.is_active
  )

  // Check new api_key_config
  const apiKeyConfig = agent.config?.api_key_config
  const hasNewApiKeyConfig =
    apiKeyConfig?.secret_key?.type === "default" ||
    apiKeyConfig?.secret_key?.type === "additional" ||
    // ADDED: Also sync when type is "none" or undefined (will use default key from integration)
    !apiKeyConfig?.secret_key ||
    apiKeyConfig?.secret_key?.type === "none"

  return hasLegacySecretKey || hasNewApiKeyConfig
}

// ============================================================================
// GET API KEY FOR AGENT
// ============================================================================

async function getRetellApiKeyForAgent(
  agent: AIAgent
): Promise<string | null> {
  // Check legacy keys first
  const legacyKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === "retell" && key.is_active
  )

  if (legacyKey?.key) {
    return legacyKey.key
  }

  // Need to fetch from workspace_integrations
  if (!agent.workspace_id) {
    console.error("[RetellSync] Agent has no workspace_id, cannot fetch integration keys")
    return null
  }

  try {
    const supabase = getSupabaseAdmin()

    const { data: integration, error } = await supabase
      .from("workspace_integrations")
      .select("api_keys")
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", "retell")
      .eq("is_active", true)
      .single()

    if (error || !integration) {
      console.error("[RetellSync] Failed to fetch Retell integration:", error)
      return null
    }

    const apiKeys = integration.api_keys as IntegrationApiKeys
    const apiKeyConfig = agent.config?.api_key_config

    // UPDATED: Handle "none" or undefined by falling back to default key
    if (!apiKeyConfig?.secret_key || apiKeyConfig.secret_key.type === "none") {
      return apiKeys.default_secret_key || null
    }

    if (apiKeyConfig.secret_key.type === "default") {
      return apiKeys.default_secret_key
    }

    if (apiKeyConfig.secret_key.type === "additional") {
      const additionalKeyId = apiKeyConfig.secret_key.additional_key_id
      const additionalKey = apiKeys.additional_keys?.find(
        (k) => k.id === additionalKeyId
      )

      if (!additionalKey) {
        console.error("[RetellSync] Additional key not found:", additionalKeyId)
        return null
      }

      return additionalKey.secret_key
    }

    return null
  } catch (error) {
    console.error("[RetellSync] Error fetching API keys for agent:", error)
    return null
  }
}

// ============================================================================
// SAFE RETELL SYNC
// ============================================================================

export async function safeRetellSync(
  agent: AIAgent,
  operation: SyncOperation = "create"
): Promise<RetellSyncResult> {
  try {
    if (!shouldSyncToRetell(agent)) {
      console.log("[RetellSync] Skipping sync - not configured for Retell")
      return { success: true }
    }

    const secretKey = await getRetellApiKeyForAgent(agent)

    if (!secretKey) {
      console.error("[RetellSync] No API key found for agent")
      return {
        success: false,
        error: "No Retell API key configured. Please set up API keys in the agent or integration settings.",
      }
    }

    switch (operation) {
      case "create": {
        // Step 1: Create LLM first
        console.log("[RetellSync] Creating LLM on Retell...")
        const llmPayload = mapToRetellLLM(agent)
        const llmResponse = await createRetellLLMWithKey(llmPayload, secretKey)

        if (!llmResponse.success || !llmResponse.data) {
          return {
            success: false,
            error: `Failed to create Retell LLM: ${llmResponse.error}`,
          }
        }

        const llmId = llmResponse.data.llm_id

        // Step 2: Create Agent with LLM ID
        console.log("[RetellSync] Creating Agent on Retell with LLM:", llmId)
        const agentPayload = mapToRetellAgent(agent, llmId)
        const agentResponse = await createRetellAgentWithKey(agentPayload, secretKey)

        if (!agentResponse.success || !agentResponse.data) {
          // Cleanup: Delete the LLM we just created
          await deleteRetellLLMWithKey(llmId, secretKey)
          return {
            success: false,
            error: `Failed to create Retell Agent: ${agentResponse.error}`,
          }
        }

        // Process response with both LLM and Agent data
        return await processRetellResponse(
          { ...agentResponse, llmData: llmResponse.data },
          agent.id
        )
      }

      case "update": {
        if (!agent.external_agent_id) {
          console.log("[RetellSync] No external_agent_id, creating new agent on Retell...")
          return await safeRetellSync(agent, "create")
        }

        const config = agent.config || {}

        // Update LLM if we have the llm_id stored
        if (config.retell_llm_id) {
          console.log("[RetellSync] Updating LLM on Retell:", config.retell_llm_id)
          const llmPayload = mapToRetellLLM(agent)
          await updateRetellLLMWithKey(config.retell_llm_id, llmPayload, secretKey)
        }

        // Update Agent
        console.log("[RetellSync] Updating Agent on Retell:", agent.external_agent_id)
        const agentPayload = mapToRetellAgent(agent, config.retell_llm_id || "")
        // Remove response_engine from update payload (can't change LLM reference)
        const { response_engine, ...updatePayload } = agentPayload

        const agentResponse = await updateRetellAgentWithKey(
          agent.external_agent_id,
          updatePayload,
          secretKey
        )

        return await processRetellResponse(agentResponse, agent.id)
      }

      case "delete": {
        if (!agent.external_agent_id) {
          return { success: true } // Nothing to delete
        }

        const config = agent.config || {}

        // Delete Agent first
        console.log("[RetellSync] Deleting Agent on Retell:", agent.external_agent_id)
        const agentResponse = await deleteRetellAgentWithKey(
          agent.external_agent_id,
          secretKey
        )

        if (!agentResponse.success) {
          return {
            success: false,
            error: `Failed to delete Retell Agent: ${agentResponse.error}`,
          }
        }

        // Delete LLM if we have the llm_id stored
        if (config.retell_llm_id) {
          console.log("[RetellSync] Deleting LLM on Retell:", config.retell_llm_id)
          await deleteRetellLLMWithKey(config.retell_llm_id, secretKey)
        }

        return await processRetellDeleteResponse(agentResponse, agent.id)
      }

      default:
        return { success: false, error: "Invalid sync operation" }
    }
  } catch (error) {
    console.error("[RetellSync] Sync error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown sync error",
    }
  }
}
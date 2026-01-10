/**
 * Retell Sync
 * Orchestrates sync operations between internal agents and Retell
 * 
 * Architecture:
 * - Each agent has its own dedicated LLM (1:1 relationship)
 * - Tools are configured on the LLM level (not agent level)
 * - Webhook URL is set on the LLM for tool execution callbacks
 * 
 * Flow:
 * - CREATE: Create LLM → Create Agent (Retell requires LLM first)
 * - UPDATE: Update LLM (for tools/prompt changes) → Update Agent (for voice/settings)
 * - DELETE: Delete Agent → Delete LLM (cleanup)
 * - TOOLS: Update only the LLM when tools change
 */

import { createClient } from "@supabase/supabase-js"
import type { AIAgent } from "@/types/database.types"
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

export type SyncOperation = "create" | "update" | "delete" | "update_tools"

export interface RetellSyncResult {
  success: boolean
  agent?: AIAgent
  error?: string
  llm_id?: string
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

  // NEW ORG-LEVEL FLOW: Always return true for Retell agents
  // The actual API key will be fetched from workspace's assigned integration
  // If no key is assigned, sync will fail gracefully with an error message
  return true
}

// ============================================================================
// GET API KEY FOR AGENT (NEW ORG-LEVEL FLOW)
// ============================================================================

async function getRetellApiKeyForAgent(
  agent: AIAgent
): Promise<string | null> {
  // Need workspace_id to fetch the assigned integration
  if (!agent.workspace_id) {
    console.error("[RetellSync] Agent has no workspace_id, cannot fetch integration keys")
    return null
  }

  try {
    const supabase = getSupabaseAdmin()

    // NEW ORG-LEVEL FLOW: Fetch from workspace_integration_assignments -> partner_integrations
    const { data: assignment, error: assignmentError } = await supabase
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id,
          api_keys,
          is_active
        )
      `)
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", "retell")
      .single()

    if (assignmentError || !assignment?.partner_integration) {
      console.log("[RetellSync] No Retell integration assigned to workspace")
      return null
    }

    const partnerIntegration = assignment.partner_integration as any
    if (!partnerIntegration.is_active) {
      console.log("[RetellSync] Assigned Retell integration is not active")
      return null
    }

    const apiKeys = partnerIntegration.api_keys as any
    if (!apiKeys?.default_secret_key) {
      console.error("[RetellSync] Assigned integration has no secret key")
      return null
    }

    return apiKeys.default_secret_key
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
      console.log("[RetellSync] Skipping sync - no API key configured")
      return { success: true }
    }

    const secretKey = await getRetellApiKeyForAgent(agent)

    if (!secretKey) {
      console.error("[RetellSync] No API key found for agent")
      return {
        success: false,
        error: "No Retell API key configured. Please assign an API key in the agent settings.",
      }
    }

    switch (operation) {
      case "create": {
        // Step 1: Create LLM first
        console.log("[RetellSync] Creating LLM on Retell...")
        const llmPayload = mapToRetellLLM(agent)
        console.log("[RetellSync] LLM Payload:", JSON.stringify(llmPayload, null, 2))
        const llmResponse = await createRetellLLMWithKey(llmPayload, secretKey)

        console.log("[RetellSync] LLM Response:", { success: llmResponse.success, error: llmResponse.error, llmId: llmResponse.data?.llm_id })

        if (!llmResponse.success || !llmResponse.data) {
          console.error("[RetellSync] LLM creation failed:", llmResponse.error)
          return {
            success: false,
            error: `Failed to create Retell LLM: ${llmResponse.error}`,
          }
        }

        const llmId = llmResponse.data.llm_id
        console.log("[RetellSync] LLM created successfully:", llmId)

        // Step 2: Create Agent with LLM ID
        console.log("[RetellSync] Creating Agent on Retell with LLM:", llmId)
        const agentPayload = mapToRetellAgent(agent, llmId)
        console.log("[RetellSync] Agent Payload:", JSON.stringify(agentPayload, null, 2))
        const agentResponse = await createRetellAgentWithKey(agentPayload, secretKey)

        console.log("[RetellSync] Agent Response:", { success: agentResponse.success, error: agentResponse.error, agentId: agentResponse.data?.agent_id })

        if (!agentResponse.success || !agentResponse.data) {
          // Cleanup: Delete the LLM we just created
          console.error("[RetellSync] Agent creation failed:", agentResponse.error)
          console.log("[RetellSync] Cleaning up LLM:", llmId)
          await deleteRetellLLMWithKey(llmId, secretKey)
          return {
            success: false,
            error: `Failed to create Retell Agent: ${agentResponse.error}`,
          }
        }

        console.log("[RetellSync] Agent created successfully:", agentResponse.data.agent_id)

        // Process response with both LLM and Agent data
        const processResult = await processRetellResponse(
          { ...agentResponse, llmData: llmResponse.data },
          agent.id
        )
        
        console.log("[RetellSync] Process response result:", { success: processResult.success, error: processResult.error })
        return processResult
      }

      case "update": {
        if (!agent.external_agent_id) {
          console.log("[RetellSync] No external_agent_id, creating new agent on Retell...")
          return await safeRetellSync(agent, "create")
        }

        const config = agent.config || {}

        // Try to update LLM if we have the llm_id stored
        let llmUpdateFailed = false
        if (config.retell_llm_id) {
          console.log("[RetellSync] Updating LLM on Retell:", config.retell_llm_id)
          const llmPayload = mapToRetellLLM(agent)
          const llmUpdateResponse = await updateRetellLLMWithKey(config.retell_llm_id, llmPayload, secretKey)
          
          if (!llmUpdateResponse.success) {
            console.log("[RetellSync] LLM update failed, will create new agent...")
            llmUpdateFailed = true
          }
        }

        // Try to update Agent
        console.log("[RetellSync] Updating Agent on Retell:", agent.external_agent_id)
        const agentPayload = mapToRetellAgent(agent, config.retell_llm_id || "")
        // Remove response_engine from update payload (can't change LLM reference)
        const { response_engine, ...updatePayload } = agentPayload

        const agentResponse = await updateRetellAgentWithKey(
          agent.external_agent_id,
          updatePayload,
          secretKey
        )

        // If update fails (agent doesn't exist or API key from different account), create new agent
        if (!agentResponse.success || llmUpdateFailed) {
          console.log("[RetellSync] Update failed, creating new agent on Retell instead...")
          return await safeRetellSync(agent, "create")
        }

        return await processRetellResponse(agentResponse, agent.id)
      }

      case "delete": {
        if (!agent.external_agent_id) {
          return { success: true } // Nothing to delete
        }

        const deleteConfig = agent.config || {}

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
        if (deleteConfig.retell_llm_id) {
          console.log("[RetellSync] Deleting LLM on Retell:", deleteConfig.retell_llm_id)
          await deleteRetellLLMWithKey(deleteConfig.retell_llm_id, secretKey)
        }

        return await processRetellDeleteResponse(agentResponse, agent.id)
      }

      case "update_tools": {
        // Update only the LLM (tools, prompts, webhook_url)
        // This is more efficient when only tools change
        const toolsConfig = agent.config || {}

        if (!toolsConfig.retell_llm_id) {
          console.log("[RetellSync] No LLM ID found, performing full sync...")
          return await safeRetellSync(agent, "update")
        }

        console.log("[RetellSync] Updating LLM tools on Retell:", toolsConfig.retell_llm_id)
        const llmPayload = mapToRetellLLM(agent)
        const llmUpdateResponse = await updateRetellLLMWithKey(
          toolsConfig.retell_llm_id,
          llmPayload,
          secretKey
        )

        if (!llmUpdateResponse.success) {
          console.error("[RetellSync] LLM tools update failed:", llmUpdateResponse.error)
          // If LLM update fails, try full sync (might need to recreate)
          return await safeRetellSync(agent, "update")
        }

        console.log("[RetellSync] LLM tools updated successfully")
        return {
          success: true,
          llm_id: toolsConfig.retell_llm_id,
        }
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




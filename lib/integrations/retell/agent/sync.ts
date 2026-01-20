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
import { logger } from "@/lib/logger"

const log = logger.child({ module: "RetellSync" })

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
    log.error("Agent has no workspace_id, cannot fetch integration keys")
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
      log.debug("No Retell integration assigned to workspace")
      return null
    }

    const partnerIntegration = assignment.partner_integration as any
    if (!partnerIntegration.is_active) {
      log.debug("Assigned Retell integration is not active")
      return null
    }

    const apiKeys = partnerIntegration.api_keys as any
    if (!apiKeys?.default_secret_key) {
      log.error("Assigned integration has no secret key")
      return null
    }

    return apiKeys.default_secret_key
  } catch (error) {
    log.error("Error fetching API keys for agent", { error })
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
      log.debug("Skipping sync - no API key configured")
      return { success: true }
    }

    const secretKey = await getRetellApiKeyForAgent(agent)

    if (!secretKey) {
      log.error("No API key found for agent")
      return {
        success: false,
        error: "No Retell API key configured. Please assign an API key in the agent settings.",
      }
    }

    switch (operation) {
      case "create": {
        // Step 1: Create LLM first
        log.info("Creating LLM on Retell")
        const llmPayload = mapToRetellLLM(agent)
        log.debug("LLM Payload", { model: llmPayload.model })
        const llmResponse = await createRetellLLMWithKey(llmPayload, secretKey)

        log.debug("LLM Response", { success: llmResponse.success, error: llmResponse.error, llmId: llmResponse.data?.llm_id })

        if (!llmResponse.success || !llmResponse.data) {
          log.error("LLM creation failed", { error: llmResponse.error })
          return {
            success: false,
            error: `Failed to create Retell LLM: ${llmResponse.error}`,
          }
        }

        const llmId = llmResponse.data.llm_id
        log.info("LLM created successfully", { llmId })

        // Step 2: Create Agent with LLM ID
        log.info("Creating Agent on Retell", { llmId })
        const agentPayload = mapToRetellAgent(agent, llmId)
        log.debug("Agent Payload", { agentName: agentPayload.agent_name })
        const agentResponse = await createRetellAgentWithKey(agentPayload, secretKey)

        log.debug("Agent Response", { success: agentResponse.success, error: agentResponse.error, agentId: agentResponse.data?.agent_id })

        if (!agentResponse.success || !agentResponse.data) {
          // Cleanup: Delete the LLM we just created
          log.error("Agent creation failed", { error: agentResponse.error })
          log.info("Cleaning up LLM", { llmId })
          await deleteRetellLLMWithKey(llmId, secretKey)
          return {
            success: false,
            error: `Failed to create Retell Agent: ${agentResponse.error}`,
          }
        }

        log.info("Agent created successfully", { agentId: agentResponse.data.agent_id })

        // Process response with both LLM and Agent data
        const processResult = await processRetellResponse(
          { ...agentResponse, llmData: llmResponse.data },
          agent.id
        )
        
        log.debug("Process response result", { success: processResult.success, error: processResult.error })
        return processResult
      }

      case "update": {
        if (!agent.external_agent_id) {
          log.info("No external_agent_id, creating new agent on Retell")
          return await safeRetellSync(agent, "create")
        }

        const config = agent.config || {}

        // Try to update LLM if we have the llm_id stored
        let llmUpdateFailed = false
        if (config.retell_llm_id) {
          log.info("Updating LLM on Retell", { llmId: config.retell_llm_id })
          const llmPayload = mapToRetellLLM(agent)
          const llmUpdateResponse = await updateRetellLLMWithKey(config.retell_llm_id, llmPayload, secretKey)
          
          if (!llmUpdateResponse.success) {
            log.info("LLM update failed, will create new agent")
            llmUpdateFailed = true
          }
        }

        // Try to update Agent
        log.info("Updating Agent on Retell", { externalAgentId: agent.external_agent_id })
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
          log.info("Update failed, creating new agent on Retell instead")
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
        log.info("Deleting Agent on Retell", { externalAgentId: agent.external_agent_id })
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
          log.info("Deleting LLM on Retell", { llmId: deleteConfig.retell_llm_id })
          await deleteRetellLLMWithKey(deleteConfig.retell_llm_id, secretKey)
        }

        return await processRetellDeleteResponse(agentResponse, agent.id)
      }

      case "update_tools": {
        // Update only the LLM (tools, prompts, webhook_url)
        // This is more efficient when only tools change
        const toolsConfig = agent.config || {}

        if (!toolsConfig.retell_llm_id) {
          log.info("No LLM ID found, performing full sync")
          return await safeRetellSync(agent, "update")
        }

        log.info("Updating LLM tools on Retell", { llmId: toolsConfig.retell_llm_id })
        const llmPayload = mapToRetellLLM(agent)
        const llmUpdateResponse = await updateRetellLLMWithKey(
          toolsConfig.retell_llm_id,
          llmPayload,
          secretKey
        )

        if (!llmUpdateResponse.success) {
          log.error("LLM tools update failed", { error: llmUpdateResponse.error })
          // If LLM update fails, try full sync (might need to recreate)
          return await safeRetellSync(agent, "update")
        }

        log.info("LLM tools updated successfully")
        return {
          success: true,
          llm_id: toolsConfig.retell_llm_id,
        }
      }

      default:
        return { success: false, error: "Invalid sync operation" }
    }
  } catch (error) {
    log.error("Sync error", { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown sync error",
    }
  }
}




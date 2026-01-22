/**
 * Retell Sync
 * Orchestrates sync operations between internal agents and Retell
 * 
 * Architecture:
 * - Each agent has its own dedicated LLM (1:1 relationship)
 * - Tools are configured on the LLM level (not agent level)
 * - Custom tools are registered with MCP server, then referenced via mcps array
 * - Webhook URL is set on the LLM for tool execution callbacks (fallback)
 * 
 * Flow:
 * - CREATE: Register tools with MCP → Create LLM → Create Agent
 * - UPDATE: Register tools with MCP → Update LLM → Update Agent
 * - DELETE: Delete Agent → Delete LLM → Delete tools from MCP
 * - TOOLS: Register tools with MCP → Update only the LLM
 */

import { createClient } from "@supabase/supabase-js"
import type { AIAgent, FunctionTool } from "@/types/database.types"
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
import { mcpClient, convertToMCPTool, isMCPConfigured, type MCPToolInput } from "@/lib/integrations/mcp"

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
// MCP TOOL REGISTRATION
// ============================================================================

/**
 * Check if agent has custom function tools
 */
function hasCustomFunctionTools(agent: AIAgent): boolean {
  const tools = agent.config?.tools || []
  return tools.some(
    (t: FunctionTool) => t.enabled !== false && 
    (t.tool_type === 'function' || t.tool_type === 'custom_function')
  )
}

/**
 * Get custom function tools from agent
 */
function getCustomFunctionTools(agent: AIAgent): FunctionTool[] {
  const tools = agent.config?.tools || []
  return tools.filter(
    (t: FunctionTool) => t.enabled !== false && 
    (t.tool_type === 'function' || t.tool_type === 'custom_function')
  )
}

/**
 * Register agent's custom tools with MCP server
 * This must be called before syncing to Retell so the MCP server knows about the tools
 */
async function registerToolsWithMCP(
  agent: AIAgent,
  workspaceId: string,
  partnerId: string
): Promise<{ success: boolean; error?: string }> {
  // Check if MCP is configured
  if (!isMCPConfigured()) {
    log.warn("MCP not configured, skipping tool registration")
    return { success: true } // Not an error, just not configured
  }

  // Check if agent has custom function tools
  if (!hasCustomFunctionTools(agent)) {
    log.debug("Agent has no custom function tools, skipping MCP registration")
    return { success: true }
  }

  const customTools = getCustomFunctionTools(agent)
  log.info("Registering custom tools with MCP", { 
    agentId: agent.id, 
    toolCount: customTools.length 
  })

  // Convert tools to MCP format
  const defaultWebhookUrl = agent.config?.tools_server_url
  const mcpTools: MCPToolInput[] = []

  for (const tool of customTools) {
    const mcpTool = convertToMCPTool(tool, defaultWebhookUrl)
    if (mcpTool) {
      mcpTools.push(mcpTool)
    }
  }

  if (mcpTools.length === 0) {
    log.warn("No valid custom tools to register (missing webhook URLs?)")
    return { success: true }
  }

  // Register with MCP server
  try {
    const result = await mcpClient.registerTools(
      agent.id,
      workspaceId,
      partnerId,
      mcpTools
    )

    if (!result.success) {
      log.error("Failed to register tools with MCP", { error: result.error })
      return { success: false, error: result.error }
    }

    log.info("Successfully registered tools with MCP", { 
      agentId: agent.id,
      toolsCount: mcpTools.length 
    })
    return { success: true }
  } catch (error) {
    log.error("Error registering tools with MCP", { error })
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }
  }
}

/**
 * Delete agent's tools from MCP server
 */
async function deleteToolsFromMCP(agentId: string): Promise<void> {
  if (!isMCPConfigured()) {
    return
  }

  try {
    await mcpClient.deleteTools(agentId)
    log.info("Deleted tools from MCP", { agentId })
  } catch (error) {
    // Log but don't fail - MCP cleanup is best effort
    log.warn("Failed to delete tools from MCP", { agentId, error })
  }
}

/**
 * Get partner ID for agent's workspace
 */
async function getPartnerIdForWorkspace(workspaceId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("workspaces")
      .select("partner_id")
      .eq("id", workspaceId)
      .single()

    if (error || !data) {
      return null
    }

    return data.partner_id
  } catch {
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
        // Step 0: Register custom tools with MCP server (if configured)
        if (agent.workspace_id) {
          const partnerId = await getPartnerIdForWorkspace(agent.workspace_id)
          if (partnerId) {
            const mcpResult = await registerToolsWithMCP(agent, agent.workspace_id, partnerId)
            if (!mcpResult.success) {
              // Log warning but continue - MCP registration failure shouldn't block agent creation
              log.warn("MCP tool registration failed, continuing without MCP", { error: mcpResult.error })
            }
          }
        }

        // Step 1: Create LLM first
        log.info("Creating LLM on Retell")
        const llmPayload = mapToRetellLLM(agent)
        log.debug("LLM Payload", { model: llmPayload.model, hasMCP: !!llmPayload.mcps?.length })
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

        // Step 0: Update custom tools in MCP server (if configured)
        if (agent.workspace_id) {
          const partnerId = await getPartnerIdForWorkspace(agent.workspace_id)
          if (partnerId) {
            const mcpResult = await registerToolsWithMCP(agent, agent.workspace_id, partnerId)
            if (!mcpResult.success) {
              log.warn("MCP tool registration failed, continuing without MCP", { error: mcpResult.error })
            }
          }
        }

        const config = agent.config || {}

        // Try to update LLM if we have the llm_id stored
        let llmUpdateFailed = false
        if (config.retell_llm_id) {
          log.info("Updating LLM on Retell", { llmId: config.retell_llm_id })
          const llmPayload = mapToRetellLLM(agent)
          log.debug("LLM Payload", { model: llmPayload.model, hasMCP: !!llmPayload.mcps?.length })
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
          // Still cleanup MCP even if no external agent
          await deleteToolsFromMCP(agent.id)
          return { success: true } // Nothing else to delete
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

        // Cleanup MCP tools
        await deleteToolsFromMCP(agent.id)

        return await processRetellDeleteResponse(agentResponse, agent.id)
      }

      case "update_tools": {
        // Update only the LLM (tools, prompts, webhook_url, mcps)
        // This is more efficient when only tools change
        const toolsConfig = agent.config || {}

        // Step 0: Update custom tools in MCP server (if configured)
        if (agent.workspace_id) {
          const partnerId = await getPartnerIdForWorkspace(agent.workspace_id)
          if (partnerId) {
            const mcpResult = await registerToolsWithMCP(agent, agent.workspace_id, partnerId)
            if (!mcpResult.success) {
              log.warn("MCP tool registration failed, continuing without MCP", { error: mcpResult.error })
            }
          }
        }

        if (!toolsConfig.retell_llm_id) {
          log.info("No LLM ID found, performing full sync")
          return await safeRetellSync(agent, "update")
        }

        log.info("Updating LLM tools on Retell", { llmId: toolsConfig.retell_llm_id })
        const llmPayload = mapToRetellLLM(agent)
        log.debug("LLM Payload", { model: llmPayload.model, hasMCP: !!llmPayload.mcps?.length })
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




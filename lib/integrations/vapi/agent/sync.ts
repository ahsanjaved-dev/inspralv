import { createClient } from "@supabase/supabase-js"
import type { AIAgent } from "@/types/database.types"
import { mapToVapi } from "./mapper"
import {
  createVapiAgentWithKey,
  updateVapiAgentWithKey,
  deleteVapiAgentWithKey,
} from "./config"
import { processVapiResponse, processDeleteResponse } from "./response"
import { syncVapiFunctionTools } from "@/lib/integrations/function_tools/vapi/api/sync"
import { logger } from "@/lib/logger"

const log = logger.child({ module: "VapiSync" })

export type SyncOperation = "create" | "update" | "delete"

export interface VapiSyncResult {
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
// CHECK IF SHOULD SYNC
// ============================================================================

export function shouldSyncToVapi(agent: AIAgent): boolean {
  if (agent.provider !== "vapi") {
    return false
  }

  // NEW ORG-LEVEL FLOW: Always return true for VAPI agents
  // The actual API key will be fetched from workspace's assigned integration
  // If no key is assigned, sync will fail gracefully with an error message
  return true
}

// ============================================================================
// GET API KEY FOR SYNC (NEW ORG-LEVEL FLOW)
// ============================================================================

async function getVapiApiKeyForAgent(
  agent: AIAgent
): Promise<{ secretKey: string; publicKey?: string } | null> {
  // Need workspace_id to fetch the assigned integration
  if (!agent.workspace_id) {
    log.error("Agent has no workspace_id, cannot fetch integration keys")
    return null
  }

  try {
    const supabase = getSupabaseAdmin()
    log.debug("Querying integration assignment", { workspaceId: agent.workspace_id })

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
      .eq("provider", "vapi")
      .single()

    if (assignmentError) {
      // PGRST116 = no rows found, which is expected if no integration assigned
      if (assignmentError.code !== "PGRST116") {
        log.error("Assignment query error", { error: assignmentError.message, code: assignmentError.code })
      }
      return null
    }
    
    if (!assignment) {
      log.debug("No assignment found for workspace")
      return null
    }
    
    log.debug("Assignment found", { integrationId: (assignment.partner_integration as any)?.id })

    if (!assignment.partner_integration) {
      log.debug("Assignment exists but partner_integration is null")
      return null
    }

    const partnerIntegration = assignment.partner_integration as any
    if (!partnerIntegration.is_active) {
      log.debug("Assigned VAPI integration is not active")
      return null
    }

    const apiKeys = partnerIntegration.api_keys as any
    if (!apiKeys?.default_secret_key) {
      log.error("Assigned integration has no secret key")
      return null
    }

    log.debug("Successfully retrieved API keys")
    return {
      secretKey: apiKeys.default_secret_key,
      publicKey: apiKeys.default_public_key || undefined,
    }
  } catch (error) {
    log.error("Exception fetching API keys for agent", { error })
    return null
  }
}

// ============================================================================
// SAFE VAPI SYNC
// ============================================================================

export async function safeVapiSync(
  agent: AIAgent,
  operation: SyncOperation = "create"
): Promise<VapiSyncResult> {
  log.info(`Starting ${operation} sync`, { agentId: agent.id, agentName: agent.name })
  
  try {
    if (!shouldSyncToVapi(agent)) {
      log.debug("Skipping sync - agent is not VAPI provider")
      return { success: true }
    }

    // Get the API key
    log.debug("Fetching API key", { workspaceId: agent.workspace_id })
    const keys = await getVapiApiKeyForAgent(agent)

    if (!keys?.secretKey) {
      const errorMsg = "No VAPI API key configured. Please assign an API key in the agent settings."
      log.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
      }
    }
    
    log.debug(`API key found, proceeding with ${operation}`)

    // ------------------------------------------------------------------------
    // Custom Function Tools (API Alternative)
    // - Sync internal `config.tools` (function tools) to VAPI via /tool API
    // - Persist `external_tool_id` back into the agent config
    // - mapToVapi will then attach them via `model.toolIds`
    // ------------------------------------------------------------------------
    let agentForMapping: AIAgent = agent
    if (operation !== "delete") {
      const configAny = (agent.config || {}) as any
      const tools = configAny.tools as any[] | undefined
      const defaultServerUrl = configAny.tools_server_url as string | undefined

      if (Array.isArray(tools) && tools.length > 0) {
        const synced = await syncVapiFunctionTools(tools as any, keys.secretKey, {
          defaultServerUrl,
        })

        if (synced.errors.length > 0) {
          log.warn("Tool sync warnings", { errors: synced.errors })
        }

        // Only persist if something changed (e.g. new external_tool_id)
        const changed =
          JSON.stringify(tools.map((t) => t?.external_tool_id || null)) !==
          JSON.stringify(synced.tools.map((t) => t?.external_tool_id || null))

        if (changed) {
          const supabase = getSupabaseAdmin()
          const nextConfig = { ...configAny, tools: synced.tools }

          await supabase
            .from("ai_agents")
            .update({ config: nextConfig, updated_at: new Date().toISOString() })
            .eq("id", agent.id)

          agentForMapping = {
            ...agent,
            config: nextConfig,
          } as AIAgent
        } else {
          agentForMapping = agent
        }
      }
    }

    const payload = mapToVapi(agentForMapping)
    log.debug("Mapped payload for VAPI", { name: payload.name, model: payload.model?.model })
    let response
    let result: VapiSyncResult

    switch (operation) {
      case "create":
        log.info("Creating agent on VAPI")
        response = await createVapiAgentWithKey(payload, keys.secretKey)
        result = await processVapiResponse(response, agent.id)
        log.info("Create result", { success: result.success, error: result.error, externalId: result.agent?.external_agent_id })
        return result

      case "update":
        if (!agent.external_agent_id) {
          // No external ID, create instead
          log.info("No external_agent_id, creating new agent on VAPI")
          response = await createVapiAgentWithKey(payload, keys.secretKey)
          result = await processVapiResponse(response, agent.id)
          log.info("Create (from update) result", { success: result.success, error: result.error, externalId: result.agent?.external_agent_id })
          return result
        }
        
        log.info("Updating agent on VAPI", { externalAgentId: agent.external_agent_id })
        response = await updateVapiAgentWithKey(
          agent.external_agent_id,
          payload,
          keys.secretKey
        )
        
        // If update fails (agent doesn't exist or API key from different account), create new agent
        if (!response.success) {
          log.info("Update failed, creating new agent on VAPI instead")
          const createResponse = await createVapiAgentWithKey(payload, keys.secretKey)
          result = await processVapiResponse(createResponse, agent.id)
          log.info("Create (fallback) result", { success: result.success, error: result.error, externalId: result.agent?.external_agent_id })
          return result
        }
        
        result = await processVapiResponse(response, agent.id)
        log.info("Update result", { success: result.success, error: result.error, externalId: result.agent?.external_agent_id })
        return result

      case "delete":
        if (!agent.external_agent_id) {
          log.debug("No external_agent_id, nothing to delete")
          return { success: true } // Nothing to delete
        }
        log.info("Deleting agent on VAPI", { externalAgentId: agent.external_agent_id })
        response = await deleteVapiAgentWithKey(
          agent.external_agent_id,
          keys.secretKey
        )
        return await processDeleteResponse(response, agent.id)

      default:
        return { success: false, error: "Invalid sync operation" }
    }
  } catch (error) {
    log.error("Sync exception", { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown sync error",
    }
  }
}
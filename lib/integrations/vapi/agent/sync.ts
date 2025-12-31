import { createClient } from "@supabase/supabase-js"
import type { AIAgent, IntegrationApiKeys } from "@/types/database.types"
import { mapToVapi } from "./mapper"
import {
  createVapiAgentWithKey,
  updateVapiAgentWithKey,
  deleteVapiAgentWithKey,
} from "./config"
import { processVapiResponse, processDeleteResponse } from "./response"
import { syncVapiFunctionTools } from "@/lib/integrations/function_tools/vapi"

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

  // NEW FLOW: Check if an API key is assigned via assigned_key_id
  const apiKeyConfig = agent.config?.api_key_config
  if (apiKeyConfig?.assigned_key_id) {
    return true
  }

  // Legacy: Check if secret_key type is configured (not "none")
  const secretKeyConfig = apiKeyConfig?.secret_key
  if (secretKeyConfig && secretKeyConfig.type !== "none") {
    return true
  }

  // Legacy: Check legacy keys stored directly on agent
  const hasLegacySecretKey = agent.agent_secret_api_key?.some(
    (key) => key.provider === "vapi" && key.is_active
  )

  return hasLegacySecretKey || false
}

// ============================================================================
// GET API KEY FOR SYNC
// ============================================================================

async function getVapiApiKeyForAgent(
  agent: AIAgent
): Promise<{ secretKey: string; publicKey?: string } | null> {
  // First check legacy keys stored directly on agent
  const legacyKey = agent.agent_secret_api_key?.find(
    (key) => key.provider === "vapi" && key.is_active
  )

  if (legacyKey?.key) {
    const legacyPublicKey = agent.agent_public_api_key?.find(
      (key) => key.provider === "vapi" && key.is_active
    )
    return {
      secretKey: legacyKey.key,
      publicKey: legacyPublicKey?.key,
    }
  }

  // Need to fetch from workspace_integrations
  if (!agent.workspace_id) {
    console.error("[VapiSync] Agent has no workspace_id, cannot fetch integration keys")
    return null
  }

  try {
    const supabase = getSupabaseAdmin()

    const { data: integration, error } = await supabase
      .from("workspace_integrations")
      .select("api_keys")
      .eq("workspace_id", agent.workspace_id)
      .eq("provider", "vapi")
      .eq("is_active", true)
      .single()

    if (error || !integration) {
      console.error("[VapiSync] Failed to fetch VAPI integration:", error)
      return null
    }

    const apiKeys = integration.api_keys as IntegrationApiKeys
    const apiKeyConfig = agent.config?.api_key_config

    // NEW FLOW: Check assigned_key_id first
    if (apiKeyConfig?.assigned_key_id) {
      const keyId = apiKeyConfig.assigned_key_id
      
      // Check if it's the default key
      if (keyId === "default" && apiKeys.default_secret_key) {
        return {
          secretKey: apiKeys.default_secret_key,
          publicKey: apiKeys.default_public_key,
        }
      }
      
      // Check additional keys
      const additionalKey = apiKeys.additional_keys?.find((k) => k.id === keyId)
      if (additionalKey?.secret_key) {
        return {
          secretKey: additionalKey.secret_key,
          publicKey: additionalKey.public_key,
        }
      }
      
      console.error("[VapiSync] Assigned key not found:", keyId)
      return null
    }

    // Legacy flow: Check secret_key.type
    if (!apiKeyConfig?.secret_key || apiKeyConfig.secret_key.type === "none") {
      return null
    }

    if (apiKeyConfig.secret_key.type === "default") {
      if (!apiKeys.default_secret_key) return null
      return {
        secretKey: apiKeys.default_secret_key,
        publicKey: apiKeys.default_public_key,
      }
    }

    if (apiKeyConfig.secret_key.type === "additional") {
      const additionalKeyId = apiKeyConfig.secret_key.additional_key_id
      const additionalKey = apiKeys.additional_keys?.find(
        (k) => k.id === additionalKeyId
      )

      if (!additionalKey || !additionalKey.secret_key) {
        console.error("[VapiSync] Additional key not found:", additionalKeyId)
        return null
      }

      return {
        secretKey: additionalKey.secret_key,
        publicKey: additionalKey.public_key,
      }
    }

    return null
  } catch (error) {
    console.error("[VapiSync] Error fetching API keys for agent:", error)
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
  try {
    if (!shouldSyncToVapi(agent)) {
      console.log("[VapiSync] Skipping sync - no API key configured")
      return { success: true }
    }

    // Get the API key
    const keys = await getVapiApiKeyForAgent(agent)

    if (!keys?.secretKey) {
      console.error("[VapiSync] No API key found for agent")
      return {
        success: false,
        error: "No VAPI API key configured. Please assign an API key in the agent settings.",
      }
    }

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
          console.warn("[VapiSync] Tool sync warnings:", synced.errors)
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
    let response

    switch (operation) {
      case "create":
        console.log("[VapiSync] Creating agent on VAPI...")
        response = await createVapiAgentWithKey(payload, keys.secretKey)
        return await processVapiResponse(response, agent.id)

      case "update":
        if (!agent.external_agent_id) {
          // No external ID, create instead
          console.log("[VapiSync] No external_agent_id, creating new agent on VAPI...")
          response = await createVapiAgentWithKey(payload, keys.secretKey)
          return await processVapiResponse(response, agent.id)
        }
        
        console.log("[VapiSync] Updating agent on VAPI:", agent.external_agent_id)
        response = await updateVapiAgentWithKey(
          agent.external_agent_id,
          payload,
          keys.secretKey
        )
        
        // If update fails (agent doesn't exist or API key from different account), create new agent
        if (!response.success) {
          console.log("[VapiSync] Update failed, creating new agent on VAPI instead...")
          const createResponse = await createVapiAgentWithKey(payload, keys.secretKey)
          return await processVapiResponse(createResponse, agent.id)
        }
        
        return await processVapiResponse(response, agent.id)

      case "delete":
        if (!agent.external_agent_id) {
          return { success: true } // Nothing to delete
        }
        console.log("[VapiSync] Deleting agent on VAPI:", agent.external_agent_id)
        response = await deleteVapiAgentWithKey(
          agent.external_agent_id,
          keys.secretKey
        )
        return await processDeleteResponse(response, agent.id)

      default:
        return { success: false, error: "Invalid sync operation" }
    }
  } catch (error) {
    console.error("[VapiSync] Sync error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown sync error",
    }
  }
}
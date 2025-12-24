import { createClient } from "@supabase/supabase-js"
import type { AIAgent, IntegrationApiKeys } from "@/types/database.types"
import { mapToVapi } from "./mapper"
import {
  createVapiAgentWithKey,
  updateVapiAgentWithKey,
  deleteVapiAgentWithKey,
} from "./config"
import { processVapiResponse, processDeleteResponse } from "./response"

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

  // Check legacy keys (stored directly on agent)
  const hasLegacySecretKey = agent.agent_secret_api_key?.some(
    (key) => key.provider === "vapi" && key.is_active
  )

  // Check new api_key_config (references workspace integration)
  const apiKeyConfig = agent.config?.api_key_config
  const hasNewApiKeyConfig =
    apiKeyConfig?.secret_key?.type === "default" ||
    apiKeyConfig?.secret_key?.type === "additional"

  return hasLegacySecretKey || hasNewApiKeyConfig
}

// ============================================================================
// GET API KEY FOR SYNC
// ============================================================================

async function getVapiApiKeyForAgent(
  agent: AIAgent
): Promise<{ secretKey: string; publicKey?: string } | null> {
  // First check legacy keys
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

  // Check new api_key_config
  const apiKeyConfig = agent.config?.api_key_config
  if (!apiKeyConfig?.secret_key || apiKeyConfig.secret_key.type === "none") {
    return null
  }

  // Need to fetch from workspace_integrations
  if (!agent.workspace_id) {
    console.error("Agent has no workspace_id, cannot fetch integration keys")
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
      console.error("Failed to fetch VAPI integration:", error)
      return null
    }

    const apiKeys = integration.api_keys as IntegrationApiKeys

    if (apiKeyConfig.secret_key.type === "default") {
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

      if (!additionalKey) {
        console.error("Additional key not found:", additionalKeyId)
        return null
      }

      return {
        secretKey: additionalKey.secret_key,
        publicKey: additionalKey.public_key,
      }
    }

    return null
  } catch (error) {
    console.error("Error fetching API keys for agent:", error)
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
      console.log("[VapiSync] Skipping sync - not configured for VAPI")
      return { success: true }
    }

    // Get the API key
    const keys = await getVapiApiKeyForAgent(agent)

    if (!keys?.secretKey) {
      console.error("[VapiSync] No API key found for agent")
      return {
        success: false,
        error: "No VAPI API key configured. Please set up API keys in the agent or integration settings.",
      }
    }

    const payload = mapToVapi(agent)
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
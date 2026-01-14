/**
 * VAPI Response Handler
 * Processes VAPI responses and updates Supabase
 */

import { createClient } from "@supabase/supabase-js"
import type { AIAgent } from "@/types/database.types"
import type { VapiResponse } from "./config"
import { mapFromVapi, type VapiAssistantResponse } from "./mapper"
import { env } from "@/lib/env"

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessResponseResult {
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
// PROCESS VAPI RESPONSE
// ============================================================================

export async function processVapiResponse(
  providerResponse: VapiResponse,
  agentId: string
): Promise<ProcessResponseResult> {
  if (!providerResponse.success || !providerResponse.data) {
    return {
      success: false,
      error: providerResponse.error || "No data in VAPI response",
    }
  }

  try {
    const supabase = getSupabaseAdmin()
    const vapiData = providerResponse.data as VapiAssistantResponse
    const mappedData = mapFromVapi(vapiData)

    // Get current agent to merge config and get workspace_id
    const { data: currentAgent, error: fetchError } = await supabase
      .from("ai_agents")
      .select("config, workspace_id")
      .eq("id", agentId)
      .single()

    if (fetchError) {
      return {
        success: false,
        error: `Failed to fetch current agent: ${fetchError.message}`,
      }
    }

    // Generate webhook URL based on workspace
    // This URL is stored in config as read-only for user reference
    const baseUrl = (env.appUrl || "https://genius365.vercel.app").replace(/\/$/, "")
    const webhookUrl = currentAgent?.workspace_id
      ? `${baseUrl}/api/webhooks/w/${currentAgent.workspace_id}/vapi`
      : `${baseUrl}/api/webhooks/vapi`

    // Merge existing config with updates from VAPI
    // Include the generated webhook URL as a read-only field
    const mergedConfig = {
      ...(currentAgent?.config || {}),
      ...(mappedData.config || {}),
      // Store webhook URL in config (read-only, auto-generated)
      provider_webhook_url: webhookUrl,
      provider_webhook_configured_at: new Date().toISOString(),
    }

    // Update agent in Supabase
    const { data: updatedAgent, error: updateError } = await supabase
      .from("ai_agents")
      .update({
        external_agent_id: mappedData.external_agent_id,
        config: mergedConfig,
        sync_status: "synced",
        needs_resync: false,
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        ...(mappedData.voice_provider && { voice_provider: mappedData.voice_provider }),
        ...(mappedData.model_provider && { model_provider: mappedData.model_provider }),
        ...(mappedData.transcriber_provider && { transcriber_provider: mappedData.transcriber_provider }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId)
      .select()
      .single()

    if (updateError) {
      return {
        success: false,
        error: `Failed to update agent: ${updateError.message}`,
      }
    }

    console.log(`[VapiResponse] Agent synced successfully. Webhook URL: ${webhookUrl}`)

    return {
      success: true,
      agent: updatedAgent as AIAgent,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error processing VAPI response",
    }
  }
}

// ============================================================================
// PROCESS DELETE RESPONSE
// ============================================================================

export async function processDeleteResponse(
  providerResponse: VapiResponse,
  agentId: string
): Promise<ProcessResponseResult> {
  if (!providerResponse.success) {
    return {
      success: false,
      error: providerResponse.error || "Failed to delete agent on VAPI",
    }
  }

  try {
    const supabase = getSupabaseAdmin()

    // Clear external_agent_id after successful deletion
    const { data: updatedAgent, error: updateError } = await supabase
      .from("ai_agents")
      .update({
        external_agent_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId)
      .select()
      .single()

    if (updateError) {
      return {
        success: false,
        error: `Failed to update agent after VAPI deletion: ${updateError.message}`,
      }
    }

    return {
      success: true,
      agent: updatedAgent as AIAgent,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error processing delete response",
    }
  }
}
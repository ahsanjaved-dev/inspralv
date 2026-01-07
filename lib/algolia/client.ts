/**
 * Algolia workspace configuration
 *
 * Keys are stored per-workspace in `workspace_integrations` (provider = "algolia").
 * We intentionally do NOT depend on the `algoliasearch` npm package; all calls use REST (`fetch`).
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { AlgoliaIntegrationConfig } from "@/types/database.types"

export interface WorkspaceAlgoliaConfig {
  appId: string
  adminApiKey: string
  searchApiKey: string
  callLogsIndex: string
}

// Simple in-memory cache (server-only usage). Safe to no-op if it gets cleared.
const configCache = new Map<string, WorkspaceAlgoliaConfig | null>()

/**
 * Get Algolia configuration for a workspace from `workspace_integrations`.
 */
export async function getWorkspaceAlgoliaConfig(
  workspaceId: string
): Promise<WorkspaceAlgoliaConfig | null> {
  if (configCache.has(workspaceId)) {
    return configCache.get(workspaceId) ?? null
  }

  try {
    const adminClient = createAdminClient()

    const { data: integration, error } = await adminClient
      .from("workspace_integrations")
      .select("config")
      .eq("workspace_id", workspaceId)
      .eq("provider", "algolia")
      .eq("is_active", true)
      .single()

    if (error || !integration) {
      configCache.set(workspaceId, null)
      return null
    }

    const config = integration.config as AlgoliaIntegrationConfig | null
    if (!config?.app_id || !config?.admin_api_key || !config?.search_api_key) {
      console.warn("[Algolia] Incomplete configuration for workspace:", workspaceId)
      configCache.set(workspaceId, null)
      return null
    }

    const resolved: WorkspaceAlgoliaConfig = {
      appId: config.app_id,
      adminApiKey: config.admin_api_key,
      searchApiKey: config.search_api_key,
      callLogsIndex: config.call_logs_index || "call_logs",
    }

    configCache.set(workspaceId, resolved)
    return resolved
  } catch (error) {
    console.error("[Algolia] Error fetching workspace config:", error)
    configCache.set(workspaceId, null)
    return null
  }
}

export async function isAlgoliaConfigured(workspaceId: string): Promise<boolean> {
  return (await getWorkspaceAlgoliaConfig(workspaceId)) !== null
}

export function clearAlgoliaCache(workspaceId: string): void {
  configCache.delete(workspaceId)
}

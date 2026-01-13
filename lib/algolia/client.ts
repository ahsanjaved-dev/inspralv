/**
 * Algolia Organization-Level Configuration
 *
 * New architecture: Algolia integration is configured at the organization (partner) level.
 * - API keys are stored in `partner_integrations` table (provider = "algolia")
 * - Workspaces are assigned to org-level integrations via `workspace_integration_assignments`
 * - Each workspace uses a unique `workspace_id` as a filter/namespace in Algolia indices
 * - This ensures data isolation while using shared org-level credentials
 *
 * Fallback: Legacy workspace-level config from `workspace_integrations` is still supported
 * for backwards compatibility during migration.
 *
 * We intentionally do NOT depend on the `algoliasearch` npm package; all calls use REST (`fetch`).
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"
import type { AlgoliaIntegrationConfig } from "@/types/database.types"

export interface AlgoliaConfig {
  appId: string
  adminApiKey: string
  searchApiKey: string
  callLogsIndex: string
}

export interface WorkspaceAlgoliaContext {
  config: AlgoliaConfig
  workspaceId: string
  partnerId: string
}

// Simple in-memory cache (server-only usage). Safe to no-op if it gets cleared.
const configCache = new Map<string, AlgoliaConfig | null>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const cacheTimestamps = new Map<string, number>()

/**
 * Check if cached config is still valid
 */
function isCacheValid(key: string): boolean {
  const timestamp = cacheTimestamps.get(key)
  if (!timestamp) return false
  return Date.now() - timestamp < CACHE_TTL_MS
}

/**
 * Set config in cache with timestamp
 */
function setCache(key: string, config: AlgoliaConfig | null): void {
  configCache.set(key, config)
  cacheTimestamps.set(key, Date.now())
}

/**
 * Get Algolia configuration for a workspace.
 *
 * Flow:
 * 1. Check for org-level integration via workspace_integration_assignments + partner_integrations
 * 2. If no org-level integration, check for default org-level integration and auto-assign
 * 3. Fallback to legacy workspace_integrations for backwards compatibility
 *
 * @param workspaceId - The workspace UUID
 * @returns AlgoliaConfig or null if not configured
 */
export async function getWorkspaceAlgoliaConfig(
  workspaceId: string
): Promise<AlgoliaConfig | null> {
  const cacheKey = `algolia:${workspaceId}`

  if (configCache.has(cacheKey) && isCacheValid(cacheKey)) {
    return configCache.get(cacheKey) ?? null
  }

  try {
    // Try org-level integration first (new architecture)
    const orgConfig = await getOrgLevelAlgoliaConfig(workspaceId)
    if (orgConfig) {
      setCache(cacheKey, orgConfig)
      return orgConfig
    }

    // Fallback to legacy workspace-level config
    const legacyConfig = await getLegacyAlgoliaConfig(workspaceId)
    if (legacyConfig) {
      console.log("[Algolia] Using legacy workspace-level config for workspace:", workspaceId)
      setCache(cacheKey, legacyConfig)
      return legacyConfig
    }

    setCache(cacheKey, null)
    return null
  } catch (error) {
    console.error("[Algolia] Error fetching workspace config:", error)
    setCache(cacheKey, null)
    return null
  }
}

/**
 * Get org-level Algolia configuration via partner_integrations
 */
async function getOrgLevelAlgoliaConfig(workspaceId: string): Promise<AlgoliaConfig | null> {
  if (!prisma) {
    return null
  }

  try {
    // Check for existing assignment
    let assignment = await prisma.workspaceIntegrationAssignment.findFirst({
      where: {
        workspaceId,
        provider: "algolia",
      },
      include: {
        partnerIntegration: {
          select: {
            id: true,
            config: true,
            apiKeys: true,
            isActive: true,
          },
        },
      },
    })

    // If no assignment, try to auto-assign default integration
    if (!assignment) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { partnerId: true },
      })

      if (workspace?.partnerId) {
        const defaultIntegration = await prisma.partnerIntegration.findFirst({
          where: {
            partnerId: workspace.partnerId,
            provider: "algolia",
            isDefault: true,
            isActive: true,
          },
          select: {
            id: true,
            config: true,
            apiKeys: true,
            isActive: true,
          },
        })

        if (defaultIntegration) {
          // Auto-create the assignment
          console.log(
            `[Algolia] Auto-assigning default Algolia integration to workspace ${workspaceId}`
          )
          await prisma.workspaceIntegrationAssignment.create({
            data: {
              workspaceId,
              provider: "algolia",
              partnerIntegrationId: defaultIntegration.id,
            },
          })

          // Create a mock assignment object to continue
          assignment = {
            partnerIntegration: defaultIntegration,
          } as any
        }
      }
    }

    if (!assignment?.partnerIntegration?.isActive) {
      return null
    }

    const integration = assignment.partnerIntegration
    const config = integration.config as Record<string, unknown> | null
    const apiKeys = integration.apiKeys as Record<string, unknown> | null

    // Get keys from config first, then fallback to apiKeys (for backwards compatibility)
    const appId = config?.app_id as string | undefined
    const adminApiKey = (config?.admin_api_key as string) || (apiKeys?.default_secret_key as string)
    const searchApiKey = (config?.search_api_key as string) || (apiKeys?.default_public_key as string) || adminApiKey
    const callLogsIndex = (config?.call_logs_index as string) || "call_logs"

    // Require at minimum: app_id and admin key
    if (!appId || !adminApiKey) {
      console.warn("[Algolia] Incomplete org-level config for workspace:", workspaceId)
      return null
    }

    return {
      appId,
      adminApiKey,
      searchApiKey: searchApiKey || adminApiKey, // Fallback to admin key if no search key
      callLogsIndex,
    }
  } catch (error) {
    console.error("[Algolia] Error fetching org-level config:", error)
    return null
  }
}

/**
 * Get legacy workspace-level Algolia configuration (for backwards compatibility)
 */
async function getLegacyAlgoliaConfig(workspaceId: string): Promise<AlgoliaConfig | null> {
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
      return null
    }

    const config = integration.config as AlgoliaIntegrationConfig | null
    if (!config?.app_id || !config?.admin_api_key || !config?.search_api_key) {
      return null
    }

    return {
      appId: config.app_id,
      adminApiKey: config.admin_api_key,
      searchApiKey: config.search_api_key,
      callLogsIndex: config.call_logs_index || "call_logs",
    }
  } catch (error) {
    console.error("[Algolia] Error fetching legacy config:", error)
    return null
  }
}

/**
 * Check if Algolia is configured for a workspace
 */
export async function isAlgoliaConfigured(workspaceId: string): Promise<boolean> {
  return (await getWorkspaceAlgoliaConfig(workspaceId)) !== null
}

/**
 * Get full workspace Algolia context (config + IDs for filtering)
 */
export async function getWorkspaceAlgoliaContext(
  workspaceId: string,
  partnerId: string
): Promise<WorkspaceAlgoliaContext | null> {
  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return null

  return {
    config,
    workspaceId,
    partnerId,
  }
}

/**
 * Clear Algolia cache for a workspace (call when config changes)
 */
export function clearAlgoliaCache(workspaceId: string): void {
  const cacheKey = `algolia:${workspaceId}`
  configCache.delete(cacheKey)
  cacheTimestamps.delete(cacheKey)
}

/**
 * Clear all Algolia cache (for testing or major config changes)
 */
export function clearAllAlgoliaCache(): void {
  configCache.clear()
  cacheTimestamps.clear()
}

/**
 * Get Algolia client-side configuration for React InstantSearch
 * This returns only the search API key (safe for client-side) and app ID
 */
export async function getAlgoliaSearchClientConfig(
  workspaceId: string
): Promise<{ appId: string; searchApiKey: string; indexName: string } | null> {
  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return null

  return {
    appId: config.appId,
    searchApiKey: config.searchApiKey,
    indexName: config.callLogsIndex,
  }
}

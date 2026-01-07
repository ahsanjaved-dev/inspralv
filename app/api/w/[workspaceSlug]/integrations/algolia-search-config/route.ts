import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import type { AlgoliaIntegrationConfig } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// ============================================================================
// GET /api/w/[workspaceSlug]/integrations/algolia-search-config
// Returns Algolia search configuration for client-side use
// Only exposes safe keys (app_id and search_api_key - never admin_api_key)
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const { data: integration, error } = await ctx.adminClient
      .from("workspace_integrations")
      .select("config, is_active")
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", "algolia")
      .single()

    if (error || !integration) {
      return apiResponse({
        configured: false,
        message: "Algolia not configured for this workspace",
      })
    }

    if (!integration.is_active) {
      return apiResponse({
        configured: false,
        message: "Algolia integration is disabled",
      })
    }

    const config = integration.config as AlgoliaIntegrationConfig | null

    if (!config?.app_id || !config?.search_api_key) {
      return apiResponse({
        configured: false,
        message: "Algolia configuration is incomplete",
      })
    }

    // NEVER return admin_api_key
    return apiResponse({
      configured: true,
      appId: config.app_id,
      searchApiKey: config.search_api_key,
      indexName: config.call_logs_index || "call_logs",
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/integrations/algolia-search-config error:", error)
    return serverError()
  }
}



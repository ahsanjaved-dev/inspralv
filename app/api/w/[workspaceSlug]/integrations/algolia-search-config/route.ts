import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { getAlgoliaSearchClientConfig, isAlgoliaConfigured } from "@/lib/algolia/client"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// ============================================================================
// GET /api/w/[workspaceSlug]/integrations/algolia-search-config
// Returns Algolia search configuration for client-side use (React InstantSearch)
// Only exposes safe keys (app_id and search_api_key - never admin_api_key)
// Also returns workspaceId which is used for filtering in searches
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Use new org-level config client (with fallback to legacy)
    const config = await getAlgoliaSearchClientConfig(ctx.workspace.id)

    if (!config) {
      return apiResponse({
        configured: false,
        message: "Algolia not configured for this workspace",
        benefits: getAlgoliaBenefits(),
      })
    }

    // Return minimal config - searches are proxied through backend
    // No API keys or index names exposed to client
    return apiResponse({
      configured: true,
      workspaceId: ctx.workspace.id,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/integrations/algolia-search-config error:", error)
    return serverError()
  }
}

// ============================================================================
// Benefits messaging for unconfigured state
// ============================================================================

function getAlgoliaBenefits() {
  return {
    title: "Unlock Fast Search with Algolia",
    features: [
      {
        icon: "zap",
        title: "Instant Search Results",
        description: "Search through thousands of call logs in milliseconds",
      },
      {
        icon: "sparkles",
        title: "Smart Autocomplete",
        description: "Get suggestions as you type for faster discovery",
      },
      {
        icon: "layers",
        title: "Advanced Filtering",
        description: "Filter by status, agent, date range, and more simultaneously",
      },
      {
        icon: "trending-up",
        title: "Typo Tolerance",
        description: "Find results even with misspellings or partial matches",
      },
    ],
    cta: "Configure Algolia in Organization Settings to enable fast search",
  }
}

import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { getWorkspaceAlgoliaConfig } from "@/lib/algolia/client"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// ============================================================================
// POST /api/w/[workspaceSlug]/calls/search
// Proxies search requests to Algolia, hiding the index name from clients
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const config = await getWorkspaceAlgoliaConfig(ctx.workspace.id)
    if (!config) {
      return apiError("Algolia not configured for this workspace", 400)
    }

    const body = await request.json()
    const { query = "", page = 0, hitsPerPage = 20, filters = {}, type = "search" } = body

    // Build filter string - workspace_id is ALWAYS required
    const filterParts: string[] = [`workspace_id:${ctx.workspace.id}`]

    if (filters.status) {
      filterParts.push(`status:${filters.status}`)
    }
    if (filters.direction) {
      filterParts.push(`direction:${filters.direction}`)
    }
    if (filters.callType) {
      filterParts.push(`call_type:${filters.callType.toLowerCase()}`)
    }
    if (filters.agentId) {
      filterParts.push(`agent_id:${filters.agentId}`)
    }

    // Date filters
    const numericFilters: string[] = []
    if (filters.startDate) {
      numericFilters.push(`created_at_timestamp >= ${new Date(filters.startDate).getTime()}`)
    }
    if (filters.endDate) {
      numericFilters.push(`created_at_timestamp <= ${new Date(filters.endDate).getTime()}`)
    }

    // Make request to Algolia
    const algoliaUrl = `https://${config.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(config.callLogsIndex)}/query`
    
    const algoliaBody: Record<string, unknown> = {
      query,
      filters: filterParts.join(" AND "),
      page,
      hitsPerPage,
    }

    if (numericFilters.length > 0) {
      algoliaBody.numericFilters = numericFilters
    }

    // Different config for autocomplete vs search
    if (type === "autocomplete") {
      algoliaBody.hitsPerPage = 10
      algoliaBody.attributesToRetrieve = [
        "caller_name",
        "phone_number",
        "agent_name",
        "transcript",
        "summary",
        "objectID",
        "conversation_id",
      ]
      algoliaBody.attributesToHighlight = [
        "caller_name",
        "phone_number",
        "agent_name",
        "transcript",
        "summary",
      ]
      algoliaBody.highlightPreTag = "<mark>"
      algoliaBody.highlightPostTag = "</mark>"
    } else {
      algoliaBody.attributesToRetrieve = [
        "objectID",
        "conversation_id",
        "external_id",
        "workspace_id",
        "agent_id",
        "call_type",
        "agent_name",
        "status",
        "direction",
        "sentiment",
        "provider",
        "duration_seconds",
        "total_cost",
        "phone_number",
        "caller_name",
        "started_at_timestamp",
        "ended_at_timestamp",
        "created_at_timestamp",
        "transcript",
        "summary",
        "recording_url",
      ]
      algoliaBody.attributesToHighlight = ["transcript", "summary", "caller_name"]
      algoliaBody.highlightPreTag = "<mark>"
      algoliaBody.highlightPostTag = "</mark>"
    }

    const response = await fetch(algoliaUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": config.appId,
        "X-Algolia-API-Key": config.searchApiKey,
      },
      body: JSON.stringify(algoliaBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Algolia Search] Error:", errorText)
      return apiError("Search failed", response.status)
    }

    const result = await response.json()

    return apiResponse({
      hits: result.hits || [],
      nbHits: result.nbHits || 0,
      page: result.page || 0,
      nbPages: result.nbPages || 0,
      hitsPerPage: result.hitsPerPage || hitsPerPage,
      processingTimeMS: result.processingTimeMS,
      query,
    })
  } catch (error) {
    console.error("POST /api/w/[slug]/calls/search error:", error)
    return serverError()
  }
}


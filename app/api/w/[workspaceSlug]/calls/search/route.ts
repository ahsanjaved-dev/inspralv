import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { getWorkspaceAlgoliaConfig } from "@/lib/algolia/client"
import { configureCallLogsIndex } from "@/lib/algolia/call-logs"

// Track if we've configured the index in this process
const indexConfiguredSet = new Set<string>()

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

    console.log(`[Algolia Search] Workspace: ${workspaceSlug} -> ID: ${ctx.workspace.id}`)

    const config = await getWorkspaceAlgoliaConfig(ctx.workspace.id)
    if (!config) {
      console.log(`[Algolia Search] No Algolia config for workspace ${ctx.workspace.id}`)
      return apiError("Algolia not configured for this workspace", 400)
    }

    // Ensure index is configured (once per process)
    if (!indexConfiguredSet.has(ctx.workspace.id)) {
      console.log(`[Algolia Search] Configuring index for workspace ${ctx.workspace.id}`)
      await configureCallLogsIndex(ctx.workspace.id)
      indexConfiguredSet.add(ctx.workspace.id)
    }

    const body = await request.json()
    const { query = "", page = 0, hitsPerPage = 20, filters = {}, type = "search" } = body

    // Build filter string - workspace_id is ALWAYS required
    const filterParts: string[] = [`workspace_id:${ctx.workspace.id}`]
    
    console.log(`[Algolia Search] Filter: workspace_id:${ctx.workspace.id}, query: "${query}", type: ${type}`)

    if (filters.status) {
      filterParts.push(`status:${filters.status}`)
    }
    if (filters.direction) {
      filterParts.push(`direction:${filters.direction}`)
    }
    if (filters.callType) {
      filterParts.push(`call_type:${filters.callType.toLowerCase()}`)
    }
    // Exclude web calls when filtering for outbound (web calls are stored as direction=outbound)
    if (filters.excludeWebCalls) {
      filterParts.push(`NOT call_type:web`)
    }
    if (filters.agentId) {
      filterParts.push(`agent_id:${filters.agentId}`)
    }

    // Date filters - DEFAULT TO TODAY if no date filters provided
    // This ensures we never return all historical data
    const numericFilters: string[] = []
    
    // Get today's date boundaries (server timezone)
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    
    // Use provided dates or default to today
    const startTimestamp = filters.startDate 
      ? new Date(filters.startDate).getTime() 
      : todayStart.getTime()
    const endTimestamp = filters.endDate 
      ? new Date(filters.endDate).getTime() 
      : todayEnd.getTime()
    
    numericFilters.push(`created_at_timestamp >= ${startTimestamp}`)
    numericFilters.push(`created_at_timestamp <= ${endTimestamp}`)
    
    console.log(`[Algolia Search] Applying date range: ${new Date(startTimestamp).toISOString()} to ${new Date(endTimestamp).toISOString()}`)

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

    console.log(`[Algolia Search] Results: ${result.nbHits || 0} hits, page ${result.page || 0}, hitsLength: ${result.hits?.length || 0}`)
    
    // Debug: Log first and last hit timestamps to verify sorting
    try {
      if (result.hits && result.hits.length > 0) {
        const firstHit = result.hits[0]
        const lastHit = result.hits[result.hits.length - 1]
        const firstDate = new Date(firstHit.created_at_timestamp).toISOString()
        const lastDate = new Date(lastHit.created_at_timestamp).toISOString()
        console.log(`[Algolia Search] SORTING CHECK - First: ${firstHit.objectID?.slice(0,8)}... at ${firstDate}`)
        console.log(`[Algolia Search] SORTING CHECK - Last: ${lastHit.objectID?.slice(0,8)}... at ${lastDate}`)
        
        // Check if the problematic call is in results
        const newCallCheck = result.hits.find((h: any) => h.objectID?.includes('256e9383'))
        if (newCallCheck) {
          console.log(`[Algolia Search] FOUND new call 256e9383: ts=${newCallCheck.created_at_timestamp} (${new Date(newCallCheck.created_at_timestamp).toISOString()})`)
        }
      }
    } catch (e) {
      console.error(`[Algolia Search] Debug log error:`, e)
    }

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


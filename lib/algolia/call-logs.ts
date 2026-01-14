/**
 * Algolia Call Logs Indexing & Search
 *
 * Handles indexing and searching call logs in Algolia with workspace-level data isolation.
 *
 * Key features:
 * - All records include `workspace_id` for data isolation
 * - Searches are ALWAYS filtered by `workspace_id` for security
 * - Org-level credentials are used but data is partitioned by workspace
 * - Supports autocomplete, suggestions, and multi-query search
 */

import {
  getWorkspaceAlgoliaConfig,
  isAlgoliaConfigured,
  type AlgoliaConfig,
} from "./client"
import type { Conversation, AgentProvider } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export interface CallLogAlgoliaRecord {
  objectID: string
  // Core identifiers - CRITICAL for data isolation
  conversation_id: string
  external_id: string | null
  workspace_id: string // REQUIRED - used for data isolation
  partner_id: string
  agent_id: string | null
  call_type: string | null
  // Searchable fields
  transcript: string | null
  summary: string | null
  phone_number: string | null
  caller_name: string | null
  agent_name: string
  // Filterable fields
  status: string
  direction: string
  sentiment: string | null
  provider: string
  // Numeric fields for sorting/filtering
  duration_seconds: number
  total_cost: number
  started_at_timestamp: number | null
  ended_at_timestamp: number | null
  created_at_timestamp: number
  // Display fields
  recording_url: string | null
}

export interface CallLogSearchParams {
  query?: string
  workspaceId: string // REQUIRED - always filter by workspace
  partnerId?: string
  agentId?: string
  status?: string
  direction?: string
  callType?: string
  excludeWebFromOutbound?: boolean
  sentiment?: string
  startDate?: Date
  endDate?: Date
  page?: number
  hitsPerPage?: number
}

export interface CallLogSearchResult {
  hits: CallLogAlgoliaRecord[]
  nbHits: number
  page: number
  nbPages: number
  hitsPerPage: number
  processingTimeMS?: number
}

export interface AutocompleteParams {
  query: string
  workspaceId: string // REQUIRED
  maxSuggestions?: number
}

export interface AutocompleteResult {
  suggestions: Array<{
    text: string
    type: "caller" | "phone" | "agent" | "transcript"
    objectID?: string
  }>
}

// ============================================================================
// ALGOLIA REST API HELPERS
// ============================================================================

function algoliaBaseUrl(appId: string): string {
  // Default REST host. Algolia also supports regional hosts; this is the common base.
  return `https://${appId}-dsn.algolia.net`
}

async function algoliaFetch(params: {
  appId: string
  apiKey: string
  path: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
}): Promise<any> {
  const url = `${algoliaBaseUrl(params.appId)}${params.path}`
  const res = await fetch(url, {
    method: params.method,
    headers: {
      "Content-Type": "application/json",
      "X-Algolia-Application-Id": params.appId,
      "X-Algolia-API-Key": params.apiKey,
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  })

  const text = await res.text()
  const json = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return { raw: text }
        }
      })()
    : {}

  if (!res.ok) {
    throw new Error(
      (json && (json.message || json.error)) ||
        `Algolia request failed: ${res.status} ${res.statusText}`
    )
  }

  return json
}

// ============================================================================
// INDEX CALL LOG
// ============================================================================

export async function indexCallLogToAlgolia(params: {
  conversation: Conversation
  workspaceId: string
  partnerId: string
  agentName: string
  agentProvider: AgentProvider
}): Promise<boolean> {
  const { conversation, workspaceId, partnerId, agentName, agentProvider } = params

  // Check if Algolia is configured for this workspace
  const configured = await isAlgoliaConfigured(workspaceId)
  if (!configured) {
    // Silently skip if not configured
    return false
  }

  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return false

  try {
    const metadata = conversation.metadata as unknown as Record<string, unknown> | null
    const rawCallType =
      metadata && typeof metadata.call_type === "string" ? metadata.call_type : null
    
    // Determine call_type based on EXACT provider call types:
    // VAPI types: webCall, inboundPhoneCall, outboundPhoneCall
    // Retell types: web_call, phone_call (use direction to determine in/out)
    // 
    // Call types explained:
    // - web: Browser-based calls (user interacts through browser)
    // - inbound: Agent receives call from a phone number
    // - outbound: Agent makes call to a phone number
    let call_type: string
    
    if (rawCallType) {
      const lowerType = rawCallType.toLowerCase()
      
      if (lowerType === "inboundphonecall" || lowerType === "inbound_phone_call") {
        // Explicit inbound phone call
        call_type = "inbound"
      } else if (lowerType === "outboundphonecall" || lowerType === "outbound_phone_call") {
        // Explicit outbound phone call
        call_type = "outbound"
      } else if (lowerType.includes("web")) {
        // Web call (webCall, web_call, etc)
        call_type = "web"
      } else if (lowerType === "phone_call") {
        // Retell phone_call - use direction
        call_type = conversation.direction === "inbound" ? "inbound" : "outbound"
      } else {
        // Unknown type - fallback to direction
        call_type = conversation.direction || "unknown"
      }
    } else {
      // No call_type in metadata - use direction
      call_type = conversation.direction || "unknown"
    }

    const record: CallLogAlgoliaRecord = {
      objectID: conversation.id,
      conversation_id: conversation.id,
      external_id: conversation.external_id,
      workspace_id: workspaceId, // CRITICAL - ensures data isolation
      partner_id: partnerId,
      agent_id: conversation.agent_id,
      call_type,
      transcript: conversation.transcript,
      summary: conversation.summary,
      // Use "Unknown Number" / "Unknown Caller" for display purposes
      phone_number: conversation.phone_number || "Unknown Number",
      caller_name: conversation.caller_name || "Unknown Caller",
      agent_name: agentName || "Unknown Agent",
      status: conversation.status || "unknown",
      direction: conversation.direction || null,
      sentiment: conversation.sentiment,
      provider: agentProvider,
      duration_seconds: conversation.duration_seconds || 0,
      total_cost: conversation.total_cost || 0,
      started_at_timestamp: conversation.started_at
        ? new Date(conversation.started_at).getTime()
        : null,
      ended_at_timestamp: conversation.ended_at
        ? new Date(conversation.ended_at).getTime()
        : null,
      created_at_timestamp: new Date(conversation.created_at).getTime(),
      recording_url: conversation.recording_url,
    }

    await algoliaFetch({
      appId: config.appId,
      apiKey: config.adminApiKey,
      method: "PUT",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/${encodeURIComponent(
        record.objectID
      )}`,
      body: record,
    })

    console.log("[Algolia] Indexed call log:", conversation.id, "workspace:", workspaceId)
    return true
  } catch (error) {
    console.error("[Algolia] Failed to index call log:", error)
    return false
  }
}

// ============================================================================
// BULK INDEX CALL LOGS
// ============================================================================

export async function bulkIndexCallLogs(
  workspaceId: string,
  records: CallLogAlgoliaRecord[]
): Promise<boolean> {
  const configured = await isAlgoliaConfigured(workspaceId)
  if (!configured) {
    return false
  }

  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return false

  // Ensure all records have the correct workspace_id
  const validatedRecords = records.map((r) => ({
    ...r,
    workspace_id: workspaceId, // Force correct workspace_id
  }))

  try {
    await algoliaFetch({
      appId: config.appId,
      apiKey: config.adminApiKey,
      method: "POST",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/batch`,
      body: {
        requests: validatedRecords.map((r) => ({
          action: "updateObject",
          body: r,
        })),
      },
    })

    console.log(
      "[Algolia] Bulk indexed",
      records.length,
      "call logs for workspace:",
      workspaceId
    )
    return true
  } catch (error) {
    console.error("[Algolia] Failed to bulk index call logs:", error)
    return false
  }
}

// ============================================================================
// CLEAR ALL WORKSPACE DATA FROM INDEX
// ============================================================================

export async function clearWorkspaceDataFromAlgolia(
  workspaceId: string
): Promise<{ success: boolean; deletedCount: number }> {
  const configured = await isAlgoliaConfigured(workspaceId)
  if (!configured) {
    return { success: false, deletedCount: 0 }
  }

  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return { success: false, deletedCount: 0 }

  try {
    // Use deleteBy to remove all records matching workspace_id filter
    const response = await algoliaFetch({
      appId: config.appId,
      apiKey: config.adminApiKey,
      method: "POST",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/deleteByQuery`,
      body: {
        filters: `workspace_id:${workspaceId}`,
      },
    })

    console.log(`[Algolia] Cleared all data for workspace: ${workspaceId}`)
    return { success: true, deletedCount: response?.deletedCount || 0 }
  } catch (error) {
    console.error("[Algolia] Failed to clear workspace data:", error)
    return { success: false, deletedCount: 0 }
  }
}

// ============================================================================
// DELETE CALL LOG FROM INDEX
// ============================================================================

export async function deleteCallLogFromAlgolia(
  workspaceId: string,
  conversationId: string
): Promise<boolean> {
  const configured = await isAlgoliaConfigured(workspaceId)
  if (!configured) {
    return false
  }

  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return false

  try {
    await algoliaFetch({
      appId: config.appId,
      apiKey: config.adminApiKey,
      method: "DELETE",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/${encodeURIComponent(
        conversationId
      )}`,
    })

    console.log("[Algolia] Deleted call log:", conversationId)
    return true
  } catch (error) {
    console.error("[Algolia] Failed to delete call log:", error)
    return false
  }
}

// ============================================================================
// SEARCH CALL LOGS
// ============================================================================

export async function searchCallLogs(
  params: CallLogSearchParams
): Promise<CallLogSearchResult | null> {
  const {
    query = "",
    workspaceId,
    partnerId,
    agentId,
    status,
    direction,
    callType,
    excludeWebFromOutbound,
    sentiment,
    startDate,
    endDate,
    page = 0,
    hitsPerPage = 20,
  } = params

  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return null

  try {
    // Build filters - workspace_id is ALWAYS required for security and data isolation
    const filters: string[] = [`workspace_id:${workspaceId}`]

    if (partnerId) {
      filters.push(`partner_id:${partnerId}`)
    }
    if (agentId) {
      filters.push(`agent_id:${agentId}`)
    }
    if (status) {
      filters.push(`status:${status}`)
    }
    if (direction) {
      filters.push(`direction:${direction}`)
    }
    // If the UI asks for outbound calls, we exclude web calls so "Outbound" and "Web Calls" don't overlap.
    if (excludeWebFromOutbound && direction === "outbound") {
      filters.push(`NOT call_type:web`)
    }
    if (callType) {
      // We normalize web calls to call_type="web" on indexing.
      filters.push(`call_type:${callType.toLowerCase() === "web" ? "web" : callType}`)
    }
    if (sentiment) {
      filters.push(`sentiment:${sentiment}`)
    }

    // Date range filters
    const numericFilters: string[] = []
    if (startDate) {
      numericFilters.push(`created_at_timestamp >= ${startDate.getTime()}`)
    }
    if (endDate) {
      numericFilters.push(`created_at_timestamp <= ${endDate.getTime()}`)
    }

    const searchResult = await algoliaFetch({
      appId: config.appId,
      apiKey: config.searchApiKey,
      method: "POST",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/query`,
      body: {
        query,
        filters: filters.join(" AND "),
        numericFilters: numericFilters.length > 0 ? numericFilters : undefined,
        page,
        hitsPerPage,
        attributesToRetrieve: [
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
          "created_at_timestamp",
          "summary",
          "recording_url",
        ],
        attributesToHighlight: ["transcript", "summary", "caller_name"],
      },
    })

    return {
      hits: (searchResult.hits || []) as CallLogAlgoliaRecord[],
      nbHits: searchResult.nbHits || 0,
      page: searchResult.page || 0,
      nbPages: searchResult.nbPages || 0,
      hitsPerPage: searchResult.hitsPerPage || hitsPerPage,
      processingTimeMS: searchResult.processingTimeMS,
    }
  } catch (error) {
    console.error("[Algolia] Search failed:", error)
    return null
  }
}

// ============================================================================
// AUTOCOMPLETE / SUGGESTIONS
// ============================================================================

export async function getAutocompleteSuggestions(
  params: AutocompleteParams
): Promise<AutocompleteResult | null> {
  const { query, workspaceId, maxSuggestions = 5 } = params

  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return null

  if (!query || query.trim().length === 0) {
    return { suggestions: [] }
  }

  try {
    const searchResult = await algoliaFetch({
      appId: config.appId,
      apiKey: config.searchApiKey,
      method: "POST",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/query`,
      body: {
        query,
        filters: `workspace_id:${workspaceId}`, // ALWAYS filter by workspace
        hitsPerPage: maxSuggestions * 3, // Fetch more to dedupe
        attributesToRetrieve: [
          "caller_name",
          "phone_number",
          "agent_name",
          "objectID",
        ],
        attributesToHighlight: ["caller_name", "phone_number", "agent_name"],
      },
    })

    const suggestions: AutocompleteResult["suggestions"] = []
    const seen = new Set<string>()

    // Extract unique suggestions from hits
    for (const hit of searchResult.hits || []) {
      if (suggestions.length >= maxSuggestions) break

      // Caller name
      if (hit.caller_name && !seen.has(`caller:${hit.caller_name}`)) {
        seen.add(`caller:${hit.caller_name}`)
        suggestions.push({
          text: hit.caller_name,
          type: "caller",
          objectID: hit.objectID,
        })
      }

      // Phone number
      if (
        hit.phone_number &&
        !seen.has(`phone:${hit.phone_number}`) &&
        suggestions.length < maxSuggestions
      ) {
        seen.add(`phone:${hit.phone_number}`)
        suggestions.push({
          text: hit.phone_number,
          type: "phone",
          objectID: hit.objectID,
        })
      }

      // Agent name
      if (
        hit.agent_name &&
        !seen.has(`agent:${hit.agent_name}`) &&
        suggestions.length < maxSuggestions
      ) {
        seen.add(`agent:${hit.agent_name}`)
        suggestions.push({
          text: hit.agent_name,
          type: "agent",
        })
      }
    }

    return { suggestions: suggestions.slice(0, maxSuggestions) }
  } catch (error) {
    console.error("[Algolia] Autocomplete failed:", error)
    return null
  }
}

// ============================================================================
// MULTI-QUERY SEARCH (for advanced use cases)
// ============================================================================

export interface MultiQuerySearch {
  indexName?: string // Uses default if not specified
  query: string
  params?: {
    filters?: string
    hitsPerPage?: number
    page?: number
    attributesToRetrieve?: string[]
  }
}

export interface MultiQueryResult {
  results: CallLogSearchResult[]
}

export async function multiQuerySearch(
  workspaceId: string,
  queries: MultiQuerySearch[]
): Promise<MultiQueryResult | null> {
  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return null

  try {
    // Ensure all queries have workspace_id filter
    const preparedQueries = queries.map((q) => {
      const baseFilters = `workspace_id:${workspaceId}`
      const combinedFilters = q.params?.filters
        ? `${baseFilters} AND ${q.params.filters}`
        : baseFilters

      return {
        indexName: q.indexName || config.callLogsIndex,
        query: q.query,
        params: {
          ...q.params,
          filters: combinedFilters,
        },
      }
    })

    const result = await algoliaFetch({
      appId: config.appId,
      apiKey: config.searchApiKey,
      method: "POST",
      path: "/1/indexes/*/queries",
      body: { requests: preparedQueries },
    })

    return {
      results: (result.results || []).map((r: any) => ({
        hits: r.hits || [],
        nbHits: r.nbHits || 0,
        page: r.page || 0,
        nbPages: r.nbPages || 0,
        hitsPerPage: r.hitsPerPage || 20,
        processingTimeMS: r.processingTimeMS,
      })),
    }
  } catch (error) {
    console.error("[Algolia] Multi-query search failed:", error)
    return null
  }
}

// ============================================================================
// CONFIGURE INDEX SETTINGS (run once during setup)
// ============================================================================

export async function configureCallLogsIndex(workspaceId: string): Promise<boolean> {
  const configured = await isAlgoliaConfigured(workspaceId)
  if (!configured) {
    return false
  }

  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return false

  try {
    await algoliaFetch({
      appId: config.appId,
      apiKey: config.adminApiKey,
      method: "PUT",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/settings`,
      body: {
        // Searchable attributes (in order of importance)
        searchableAttributes: [
          "transcript",
          "summary",
          "caller_name",
          "phone_number",
          "agent_name",
        ],
        // Attributes for filtering - workspace_id is filterOnly for security
        attributesForFaceting: [
          "filterOnly(workspace_id)", // CRITICAL - filterOnly means can't be searched/exposed
          "filterOnly(partner_id)",
          "filterOnly(agent_id)",
          "status",
          "direction",
          "call_type",
          "sentiment",
          "provider",
        ],
        // Attributes to not retrieve (sensitive data protection)
        unretrievableAttributes: ["workspace_id", "partner_id"],
        // Ranking
        ranking: [
          "desc(created_at_timestamp)",
          "typo",
          "geo",
          "words",
          "filters",
          "proximity",
          "attribute",
          "exact",
          "custom",
        ],
        // Custom ranking
        customRanking: ["desc(created_at_timestamp)"],
        // Pagination settings
        paginationLimitedTo: 1000,
        // Highlighting
        highlightPreTag: "<em>",
        highlightPostTag: "</em>",
        // Typo tolerance settings
        typoTolerance: true,
        minWordSizefor1Typo: 4,
        minWordSizefor2Typos: 8,
      },
    })

    console.log("[Algolia] Call logs index configured successfully for workspace:", workspaceId)
    return true
  } catch (error) {
    console.error("[Algolia] Failed to configure index:", error)
    return false
  }
}

// ============================================================================
// INDEX STATS (for monitoring)
// ============================================================================

export interface IndexStats {
  entries: number
  dataSize: number
  fileSize: number
  lastBuildTimeS: number
}

export async function getIndexStats(workspaceId: string): Promise<IndexStats | null> {
  const config = await getWorkspaceAlgoliaConfig(workspaceId)
  if (!config) return null

  try {
    const result = await algoliaFetch({
      appId: config.appId,
      apiKey: config.adminApiKey,
      method: "GET",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/settings`,
    })

    // Note: Settings endpoint doesn't return stats directly.
    // For actual stats, you'd need the indices endpoint
    return null // Placeholder - implement if needed
  } catch (error) {
    console.error("[Algolia] Failed to get index stats:", error)
    return null
  }
}

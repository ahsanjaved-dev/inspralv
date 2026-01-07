/**
 * Algolia Call Logs Indexing
 * Handles indexing and searching call logs in Algolia
 * 
 * All functions require workspaceId to fetch workspace-specific Algolia config
 */

import { getWorkspaceAlgoliaConfig, isAlgoliaConfigured } from "./client"
import type { Conversation, AgentProvider } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export interface CallLogAlgoliaRecord {
  objectID: string
  // Core identifiers
  conversation_id: string
  external_id: string | null
  workspace_id: string
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
  workspaceId: string
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
}

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
  const json = text ? (() => { try { return JSON.parse(text) } catch { return { raw: text } } })() : {}

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
    const callType =
      metadata && typeof metadata.call_type === "string" ? metadata.call_type : null
    const normalizedCallType =
      callType && callType.toLowerCase().includes("web") ? "web" : callType

    const record: CallLogAlgoliaRecord = {
      objectID: conversation.id,
      conversation_id: conversation.id,
      external_id: conversation.external_id,
      workspace_id: workspaceId,
      partner_id: partnerId,
      agent_id: conversation.agent_id,
      call_type: normalizedCallType,
      transcript: conversation.transcript,
      summary: conversation.summary,
      phone_number: conversation.phone_number,
      caller_name: conversation.caller_name,
      agent_name: agentName,
      status: conversation.status,
      direction: conversation.direction,
      sentiment: conversation.sentiment,
      provider: agentProvider,
      duration_seconds: conversation.duration_seconds,
      total_cost: conversation.total_cost,
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
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/${encodeURIComponent(record.objectID)}`,
      body: record,
    })

    console.log("[Algolia] Indexed call log:", conversation.id)
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

  try {
    await algoliaFetch({
      appId: config.appId,
      apiKey: config.adminApiKey,
      method: "POST",
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/batch`,
      body: {
        requests: records.map((r) => ({
          action: "updateObject",
          indexName: config.callLogsIndex,
          body: r,
        })),
      },
    })

    console.log("[Algolia] Bulk indexed", records.length, "call logs")
    return true
  } catch (error) {
    console.error("[Algolia] Failed to bulk index call logs:", error)
    return false
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
      path: `/1/indexes/${encodeURIComponent(config.callLogsIndex)}/${encodeURIComponent(conversationId)}`,
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
    // Build filters - workspace_id is always required for security
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
    }
  } catch (error) {
    console.error("[Algolia] Search failed:", error)
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
        // Attributes for filtering
        attributesForFaceting: [
          "filterOnly(workspace_id)",
          "filterOnly(partner_id)",
          "filterOnly(agent_id)",
          "status",
          "direction",
          "call_type",
          "sentiment",
          "provider",
        ],
        // Attributes for sorting
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
      },
    })

    console.log("[Algolia] Call logs index configured successfully")
    return true
  } catch (error) {
    console.error("[Algolia] Failed to configure index:", error)
    return false
  }
}

import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { isAlgoliaConfigured } from "@/lib/algolia/client"
import { bulkIndexCallLogs, configureCallLogsIndex, searchCallLogs, type CallLogAlgoliaRecord } from "@/lib/algolia/call-logs"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// Rate-limit warmups per workspace to avoid spamming Algolia
const ALGOLIA_WARMUP_TTL_MS = 5 * 60 * 1000
const algoliaWarmupLastRun = new Map<string, number>()
const algoliaWarmupInFlight = new Set<string>()

async function warmupAlgoliaIndex(params: {
  workspaceId: string
  partnerId: string
  adminClient: any
  limit?: number
}) {
  const { workspaceId, partnerId, adminClient, limit = 200 } = params

  const now = Date.now()
  const lastRun = algoliaWarmupLastRun.get(workspaceId) || 0
  if (algoliaWarmupInFlight.has(workspaceId)) return
  if (now - lastRun < ALGOLIA_WARMUP_TTL_MS) return

  algoliaWarmupInFlight.add(workspaceId)
  algoliaWarmupLastRun.set(workspaceId, now)

  try {
    // Ensure index settings exist (facets/searchable attrs)
    await configureCallLogsIndex(workspaceId)

    // Pull most recent calls and bulk index them (idempotent)
    const { data: conversations, error } = await adminClient
      .from("conversations")
      .select(
        `
        id,
        external_id,
        workspace_id,
        agent_id,
        direction,
        status,
        duration_seconds,
        total_cost,
        transcript,
        recording_url,
        started_at,
        ended_at,
        phone_number,
        caller_name,
        sentiment,
        summary,
        metadata,
        created_at,
        agent:ai_agents(id, name, provider)
      `
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[AlgoliaWarmup] Failed to fetch conversations:", error)
      return
    }

    const records: CallLogAlgoliaRecord[] = (conversations || []).map((c: any) => {
      const meta = c.metadata as Record<string, unknown> | null
      const rawCallType = meta && typeof meta.call_type === "string" ? meta.call_type : null
      const call_type = rawCallType && rawCallType.toLowerCase().includes("web") ? "web" : rawCallType

      return {
        objectID: c.id,
        conversation_id: c.id,
        external_id: c.external_id,
        workspace_id: workspaceId,
        partner_id: partnerId,
        agent_id: c.agent_id,
        call_type,
        transcript: c.transcript,
        summary: c.summary,
        phone_number: c.phone_number,
        caller_name: c.caller_name,
        agent_name: c.agent?.name || "Unknown",
        status: c.status,
        direction: c.direction,
        sentiment: c.sentiment,
        provider: c.agent?.provider || "unknown",
        duration_seconds: c.duration_seconds || 0,
        total_cost: c.total_cost || 0,
        started_at_timestamp: c.started_at ? new Date(c.started_at).getTime() : null,
        ended_at_timestamp: c.ended_at ? new Date(c.ended_at).getTime() : null,
        created_at_timestamp: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
        recording_url: c.recording_url || null,
      }
    })

    if (records.length > 0) {
      await bulkIndexCallLogs(workspaceId, records)
      console.log("[AlgoliaWarmup] Warmed index with recent calls:", {
        workspaceId,
        count: records.length,
      })
    }
  } catch (e) {
    console.error("[AlgoliaWarmup] Error:", e)
  } finally {
    algoliaWarmupInFlight.delete(workspaceId)
  }
}

// ============================================================================
// GET /api/w/[workspaceSlug]/calls
// List all calls (conversations) for the workspace
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const status = searchParams.get("status")
    const direction = searchParams.get("direction")
    const callType = searchParams.get("call_type")
    const agentId = searchParams.get("agent_id")
    const search = searchParams.get("search")
    
    // Date filters - DEFAULT TO TODAY if not provided
    // This ensures we never return all historical data
    const now = new Date()
    const todayStartISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString()
    const todayEndISO = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()
    
    const startDate = searchParams.get("start_date") || todayStartISO
    const endDate = searchParams.get("end_date") || todayEndISO
    
    console.log(`[Calls API] Date range: ${startDate} to ${endDate}`)

    // ============================================================================
    // Algolia-backed search (only when `search` is provided)
    // We return DB rows (conversations) for the Algolia hit IDs to keep response shape identical.
    // Falls back to DB search if Algolia isn't configured or if search fails.
    // ============================================================================

    if (search && search.trim().length > 0) {
      try {
        const configured = await isAlgoliaConfigured(ctx.workspace.id)
        if (configured) {
          const algoliaPage = Math.max(0, page - 1) // Algolia is 0-based
          const algoliaResult = await searchCallLogs({
            query: search,
            workspaceId: ctx.workspace.id,
            partnerId: ctx.partner.id,
            agentId: agentId || undefined,
            status: status || undefined,
            direction: direction || undefined,
            callType: callType || undefined,
            excludeWebFromOutbound: !!direction && direction === "outbound" && !callType,
            // Always apply date filters (defaults to today if not provided)
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            page: algoliaPage,
            hitsPerPage: pageSize,
          })

          if (algoliaResult) {
            const ids = algoliaResult.hits
              .map((h) => (h.conversation_id || h.objectID) as string)
              .filter(Boolean)

            // If Algolia returns 0 hits, fall back to DB search.
            // This helps during rollout/backfill if indexing hasn't caught up yet.
            if (ids.length === 0) {
              console.log("[Calls] Algolia returned 0 hits, falling back to DB search:", {
                workspaceId: ctx.workspace.id,
                query: search,
              })
              // Best-effort warmup to populate Algolia with recent calls (rate-limited)
              warmupAlgoliaIndex({
                workspaceId: ctx.workspace.id,
                partnerId: ctx.partner.id,
                adminClient: ctx.adminClient,
              }).catch(() => {})
            } else {

              // Fetch matching conversations from DB (security + full object shape)
              const { data: rows, error } = await ctx.adminClient
                .from("conversations")
                .select(
                  `
                  *,
                  agent:ai_agents(id, name, provider)
                `
                )
                .eq("workspace_id", ctx.workspace.id)
                .is("deleted_at", null)
                .in("id", ids)

              if (error) {
                console.error("[Calls] Algolia search DB fetch error:", error)
                // fall through to DB search below
              } else {
                // Preserve Algolia ranking order
                const byId = new Map((rows || []).map((r: any) => [r.id, r]))
                const ordered = ids.map((id) => byId.get(id)).filter(Boolean)

                console.log("[Calls] Search via Algolia:", {
                  workspaceId: ctx.workspace.id,
                  query: search,
                  returned: ordered.length,
                  total: algoliaResult.nbHits || 0,
                })

                return apiResponse({
                  data: ordered,
                  total: algoliaResult.nbHits || ordered.length,
                  page,
                  pageSize,
                  totalPages: Math.ceil((algoliaResult.nbHits || 0) / pageSize),
                  source: "algolia",
                })
              }
            }
          }
        }
      } catch (err) {
        console.error("[Calls] Algolia search failed, falling back to DB:", err)
      }
    }

    let query = ctx.adminClient
      .from("conversations")
      .select(
        `
        *,
        agent:ai_agents(id, name, provider)
      `,
        { count: "exact" }
      )
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    // Apply filters
    if (status) {
      query = query.eq("status", status)
    }
    if (direction) {
      query = query.eq("direction", direction)
      // IMPORTANT: web calls are stored as direction=outbound for Retell,
      // but we want the Outbound filter to exclude web calls.
      if (direction === "outbound" && !callType) {
        query = query.not("metadata->>call_type", "ilike", "%web%")
      }
    }
    if (callType) {
      // Currently supports filtering web calls for Retell using metadata.call_type
      // e.g. call_type=web
      if (callType.toLowerCase() === "web") {
        // PostgREST JSON text accessor
        query = query.ilike("metadata->>call_type", "%web%")
      } else {
        query = query.eq("metadata->>call_type", callType)
      }
    }
    if (agentId) {
      query = query.eq("agent_id", agentId)
    }
    // Always apply date filters (defaults to today if not provided)
    query = query.gte("created_at", startDate)
    query = query.lte("created_at", endDate)
    
    // Full-text search on transcript (fallback path)
    if (search) {
      // Also support searching by agent name in fallback mode.
      let agentIds: string[] = []
      try {
        const { data: matchingAgents } = await ctx.adminClient
          .from("ai_agents")
          .select("id")
          .eq("workspace_id", ctx.workspace.id)
          .is("deleted_at", null)
          .ilike("name", `%${search}%`)

        agentIds = (matchingAgents || []).map((a: any) => a.id).filter(Boolean)
      } catch {
        // ignore agent name search enrichment if it fails
      }

      // Use ilike for simple substring matching
      // For production, you'd want to use proper full-text search
      const orParts = [
        `transcript.ilike.%${search}%`,
        `caller_name.ilike.%${search}%`,
        `phone_number.ilike.%${search}%`,
      ]
      if (agentIds.length > 0) {
        // PostgREST in operator: agent_id.in.(id1,id2,...)
        orParts.push(`agent_id.in.(${agentIds.join(",")})`)
      }
      query = query.or(orParts.join(","))
    }

    // Pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: calls, error, count } = await query

    if (error) {
      console.error("List calls error:", error)
      return serverError()
    }

    return apiResponse({
      data: calls,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/calls error:", error)
    return serverError()
  }
}


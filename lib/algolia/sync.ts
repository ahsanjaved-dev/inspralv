/**
 * Algolia Sync Utilities
 *
 * Handles bulk syncing of existing call logs to Algolia when:
 * 1. A new Algolia integration is created at the partner level
 * 2. An Algolia integration is assigned to a workspace
 *
 * This ensures data is immediately available for search after configuration.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"
import {
  bulkIndexCallLogs,
  configureCallLogsIndex,
  type CallLogAlgoliaRecord,
} from "./call-logs"
import { clearAlgoliaCache, getWorkspaceAlgoliaConfig } from "./client"

// ============================================================================
// TYPES
// ============================================================================

export interface SyncResult {
  success: boolean
  workspaceId: string
  recordsIndexed: number
  error?: string
}

export interface BulkSyncResult {
  success: boolean
  workspaces: SyncResult[]
  totalRecordsIndexed: number
}

// ============================================================================
// SYNC ALL CALLS FOR A WORKSPACE
// ============================================================================

/**
 * Sync all existing call logs for a workspace to Algolia.
 * This should be called when Algolia is first configured for a workspace.
 *
 * @param workspaceId - The workspace UUID
 * @param partnerId - The partner UUID (for records)
 * @param batchSize - Number of records to process per batch (default: 500)
 */
export async function syncWorkspaceCallsToAlgolia(
  workspaceId: string,
  partnerId: string,
  batchSize: number = 500
): Promise<SyncResult> {
  console.log(`[AlgoliaSync] Starting sync for workspace: ${workspaceId}`)

  try {
    // Clear cache to ensure we use fresh config
    clearAlgoliaCache(workspaceId)

    // Check if Algolia is configured
    const config = await getWorkspaceAlgoliaConfig(workspaceId)
    if (!config) {
      console.log(`[AlgoliaSync] Algolia not configured for workspace: ${workspaceId}`)
      return {
        success: false,
        workspaceId,
        recordsIndexed: 0,
        error: "Algolia not configured for this workspace",
      }
    }

    // Configure the index settings first
    await configureCallLogsIndex(workspaceId)

    const adminClient = createAdminClient()
    let totalIndexed = 0
    let offset = 0
    let hasMore = true

    while (hasMore) {
      // Fetch batch of conversations
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
        .range(offset, offset + batchSize - 1)

      if (error) {
        console.error(`[AlgoliaSync] Error fetching conversations:`, error)
        return {
          success: false,
          workspaceId,
          recordsIndexed: totalIndexed,
          error: `Failed to fetch conversations: ${error.message}`,
        }
      }

      if (!conversations || conversations.length === 0) {
        hasMore = false
        continue
      }

      // Map to Algolia records
      const records: CallLogAlgoliaRecord[] = conversations.map((c: any) => {
        const meta = c.metadata as Record<string, unknown> | null
        const rawCallType = meta && typeof meta.call_type === "string" ? meta.call_type : null
        
        // Determine call_type based on EXACT provider call types:
        // VAPI types: webCall, inboundPhoneCall, outboundPhoneCall
        // Retell types: web_call, phone_call (use direction to determine in/out)
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
            call_type = c.direction === "inbound" ? "inbound" : "outbound"
          } else {
            // Unknown type - fallback to direction
            call_type = c.direction || "unknown"
          }
        } else {
          // No call_type in metadata - use direction
          call_type = c.direction || "unknown"
        }

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
          // Use "Unknown Number" / "Unknown Caller" for display purposes
          phone_number: c.phone_number || "Unknown Number",
          caller_name: c.caller_name || "Unknown Caller",
          agent_name: c.agent?.name || "Unknown Agent",
          status: c.status || "unknown",
          direction: c.direction || null,
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

      // Index batch to Algolia
      if (records.length > 0) {
        const indexed = await bulkIndexCallLogs(workspaceId, records)
        if (indexed) {
          totalIndexed += records.length
          console.log(
            `[AlgoliaSync] Indexed batch: ${records.length} records (total: ${totalIndexed})`
          )
        } else {
          console.error(`[AlgoliaSync] Failed to index batch at offset ${offset}`)
        }
      }

      // Check if there are more records
      if (conversations.length < batchSize) {
        hasMore = false
      } else {
        offset += batchSize
      }
    }

    console.log(`[AlgoliaSync] Completed sync for workspace: ${workspaceId}, total: ${totalIndexed}`)

    return {
      success: true,
      workspaceId,
      recordsIndexed: totalIndexed,
    }
  } catch (error) {
    console.error(`[AlgoliaSync] Error syncing workspace:`, error)
    return {
      success: false,
      workspaceId,
      recordsIndexed: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// ============================================================================
// SYNC ALL WORKSPACES FOR A PARTNER (when org-level Algolia is configured)
// ============================================================================

/**
 * Sync all workspaces under a partner to Algolia.
 * This should be called when a new Algolia integration is created at the org level
 * and set as default, to immediately populate the index with existing data.
 *
 * @param partnerId - The partner UUID
 * @param integrationId - The partner integration UUID (for assignment)
 */
export async function syncPartnerWorkspacesToAlgolia(
  partnerId: string,
  integrationId: string
): Promise<BulkSyncResult> {
  console.log(`[AlgoliaSync] Starting bulk sync for partner: ${partnerId}`)

  if (!prisma) {
    return {
      success: false,
      workspaces: [],
      totalRecordsIndexed: 0,
    }
  }

  try {
    // Get all workspaces for this partner
    const workspaces = await prisma.workspace.findMany({
      where: {
        partnerId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    })

    if (workspaces.length === 0) {
      console.log(`[AlgoliaSync] No workspaces found for partner: ${partnerId}`)
      return {
        success: true,
        workspaces: [],
        totalRecordsIndexed: 0,
      }
    }

    console.log(`[AlgoliaSync] Found ${workspaces.length} workspaces to sync`)

    const results: SyncResult[] = []
    let totalRecordsIndexed = 0

    // Process each workspace
    for (const workspace of workspaces) {
      // First, ensure the workspace has an assignment to this Algolia integration
      const existingAssignment = await prisma.workspaceIntegrationAssignment.findFirst({
        where: {
          workspaceId: workspace.id,
          provider: "algolia",
        },
      })

      if (!existingAssignment) {
        // Create assignment
        await prisma.workspaceIntegrationAssignment.create({
          data: {
            workspaceId: workspace.id,
            provider: "algolia",
            partnerIntegrationId: integrationId,
          },
        })
        console.log(`[AlgoliaSync] Created Algolia assignment for workspace: ${workspace.id}`)
      }

      // Sync the workspace
      const result = await syncWorkspaceCallsToAlgolia(workspace.id, partnerId)
      results.push(result)

      if (result.success) {
        totalRecordsIndexed += result.recordsIndexed
      }
    }

    const allSuccess = results.every((r) => r.success)

    console.log(
      `[AlgoliaSync] Bulk sync completed for partner: ${partnerId}, ` +
        `workspaces: ${results.length}, total records: ${totalRecordsIndexed}`
    )

    return {
      success: allSuccess,
      workspaces: results,
      totalRecordsIndexed,
    }
  } catch (error) {
    console.error(`[AlgoliaSync] Error in bulk sync:`, error)
    return {
      success: false,
      workspaces: [],
      totalRecordsIndexed: 0,
    }
  }
}

// ============================================================================
// BACKGROUND SYNC (non-blocking)
// ============================================================================

/**
 * Start a background sync for a workspace (non-blocking).
 * Useful for triggering sync from API handlers without waiting.
 */
export function startBackgroundSync(workspaceId: string, partnerId: string): void {
  // Fire and forget - don't await
  syncWorkspaceCallsToAlgolia(workspaceId, partnerId).catch((error) => {
    console.error(`[AlgoliaSync] Background sync failed for workspace ${workspaceId}:`, error)
  })
}

/**
 * Start a background bulk sync for all partner workspaces (non-blocking).
 */
export function startBackgroundBulkSync(partnerId: string, integrationId: string): void {
  // Fire and forget - don't await
  syncPartnerWorkspacesToAlgolia(partnerId, integrationId).catch((error) => {
    console.error(`[AlgoliaSync] Background bulk sync failed for partner ${partnerId}:`, error)
  })
}


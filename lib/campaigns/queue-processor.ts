/**
 * Campaign Queue Processor
 * 
 * This module provides a queue-based approach for processing large campaigns
 * that may exceed serverless function timeout limits.
 * 
 * Key features:
 * - Tracks campaign processing state in database
 * - Supports chunked processing across multiple API calls
 * - Automatic resume from interruptions
 * - Progress tracking and estimation
 * - Rate limiting and backoff
 * 
 * Usage:
 * 1. Initialize a campaign queue entry when starting
 * 2. Process chunks via API endpoint (called repeatedly or via cron)
 * 3. Track progress through queue state
 */

import { createAdminClient } from "@/lib/supabase/admin"
import {
  processNextChunk,
  isWithinBusinessHours,
  type OptimizedBatchConfig,
  type ChunkResult,
} from "./batch-caller"

// ============================================================================
// TYPES
// ============================================================================

export interface CampaignQueueEntry {
  id: string
  campaign_id: string
  workspace_id: string
  status: "pending" | "processing" | "paused" | "completed" | "failed" | "cancelled"
  total_recipients: number
  processed_count: number
  successful_count: number
  failed_count: number
  chunks_processed: number
  total_chunks: number
  last_chunk_at: string | null
  error_message: string | null
  config: OptimizedBatchConfig
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ProcessChunkResult {
  success: boolean
  queueEntry: CampaignQueueEntry | null
  chunkResult: ChunkResult | null
  hasMore: boolean
  pendingCount: number
  shouldContinue: boolean
  nextProcessAt: Date | null
  error?: string
}

export interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  paused: number
}

// ============================================================================
// QUEUE STATE TABLE OPERATIONS
// ============================================================================

/**
 * Initialize campaign queue entry
 * Call this when starting a campaign
 */
export async function initializeCampaignQueue(
  campaignId: string,
  workspaceId: string,
  totalRecipients: number,
  config: OptimizedBatchConfig,
  chunkSize: number = 50
): Promise<CampaignQueueEntry | null> {
  const adminClient = createAdminClient()
  const now = new Date().toISOString()
  const totalChunks = Math.ceil(totalRecipients / chunkSize)

  // Check if queue entry already exists
  const { data: existing } = await adminClient
    .from("campaign_queue")
    .select("*")
    .eq("campaign_id", campaignId)
    .single()

  if (existing) {
    // Reset existing entry if it was failed or cancelled
    if (existing.status === "failed" || existing.status === "cancelled") {
      const { data: updated, error } = await adminClient
        .from("campaign_queue")
        .update({
          status: "pending",
          processed_count: 0,
          successful_count: 0,
          failed_count: 0,
          chunks_processed: 0,
          error_message: null,
          config,
          started_at: now,
          completed_at: null,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) {
        console.error("[CampaignQueue] Error resetting queue entry:", error)
        return null
      }
      return updated as CampaignQueueEntry
    }
    return existing as CampaignQueueEntry
  }

  // Create new queue entry
  const { data, error } = await adminClient
    .from("campaign_queue")
    .insert({
      campaign_id: campaignId,
      workspace_id: workspaceId,
      status: "pending",
      total_recipients: totalRecipients,
      processed_count: 0,
      successful_count: 0,
      failed_count: 0,
      chunks_processed: 0,
      total_chunks: totalChunks,
      config,
      started_at: now,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) {
    console.error("[CampaignQueue] Error creating queue entry:", error)
    return null
  }

  return data as CampaignQueueEntry
}

/**
 * Get campaign queue entry
 */
export async function getCampaignQueueEntry(campaignId: string): Promise<CampaignQueueEntry | null> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("campaign_queue")
    .select("*")
    .eq("campaign_id", campaignId)
    .single()

  if (error || !data) {
    return null
  }

  return data as CampaignQueueEntry
}

/**
 * Update queue entry after processing a chunk
 */
async function updateQueueAfterChunk(
  queueId: string,
  chunkResult: ChunkResult,
  pendingCount: number,
  hasMore: boolean
): Promise<CampaignQueueEntry | null> {
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const updateData: Partial<CampaignQueueEntry> = {
    processed_count: chunkResult.successful + chunkResult.failed,
    successful_count: chunkResult.successful,
    failed_count: chunkResult.failed,
    chunks_processed: 1, // Will be incremented
    last_chunk_at: now,
    updated_at: now,
    status: hasMore ? "processing" : "completed",
  }

  if (!hasMore) {
    updateData.completed_at = now
  }

  // Use RPC for atomic increment
  const { data: current } = await adminClient
    .from("campaign_queue")
    .select("processed_count, successful_count, failed_count, chunks_processed")
    .eq("id", queueId)
    .single()

  if (current) {
    updateData.processed_count = (current.processed_count || 0) + chunkResult.successful + chunkResult.failed
    updateData.successful_count = (current.successful_count || 0) + chunkResult.successful
    updateData.failed_count = (current.failed_count || 0) + chunkResult.failed
    updateData.chunks_processed = (current.chunks_processed || 0) + 1
  }

  const { data, error } = await adminClient
    .from("campaign_queue")
    .update(updateData)
    .eq("id", queueId)
    .select()
    .single()

  if (error) {
    console.error("[CampaignQueue] Error updating queue entry:", error)
    return null
  }

  return data as CampaignQueueEntry
}

/**
 * Mark queue entry as failed
 */
export async function markQueueFailed(
  queueId: string,
  errorMessage: string
): Promise<void> {
  const adminClient = createAdminClient()

  await adminClient
    .from("campaign_queue")
    .update({
      status: "failed",
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId)
}

/**
 * Mark queue entry as paused
 */
export async function markQueuePaused(queueId: string, reason?: string): Promise<void> {
  const adminClient = createAdminClient()

  await adminClient
    .from("campaign_queue")
    .update({
      status: "paused",
      error_message: reason || "Campaign paused",
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId)
}

// ============================================================================
// MAIN CHUNK PROCESSOR
// ============================================================================

/**
 * Process the next chunk for a campaign
 * 
 * This should be called repeatedly (via cron, queue, or recursive API calls)
 * until hasMore is false.
 */
export async function processQueueChunk(campaignId: string): Promise<ProcessChunkResult> {
  const adminClient = createAdminClient()

  // Get queue entry
  const queueEntry = await getCampaignQueueEntry(campaignId)
  if (!queueEntry) {
    return {
      success: false,
      queueEntry: null,
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
      shouldContinue: false,
      nextProcessAt: null,
      error: "Campaign queue entry not found",
    }
  }

  // Check queue status
  if (queueEntry.status === "completed") {
    return {
      success: true,
      queueEntry,
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
      shouldContinue: false,
      nextProcessAt: null,
    }
  }

  if (queueEntry.status === "cancelled" || queueEntry.status === "failed") {
    return {
      success: false,
      queueEntry,
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
      shouldContinue: false,
      nextProcessAt: null,
      error: `Campaign queue is ${queueEntry.status}`,
    }
  }

  if (queueEntry.status === "paused") {
    return {
      success: true,
      queueEntry,
      chunkResult: null,
      hasMore: true,
      pendingCount: queueEntry.total_recipients - queueEntry.processed_count,
      shouldContinue: false,
      nextProcessAt: null,
    }
  }

  // Check campaign status in main table
  const { data: campaign } = await adminClient
    .from("call_campaigns")
    .select("status, business_hours_config, timezone")
    .eq("id", campaignId)
    .single()

  if (!campaign) {
    await markQueueFailed(queueEntry.id, "Campaign not found")
    return {
      success: false,
      queueEntry,
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
      shouldContinue: false,
      nextProcessAt: null,
      error: "Campaign not found",
    }
  }

  if (campaign.status === "paused") {
    await markQueuePaused(queueEntry.id, "Campaign paused")
    return {
      success: true,
      queueEntry,
      chunkResult: null,
      hasMore: true,
      pendingCount: queueEntry.total_recipients - queueEntry.processed_count,
      shouldContinue: false,
      nextProcessAt: null,
    }
  }

  if (campaign.status === "cancelled") {
    await adminClient
      .from("campaign_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", queueEntry.id)
    return {
      success: false,
      queueEntry,
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
      shouldContinue: false,
      nextProcessAt: null,
      error: "Campaign cancelled",
    }
  }

  // Check business hours
  // IMPORTANT: Use the timezone from business hours config if available
  // This ensures we check against the timezone the user configured in the schedule step
  const businessHoursConfig = campaign.business_hours_config
  const effectiveTimezone = (businessHoursConfig as any)?.timezone || campaign.timezone || "Australia/Melbourne"

  if (businessHoursConfig && !isWithinBusinessHours(businessHoursConfig, effectiveTimezone)) {
    // Calculate next business hours window
    const nextBusinessHours = calculateNextBusinessHours(businessHoursConfig, effectiveTimezone)
    
    return {
      success: true,
      queueEntry,
      chunkResult: null,
      hasMore: true,
      pendingCount: queueEntry.total_recipients - queueEntry.processed_count,
      shouldContinue: false,
      nextProcessAt: nextBusinessHours,
      error: "Outside business hours",
    }
  }

  // Update status to processing
  await adminClient
    .from("campaign_queue")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", queueEntry.id)

  // Process the chunk
  try {
    const config = queueEntry.config as OptimizedBatchConfig
    const result = await processNextChunk(config)

    if (!result.chunkResult) {
      // No more recipients or campaign stopped
      const updatedEntry = await getCampaignQueueEntry(campaignId)
      return {
        success: true,
        queueEntry: updatedEntry,
        chunkResult: null,
        hasMore: result.hasMore,
        pendingCount: result.pendingCount,
        shouldContinue: result.hasMore,
        nextProcessAt: result.hasMore ? new Date(Date.now() + 2000) : null,
      }
    }

    // Update queue state
    const updatedEntry = await updateQueueAfterChunk(
      queueEntry.id,
      result.chunkResult,
      result.pendingCount,
      result.hasMore
    )

    return {
      success: true,
      queueEntry: updatedEntry,
      chunkResult: result.chunkResult,
      hasMore: result.hasMore,
      pendingCount: result.pendingCount,
      shouldContinue: result.hasMore,
      nextProcessAt: result.hasMore ? new Date(Date.now() + 2000) : null, // 2 second delay
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    await markQueueFailed(queueEntry.id, errorMessage)
    
    return {
      success: false,
      queueEntry,
      chunkResult: null,
      hasMore: false,
      pendingCount: 0,
      shouldContinue: false,
      nextProcessAt: null,
      error: errorMessage,
    }
  }
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Get all pending/processing campaigns for a workspace
 */
export async function getActiveQueueEntries(workspaceId: string): Promise<CampaignQueueEntry[]> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("campaign_queue")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "processing", "paused"])
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[CampaignQueue] Error fetching active entries:", error)
    return []
  }

  return (data || []) as CampaignQueueEntry[]
}

/**
 * Get queue statistics for a workspace
 */
export async function getQueueStats(workspaceId: string): Promise<QueueStats> {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("campaign_queue")
    .select("status")
    .eq("workspace_id", workspaceId)

  if (error || !data) {
    return { pending: 0, processing: 0, completed: 0, failed: 0, paused: 0 }
  }

  return {
    pending: data.filter(d => d.status === "pending").length,
    processing: data.filter(d => d.status === "processing").length,
    completed: data.filter(d => d.status === "completed").length,
    failed: data.filter(d => d.status === "failed").length,
    paused: data.filter(d => d.status === "paused").length,
  }
}

/**
 * Resume a paused campaign
 */
export async function resumeQueueEntry(campaignId: string): Promise<boolean> {
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from("campaign_queue")
    .update({
      status: "processing",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId)
    .eq("status", "paused")

  return !error
}

/**
 * Cancel a campaign queue entry
 */
export async function cancelQueueEntry(campaignId: string): Promise<boolean> {
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from("campaign_queue")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "processing", "paused"])

  return !error
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate when the next business hours window starts
 */
function calculateNextBusinessHours(
  config: any,
  timezone: string
): Date | null {
  if (!config || !config.enabled || !config.schedule) {
    return null
  }

  const now = new Date()
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  
  // Check next 7 days
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    })
    const weekday = formatter.format(checkDate).toLowerCase()
    
    const slots = config.schedule[weekday] || []
    if (slots.length > 0) {
      const firstSlot = slots.sort((a: any, b: any) => a.start.localeCompare(b.start))[0]
      if (firstSlot) {
        const [hours, minutes] = firstSlot.start.split(":").map(Number)
        const targetDate = new Date(checkDate)
        targetDate.setHours(hours, minutes, 0, 0)
        
        // If it's today and time has passed, skip to next day
        if (dayOffset === 0 && targetDate <= now) {
          continue
        }
        
        return targetDate
      }
    }
  }
  
  return null
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { OptimizedBatchConfig }


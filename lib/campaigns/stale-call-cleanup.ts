/**
 * Stale Call Cleanup Utility
 * 
 * Detects and handles campaign recipients that are stuck in "calling" status
 * because VAPI never sent an end-of-call webhook.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"

// ============================================================================
// CONFIGURATION
// ============================================================================

// Time after which a "calling" recipient is considered stale (in minutes)
const STALE_CALL_THRESHOLD_MINUTES = 5

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============================================================================
// STALE CALL DETECTION
// ============================================================================

export interface StaleCallCleanupResult {
  success: boolean
  campaignId: string
  staleRecipientsFound: number
  staleRecipientsUpdated: number
  campaignCompleted: boolean
  error?: string
}

/**
 * Check for and clean up stale "calling" recipients for a specific campaign
 * 
 * A call is considered "stale" if:
 * 1. Status is "calling"
 * 2. call_started_at was more than STALE_CALL_THRESHOLD_MINUTES ago
 * 3. No webhook has been received (no end timestamp)
 */
export async function cleanupStaleCalls(
  campaignId: string,
  thresholdMinutes: number = STALE_CALL_THRESHOLD_MINUTES
): Promise<StaleCallCleanupResult> {
  const supabase = getSupabaseAdmin()
  
  try {
    // Calculate the threshold timestamp
    const thresholdTime = new Date()
    thresholdTime.setMinutes(thresholdTime.getMinutes() - thresholdMinutes)
    const thresholdISO = thresholdTime.toISOString()

    console.log(`[StaleCallCleanup] Checking campaign ${campaignId} for stale calls older than ${thresholdMinutes} minutes`)
    console.log(`[StaleCallCleanup] Threshold timestamp: ${thresholdISO}`)

    // Find stale "calling" recipients
    const { data: staleRecipients, error: findError } = await supabase
      .from("call_recipients")
      .select("id, phone_number, call_started_at, external_call_id")
      .eq("campaign_id", campaignId)
      .eq("call_status", "calling")
      .lt("call_started_at", thresholdISO)

    if (findError) {
      console.error("[StaleCallCleanup] Error finding stale recipients:", findError)
      return {
        success: false,
        campaignId,
        staleRecipientsFound: 0,
        staleRecipientsUpdated: 0,
        campaignCompleted: false,
        error: findError.message,
      }
    }

    const staleCount = staleRecipients?.length || 0
    console.log(`[StaleCallCleanup] Found ${staleCount} stale recipients`)

    if (staleCount === 0) {
      // Check if campaign should be completed
      const campaignCompleted = await checkAndCompleteCampaign(supabase, campaignId)
      
      return {
        success: true,
        campaignId,
        staleRecipientsFound: 0,
        staleRecipientsUpdated: 0,
        campaignCompleted,
      }
    }

    // Update stale recipients to "failed" with timeout reason
    let updatedCount = 0
    for (const recipient of staleRecipients!) {
      const { error: updateError } = await supabase
        .from("call_recipients")
        .update({
          call_status: "failed",
          call_outcome: "error",
          call_ended_at: new Date().toISOString(),
          last_error: `Call timed out - no response received within ${thresholdMinutes} minutes`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recipient.id)

      if (updateError) {
        console.error(`[StaleCallCleanup] Error updating recipient ${recipient.id}:`, updateError)
      } else {
        updatedCount++
        console.log(`[StaleCallCleanup] Marked recipient ${recipient.id} (${recipient.phone_number}) as failed (timeout)`)
      }
    }

    // Update campaign statistics
    const { data: campaign } = await supabase
      .from("call_campaigns")
      .select("completed_calls, failed_calls")
      .eq("id", campaignId)
      .single()

    if (campaign) {
      await supabase
        .from("call_campaigns")
        .update({
          completed_calls: (campaign.completed_calls || 0) + updatedCount,
          failed_calls: (campaign.failed_calls || 0) + updatedCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId)
    }

    // Check if campaign should be completed
    const campaignCompleted = await checkAndCompleteCampaign(supabase, campaignId)

    console.log(`[StaleCallCleanup] Cleanup complete: ${updatedCount}/${staleCount} recipients updated`)

    return {
      success: true,
      campaignId,
      staleRecipientsFound: staleCount,
      staleRecipientsUpdated: updatedCount,
      campaignCompleted,
    }
  } catch (error) {
    console.error("[StaleCallCleanup] Exception:", error)
    return {
      success: false,
      campaignId,
      staleRecipientsFound: 0,
      staleRecipientsUpdated: 0,
      campaignCompleted: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Check if a campaign should be marked as completed
 * Campaign is completed when there are no more pending, queued, or calling recipients
 */
async function checkAndCompleteCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<boolean> {
  try {
    // Check if there are any recipients still in progress
    const { count: inProgressCount, error: countError } = await supabase
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("call_status", ["pending", "queued", "calling"])

    if (countError) {
      console.error("[StaleCallCleanup] Error counting in-progress recipients:", countError)
      return false
    }

    if (inProgressCount === 0) {
      // Check if campaign is still active
      const { data: campaign } = await supabase
        .from("call_campaigns")
        .select("status")
        .eq("id", campaignId)
        .single()

      if (campaign?.status === "active") {
        console.log(`[StaleCallCleanup] Campaign ${campaignId} has no more recipients to process - marking as completed`)

        await supabase
          .from("call_campaigns")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", campaignId)

        return true
      }
    } else {
      console.log(`[StaleCallCleanup] Campaign ${campaignId} still has ${inProgressCount} recipients in progress`)
    }

    return false
  } catch (error) {
    console.error("[StaleCallCleanup] Error checking campaign completion:", error)
    return false
  }
}

/**
 * Clean up stale calls for all active campaigns
 * Useful for running as a background job
 */
export async function cleanupAllActiveCampaigns(): Promise<{
  success: boolean
  campaignsProcessed: number
  totalStaleRecipients: number
  totalCampaignsCompleted: number
}> {
  const supabase = getSupabaseAdmin()

  try {
    // Find all active campaigns
    const { data: activeCampaigns, error: findError } = await supabase
      .from("call_campaigns")
      .select("id")
      .eq("status", "active")

    if (findError || !activeCampaigns) {
      console.error("[StaleCallCleanup] Error finding active campaigns:", findError)
      return {
        success: false,
        campaignsProcessed: 0,
        totalStaleRecipients: 0,
        totalCampaignsCompleted: 0,
      }
    }

    console.log(`[StaleCallCleanup] Found ${activeCampaigns.length} active campaigns to check`)

    let totalStale = 0
    let totalCompleted = 0

    for (const campaign of activeCampaigns) {
      const result = await cleanupStaleCalls(campaign.id)
      totalStale += result.staleRecipientsUpdated
      if (result.campaignCompleted) totalCompleted++
    }

    return {
      success: true,
      campaignsProcessed: activeCampaigns.length,
      totalStaleRecipients: totalStale,
      totalCampaignsCompleted: totalCompleted,
    }
  } catch (error) {
    console.error("[StaleCallCleanup] Error in cleanupAllActiveCampaigns:", error)
    return {
      success: false,
      campaignsProcessed: 0,
      totalStaleRecipients: 0,
      totalCampaignsCompleted: 0,
    }
  }
}


import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import {
  startNextCalls,
  getProviderConfigForCampaign,
  MAX_CONCURRENT_CALLS_PER_CAMPAIGN,
} from "@/lib/campaigns/call-queue-manager"
import type { BusinessHoursConfig } from "@/types/database.types"

// ============================================================================
// VERCEL CONFIG
// ============================================================================
// Short timeout - we just queue and start initial calls
export const maxDuration = 30

// ============================================================================
// POST /api/w/[workspaceSlug]/campaigns/[id]/start-scalable
// ============================================================================
/**
 * Start a campaign using the SCALABLE queue-based approach
 * 
 * This is fundamentally different from the old approach:
 * 
 * OLD: Fire-and-forget all calls at once → hits VAPI concurrency limits
 * NEW: Queue all calls, start only N at a time → self-regulating flow
 * 
 * Flow:
 * 1. Validate campaign and prerequisites
 * 2. Update campaign status to "active"
 * 3. Start first batch of calls (respecting concurrency limits)
 * 4. Return immediately - webhooks will trigger subsequent calls
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    // Get campaign with agent
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select(`
        *,
        agent:ai_agents!agent_id(
          id, 
          name, 
          provider, 
          is_active, 
          external_agent_id,
          external_phone_number,
          assigned_phone_number_id
        )
      `)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Validate campaign status
    if (campaign.status === "active") {
      return apiError("Campaign is already active")
    }

    if (campaign.status === "completed" || campaign.status === "cancelled") {
      return apiError("Cannot start a completed or cancelled campaign")
    }

    if (campaign.status === "scheduled") {
      return apiError("Scheduled campaigns start automatically at the scheduled time")
    }

    if (campaign.status !== "ready" && campaign.status !== "draft") {
      return apiError(`Cannot start campaign with status: ${campaign.status}`)
    }

    // Validate agent
    const agent = campaign.agent as any
    if (!agent || !agent.is_active) {
      return apiError("Campaign agent is not active")
    }

    if (!agent.external_agent_id) {
      return apiError("Agent has not been synced with the voice provider")
    }

    // Get provider config (VAPI or Retell based on agent provider)
    const providerConfig = await getProviderConfigForCampaign(id)
    if (!providerConfig) {
      return apiError(`${agent.provider || "Provider"} integration not configured properly. Check that the integration has API keys and a shared outbound phone number configured.`)
    }

    // Get pending recipients count
    const { count: recipientCount } = await ctx.adminClient
      .from("call_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (!recipientCount || recipientCount === 0) {
      return apiError("No pending recipients to call. Add recipients first.")
    }

    // Check business hours if configured
    const businessHoursConfig = campaign.business_hours_config as BusinessHoursConfig | null
    // IMPORTANT: Use the timezone from business hours config (set by user in the schedule step)
    // Fall back to campaign.timezone only if business hours config doesn't have a timezone
    const campaignTimezone = (businessHoursConfig as any)?.timezone || campaign.timezone || "Australia/Melbourne"
    
    console.log("[CampaignStart:Scalable] Business hours check:", {
      enabled: businessHoursConfig?.enabled,
      configTimezone: (businessHoursConfig as any)?.timezone,
      campaignTimezone: campaign.timezone,
      effectiveTimezone: campaignTimezone,
      schedule: businessHoursConfig?.schedule,
    })
    
    if (businessHoursConfig?.enabled) {
      const { isWithinBusinessHours, getNextBusinessHoursInfo } = await import("@/lib/integrations/vapi/batch-calls")
      
      if (!isWithinBusinessHours(businessHoursConfig, campaignTimezone)) {
        const nextInfo = getNextBusinessHoursInfo(businessHoursConfig, campaignTimezone)
        
        // Format the start time nicely (e.g., "09:00" -> "9:00 AM")
        let nextWindowStr = ""
        if (nextInfo) {
          const [hours = 0, minutes = 0] = nextInfo.startTime.split(":").map(Number)
          const period = hours >= 12 ? "PM" : "AM"
          const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
          nextWindowStr = `${nextInfo.dayName} at ${displayHour}:${String(minutes).padStart(2, "0")} ${period}`
        }
        
        // Format timezone name nicely (e.g., "Australia/Melbourne" -> "Melbourne")
        const tzName = campaignTimezone.split('/').pop()?.replace('_', ' ') || campaignTimezone
        
        console.log("[CampaignStart:Scalable] BLOCKED - Outside business hours:", {
          effectiveTimezone: campaignTimezone,
          nextWindow: nextInfo,
        })
        
        const message = nextWindowStr
          ? `Outside business hours. Next calling window: ${nextWindowStr} (${tzName})`
          : `Outside business hours. No calling windows configured for the upcoming week.`
        
        return apiError(message, 400)
      }
    }

    // =========================================================================
    // STEP 1: UPDATE CAMPAIGN TO "ACTIVE"
    // =========================================================================
    
    const now = new Date().toISOString()
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "active",
        started_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select(`
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active, external_agent_id)
      `)
      .single()

    if (updateError) {
      console.error("[CampaignStart] Error updating campaign status:", updateError)
      return serverError("Failed to update campaign status")
    }

    console.log("[CampaignStart:Scalable] Campaign status updated to ACTIVE:", id)

    // =========================================================================
    // STEP 2: START FIRST BATCH OF CALLS (Initial start mode)
    // =========================================================================
    
    const startResult = await startNextCalls(id, ctx.workspace.id, providerConfig, { isInitialStart: true })

    console.log("[CampaignStart:Scalable] Initial calls started:", {
      campaignId: id,
      started: startResult.started,
      failed: startResult.failed,
      remaining: startResult.remaining,
    })

    // =========================================================================
    // STEP 3: RETURN IMMEDIATELY
    // =========================================================================
    // Webhooks will trigger subsequent calls as each call completes
    
    return apiResponse({
      success: true,
      campaign: updatedCampaign,
      recipientCount,
      message: `Campaign started! ${startResult.started} calls initiated, ${startResult.remaining} queued.`,
      processing: {
        status: "started",
        totalRecipients: recipientCount,
        initialCallsStarted: startResult.started,
        initialCallsFailed: startResult.failed,
        remainingInQueue: startResult.remaining,
        maxConcurrentCalls: MAX_CONCURRENT_CALLS_PER_CAMPAIGN,
        note: "Calls will be processed automatically as each call completes. No need to poll.",
      },
      ...(startResult.errors.length > 0 && {
        warnings: startResult.errors.slice(0, 5),
      }),
    })
  } catch (error) {
    console.error("[CampaignStart:Scalable] Exception:", error)
    return serverError("Internal server error")
  }
}


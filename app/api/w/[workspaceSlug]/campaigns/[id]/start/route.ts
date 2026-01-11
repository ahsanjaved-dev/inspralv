import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import type { BusinessHoursConfig, BusinessHoursTimeSlot, DayOfWeek } from "@/types/database.types"

// Inspra Outbound API base URL - should be configured via environment variable
const INSPRA_API_BASE_URL = process.env.INSPRA_OUTBOUND_API_URL || "https://api.inspra.io"

interface InspraCallListItem {
  phone: string
  variables: Record<string, string>
}

interface InspraLoadJsonPayload {
  agentId: string
  workspaceId: string
  batchRef: string
  cli: string
  callList: InspraCallListItem[]
  nbf: string // Not before (ISO date)
  exp: string // Expiry (ISO date)
  blockRules: string[] // e.g., ["Mon-Fri|0800-1600"]
}

// Convert business hours config to Inspra block rules format
// Block rules define when calls CANNOT be made
// Format: "Day-Day|HHMM-HHMM" e.g., "Mon-Fri|2000-0900" blocks 8PM to 9AM
function convertBusinessHoursToBlockRules(config: BusinessHoursConfig): string[] {
  const blockRules: string[] = []
  
  const dayMap: Record<DayOfWeek, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
  }

  const dayOrder: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

  // For each day, if there are no slots, block the entire day
  // If there are slots, block the times outside those slots
  for (const day of dayOrder) {
    const slots = config.schedule[day] || []
    const dayAbbrev = dayMap[day]

    if (slots.length === 0) {
      // Block entire day: 0000-2359
      blockRules.push(`${dayAbbrev}|0000-2359`)
    } else {
      // Block times outside the allowed slots
      // Sort slots by start time
      const sortedSlots = [...slots].sort((a, b) => a.start.localeCompare(b.start))
      
      // Block from midnight to first slot start
      const firstSlot = sortedSlots[0]
      if (firstSlot && firstSlot.start !== "00:00") {
        const startTime = firstSlot.start.replace(":", "")
        blockRules.push(`${dayAbbrev}|0000-${startTime}`)
      }

      // Block gaps between slots
      for (let i = 0; i < sortedSlots.length - 1; i++) {
        const currentSlot = sortedSlots[i]
        const nextSlot = sortedSlots[i + 1]
        if (currentSlot && nextSlot) {
          const currentEnd = currentSlot.end.replace(":", "")
          const nextStart = nextSlot.start.replace(":", "")
          if (currentEnd !== nextStart) {
            blockRules.push(`${dayAbbrev}|${currentEnd}-${nextStart}`)
          }
        }
      }

      // Block from last slot end to midnight
      const lastSlot = sortedSlots[sortedSlots.length - 1]
      if (lastSlot && lastSlot.end !== "24:00" && lastSlot.end !== "23:59") {
        const endTime = lastSlot.end.replace(":", "")
        blockRules.push(`${dayAbbrev}|${endTime}-2359`)
      }
    }
  }

  return blockRules
}

// POST /api/w/[workspaceSlug]/campaigns/[id]/start - Start campaign via Inspra API
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check paywall
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    // Get campaign with agent and recipients
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
          config
        )
      `)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Validate campaign can be started
    if (campaign.status === "active") {
      return apiError("Campaign is already active")
    }

    if (campaign.status === "completed" || campaign.status === "cancelled") {
      return apiError("Cannot start a completed or cancelled campaign")
    }

    // Validate agent
    const agent = campaign.agent as any
    if (!agent || !agent.is_active) {
      return apiError("Campaign agent is not active")
    }

    if (!agent.external_agent_id) {
      return apiError("Agent has not been synced with the voice provider")
    }

    // Get CLI (caller ID) from agent's phone number
    const cli = agent.external_phone_number
    if (!cli) {
      return apiError("Agent does not have a phone number assigned")
    }

    // Get all pending recipients
    const { data: recipients, error: recipientsError } = await ctx.adminClient
      .from("call_recipients")
      .select("*")
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (recipientsError) {
      console.error("[CampaignStart] Error fetching recipients:", recipientsError)
      return serverError("Failed to fetch recipients")
    }

    if (!recipients || recipients.length === 0) {
      return apiError("No pending recipients to call")
    }

    // Build call list for Inspra API
    // Map recipient data to Inspra variables format
    const callList: InspraCallListItem[] = recipients.map((recipient) => ({
      phone: recipient.phone_number,
      variables: {
        FIRST_NAME: recipient.first_name || "",
        LAST_NAME: recipient.last_name || "",
        EMAIL: recipient.email || "",
        COMPANY_NAME: recipient.company || "",
        REASON_FOR_CALL: recipient.reason_for_call || "",
        ADDRESS: recipient.address_line_1 || "",
        ADDRESS_LINE_2: recipient.address_line_2 || "",
        CITY: recipient.suburb || "",
        STATE: recipient.state || "",
        POST_CODE: recipient.post_code || "",
        COUNTRY: recipient.country || "",
      },
    }))

    // Calculate NBF (not before) and EXP (expiry) dates
    const now = new Date()
    let nbf: Date
    let exp: Date

    if (campaign.schedule_type === "scheduled" && campaign.scheduled_start_at) {
      nbf = new Date(campaign.scheduled_start_at)
    } else {
      nbf = now
    }

    // Set expiry - use scheduled_expires_at if set, otherwise 30 days from now
    if (campaign.scheduled_expires_at) {
      exp = new Date(campaign.scheduled_expires_at)
    } else {
      exp = new Date(nbf)
      exp.setDate(exp.getDate() + 30)
    }

    // Convert business hours to block rules
    const businessHoursConfig = campaign.business_hours_config as BusinessHoursConfig | null
    const blockRules = businessHoursConfig 
      ? convertBusinessHoursToBlockRules(businessHoursConfig)
      : []

    // Prepare Inspra API payload
    const inspraPayload: InspraLoadJsonPayload = {
      agentId: agent.external_agent_id,
      workspaceId: ctx.workspace.id,
      batchRef: `campaign-${campaign.id}`,
      cli,
      callList,
      nbf: nbf.toISOString(),
      exp: exp.toISOString(),
      blockRules,
    }

    console.log("[CampaignStart] Sending to Inspra API:", {
      campaignId: id,
      agentId: agent.external_agent_id,
      recipientCount: callList.length,
      blockRulesCount: blockRules.length,
    })

    // Call Inspra API
    const inspraResponse = await fetch(`${INSPRA_API_BASE_URL}/load-json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add API key if required
        ...(process.env.INSPRA_API_KEY && {
          "Authorization": `Bearer ${process.env.INSPRA_API_KEY}`,
        }),
      },
      body: JSON.stringify(inspraPayload),
    })

    if (!inspraResponse.ok) {
      const errorText = await inspraResponse.text()
      console.error("[CampaignStart] Inspra API error:", {
        status: inspraResponse.status,
        body: errorText,
      })
      return apiError(`Failed to start campaign: ${errorText}`, inspraResponse.status)
    }

    // Update campaign status to active
    const { data: updatedCampaign, error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("[CampaignStart] Error updating campaign status:", updateError)
      // Campaign was sent to Inspra but status update failed
      // This is a partial success - log and continue
    }

    return apiResponse({
      success: true,
      campaign: updatedCampaign || campaign,
      batchRef: `campaign-${campaign.id}`,
      recipientCount: callList.length,
    })
  } catch (error) {
    console.error("[CampaignStart] Exception:", error)
    return serverError("Internal server error")
  }
}


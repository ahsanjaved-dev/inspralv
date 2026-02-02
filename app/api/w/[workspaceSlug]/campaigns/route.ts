import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import {
  apiResponse,
  apiError,
  unauthorized,
  serverError,
  getValidationError,
} from "@/lib/api/helpers"
import { createCampaignSchema, createCampaignWizardSchema } from "@/types/database.types"
import type { RecipientData } from "@/lib/integrations/campaign-provider"

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============================================================================
// HELPER: Get CLI (Caller ID) for campaign
// ============================================================================

async function getCLIForAgent(
  agent: any,
  workspaceId: string,
  partnerId: string,
  adminClient: ReturnType<typeof getSupabaseAdmin>
): Promise<string | null> {
  // Priority:
  // 1. Agent's external_phone_number
  // 2. Agent's assigned_phone_number_id (lookup)
  // 3. Shared outbound from integration config

  if (agent.external_phone_number) {
    return agent.external_phone_number
  }

  if (agent.assigned_phone_number_id) {
    const { data: phoneNumber } = await adminClient
      .from("phone_numbers")
      .select("phone_number, phone_number_e164")
      .eq("id", agent.assigned_phone_number_id)
      .single()

    if (phoneNumber) {
      return phoneNumber.phone_number_e164 || phoneNumber.phone_number
    }
  }

  // Check integration for shared outbound number
  const supabase = getSupabaseAdmin()
  const { data: assignment } = await supabase
    .from("workspace_integration_assignments")
    .select(
      `
      partner_integration:partner_integrations (
        config
      )
    `
    )
    .eq("workspace_id", workspaceId)
    .eq("provider", "vapi")
    .single()

  if (assignment?.partner_integration) {
    const config = (assignment.partner_integration as any).config
    if (config?.shared_outbound_phone_number) {
      return config.shared_outbound_phone_number
    }
  }

  return null
}

/**
 * Calculate accurate campaign stats from actual recipient data using optimized SQL function
 * Returns stats by campaign_id for batch processing
 * 
 * OPTIMIZED: Uses SQL aggregation function instead of fetching all recipients
 * Falls back to direct query if RPC function doesn't exist
 */
async function calculateCampaignStatsForIds(
  campaignIds: string[],
  adminClient: ReturnType<typeof getSupabaseAdmin>
): Promise<Map<string, { pending: number; completed: number; successful: number; failed: number; total: number }>> {
  if (campaignIds.length === 0) {
    return new Map()
  }

  const statsMap = new Map<string, { pending: number; completed: number; successful: number; failed: number; total: number }>()
  
  // Initialize all campaigns with empty stats
  for (const id of campaignIds) {
    statsMap.set(id, { pending: 0, completed: 0, successful: 0, failed: 0, total: 0 })
  }

  try {
    // Try optimized SQL function first
    const { data: batchStats, error } = await adminClient
      .rpc("get_campaign_stats_batch", { campaign_ids: campaignIds })

    if (error) {
      // RPC function might not exist - fall back to direct query
      console.log("[CampaignsAPI] RPC not available, using direct query:", error.message)
      return await calculateCampaignStatsDirectQuery(campaignIds, adminClient)
    }

    // Map RPC results to our stats format
    if (batchStats && Array.isArray(batchStats)) {
      for (const stat of batchStats) {
        statsMap.set(stat.campaign_id, {
          total: Number(stat.total_recipients) || 0,
          pending: Number(stat.pending_calls) || 0,
          completed: Number(stat.completed_calls) || 0,
          successful: Number(stat.successful_calls) || 0,
          failed: Number(stat.failed_calls) || 0,
        })
      }
    }

    return statsMap
  } catch (err) {
    console.error("[CampaignsAPI] Exception in calculateCampaignStatsForIds:", err)
    return await calculateCampaignStatsDirectQuery(campaignIds, adminClient)
  }
}

/**
 * Direct query stats calculation (fallback if RPC function doesn't exist)
 * Fetches recipients and aggregates in JS - works without SQL function
 * 
 * IMPORTANT: Stats logic must match get_campaign_stats_batch SQL function:
 * - pending = pending + queued + calling
 * - completed = completed + failed
 * - successful = completed with outcome 'answered'
 * - failed = failed status
 */
async function calculateCampaignStatsDirectQuery(
  campaignIds: string[],
  adminClient: ReturnType<typeof getSupabaseAdmin>
): Promise<Map<string, { pending: number; completed: number; successful: number; failed: number; total: number }>> {
  const statsMap = new Map<string, { pending: number; completed: number; successful: number; failed: number; total: number }>()
  
  // Initialize all campaigns with empty stats
  for (const id of campaignIds) {
    statsMap.set(id, { pending: 0, completed: 0, successful: 0, failed: 0, total: 0 })
  }

  if (campaignIds.length === 0) {
    return statsMap
  }

  // Fetch recipients status for all campaigns
  const { data: recipients, error } = await adminClient
    .from("call_recipients")
    .select("campaign_id, call_status, call_outcome")
    .in("campaign_id", campaignIds)

  if (error) {
    console.error("[CampaignsAPI] Error in direct query stats:", error)
    return statsMap
  }

  if (!recipients || recipients.length === 0) {
    console.log("[CampaignsAPI] No recipients found for campaigns:", campaignIds)
    return statsMap
  }

  // Aggregate stats by campaign
  for (const r of recipients) {
    const stat = statsMap.get(r.campaign_id)
    if (!stat) continue

    stat.total++
    
    // Count by status - must match SQL function logic
    if (r.call_status === "pending" || r.call_status === "queued" || r.call_status === "calling") {
      stat.pending++
    } else if (r.call_status === "completed") {
      stat.completed++
      // Only count as successful if outcome is 'answered'
      if (r.call_outcome === "answered") {
        stat.successful++
      }
    } else if (r.call_status === "failed") {
      stat.completed++ // Failed calls are "done" for progress calculation
      stat.failed++
    }
  }

  console.log("[CampaignsAPI] Calculated stats for campaigns:", 
    Array.from(statsMap.entries()).map(([id, s]) => ({ id: id.slice(0, 8), ...s }))
  )

  return statsMap
}

// GET /api/w/[workspaceSlug]/campaigns - List campaigns
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const offset = (page - 1) * pageSize

    // Build query
    let query = ctx.adminClient
      .from("call_campaigns")
      .select(
        `
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active)
      `,
        { count: "exact" }
      )
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    const { data, error, count } = await query

    if (error) {
      console.error("[CampaignsAPI] Error fetching campaigns:", error)
      return serverError("Failed to fetch campaigns")
    }

    // Calculate accurate stats from actual recipient data for each campaign
    const campaigns = data || []
    const campaignIds = campaigns.map((c: any) => c.id)
    const statsMap = await calculateCampaignStatsForIds(campaignIds, ctx.adminClient)

    // Override stored counter values with calculated values
    const campaignsWithAccurateStats = campaigns.map((campaign: any) => {
      const stats = statsMap.get(campaign.id)
      if (stats) {
        return {
          ...campaign,
          total_recipients: stats.total,
          pending_calls: stats.pending,
          completed_calls: stats.completed,
          successful_calls: stats.successful,
          failed_calls: stats.failed,
        }
      }
      return campaign
    })

    // Always include workspaceId for realtime subscriptions
    // This ensures realtime can connect even when there are no campaigns
    return NextResponse.json({
      data: campaignsWithAccurateStats,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
      workspaceId: ctx.workspace.id,
    })
  } catch (error) {
    console.error("[CampaignsAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

// POST /api/w/[workspaceSlug]/campaigns - Create campaign
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check paywall - block campaign creation if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    const body = await request.json()

    // Check if this is a wizard flow creation
    const isWizardFlow = body.wizard_flow === true

    // Parse with appropriate schema
    const parsed = isWizardFlow
      ? createCampaignWizardSchema.safeParse(body)
      : createCampaignSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(getValidationError(parsed.error))
    }

    // Extract draft_id if converting from draft
    const draftId = isWizardFlow ? (parsed.data as any).draft_id : undefined
    const { agent_id, ...rest } = parsed.data

    // Verify agent exists and belongs to this workspace
    // Fetch full agent details for provider payload
    const { data: agent, error: agentError } = await ctx.adminClient
      .from("ai_agents")
      .select(
        "id, name, provider, is_active, external_agent_id, external_phone_number, assigned_phone_number_id"
      )
      .eq("id", agent_id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (agentError || !agent) {
      console.error("[CampaignsAPI] Agent lookup error:", agentError, "agent_id:", agent_id)
      return apiError("Agent not found or does not belong to this workspace")
    }

    if (!agent.is_active) {
      return apiError("Selected agent is not active")
    }

    // Agent must be synced for campaigns
    if (!agent.external_agent_id) {
      return apiError("Agent must be synced with the voice provider before creating a campaign")
    }

    // Get CLI (Caller ID) for the campaign
    const cli = await getCLIForAgent(agent, ctx.workspace.id, ctx.partner.id, ctx.adminClient)
    if (!cli) {
      return apiError(
        "No outbound phone number configured for the agent. Please assign a phone number to the agent first."
      )
    }

    // Extract wizard-specific fields if present
    const recipients = isWizardFlow ? (rest as any).recipients || [] : []
    const businessHoursConfig = isWizardFlow ? (rest as any).business_hours_config || null : null
    const wizardFields = isWizardFlow
      ? {
          business_hours_config: businessHoursConfig,
          variable_mappings: (rest as any).variable_mappings || [],
          agent_prompt_overrides: (rest as any).agent_prompt_overrides || null,
          csv_column_headers: (rest as any).csv_column_headers || [],
          wizard_completed: true,
        }
      : {}

    // IMPORTANT: Use the timezone from business hours config if available
    // This ensures the campaign timezone matches what the user selected in the schedule step
    const effectiveTimezone = businessHoursConfig?.timezone || rest.timezone || "UTC"

    // Prepare campaign data
    const campaignData = {
      name: rest.name,
      description: rest.description || null,
      schedule_type: rest.schedule_type,
      scheduled_start_at: rest.scheduled_start_at || null,
      scheduled_expires_at: rest.scheduled_expires_at || null,
      business_hours_only: rest.business_hours_only || false,
      business_hours_start: rest.business_hours_start || null,
      business_hours_end: rest.business_hours_end || null,
      timezone: effectiveTimezone,
      concurrency_limit: 1,
      max_attempts: 3,
      retry_delay_minutes: 30,
      ...wizardFields,
    }

    let campaign: any
    let error: any = null

    // If we have a draft_id, update the existing draft instead of creating new
    if (draftId) {
      // Verify draft exists and belongs to this workspace
      const { data: existingDraft, error: fetchError } = await ctx.adminClient
        .from("call_campaigns")
        .select("id, status, workspace_id")
        .eq("id", draftId)
        .eq("workspace_id", ctx.workspace.id)
        .is("deleted_at", null)
        .single()

      if (fetchError || !existingDraft) {
        console.error("[CampaignsAPI] Draft not found:", draftId)
        return apiError("Draft not found")
      }

      if (existingDraft.status !== "draft") {
        return apiError("Can only convert draft campaigns")
      }

      // Determine the campaign status based on wizard completion and schedule type
      // - Immediate campaigns become "ready" (payload sent with future NBF, waits for "Start Now")
      // - Scheduled campaigns become "scheduled" (payload sent with scheduled NBF, auto-starts)
      // - Incomplete campaigns stay as "draft"
      const isWizardComplete = isWizardFlow && wizardFields.wizard_completed
      const hasRecipients = recipients.length > 0
      let campaignStatus: string = "draft"

      if (isWizardComplete && hasRecipients) {
        if (rest.schedule_type === "scheduled" && rest.scheduled_start_at) {
          // Scheduled campaigns: payload sent with scheduled NBF, auto-starts at that time
          campaignStatus = "scheduled"
        } else {
          // Immediate campaigns: payload sent with future NBF, waits for "Start Now" click
          campaignStatus = "ready"
        }
      }

      // Update the existing draft
      const { data: updated, error: updateError } = await ctx.adminClient
        .from("call_campaigns")
        .update({
          ...campaignData,
          agent_id,
          status: campaignStatus,
          total_recipients: recipients.length,
          pending_calls: recipients.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId)
        .select(
          `
          *,
          agent:ai_agents!agent_id(id, name, provider, is_active, external_agent_id)
        `
        )
        .single()

      campaign = updated
      error = updateError

      if (updateError) {
        console.error("[CampaignsAPI] Error updating draft:", updateError)
        return serverError("Failed to update draft")
      }

      // Delete existing recipients before re-inserting (will be handled below)
      await ctx.adminClient.from("call_recipients").delete().eq("campaign_id", draftId)

      console.log(`[CampaignsAPI] Converting draft ${draftId} to campaign`)
    } else {
      // Determine the campaign status based on wizard completion and schedule type
      const isWizardComplete = isWizardFlow && wizardFields.wizard_completed
      const hasRecipients = recipients.length > 0
      let newCampaignStatus: string = "draft"

      if (isWizardComplete && hasRecipients) {
        if (rest.schedule_type === "scheduled" && rest.scheduled_start_at) {
          newCampaignStatus = "scheduled"
        } else {
          newCampaignStatus = "ready"
        }
      }

      // Create new campaign in database
      const { data: created, error: createError } = await ctx.adminClient
        .from("call_campaigns")
        .insert({
          ...campaignData,
          agent_id,
          workspace_id: ctx.workspace.id,
          created_by: ctx.user.id,
          status: newCampaignStatus,
          total_recipients: recipients.length,
          pending_calls: recipients.length,
        })
        .select(
          `
          *,
          agent:ai_agents!agent_id(id, name, provider, is_active, external_agent_id)
        `
        )
        .single()

      campaign = created
      error = createError

      if (createError) {
        console.error("[CampaignsAPI] Error creating campaign:", createError)
        return serverError("Failed to create campaign")
      }
    }

    // If wizard flow with recipients, insert them
    let insertedCount = 0
    let duplicatesCount = 0
    const insertedRecipients: RecipientData[] = []

    if (isWizardFlow && recipients.length > 0) {
      const recipientRows = recipients.map((r: any) => ({
        campaign_id: campaign.id,
        workspace_id: ctx.workspace.id,
        phone_number: r.phone_number,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        email: r.email || null,
        company: r.company || null,
        // New standard columns
        reason_for_call: r.reason_for_call || null,
        address_line_1: r.address_line_1 || null,
        address_line_2: r.address_line_2 || null,
        suburb: r.suburb || null,
        state: r.state || null,
        post_code: r.post_code || null,
        country: r.country || null,
        // CRITICAL: Include custom_variables for dynamic variable substitution (e.g., {{product_interest}})
        custom_variables: r.custom_variables || {},
        call_status: "pending",
        attempts: 0,
      }))

      // Insert recipients in batches of 500
      const batchSize = 500

      for (let i = 0; i < recipientRows.length; i += batchSize) {
        const batch = recipientRows.slice(i, i + batchSize)
        const { data: inserted, error: recipientError } = await ctx.adminClient
          .from("call_recipients")
          .upsert(batch, {
            onConflict: "campaign_id,phone_number",
            ignoreDuplicates: true,
          })
          .select()

        if (recipientError) {
          console.error("[CampaignsAPI] Error inserting recipients batch:", recipientError)
          // Continue with other batches even if one fails
        } else {
          insertedCount += inserted?.length || 0
          // Collect inserted recipients for provider payload
          if (inserted) {
            insertedRecipients.push(
              ...inserted.map((r: any) => ({
                phone_number: r.phone_number,
                first_name: r.first_name,
                last_name: r.last_name,
                email: r.email,
                company: r.company,
                reason_for_call: r.reason_for_call,
                address_line_1: r.address_line_1,
                address_line_2: r.address_line_2,
                suburb: r.suburb,
                state: r.state,
                post_code: r.post_code,
                country: r.country,
              }))
            )
          }
        }
      }

      duplicatesCount = recipients.length - insertedCount

      // Update campaign recipient counts
      const { error: updateError } = await ctx.adminClient
        .from("call_campaigns")
        .update({
          total_recipients: insertedCount,
          pending_calls: insertedCount,
        })
        .eq("id", campaign.id)

      if (updateError) {
        console.error("[CampaignsAPI] Error updating campaign counts:", updateError)
      }
    }

    // =========================================================================
    // CAMPAIGN CREATED - CALLS WILL BE INITIATED WHEN USER CLICKS "START NOW"
    // =========================================================================
    // Note: We no longer send calls to the provider on campaign creation.
    // Calls are only initiated when user explicitly clicks "Start Now" via
    // POST /campaigns/[id]/start endpoint.
    // For scheduled campaigns, the cron job will trigger the start.

    console.log(`[CampaignsAPI] Campaign created: ${campaign.id} with status: ${campaign.status}`)
    console.log(`[CampaignsAPI] Recipients: ${insertedCount} imported (${duplicatesCount} duplicates)`)

    // Re-fetch campaign with updated counts
    const { data: updatedCampaign } = await ctx.adminClient
      .from("call_campaigns")
      .select(
        `
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active, external_agent_id)
      `
      )
      .eq("id", campaign.id)
      .single()

    return apiResponse(
      {
        ...updatedCampaign,
        _import: {
          imported: insertedCount,
          duplicates: duplicatesCount,
          total: recipients.length,
        },
      },
      201
    )
  } catch (error) {
    console.error("[CampaignsAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

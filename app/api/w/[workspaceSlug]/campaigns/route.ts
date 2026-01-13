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
import type { BusinessHoursConfig } from "@/types/database.types"
import {
  loadJsonBatch,
  buildLoadJsonPayload,
  type CampaignData,
  type RecipientData,
} from "@/lib/integrations/inspra/client"

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
    .select(`
      partner_integration:partner_integrations (
        config
      )
    `)
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

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
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
    // Fetch full agent details for Inspra payload
    const { data: agent, error: agentError } = await ctx.adminClient
      .from("ai_agents")
      .select("id, name, provider, is_active, external_agent_id, external_phone_number, assigned_phone_number_id")
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
      return apiError("No outbound phone number configured for the agent. Please assign a phone number to the agent first.")
    }

    // Extract wizard-specific fields if present
    const recipients = isWizardFlow ? (rest as any).recipients || [] : []
    const wizardFields = isWizardFlow
      ? {
          business_hours_config: (rest as any).business_hours_config || null,
          variable_mappings: (rest as any).variable_mappings || [],
          agent_prompt_overrides: (rest as any).agent_prompt_overrides || null,
          csv_column_headers: (rest as any).csv_column_headers || [],
          wizard_completed: true,
        }
      : {}

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
      timezone: rest.timezone || "UTC",
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
      // - Immediate campaigns stay as "draft" until user clicks "Start"
      // - Scheduled campaigns become "scheduled" and will auto-start at the scheduled time
      const isWizardComplete = isWizardFlow && wizardFields.wizard_completed
      const hasRecipients = recipients.length > 0
      let campaignStatus: string = "draft"
      
      if (isWizardComplete && hasRecipients) {
        // Only scheduled campaigns get auto-scheduled status
        // Immediate campaigns stay as draft - user must click "Start" to activate
        if (rest.schedule_type === "scheduled" && rest.scheduled_start_at) {
          campaignStatus = "scheduled"
        }
        // For immediate, keep as "draft" - user will click "Start" when ready
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
      await ctx.adminClient
        .from("call_recipients")
        .delete()
        .eq("campaign_id", draftId)

      console.log(`[CampaignsAPI] Converting draft ${draftId} to campaign`)
    } else {
      // Determine the campaign status based on wizard completion and schedule type
      // - Immediate campaigns stay as "draft" until user clicks "Start"
      // - Scheduled campaigns become "scheduled" and will auto-start at the scheduled time
      const isWizardComplete = isWizardFlow && wizardFields.wizard_completed
      const hasRecipients = recipients.length > 0
      let newCampaignStatus: string = "draft"
      
      if (isWizardComplete && hasRecipients) {
        // Only scheduled campaigns get auto-scheduled status
        if (rest.schedule_type === "scheduled" && rest.scheduled_start_at) {
          newCampaignStatus = "scheduled"
        }
        // For immediate, keep as "draft" - user will click "Start" when ready
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
        // New standard columns for Inspra API
        reason_for_call: r.reason_for_call || null,
        address_line_1: r.address_line_1 || null,
        address_line_2: r.address_line_2 || null,
        suburb: r.suburb || null,
        state: r.state || null,
        post_code: r.post_code || null,
        country: r.country || null,
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
          // Collect inserted recipients for Inspra payload
          if (inserted) {
            insertedRecipients.push(...inserted.map((r: any) => ({
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
            })))
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
    // SEND TO INSPRA API on CREATE
    // =========================================================================
    
    let inspraResult: { success: boolean; error?: string } = { success: true }

    if (insertedRecipients.length > 0) {
      console.log("[CampaignsAPI] Sending campaign to Inspra API...")

      // Build campaign data for Inspra
      const campaignDataForInspra: CampaignData = {
        id: campaign.id,
        workspace_id: ctx.workspace.id,
        agent: {
          external_agent_id: agent.external_agent_id,
          external_phone_number: agent.external_phone_number,
          assigned_phone_number_id: agent.assigned_phone_number_id,
        },
        cli,
        schedule_type: campaign.schedule_type,
        scheduled_start_at: campaign.scheduled_start_at,
        scheduled_expires_at: campaign.scheduled_expires_at,
        business_hours_config: campaign.business_hours_config as BusinessHoursConfig | null,
        timezone: campaign.timezone,
      }

      // Build Inspra payload
      const inspraPayload = buildLoadJsonPayload(campaignDataForInspra, insertedRecipients)

      console.log("[CampaignsAPI] Inspra payload:", {
        batchRef: inspraPayload.batchRef,
        agentId: inspraPayload.agentId,
        workspaceId: inspraPayload.workspaceId,
        cli: inspraPayload.cli,
        recipientCount: inspraPayload.callList.length,
        nbf: inspraPayload.nbf,
        exp: inspraPayload.exp,
        blockRulesCount: inspraPayload.blockRules.length,
      })

      // Call Inspra API
      inspraResult = await loadJsonBatch(inspraPayload)

      if (inspraResult.success) {
        console.log("[CampaignsAPI] Successfully sent to Inspra API")
        
        // Update campaign with Inspra batch reference
        await ctx.adminClient
          .from("call_campaigns")
          .update({
            // Store batch reference in metadata for tracking
            // We could add a dedicated column later if needed
          })
          .eq("id", campaign.id)
      } else {
        console.error("[CampaignsAPI] Failed to send to Inspra API:", inspraResult.error)
        // Don't fail the campaign creation - just log the error
        // The campaign is still created locally, can retry Inspra later
      }
    }

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
        _inspra: {
          sent: inspraResult.success,
          error: inspraResult.error,
          batchRef: `campaign-${campaign.id}`,
        },
      },
      201
    )
  } catch (error) {
    console.error("[CampaignsAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

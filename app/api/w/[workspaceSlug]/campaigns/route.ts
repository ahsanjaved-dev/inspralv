import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import {
  apiResponse,
  apiError,
  unauthorized,
  serverError,
  getValidationError,
} from "@/lib/api/helpers"
import { createCampaignSchema, createCampaignWizardSchema } from "@/types/database.types"

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

    const { agent_id, ...rest } = parsed.data

    // Verify agent exists and belongs to this workspace
    const { data: agent, error: agentError } = await ctx.adminClient
      .from("ai_agents")
      .select("id, name, provider, is_active")
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

    // Create campaign
    const { data: campaign, error } = await ctx.adminClient
      .from("call_campaigns")
      .insert({
        ...campaignData,
        agent_id,
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id,
        status: "draft",
        total_recipients: recipients.length,
        pending_calls: recipients.length,
      })
      .select(
        `
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active)
      `
      )
      .single()

    if (error) {
      console.error("[CampaignsAPI] Error creating campaign:", error)
      return serverError("Failed to create campaign")
    }

    // If wizard flow with recipients, insert them
    if (isWizardFlow && recipients.length > 0) {
      const recipientRows = recipients.map((r: any) => ({
        campaign_id: campaign.id,
        workspace_id: ctx.workspace.id,
        phone_number: r.phone_number,
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        email: r.email || null,
        company: r.company || null,
        custom_variables: r.custom_variables || {},
        call_status: "pending",
        attempts: 0,
      }))

      // Insert recipients in batches of 500
      const batchSize = 500
      let insertedCount = 0
      let duplicatesCount = 0

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

      // Re-fetch campaign with updated counts
      const { data: updatedCampaign } = await ctx.adminClient
        .from("call_campaigns")
        .select(
          `
          *,
          agent:ai_agents!agent_id(id, name, provider, is_active)
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
    }

    return apiResponse(campaign, 201)
  } catch (error) {
    console.error("[CampaignsAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import {
  apiResponse,
  apiError,
  unauthorized,
  serverError,
} from "@/lib/api/helpers"
import { z } from "zod"

// ============================================================================
// DRAFT SAVE SCHEMA - Partial data allowed
// ============================================================================

const draftSaveSchema = z.object({
  // Campaign ID - if provided, update existing draft; if not, create new
  // Allow empty string to be treated as undefined
  draft_id: z.union([z.string().uuid(), z.literal("")]).optional().transform(val => val === "" ? undefined : val),
  
  // Step 1: Campaign Details (partial)
  name: z.string().optional(),
  description: z.string().optional(),
  // Allow empty string for agent_id - treat as undefined
  agent_id: z.union([z.string().uuid(), z.literal("")]).optional().transform(val => val === "" ? undefined : val),
  
  // Step 2: Recipients (partial)
  recipients: z.array(z.object({
    phone_number: z.string(),
    first_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    company: z.string().optional().nullable(),
    reason_for_call: z.string().optional().nullable(),
    address_line_1: z.string().optional().nullable(),
    address_line_2: z.string().optional().nullable(),
    suburb: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    post_code: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
  }).passthrough()).optional(), // passthrough allows extra fields
  csv_column_headers: z.array(z.string()).optional(),
  
  // Step 3: Schedule (partial)
  schedule_type: z.enum(["immediate", "scheduled"]).optional(),
  scheduled_start_at: z.string().optional().nullable(),
  scheduled_expires_at: z.string().optional().nullable(),
  timezone: z.string().optional(),
  business_hours_config: z.any().optional(),
  
  // Wizard state
  current_step: z.number().optional(),
}).passthrough() // Allow extra fields that might be sent from the wizard

// POST /api/w/[workspaceSlug]/campaigns/draft - Auto-save draft
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Note: We don't check paywall for draft saves - only for final creation
    
    const body = await request.json()
    const parsed = draftSaveSchema.safeParse(body)

    if (!parsed.success) {
      console.error("[CampaignDraft] Validation error:", JSON.stringify(parsed.error.issues, null, 2))
      console.error("[CampaignDraft] Received body:", JSON.stringify(body, null, 2))
      return apiError("Invalid draft data", 400)
    }

    const data = parsed.data
    const draftId = data.draft_id

    // For new drafts (no draft_id), we MUST have an agent_id because it's NOT NULL in DB
    if (!draftId && !data.agent_id) {
      // Return success but don't create draft - let the client know to wait for agent selection
      return apiResponse({
        draft_id: null,
        saved_at: null,
        message: "Agent selection required to create draft"
      })
    }

    // Build campaign data from partial input
    const campaignData: Record<string, unknown> = {
      status: "draft",
      wizard_completed: false,
      updated_at: new Date().toISOString(),
    }

    // Only set fields that are provided
    if (data.name !== undefined) campaignData.name = data.name || "Untitled Campaign"
    if (data.description !== undefined) campaignData.description = data.description || null
    if (data.agent_id !== undefined) campaignData.agent_id = data.agent_id
    if (data.schedule_type !== undefined) campaignData.schedule_type = data.schedule_type
    if (data.scheduled_start_at !== undefined) campaignData.scheduled_start_at = data.scheduled_start_at
    if (data.scheduled_expires_at !== undefined) campaignData.scheduled_expires_at = data.scheduled_expires_at
    if (data.timezone !== undefined) campaignData.timezone = data.timezone
    if (data.business_hours_config !== undefined) campaignData.business_hours_config = data.business_hours_config
    if (data.csv_column_headers !== undefined) campaignData.csv_column_headers = data.csv_column_headers

    let campaign: any

    if (draftId) {
      // Update existing draft
      const { data: existingCampaign, error: fetchError } = await ctx.adminClient
        .from("call_campaigns")
        .select("id, status")
        .eq("id", draftId)
        .eq("workspace_id", ctx.workspace.id)
        .is("deleted_at", null)
        .single()

      if (fetchError || !existingCampaign) {
        return apiError("Draft not found")
      }

      // Only allow updating drafts
      if (existingCampaign.status !== "draft") {
        return apiError("Can only update draft campaigns")
      }

      const { data: updated, error: updateError } = await ctx.adminClient
        .from("call_campaigns")
        .update(campaignData)
        .eq("id", draftId)
        .select()
        .single()

      if (updateError) {
        console.error("[CampaignDraft] Error updating draft:", updateError)
        return serverError("Failed to update draft")
      }

      campaign = updated

      // Update recipients if provided
      if (data.recipients && data.recipients.length > 0) {
        // Delete existing recipients and insert new ones
        await ctx.adminClient
          .from("call_recipients")
          .delete()
          .eq("campaign_id", draftId)

        const recipientRows = data.recipients.map((r) => ({
          campaign_id: draftId,
          workspace_id: ctx.workspace.id,
          phone_number: r.phone_number,
          first_name: r.first_name || null,
          last_name: r.last_name || null,
          email: r.email || null,
          company: r.company || null,
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

        const { error: recipientError } = await ctx.adminClient
          .from("call_recipients")
          .insert(recipientRows)

        if (recipientError) {
          console.error("[CampaignDraft] Error inserting recipients:", recipientError)
        }

        // Update recipient counts
        await ctx.adminClient
          .from("call_campaigns")
          .update({
            total_recipients: data.recipients.length,
            pending_calls: data.recipients.length,
          })
          .eq("id", draftId)
      }

      console.log(`[CampaignDraft] Updated draft: ${draftId}`)

    } else {
      // Create new draft with all required fields
      const { data: created, error: createError } = await ctx.adminClient
        .from("call_campaigns")
        .insert({
          ...campaignData,
          name: campaignData.name || "Untitled Campaign",
          workspace_id: ctx.workspace.id,
          created_by: ctx.user.id,
          total_recipients: 0,
          pending_calls: 0,
          // Required fields with default values
          schedule_type: campaignData.schedule_type || "immediate",
          timezone: campaignData.timezone || "UTC",
          concurrency_limit: 1,
          max_attempts: 3,
          retry_delay_minutes: 30,
          business_hours_only: false,
          completed_calls: 0,
          successful_calls: 0,
          failed_calls: 0,
        })
        .select()
        .single()

      if (createError) {
        console.error("[CampaignDraft] Error creating draft:", createError)
        return serverError("Failed to create draft")
      }

      campaign = created
      console.log(`[CampaignDraft] Created new draft: ${campaign.id}`)
    }

    return apiResponse({
      draft_id: campaign.id,
      saved_at: new Date().toISOString(),
    })

  } catch (error) {
    console.error("[CampaignDraft] Exception:", error)
    return serverError("Internal server error")
  }
}

// GET /api/w/[workspaceSlug]/campaigns/draft - Get user's latest draft
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get("id")

    if (draftId) {
      // Get specific draft
      const { data: draft, error } = await ctx.adminClient
        .from("call_campaigns")
        .select(`
          *,
          agent:ai_agents!agent_id(id, name, provider, is_active, external_agent_id)
        `)
        .eq("id", draftId)
        .eq("workspace_id", ctx.workspace.id)
        .eq("status", "draft")
        .is("deleted_at", null)
        .single()

      if (error || !draft) {
        return apiError("Draft not found", 404)
      }

      // Get recipients
      const { data: recipients } = await ctx.adminClient
        .from("call_recipients")
        .select("*")
        .eq("campaign_id", draftId)
        .order("created_at", { ascending: true })

      return apiResponse({
        ...draft,
        recipients: recipients || [],
      })
    }

    // Get user's most recent draft
    const { data: drafts, error } = await ctx.adminClient
      .from("call_campaigns")
      .select(`
        *,
        agent:ai_agents!agent_id(id, name, provider, is_active)
      `)
      .eq("workspace_id", ctx.workspace.id)
      .eq("status", "draft")
      .eq("created_by", ctx.user.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5)

    if (error) {
      console.error("[CampaignDraft] Error fetching drafts:", error)
      return serverError("Failed to fetch drafts")
    }

    return apiResponse({
      drafts: drafts || [],
    })

  } catch (error) {
    console.error("[CampaignDraft] Exception:", error)
    return serverError("Internal server error")
  }
}

// DELETE /api/w/[workspaceSlug]/campaigns/draft - Delete a draft
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get("id")

    if (!draftId) {
      return apiError("Draft ID required")
    }

    // Verify draft exists and belongs to user
    const { data: draft, error: fetchError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, status, created_by")
      .eq("id", draftId)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (fetchError || !draft) {
      return apiError("Draft not found", 404)
    }

    if (draft.status !== "draft") {
      return apiError("Can only delete draft campaigns")
    }

    // Soft delete
    const { error: deleteError } = await ctx.adminClient
      .from("call_campaigns")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", draftId)

    if (deleteError) {
      console.error("[CampaignDraft] Error deleting draft:", deleteError)
      return serverError("Failed to delete draft")
    }

    console.log(`[CampaignDraft] Deleted draft: ${draftId}`)

    return apiResponse({ success: true })

  } catch (error) {
    console.error("[CampaignDraft] Exception:", error)
    return serverError("Internal server error")
  }
}


import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import {
  apiResponse,
  apiError,
  unauthorized,
  serverError,
} from "@/lib/api/helpers"

/**
 * POST /api/w/[workspaceSlug]/campaigns/draft/create
 * 
 * Creates a new empty draft campaign. This is called when user navigates to
 * /campaigns/new without an existing draft ID.
 * 
 * The draft is created with placeholder values that get updated as the user
 * fills in the wizard.
 * 
 * IMPORTANT: This endpoint includes duplicate prevention - if the user already
 * has an "Untitled Campaign" draft created in the last 30 seconds, we return
 * that instead of creating a new one. This prevents race conditions from
 * React strict mode or fast navigation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check for recent draft to prevent duplicates
    // If user has an "Untitled Campaign" draft created in the last 30 seconds, return that
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString()
    
    const { data: recentDraft } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, name, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .eq("created_by", ctx.user.id)
      .eq("status", "draft")
      .eq("name", "Untitled Campaign")
      .is("deleted_at", null)
      .gte("created_at", thirtySecondsAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (recentDraft) {
      console.log(`[CampaignDraft/Create] Returning recent draft: ${recentDraft.id}`)
      return apiResponse({
        draft_id: recentDraft.id,
        reused: true,
      })
    }

    // Get the first available agent in the workspace as a placeholder
    // This will be updated when user actually selects an agent
    const { data: agents } = await ctx.adminClient
      .from("ai_agents")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)

    if (!agents || agents.length === 0) {
      return apiError("No active agents found. Please create an agent first.", 400)
    }

    const placeholderAgentId = agents[0].id

    // Create new draft with placeholder values
    const { data: draft, error: createError } = await ctx.adminClient
      .from("call_campaigns")
      .insert({
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id,
        agent_id: placeholderAgentId, // Placeholder - will be updated by user
        name: "Untitled Campaign",
        description: null,
        status: "draft",
        wizard_completed: false,
        schedule_type: "immediate",
        timezone: "America/New_York",
        concurrency_limit: 1,
        max_attempts: 3,
        retry_delay_minutes: 30,
        business_hours_only: false,
        total_recipients: 0,
        pending_calls: 0,
        completed_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        csv_column_headers: [],
        business_hours_config: {
          enabled: true,
          timezone: "America/New_York",
          schedule: {
            monday: [{ start: "09:00", end: "17:00" }],
            tuesday: [{ start: "09:00", end: "17:00" }],
            wednesday: [{ start: "09:00", end: "17:00" }],
            thursday: [{ start: "09:00", end: "17:00" }],
            friday: [{ start: "09:00", end: "17:00" }],
            saturday: [],
            sunday: [],
          },
        },
      })
      .select("id")
      .single()

    if (createError) {
      console.error("[CampaignDraft/Create] Error creating draft:", createError)
      return serverError("Failed to create draft")
    }

    console.log(`[CampaignDraft/Create] Created new draft: ${draft.id}`)

    return apiResponse({
      draft_id: draft.id,
      reused: false,
    })

  } catch (error) {
    console.error("[CampaignDraft/Create] Exception:", error)
    return serverError("Internal server error")
  }
}


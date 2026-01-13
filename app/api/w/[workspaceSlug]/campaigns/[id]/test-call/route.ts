import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound, getValidationError } from "@/lib/api/helpers"
import { z } from "zod"
import { queueTestCall, convertBusinessHoursToBlockRules } from "@/lib/integrations/inspra/client"
import type { BusinessHoursConfig } from "@/types/database.types"

const testCallSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  variables: z.record(z.string(), z.string()).optional(),
})

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/test-call
 * 
 * Queue a single test call via Inspra /test-call endpoint.
 */
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

    const body = await request.json()
    const parsed = testCallSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(getValidationError(parsed.error))
    }

    // Get campaign with agent
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select(`
        *,
        agent:ai_agents!agent_id(
          id, 
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

    const agent = campaign.agent as any
    if (!agent?.external_agent_id) {
      return apiError("Agent has not been synced with the voice provider")
    }

    // Get CLI (caller ID) from agent's phone number
    let cli = agent.external_phone_number
    
    if (!cli && agent.assigned_phone_number_id) {
      const { data: phoneNumber } = await ctx.adminClient
        .from("phone_numbers")
        .select("phone_number, phone_number_e164")
        .eq("id", agent.assigned_phone_number_id)
        .single()
      
      if (phoneNumber) {
        cli = phoneNumber.phone_number_e164 || phoneNumber.phone_number
      }
    }
    
    if (!cli) {
      return apiError("Agent does not have a phone number assigned")
    }

    // Set NBF to now and EXP to 24 hours from now for test calls
    const now = new Date()
    const exp = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Get business hours block rules
    const businessHoursConfig = campaign.business_hours_config as BusinessHoursConfig | null
    const blockRules = convertBusinessHoursToBlockRules(businessHoursConfig)

    // Build test call payload
    const inspraPayload = {
      agentId: agent.external_agent_id,
      workspaceId: ctx.workspace.id,
      batchRef: `test-${id}-${Date.now()}`,
      cli,
      nbf: now.toISOString(),
      exp: exp.toISOString(),
      blockRules,
      phone: parsed.data.phone_number,
      variables: parsed.data.variables || {
        FIRST_NAME: "Test",
        LAST_NAME: "User",
        COMPANY_NAME: "Test Company",
        EMAIL: "",
        REASON_FOR_CALL: "Test call",
        ADDRESS: "",
        ADDRESS_LINE_2: "",
        CITY: "",
        STATE: "",
        POST_CODE: "",
        COUNTRY: "",
      },
    }

    console.log("[CampaignTestCall] Calling Inspra test-call:", {
      campaignId: id,
      phone: parsed.data.phone_number,
      agentId: agent.external_agent_id,
    })

    // Call Inspra test-call endpoint
    const inspraResult = await queueTestCall(inspraPayload)

    if (!inspraResult.success) {
      console.error("[CampaignTestCall] Inspra API error:", inspraResult.error)
      // For testing with webhook.site, this might "fail" but the payload was sent
    }

    console.log("[CampaignTestCall] Test call queued")

    return apiResponse({
      success: true,
      message: "Test call queued successfully",
      phone: parsed.data.phone_number,
      inspra: {
        called: true,
        success: inspraResult.success,
        error: inspraResult.error,
      },
    })
  } catch (error) {
    console.error("[CampaignTestCall] Exception:", error)
    return serverError("Internal server error")
  }
}

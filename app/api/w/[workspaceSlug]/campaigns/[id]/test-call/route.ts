import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound, getValidationError } from "@/lib/api/helpers"
import { z } from "zod"
import type { BusinessHoursConfig } from "@/types/database.types"

// Inspra Outbound API base URL
const INSPRA_API_BASE_URL = process.env.INSPRA_OUTBOUND_API_URL || "https://api.inspra.io"

const testCallSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  variables: z.record(z.string(), z.string()).optional(),
})

// POST /api/w/[workspaceSlug]/campaigns/[id]/test-call - Queue a single test call
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
          external_phone_number
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

    const cli = agent.external_phone_number
    if (!cli) {
      return apiError("Agent does not have a phone number assigned")
    }

    // Set NBF to now and EXP to 24 hours from now for test calls
    const now = new Date()
    const exp = new Date(now)
    exp.setHours(exp.getHours() + 24)

    // Build test call payload
    const inspraPayload = {
      agentId: agent.external_agent_id,
      workspaceId: ctx.workspace.id,
      batchRef: `test-${campaign.id}-${Date.now()}`,
      cli,
      nbf: now.toISOString(),
      exp: exp.toISOString(),
      blockRules: [], // No block rules for test calls
      phone: parsed.data.phone_number,
      variables: parsed.data.variables || {
        FIRST_NAME: "Test",
        LAST_NAME: "User",
        COMPANY_NAME: "Test Company",
      },
    }

    console.log("[TestCall] Sending to Inspra API:", {
      campaignId: id,
      phone: parsed.data.phone_number,
    })

    // Call Inspra test-call endpoint
    const inspraResponse = await fetch(`${INSPRA_API_BASE_URL}/test-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.INSPRA_API_KEY && {
          "Authorization": `Bearer ${process.env.INSPRA_API_KEY}`,
        }),
      },
      body: JSON.stringify(inspraPayload),
    })

    if (!inspraResponse.ok) {
      const errorText = await inspraResponse.text()
      console.error("[TestCall] Inspra API error:", {
        status: inspraResponse.status,
        body: errorText,
      })
      return apiError(`Failed to queue test call: ${errorText}`, inspraResponse.status)
    }

    return apiResponse({
      success: true,
      message: "Test call queued successfully",
      phone: parsed.data.phone_number,
    })
  } catch (error) {
    console.error("[TestCall] Exception:", error)
    return serverError("Internal server error")
  }
}


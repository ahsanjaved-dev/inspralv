/**
 * GET /api/w/[workspaceSlug]/calls/[callId]
 * Fetch a single call/conversation by ID
 */

import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, notFound, serverError } from "@/lib/api/helpers"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; callId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, callId } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Fetch the conversation with full details
    const { data: conversation, error } = await ctx.adminClient
      .from("conversations")
      .select(`
        *,
        agent:ai_agents(
          id,
          name,
          provider,
          voice_provider,
          model_provider,
          transcriber_provider
        )
      `)
      .eq("id", callId)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (error || !conversation) {
      console.error("[Call Detail] Error fetching conversation:", error)
      return notFound("Call not found")
    }

    return apiResponse(conversation)
  } catch (error) {
    console.error("[Call Detail] Error:", error)
    return serverError()
  }
}


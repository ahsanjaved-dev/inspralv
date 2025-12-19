import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import {
  apiResponse,
  apiError,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} from "@/lib/api/helpers"
import { updateWorkspaceAgentSchema } from "@/types/api.types"
import { safeVapiSync, shouldSyncToVapi } from "@/lib/integrations/vapi/agent/sync"
import { safeRetellSync, shouldSyncToRetell } from "@/lib/integrations/retell/agent/sync"
import type { AIAgent } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const { data: agent, error } = await ctx.adminClient
      .from("ai_agents")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (error || !agent) {
      return notFound("Agent")
    }

    return apiResponse(agent)
  } catch (error) {
    console.error("GET /api/w/[slug]/agents/[id] error:", error)
    return serverError()
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to update agents")
    }

    const body = await request.json()
    const validation = updateWorkspaceAgentSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0].message)
    }

    // Check agent exists and belongs to workspace
    const { data: existing } = await ctx.adminClient
      .from("ai_agents")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (!existing) {
      return notFound("Agent")
    }

    // Update agent
    const { data: agent, error } = await ctx.adminClient
      .from("ai_agents")
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Update agent error:", error)
      return apiError("Failed to update agent")
    }

    // Sync with external provider
    let syncedAgent = agent as AIAgent
    const typedAgent = agent as AIAgent

    if (typedAgent.provider === "vapi" && shouldSyncToVapi(typedAgent)) {
      const syncResult = await safeVapiSync(typedAgent, "update")
      if (syncResult.success && syncResult.agent) {
        syncedAgent = syncResult.agent
      }
    } else if (typedAgent.provider === "retell" && shouldSyncToRetell(typedAgent)) {
      const syncResult = await safeRetellSync(typedAgent, "update")
      if (syncResult.success && syncResult.agent) {
        syncedAgent = syncResult.agent
      }
    }

    return apiResponse(syncedAgent)
  } catch (error) {
    console.error("PATCH /api/w/[slug]/agents/[id] error:", error)
    return serverError()
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("No permission to delete agents")
    }

    // Check agent exists
    const { data: existing } = await ctx.adminClient
      .from("ai_agents")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (!existing) {
      return notFound("Agent")
    }

    // Delete from external provider first
    const typedExisting = existing as AIAgent
    if (
      typedExisting.provider === "vapi" &&
      typedExisting.external_agent_id &&
      shouldSyncToVapi(typedExisting)
    ) {
      await safeVapiSync(typedExisting, "delete")
    } else if (
      typedExisting.provider === "retell" &&
      typedExisting.external_agent_id &&
      shouldSyncToRetell(typedExisting)
    ) {
      await safeRetellSync(typedExisting, "delete")
    }

    // Soft delete
    const { error } = await ctx.adminClient
      .from("ai_agents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)

    if (error) {
      console.error("Delete agent error:", error)
      return apiError("Failed to delete agent")
    }

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/agents/[id] error:", error)
    return serverError()
  }
}

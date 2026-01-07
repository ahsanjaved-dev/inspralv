import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
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

// Helper to get assigned_key_id from config
function getAssignedKeyId(config: any): string | null {
  if (!config?.api_key_config) return null
  
  // New flow: check assigned_key_id directly
  if (config.api_key_config.assigned_key_id) {
    return config.api_key_config.assigned_key_id
  }
  
  // Legacy flow: check secret_key type
  const secretKey = config.api_key_config.secret_key
  if (!secretKey || secretKey.type === "none") return null
  if (secretKey.type === "default") return "default"
  if (secretKey.type === "additional" && secretKey.additional_key_id) {
    return secretKey.additional_key_id
  }
  
  return null
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

    // Fetch linked knowledge documents
    const { data: knowledgeLinks } = await ctx.adminClient
      .from("agent_knowledge_documents")
      .select(`
        knowledge_document_id,
        knowledge_documents:knowledge_document_id (
          id,
          title,
          description,
          document_type,
          status,
          category
        )
      `)
      .eq("agent_id", id)

    const knowledgeDocuments = knowledgeLinks
      ?.map((link: { knowledge_documents: unknown }) => link.knowledge_documents)
      .filter(Boolean) || []

    return apiResponse({
      ...agent,
      knowledge_documents: knowledgeDocuments,
    })
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

    // Check paywall - block agent updates if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    const body = await request.json()
    const validation = updateWorkspaceAgentSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error?.issues?.[0]?.message || "Invalid request data")
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

    const existingAgent = existing as AIAgent
    
    // Detect API key changes
    const oldKeyId = getAssignedKeyId(existingAgent.config)
    const newConfig = validation.data.config
    const newKeyId = newConfig ? getAssignedKeyId(newConfig) : oldKeyId
    
    const isKeyBeingAssigned = !oldKeyId && newKeyId
    const isKeyBeingChanged = oldKeyId && newKeyId && oldKeyId !== newKeyId
    const isKeyBeingRemoved = oldKeyId && !newKeyId
    
    let warningMessage: string | null = null
    
    // Warn if changing API keys
    if (isKeyBeingChanged) {
      warningMessage = "Warning: Changing API keys may affect call logs. Ensure the new key is from the same provider account to preserve call history."
    }

    // Handle knowledge document updates if provided
    const knowledgeDocumentIds = validation.data.knowledge_document_ids
    let knowledgeBaseContent = ""
    
    if (knowledgeDocumentIds !== undefined) {
      // Delete existing links
      await ctx.adminClient
        .from("agent_knowledge_documents")
        .delete()
        .eq("agent_id", id)
      
      // Insert new links
      if (knowledgeDocumentIds.length > 0) {
        const knowledgeLinks = knowledgeDocumentIds.map((docId: string) => ({
          agent_id: id,
          knowledge_document_id: docId,
        }))

        await ctx.adminClient
          .from("agent_knowledge_documents")
          .insert(knowledgeLinks)

        // Fetch the documents and prepare content
        const { data: knowledgeDocs } = await ctx.adminClient
          .from("knowledge_documents")
          .select("id, title, content, document_type")
          .in("id", knowledgeDocumentIds)
          .eq("workspace_id", ctx.workspace.id)
          .eq("status", "active")
          .is("deleted_at", null)

        if (knowledgeDocs && knowledgeDocs.length > 0) {
          knowledgeBaseContent = "\n\n--- KNOWLEDGE BASE ---\n" +
            knowledgeDocs
              .map((doc: { title: string; content: string | null }) => `## ${doc.title}\n${doc.content || ""}`)
              .join("\n\n") +
            "\n--- END KNOWLEDGE BASE ---\n"
        }
      }
    }

    // Prepare update data - remove knowledge_document_ids as it's not a column
    const { knowledge_document_ids: _, ...restData } = validation.data
    const updateData: Record<string, unknown> = {
      ...restData,
      updated_at: new Date().toISOString(),
    }

    // If knowledge base content was updated, update system prompt
    if (knowledgeDocumentIds !== undefined && validation.data.config) {
      const baseSystemPrompt = (validation.data.config.system_prompt || "")
        .replace(/\n\n--- KNOWLEDGE BASE ---[\s\S]*--- END KNOWLEDGE BASE ---\n/g, "")
      
      updateData.config = {
        ...validation.data.config,
        system_prompt: baseSystemPrompt + knowledgeBaseContent,
      }
    }

    // If key is being assigned or changed, mark for sync
    if (isKeyBeingAssigned || isKeyBeingChanged) {
      updateData.sync_status = "pending"
      updateData.needs_resync = true
    }
    
    // If key is being removed, mark as not synced
    if (isKeyBeingRemoved) {
      updateData.sync_status = "not_synced"
      updateData.needs_resync = false
    }

    // Update agent
    const { data: agent, error } = await ctx.adminClient
      .from("ai_agents")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Update agent error:", error)
      return apiError("Failed to update agent")
    }

    // Sync with external provider if API key was assigned or changed
    let syncedAgent = agent as AIAgent
    const typedAgent = agent as AIAgent
    
    const shouldSync = isKeyBeingAssigned || isKeyBeingChanged

    if (shouldSync) {
      console.log(`[AgentUpdate] API key ${isKeyBeingAssigned ? 'assigned' : 'changed'}, triggering sync...`)
      
      // Determine sync operation
      const operation = existingAgent.external_agent_id ? "update" : "create"
      
      if (typedAgent.provider === "vapi" && shouldSyncToVapi(typedAgent)) {
        const syncResult = await safeVapiSync(typedAgent, operation)
        if (syncResult.success && syncResult.agent) {
          syncedAgent = syncResult.agent
        } else if (!syncResult.success) {
          // Update sync status to error
          await ctx.adminClient
            .from("ai_agents")
            .update({ 
              sync_status: "error", 
              last_sync_error: syncResult.error,
              needs_resync: true,
            })
            .eq("id", id)
        }
      } else if (typedAgent.provider === "retell" && shouldSyncToRetell(typedAgent)) {
        const syncResult = await safeRetellSync(typedAgent, operation)
        if (syncResult.success && syncResult.agent) {
          syncedAgent = syncResult.agent
        } else if (!syncResult.success) {
          // Update sync status to error
          await ctx.adminClient
            .from("ai_agents")
            .update({ 
              sync_status: "error", 
              last_sync_error: syncResult.error,
              needs_resync: true,
            })
            .eq("id", id)
        }
      }
    } else if (existingAgent.external_agent_id && !isKeyBeingRemoved) {
      // Agent was already synced and key wasn't changed - just update if configured
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
    }

    // Return response with warning if applicable
    const responseData: any = syncedAgent
    if (warningMessage) {
      return apiResponse({ 
        ...responseData, 
        _warning: warningMessage 
      })
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

    // Check paywall - block agent deletion if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

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

    // Delete from external provider first (only if synced)
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
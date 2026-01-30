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
import { bindPhoneNumberToVapiAssistant, unbindPhoneNumberFromVapiAssistant } from "@/lib/integrations/vapi/agent/response"
import type { AIAgent } from "@/types/database.types"
import { prisma } from "@/lib/prisma"
import { setupAgentCalendar } from "@/lib/integrations/calendar"

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
    
    // NEW ORG-LEVEL FLOW: Check if workspace has an assigned integration
    // Use Prisma if available, otherwise fallback to Supabase admin client
    let hasAssignedIntegration = false
    
    if (prisma) {
      // Prisma path (preferred)
      const assignment = await prisma.workspaceIntegrationAssignment.findFirst({
        where: {
          workspaceId: ctx.workspace.id,
          provider: existingAgent.provider,
        },
        include: {
          partnerIntegration: {
            select: {
              isActive: true,
              apiKeys: true,
            },
          },
        },
      })
      
      if (assignment?.partnerIntegration?.isActive) {
        const apiKeys = assignment.partnerIntegration.apiKeys as any
        hasAssignedIntegration = !!apiKeys?.default_secret_key
      }
      console.log(`[AgentUpdate] Prisma check - hasAssignedIntegration: ${hasAssignedIntegration}`)
    } else {
      // Supabase fallback - critical for production when DATABASE_URL may not be set
      console.log(`[AgentUpdate] Prisma not available, using Supabase fallback`)
      const { data: assignment, error: assignmentError } = await ctx.adminClient
        .from("workspace_integration_assignments")
        .select(`
          partner_integration:partner_integrations (
            id,
            api_keys,
            is_active
          )
        `)
        .eq("workspace_id", ctx.workspace.id)
        .eq("provider", existingAgent.provider)
        .single()
      
      if (assignmentError && assignmentError.code !== "PGRST116") {
        console.error("[AgentUpdate] Error fetching integration assignment:", assignmentError)
      }
      
      if (assignment?.partner_integration) {
        const partnerIntegration = assignment.partner_integration as any
        if (partnerIntegration.is_active) {
          const apiKeys = partnerIntegration.api_keys as any
          hasAssignedIntegration = !!apiKeys?.default_secret_key
        }
      }
      console.log(`[AgentUpdate] Supabase check - hasAssignedIntegration: ${hasAssignedIntegration}`)
    }
    
    // Legacy: Detect API key changes from old config-based flow
    const oldKeyId = getAssignedKeyId(existingAgent.config)
    const newConfig = validation.data.config
    const newKeyId = newConfig ? getAssignedKeyId(newConfig) : oldKeyId
    
    const isKeyBeingAssigned = !oldKeyId && newKeyId
    const isKeyBeingChanged = oldKeyId && newKeyId && oldKeyId !== newKeyId
    const isKeyBeingRemoved = oldKeyId && !newKeyId
    
    let warningMessage: string | null = null
    
    // Warn if changing API keys (legacy flow)
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
    } else if (validation.data.config && updateData.config === undefined) {
      // Ensure config is always included if provided in the request
      updateData.config = validation.data.config
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

    // Sync with external provider 
    // NEW ORG-LEVEL FLOW: Sync if workspace has assigned integration
    let syncedAgent = agent as AIAgent
    const typedAgent = agent as AIAgent
    
    // Determine if we should sync:
    // 1. Legacy: API key being assigned/changed via config
    // 2. New: Workspace has org-level assigned integration AND agent not synced OR needs update
    const shouldSyncLegacy = isKeyBeingAssigned || isKeyBeingChanged
    const needsFirstSync = !existingAgent.external_agent_id && hasAssignedIntegration
    const shouldUpdateSync = existingAgent.external_agent_id && hasAssignedIntegration && !isKeyBeingRemoved
    
    const shouldSync = shouldSyncLegacy || needsFirstSync || shouldUpdateSync

    if (shouldSync) {
      // Determine sync operation
      const operation = existingAgent.external_agent_id ? "update" : "create"
      
      console.log(`[AgentUpdate] Triggering ${operation} sync, hasAssignedIntegration: ${hasAssignedIntegration}, existingExtId: ${!!existingAgent.external_agent_id}`)
      
      if (typedAgent.provider === "vapi" && shouldSyncToVapi(typedAgent)) {
        const syncResult = await safeVapiSync(typedAgent, operation)
        if (syncResult.success && syncResult.agent) {
          syncedAgent = syncResult.agent
        } else if (!syncResult.success) {
          console.error("[AgentUpdate] VAPI sync failed:", syncResult.error)
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
          console.error("[AgentUpdate] Retell sync failed:", syncResult.error)
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
    }

    // =========================================================================
    // PHONE NUMBER BINDING FOR INBOUND CALLS
    // Handle phone number assignment changes for VAPI agents
    // =========================================================================
    const oldPhoneNumberId = existingAgent.assigned_phone_number_id
    const newPhoneNumberId = validation.data.assigned_phone_number_id
    const phoneNumberChanged = oldPhoneNumberId !== newPhoneNumberId
    
    if (
      phoneNumberChanged &&
      syncedAgent.provider === "vapi" &&
      syncedAgent.external_agent_id
    ) {
      console.log(`[AgentUpdate] Phone number assignment changed: ${oldPhoneNumberId} -> ${newPhoneNumberId}`)
      
      // Unbind old phone number if there was one
      if (oldPhoneNumberId) {
        console.log(`[AgentUpdate] Unbinding old phone number: ${oldPhoneNumberId}`)
        const unbindResult = await unbindPhoneNumberFromVapiAssistant({
          phoneNumberId: oldPhoneNumberId,
          workspaceId: ctx.workspace.id,
        })
        if (!unbindResult.success) {
          console.error(`[AgentUpdate] Failed to unbind old phone number: ${unbindResult.error}`)
        }
      }
      
      // Bind new phone number if there is one
      if (newPhoneNumberId) {
        console.log(`[AgentUpdate] Binding new phone number: ${newPhoneNumberId}`)
        const bindResult = await bindPhoneNumberToVapiAssistant({
          agentId: syncedAgent.id,
          phoneNumberId: newPhoneNumberId,
          externalAgentId: syncedAgent.external_agent_id,
          workspaceId: ctx.workspace.id,
        })
        if (!bindResult.success) {
          console.error(`[AgentUpdate] Failed to bind new phone number: ${bindResult.error}`)
        }
      }
    }

    // =========================================================================
    // CALENDAR AUTO-SETUP
    // Auto-setup calendar if agent has calendar tools and calendar_settings
    // =========================================================================
    const newConfigData = validation.data.config
    const tools = (newConfigData?.tools || []) as Array<{ name: string }>
    const calendarToolNames = ["book_appointment", "cancel_appointment", "reschedule_appointment"]
    const hasCalendarTools = tools.some(t => calendarToolNames.includes(t.name))
    const calendarSettings = (newConfigData as any)?.calendar_settings

    // Only setup calendar if:
    // 1. Agent has calendar tools
    // 2. Calendar settings with timezone are provided
    if (hasCalendarTools && calendarSettings?.timezone) {
      console.log(`[AgentUpdate] Agent has calendar tools, auto-setting up calendar...`)
      try {
        const partnerId = ctx.workspace.partner_id
        
        if (partnerId) {
          const setupResult = await setupAgentCalendar({
            agentId: id,
            agentName: syncedAgent.name,
            workspaceId: ctx.workspace.id,
            partnerId,
            timezone: calendarSettings.timezone,
            slot_duration_minutes: calendarSettings.slot_duration_minutes || 30,
            buffer_between_slots_minutes: calendarSettings.buffer_between_slots_minutes || 0,
            preferred_days: calendarSettings.preferred_days || ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
            preferred_hours_start: calendarSettings.preferred_hours_start || '09:00',
            preferred_hours_end: calendarSettings.preferred_hours_end || '17:00',
            min_notice_hours: calendarSettings.min_notice_hours || 1,
            max_advance_days: calendarSettings.max_advance_days || 60,
          })

          if (setupResult.success) {
            console.log(`[AgentUpdate] Calendar setup successful:`, setupResult.data?.calendar_id)
          } else {
            console.warn(`[AgentUpdate] Calendar setup failed (non-blocking):`, setupResult.error)
          }
        } else {
          console.warn(`[AgentUpdate] Cannot setup calendar - no partner_id for workspace`)
        }
      } catch (calendarError) {
        console.warn(`[AgentUpdate] Calendar setup error (non-blocking):`, calendarError)
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
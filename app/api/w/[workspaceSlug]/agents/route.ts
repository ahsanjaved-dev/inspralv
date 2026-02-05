import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
import { createWorkspaceAgentSchema } from "@/types/api.types"
import { createAuditLog, getRequestMetadata } from "@/lib/audit"
import type { AgentProvider, AIAgent } from "@/types/database.types"
import { safeVapiSync } from "@/lib/integrations/vapi/agent/sync"
import { safeRetellSync } from "@/lib/integrations/retell/agent/sync"
import { prisma } from "@/lib/prisma"
import { setupAgentCalendar } from "@/lib/integrations/calendar"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "10")
    const provider = searchParams.get("provider")
    const isActive = searchParams.get("isActive")

    let query = ctx.adminClient
      .from("ai_agents")
      .select("*", { count: "exact" })
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (provider) {
      query = query.eq("provider", provider as AgentProvider)
    }
    if (isActive !== null && isActive !== undefined) {
      query = query.eq("is_active", isActive === "true")
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: agents, error, count } = await query

    if (error) {
      console.error("List agents error:", error)
      return apiError("Failed to fetch agents")
    }

    return apiResponse({
      data: agents,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/agents error:", error)
    return serverError()
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    console.log(`[AgentCreate] Creating agent for workspace: ${workspaceSlug}`)
    
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      console.error(`[AgentCreate] No context found for workspace: ${workspaceSlug}`)
      return forbidden("No permission to create agents in this workspace")
    }

    console.log(`[AgentCreate] Context found - workspace: ${ctx.workspace.id}, user: ${ctx.user.id}`)

    // Check paywall - block agent creation if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) {
      console.error(`[AgentCreate] Paywall error for workspace: ${workspaceSlug}`)
      return paywallError
    }

    const body = await request.json()
    const validation = createWorkspaceAgentSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    // Check agent limits for workspace
    const { count } = await ctx.adminClient
      .from("ai_agents")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)

    const resourceLimits = ctx.workspace.resource_limits as { max_agents?: number } | null
    const maxAgents = resourceLimits?.max_agents || 10
    console.log(`[AgentCreate] Agent count: ${count}, max: ${maxAgents}`)
    if (count && count >= maxAgents) {
      console.error(`[AgentCreate] Agent limit reached: ${count}/${maxAgents}`)
      return apiError(`Agent limit reached for this workspace. Maximum: ${maxAgents} agents.`, 403)
    }

    // Get knowledge document IDs from the request
    const knowledgeDocumentIds = validation.data.knowledge_document_ids || []

    // If knowledge base is enabled, fetch the documents and prepare content
    let knowledgeBaseContent = ""
    if (knowledgeDocumentIds.length > 0) {
      const { data: knowledgeDocs } = await ctx.adminClient
        .from("knowledge_documents")
        .select("id, title, content, document_type")
        .in("id", knowledgeDocumentIds)
        .eq("workspace_id", ctx.workspace.id)
        .eq("status", "active")
        .is("deleted_at", null)

      if (knowledgeDocs && knowledgeDocs.length > 0) {
        // Build knowledge base content to inject into system prompt
        knowledgeBaseContent = "\n\n--- KNOWLEDGE BASE ---\n" +
          knowledgeDocs
            .map((doc) => `## ${doc.title}\n${doc.content || ""}`)
            .join("\n\n") +
          "\n--- END KNOWLEDGE BASE ---\n"
      }
    }

    // NEW ORG-LEVEL FLOW: Check if workspace has an assigned integration for this provider
    const inputConfig = validation.data.config || {}
    
    // If knowledge base content exists, append it to the system prompt
    const systemPromptWithKnowledge = knowledgeBaseContent
      ? (inputConfig.system_prompt || "") + knowledgeBaseContent
      : inputConfig.system_prompt

    // Check if workspace has an assigned integration for the provider
    // Use Prisma if available, otherwise fallback to Supabase admin client
    let hasAssignedIntegration = false
    
    if (prisma) {
      // Prisma path (preferred)
      const assignment = await prisma.workspaceIntegrationAssignment.findFirst({
        where: {
          workspaceId: ctx.workspace.id,
          provider: validation.data.provider,
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
      console.log(`[AgentCreate] Prisma check - hasAssignedIntegration: ${hasAssignedIntegration}`)
    } else {
      // Supabase fallback - critical for production when DATABASE_URL may not be set
      console.log(`[AgentCreate] Prisma not available, using Supabase fallback`)
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
        .eq("provider", validation.data.provider)
        .single()
      
      if (assignmentError && assignmentError.code !== "PGRST116") {
        console.error("[AgentCreate] Error fetching integration assignment:", assignmentError)
      }
      
      if (assignment?.partner_integration) {
        const partnerIntegration = assignment.partner_integration as any
        if (partnerIntegration.is_active) {
          const apiKeys = partnerIntegration.api_keys as any
          hasAssignedIntegration = !!apiKeys?.default_secret_key
        }
      }
      console.log(`[AgentCreate] Supabase check - hasAssignedIntegration: ${hasAssignedIntegration}`)
    }

    const agentConfig = {
      ...inputConfig,
      system_prompt: systemPromptWithKnowledge,
    }

    console.log(`[AgentCreate] Creating agent with provider: ${validation.data.provider}, hasAssignedIntegration: ${hasAssignedIntegration}`)
    if (knowledgeDocumentIds.length > 0) {
      console.log(`[AgentCreate] Linking ${knowledgeDocumentIds.length} knowledge documents`)
    }
    
    // DEBUG: Log incoming tools
    const incomingTools = inputConfig.tools || []
    console.log(`[AgentCreate] DEBUG - Incoming tools count: ${incomingTools.length}`)
    if (incomingTools.length > 0) {
      console.log(`[AgentCreate] DEBUG - Incoming tools:`, JSON.stringify(incomingTools.map((t: any) => ({
        name: t.name,
        parameters: t.parameters,
        hasProperties: !!t.parameters?.properties,
        propertyCount: t.parameters?.properties ? Object.keys(t.parameters.properties).length : 0,
      })), null, 2))
    }

    // Create agent with pending sync status if integration is assigned
    const { data: agent, error } = await ctx.adminClient
      .from("ai_agents")
      .insert({
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id,
        name: validation.data.name,
        description: validation.data.description,
        provider: validation.data.provider,
        voice_provider: validation.data.voice_provider,
        model_provider: validation.data.model_provider,
        transcriber_provider: validation.data.transcriber_provider,
        config: agentConfig,
        agent_secret_api_key: [],
        agent_public_api_key: [],
        is_active: validation.data.is_active ?? true,
        // Agent direction and telephony
        agent_direction: validation.data.agent_direction || "inbound",
        allow_outbound: validation.data.allow_outbound || false,
        assigned_phone_number_id: validation.data.assigned_phone_number_id || null,
        // Set sync status based on whether workspace has assigned integration
        sync_status: hasAssignedIntegration ? "pending" : "not_synced",
        needs_resync: false,
      })
      .select()
      .single()

    if (error) {
      console.error("Create agent error:", error)
      return apiError("Failed to create agent")
    }

    // Link knowledge documents to the agent
    if (knowledgeDocumentIds.length > 0) {
      const knowledgeLinks = knowledgeDocumentIds.map((docId) => ({
        agent_id: agent.id,
        knowledge_document_id: docId,
      }))

      const { error: linkError } = await ctx.adminClient
        .from("agent_knowledge_documents")
        .insert(knowledgeLinks)

      if (linkError) {
        console.error("Failed to link knowledge documents:", linkError)
        // Don't fail the whole operation, just log the error
      }
    }

    // NEW ORG-LEVEL FLOW: Auto-sync if workspace has an assigned integration
    let syncedAgent = agent
    if (hasAssignedIntegration) {
      console.log(`[AgentCreate] Auto-syncing agent with assigned ${validation.data.provider} integration`)
      
      if (validation.data.provider === "vapi") {
        const syncResult = await safeVapiSync(agent as AIAgent, "create")
        if (syncResult.success && syncResult.agent) {
          syncedAgent = syncResult.agent as any
        } else if (!syncResult.success) {
          console.error("[AgentCreate] VAPI sync failed:", syncResult.error)
          // Update sync status to error (use last_sync_error - correct column name)
          await ctx.adminClient
            .from("ai_agents")
            .update({ sync_status: "error", last_sync_error: syncResult.error })
            .eq("id", agent.id)
          // Update local copy for response
          syncedAgent = { ...agent, sync_status: "error", last_sync_error: syncResult.error } as any
        } else {
          // Sync returned success but no agent - shouldn't happen, log warning
          console.warn("[AgentCreate] VAPI sync returned success but no agent data")
        }
      } else if (validation.data.provider === "retell") {
        const syncResult = await safeRetellSync(agent as AIAgent, "create")
        if (syncResult.success && syncResult.agent) {
          syncedAgent = syncResult.agent as any
        } else if (!syncResult.success) {
          console.error("[AgentCreate] Retell sync failed:", syncResult.error)
          // Update sync status to error (use last_sync_error - correct column name)
          await ctx.adminClient
            .from("ai_agents")
            .update({ sync_status: "error", last_sync_error: syncResult.error })
            .eq("id", agent.id)
          // Update local copy for response
          syncedAgent = { ...agent, sync_status: "error", last_sync_error: syncResult.error } as any
        } else {
          // Sync returned success but no agent - shouldn't happen, log warning
          console.warn("[AgentCreate] Retell sync returned success but no agent data")
        }
      }
    }

    // Auto-setup calendar if agent has calendar tools and calendar_settings
    const tools = inputConfig.tools || []
    const calendarToolNames = ["book_appointment", "cancel_appointment", "reschedule_appointment"]
    const hasCalendarTools = tools.some((t: any) => calendarToolNames.includes(t.name))
    const calendarSettings = inputConfig.calendar_settings

    console.log(`[AgentCreate] Calendar check - hasCalendarTools: ${hasCalendarTools}, calendarSettings:`, JSON.stringify(calendarSettings))

    if (hasCalendarTools && calendarSettings?.timezone) {
      console.log(`[AgentCreate] Agent has calendar tools, auto-setting up calendar...`)
      try {
        // Get partner ID from the workspace context
        const partnerId = ctx.workspace.partner_id
        
        if (partnerId) {
          const setupResult = await setupAgentCalendar({
            agentId: agent.id,
            agentName: agent.name,
            workspaceId: ctx.workspace.id,
            workspaceName: ctx.workspace.name, // Required for calendar naming
            partnerId,
            timezone: calendarSettings.timezone,
            slot_duration_minutes: calendarSettings.slot_duration_minutes || 30,
            buffer_between_slots_minutes: calendarSettings.buffer_between_slots_minutes || 0,
            preferred_days: calendarSettings.preferred_days || ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
            preferred_hours_start: calendarSettings.preferred_hours_start || '09:00',
            preferred_hours_end: calendarSettings.preferred_hours_end || '17:00',
            min_notice_hours: calendarSettings.min_notice_hours || 1,
            max_advance_days: calendarSettings.max_advance_days || 60,
            // Email notification settings
            enable_owner_email: calendarSettings.enable_owner_email || false,
            owner_email: calendarSettings.owner_email || undefined,
            // Support for using existing calendar
            existingCalendarId: calendarSettings.calendar_source === 'existing' ? calendarSettings.existing_calendar_id : undefined,
            existingCalendarName: calendarSettings.calendar_source === 'existing' ? calendarSettings.existing_calendar_name : undefined,
          })

          if (setupResult.success) {
            console.log(`[AgentCreate] Calendar setup successful:`, setupResult.data?.calendar_id)
          } else {
            console.warn(`[AgentCreate] Calendar setup failed (non-blocking):`, setupResult.error)
          }
        } else {
          console.warn(`[AgentCreate] Cannot setup calendar - no partner_id for workspace`)
        }
      } catch (calendarError) {
        console.warn(`[AgentCreate] Calendar setup error (non-blocking):`, calendarError)
        // Don't fail agent creation if calendar setup fails
      }
    }

    // Audit log
    const { ipAddress, userAgent } = getRequestMetadata(request)
    await createAuditLog({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "agent.created",
      entityType: "ai_agent",
      entityId: agent.id,
      newValues: {
        name: syncedAgent.name,
        provider: syncedAgent.provider,
        workspace_id: ctx.workspace.id,
        sync_status: syncedAgent.sync_status,
        external_agent_id: syncedAgent.external_agent_id,
        knowledge_document_count: knowledgeDocumentIds.length,
        has_calendar_tools: hasCalendarTools,
      },
      ipAddress,
      userAgent,
    })

    return apiResponse(syncedAgent, 201)
  } catch (error) {
    console.error("POST /api/w/[slug]/agents error:", error)
    return serverError()
  }
}
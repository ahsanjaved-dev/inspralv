import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
import { createWorkspaceAgentSchema } from "@/types/api.types"
import { createAuditLog, getRequestMetadata } from "@/lib/audit"
import type { AgentProvider, AIAgent } from "@/types/database.types"
import { safeVapiSync } from "@/lib/integrations/vapi/agent/sync"
import { safeRetellSync } from "@/lib/integrations/retell/agent/sync"
import { prisma } from "@/lib/prisma"

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
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to create agents in this workspace")
    }

    // Check paywall - block agent creation if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

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
    if (count && count >= maxAgents) {
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
    let hasAssignedIntegration = false
    if (prisma) {
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
    }

    const agentConfig = {
      ...inputConfig,
      system_prompt: systemPromptWithKnowledge,
    }

    console.log(`[AgentCreate] Creating agent with provider: ${validation.data.provider}, hasAssignedIntegration: ${hasAssignedIntegration}`)
    if (knowledgeDocumentIds.length > 0) {
      console.log(`[AgentCreate] Linking ${knowledgeDocumentIds.length} knowledge documents`)
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
          // Update sync status to error
          await ctx.adminClient
            .from("ai_agents")
            .update({ sync_status: "error", sync_error: syncResult.error })
            .eq("id", agent.id)
        }
      } else if (validation.data.provider === "retell") {
        const syncResult = await safeRetellSync(agent as AIAgent, "create")
        if (syncResult.success && syncResult.agent) {
          syncedAgent = syncResult.agent as any
        } else if (!syncResult.success) {
          console.error("[AgentCreate] Retell sync failed:", syncResult.error)
          // Update sync status to error
          await ctx.adminClient
            .from("ai_agents")
            .update({ sync_status: "error", sync_error: syncResult.error })
            .eq("id", agent.id)
        }
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
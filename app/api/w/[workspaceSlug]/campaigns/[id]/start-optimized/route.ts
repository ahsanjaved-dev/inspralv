import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound } from "@/lib/api/helpers"
import {
  initializeCampaignQueue,
  processQueueChunk,
  getCampaignQueueEntry,
  type OptimizedBatchConfig,
} from "@/lib/campaigns/queue-processor"
import type { BusinessHoursConfig } from "@/types/database.types"

// ============================================================================
// CONSTANTS
// ============================================================================

// Recipients threshold - use optimized queue for large campaigns
const LARGE_CAMPAIGN_THRESHOLD = 20

// Default chunk size for processing
const DEFAULT_CHUNK_SIZE = 50

// Default concurrent calls within a chunk
const DEFAULT_CONCURRENCY = 5

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// ============================================================================
// HELPERS
// ============================================================================

async function getCLIForAgent(
  agent: any,
  workspaceId: string,
  adminClient: ReturnType<typeof getSupabaseAdmin>
): Promise<string | null> {
  // 1. Check agent's direct external phone number
  if (agent.external_phone_number) {
    return agent.external_phone_number
  }

  // 2. Check agent's assigned phone number from our DB
  if (agent.assigned_phone_number_id) {
    const { data: phoneNumber } = await adminClient
      .from("phone_numbers")
      .select("phone_number, phone_number_e164")
      .eq("id", agent.assigned_phone_number_id)
      .single()

    if (phoneNumber) {
      return phoneNumber.phone_number_e164 || phoneNumber.phone_number
    }
  }

  // 3. Check for shared outbound phone number from integration config
  // Determine agent provider (default to vapi if not specified)
  const agentProvider = agent.provider || "vapi"
  
  // First try workspace assignment
  const { data: assignment } = await adminClient
    .from("workspace_integration_assignments")
    .select(`
      partner_integration:partner_integrations (config, is_active)
    `)
    .eq("workspace_id", workspaceId)
    .eq("provider", agentProvider)
    .single()

  if (assignment?.partner_integration) {
    const partnerIntegration = assignment.partner_integration as any
    if (partnerIntegration.is_active) {
      const config = partnerIntegration.config
      if (config?.shared_outbound_phone_number) {
        console.log(`[Campaign] Using shared outbound from ${agentProvider}:`, config.shared_outbound_phone_number)
        return config.shared_outbound_phone_number
      }
    }
  }

  // Fallback: Try to get from default partner integration
  const { data: workspace } = await adminClient
    .from("workspaces")
    .select("partner_id")
    .eq("id", workspaceId)
    .single()

  if (workspace?.partner_id) {
    const { data: defaultIntegration } = await adminClient
      .from("partner_integrations")
      .select("config, is_active")
      .eq("partner_id", workspace.partner_id)
      .eq("provider", agentProvider)
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (defaultIntegration?.is_active) {
      const config = defaultIntegration.config as any
      if (config?.shared_outbound_phone_number) {
        console.log(`[Campaign] Using shared outbound from default ${agentProvider}:`, config.shared_outbound_phone_number)
        return config.shared_outbound_phone_number
      }
    }
  }

  return null
}

async function getVapiConfig(
  agent: any,
  workspaceId: string,
  adminClient: ReturnType<typeof getSupabaseAdmin>
): Promise<{ apiKey: string; phoneNumberId: string } | null> {
  try {
    const { data: workspace } = await adminClient
      .from("workspaces")
      .select("partner_id")
      .eq("id", workspaceId)
      .single()

    if (!workspace?.partner_id) return null

    const { data: assignment } = await adminClient
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id, api_keys, config, is_active
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("provider", "vapi")
      .single()

    if (assignment?.partner_integration) {
      const partnerIntegration = assignment.partner_integration as any
      if (partnerIntegration.is_active) {
        const apiKeys = partnerIntegration.api_keys
        const vapiConfig = partnerIntegration.config || {}
        
        if (apiKeys?.default_secret_key) {
          let phoneNumberId: string | null = null
          
          if (vapiConfig.shared_outbound_phone_number_id) {
            phoneNumberId = vapiConfig.shared_outbound_phone_number_id
          } else if (agent.assigned_phone_number_id) {
            const { data: phoneNumber } = await adminClient
              .from("phone_numbers")
              .select("external_id")
              .eq("id", agent.assigned_phone_number_id)
              .single()
            
            if (phoneNumber?.external_id) {
              phoneNumberId = phoneNumber.external_id
            }
          }
          
          if (phoneNumberId) {
            return {
              apiKey: apiKeys.default_secret_key,
              phoneNumberId,
            }
          }
        }
      }
    }

    // Try default integration
    const { data: defaultIntegration } = await adminClient
      .from("partner_integrations")
      .select("id, api_keys, config, is_active")
      .eq("partner_id", workspace.partner_id)
      .eq("provider", "vapi")
      .eq("is_default", true)
      .eq("is_active", true)
      .single()

    if (defaultIntegration) {
      const apiKeys = defaultIntegration.api_keys as any
      const vapiConfig = defaultIntegration.config || {} as any
      
      if (apiKeys?.default_secret_key) {
        let phoneNumberId: string | null = null
        
        if (vapiConfig.shared_outbound_phone_number_id) {
          phoneNumberId = vapiConfig.shared_outbound_phone_number_id
        } else if (agent.assigned_phone_number_id) {
          const { data: phoneNumber } = await adminClient
            .from("phone_numbers")
            .select("external_id")
            .eq("id", agent.assigned_phone_number_id)
            .single()
          
          if (phoneNumber?.external_id) {
            phoneNumberId = phoneNumber.external_id
          }
        }
        
        if (phoneNumberId) {
          return {
            apiKey: apiKeys.default_secret_key,
            phoneNumberId,
          }
        }
      }
    }

    return null
  } catch (error) {
    console.error("[CampaignStartOptimized] Error getting VAPI config:", error)
    return null
  }
}

/**
 * POST /api/w/[workspaceSlug]/campaigns/[id]/start-optimized
 * 
 * Start a campaign using the optimized queue-based processor.
 * This endpoint is designed for large campaigns with many recipients.
 * 
 * Features:
 * - Chunked processing (default: 50 recipients per chunk)
 * - Concurrent calls within chunks (default: 5 concurrent)
 * - Progress tracking
 * - Resume capability
 * - Rate limiting protection
 * 
 * Request body (optional):
 * {
 *   chunkSize?: number,     // Recipients per chunk (default: 50)
 *   concurrency?: number,   // Concurrent calls per chunk (default: 5)
 *   processFirstChunk?: boolean  // Process first chunk immediately (default: true)
 * }
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

    // Parse request body for configuration options
    let options = { chunkSize: DEFAULT_CHUNK_SIZE, concurrency: DEFAULT_CONCURRENCY, processFirstChunk: true }
    try {
      const body = await request.json()
      options = { ...options, ...body }
    } catch {
      // Use defaults if no body
    }

    // Get campaign with agent
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select(`
        *,
        agent:ai_agents!agent_id(
          id, 
          name, 
          provider, 
          is_active, 
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

    // Validate campaign status
    if (campaign.status === "active") {
      return apiError("Campaign is already active")
    }

    if (campaign.status === "completed" || campaign.status === "cancelled") {
      return apiError("Cannot start a completed or cancelled campaign")
    }

    if (campaign.status !== "ready" && campaign.status !== "draft") {
      return apiError(`Cannot start campaign with status: ${campaign.status}`)
    }

    // Validate agent
    const agent = campaign.agent as any
    if (!agent || !agent.is_active) {
      return apiError("Campaign agent is not active")
    }

    if (!agent.external_agent_id) {
      return apiError("Agent has not been synced with the voice provider")
    }

    // Get VAPI configuration
    const vapiConfig = await getVapiConfig(agent, ctx.workspace.id, ctx.adminClient)
    if (!vapiConfig) {
      return apiError("VAPI configuration not found or incomplete")
    }

    // Get CLI
    const cli = await getCLIForAgent(agent, ctx.workspace.id, ctx.adminClient)
    if (!cli) {
      return apiError("No outbound phone number configured for the agent")
    }

    // Count pending recipients
    const { count: recipientCount, error: countError } = await ctx.adminClient
      .from("call_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("call_status", "pending")

    if (countError) {
      console.error("[CampaignStartOptimized] Error counting recipients:", countError)
      return serverError("Failed to count recipients")
    }

    const totalRecipients = recipientCount || 0
    
    if (totalRecipients === 0) {
      return apiError("No pending recipients to call. Add recipients first.")
    }

    console.log(`[CampaignStartOptimized] Starting campaign ${id} with ${totalRecipients} recipients`)
    console.log(`[CampaignStartOptimized] Config: chunkSize=${options.chunkSize}, concurrency=${options.concurrency}`)

    // Build optimized batch config
    const batchConfig: OptimizedBatchConfig = {
      campaignId: id,
      workspaceId: ctx.workspace.id,
      agentId: agent.id,
      externalAgentId: agent.external_agent_id,
      phoneNumberId: vapiConfig.phoneNumberId,
      vapiSecretKey: vapiConfig.apiKey,
      concurrencyLimit: options.concurrency,
      maxAttempts: campaign.max_attempts || 3,
      retryDelayMinutes: campaign.retry_delay_minutes || 30,
      businessHoursConfig: campaign.business_hours_config as BusinessHoursConfig | null,
      timezone: campaign.timezone || "Australia/Melbourne",
      chunkSize: options.chunkSize,
      delayBetweenChunksMs: 2000,
      delayBetweenCallsMs: 500,
      maxProcessingTimeMs: 45000, // 45 seconds for serverless safety
    }

    // Initialize queue entry
    const queueEntry = await initializeCampaignQueue(
      id,
      ctx.workspace.id,
      totalRecipients,
      batchConfig,
      options.chunkSize
    )

    if (!queueEntry) {
      return serverError("Failed to initialize campaign queue")
    }

    // Update campaign status to active
    const { error: updateError } = await ctx.adminClient
      .from("call_campaigns")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("[CampaignStartOptimized] Error updating campaign status:", updateError)
      return serverError("Failed to update campaign status")
    }

    // Process first chunk immediately if requested
    let firstChunkResult = null
    if (options.processFirstChunk) {
      console.log("[CampaignStartOptimized] Processing first chunk...")
      firstChunkResult = await processQueueChunk(id)
      
      if (!firstChunkResult.success && firstChunkResult.error !== "Outside business hours") {
        console.error("[CampaignStartOptimized] First chunk failed:", firstChunkResult.error)
      }
    }

    // Get updated queue state
    const updatedQueueEntry = await getCampaignQueueEntry(id)

    // Build response
    const response: any = {
      success: true,
      campaignId: id,
      message: `Campaign started with optimized queue processing`,
      queue: {
        id: queueEntry.id,
        status: updatedQueueEntry?.status || queueEntry.status,
        totalRecipients,
        processedCount: updatedQueueEntry?.processed_count || 0,
        chunksProcessed: updatedQueueEntry?.chunks_processed || 0,
        totalChunks: queueEntry.total_chunks,
      },
      optimization: {
        chunkSize: options.chunkSize,
        concurrency: options.concurrency,
        estimatedChunks: queueEntry.total_chunks,
        largeCapaign: totalRecipients > LARGE_CAMPAIGN_THRESHOLD,
      },
    }

    if (firstChunkResult) {
      response.firstChunk = {
        processed: firstChunkResult.chunkResult?.successful || 0 + (firstChunkResult.chunkResult?.failed || 0),
        successful: firstChunkResult.chunkResult?.successful || 0,
        failed: firstChunkResult.chunkResult?.failed || 0,
        hasMore: firstChunkResult.hasMore,
        pendingCount: firstChunkResult.pendingCount,
      }
      
      if (firstChunkResult.error) {
        response.firstChunk.note = firstChunkResult.error
      }
    }

    // Add instruction for continuing processing
    if (firstChunkResult?.hasMore) {
      response.continueProcessing = {
        endpoint: `/api/w/${workspaceSlug}/campaigns/${id}/process-chunk`,
        method: "POST",
        note: "Call this endpoint repeatedly until hasMore is false, or set up a cron job",
      }
    }

    return apiResponse(response)

  } catch (error) {
    console.error("[CampaignStartOptimized] Exception:", error)
    return serverError("Internal server error")
  }
}


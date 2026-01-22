/**
 * MCP Tools Fetch API
 * 
 * This endpoint is called by the MCP server to fetch tools for an agent
 * when the MCP server's cache is empty (e.g., after restart).
 * 
 * This ensures the MCP server can recover tools from the source of truth (Supabase)
 * without requiring a manual re-sync from the UI.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import type { FunctionTool } from "@/types/database.types"
import { getToolExecutionWebhookUrl } from "@/lib/integrations/mcp/client"

// Use admin client to bypass RLS - this endpoint is called by MCP server, not users
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables")
  }

  return createSupabaseClient(supabaseUrl, supabaseServiceKey)
}

const log = logger.child({ module: "MCPToolsFetch" })

// ============================================================================
// TYPES
// ============================================================================

interface AgentConfig {
  tools?: FunctionTool[]
  tools_server_url?: string
}

// ============================================================================
// AUTH
// ============================================================================

function validateApiKey(request: NextRequest): boolean {
  const apiKey = process.env.MCP_API_KEY
  
  // Skip auth if no API key configured
  if (!apiKey) {
    return true
  }

  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return false
  }

  const token = authHeader.slice(7)
  return token === apiKey
}

// ============================================================================
// HANDLER
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params
    
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    log.info(`Fetching tools for agent: ${agentId}`)

    // Fetch agent from database using admin client (bypasses RLS)
    const supabase = getSupabaseAdmin()
    const { data: agent, error } = await supabase
      .from("ai_agents")
      .select("id, workspace_id, config")
      .eq("id", agentId)
      .single()

    if (error || !agent) {
      log.error(`Agent not found: ${agentId}`, { error })
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      )
    }

    // Get workspace's partner_id
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("partner_id")
      .eq("id", agent.workspace_id)
      .single()

    const partnerId = workspace?.partner_id || "unknown"

    // Extract custom function tools
    const config = agent.config as AgentConfig
    const allTools = config?.tools || []
    
    const customTools = allTools.filter(
      (t: FunctionTool) => 
        t.enabled !== false && 
        (t.tool_type === "function" || t.tool_type === "custom_function")
    )

    // Convert to MCP format
    const webhookUrl = getToolExecutionWebhookUrl()
    const mcpTools = customTools.map((tool: FunctionTool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} },
      webhook_url: webhookUrl,
      timeout_ms: 30000, // Default timeout
      enabled: tool.enabled ?? true,
    }))

    log.info(`Found ${mcpTools.length} tools for agent ${agentId}`)

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      workspace_id: agent.workspace_id,
      partner_id: partnerId,
      tools: mcpTools,
    })

  } catch (error) {
    log.error("Error fetching tools", { error })
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error" 
      },
      { status: 500 }
    )
  }
}


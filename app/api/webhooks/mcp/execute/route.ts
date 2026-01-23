/**
 * MCP Tool Execution Endpoint
 * 
 * Single dynamic endpoint that handles ALL tool execution requests from the MCP server.
 * This endpoint forwards requests to the user-configured API URL for each tool.
 * 
 * Flow:
 * 1. Retell calls MCP server to execute a tool
 * 2. MCP server forwards to this endpoint with tool name and arguments
 * 3. This endpoint looks up the tool's API URL from the stored configuration
 * 4. Forwards the request to the user's API URL
 * 5. Result flows back to MCP → Retell → AI speaks result
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"

const log = logger.child({ module: "MCPExecute" })

// ============================================================================
// TYPES
// ============================================================================

interface MCPExecutePayload {
  // Tool identification
  tool?: string
  function?: string  // Alternative field name
  
  // Arguments (multiple possible field names)
  arguments?: Record<string, unknown>
  parameters?: Record<string, unknown>
  
  // Metadata
  agent_id?: string
  call_id?: string
  tool_id?: string
  timestamp?: string
  
  // Agent/workspace context (passed from MCP)
  workspace_id?: string
  partner_id?: string
  
  // Tool configuration (passed from MCP - includes server_url and metadata)
  tool_config?: {
    server_url?: string
    metadata?: {
      authToken?: string
    }
  }
}

interface ToolExecutionResult {
  success: boolean
  message?: string
  result?: Record<string, unknown>
  error?: string
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  log.info("════════════════════════════════════════════════════════════════════")
  log.info("📥 MCP EXECUTE ENDPOINT - Request Received")
  log.info("════════════════════════════════════════════════════════════════════")

  try {
    // Parse request body
    const payload: MCPExecutePayload = await request.json()
    
    log.info("📨 Payload:", { payload })

    // Extract tool name (handle multiple field names)
    const toolName = payload.tool || payload.function
    
    if (!toolName) {
      log.error("❌ Missing tool name in request")
      return NextResponse.json(
        {
          success: false,
          error: "Missing tool name. Expected 'tool' or 'function' field.",
        },
        { status: 400 }
      )
    }

    // Extract arguments (handle multiple field names)
    const args = payload.arguments || payload.parameters || {}
    const agentId = payload.agent_id

    if (!agentId) {
      log.error("❌ Missing agent_id in request")
      return NextResponse.json(
        {
          success: false,
          error: "Missing agent_id. Cannot look up tool configuration.",
        },
        { status: 400 }
      )
    }

    // Look up the agent's tool configuration from database
    // Use admin client to bypass RLS (this is a server-to-server webhook)
    const supabase = createAdminClient()
    const { data: agent, error: agentError } = await supabase
      .from("ai_agents")
      .select("config")
      .eq("id", agentId)
      .single()

    if (agentError || !agent) {
      log.error(`❌ Agent not found: ${agentId}`, { error: agentError })
      return NextResponse.json(
        {
          success: false,
          error: `Agent not found: ${agentId}`,
        },
        { status: 404 }
      )
    }

    // Find the tool in the agent's config
    const agentConfig = agent.config as { tools?: Array<{
      name: string
      server_url?: string
      metadata?: { 
        authToken?: string
        apiMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
      }
    }> }
    
    const toolConfig = agentConfig?.tools?.find(t => t.name === toolName)

    if (!toolConfig) {
      log.error(`❌ Tool "${toolName}" not found in agent config`)
      return NextResponse.json(
        {
          success: false,
          error: `Tool "${toolName}" not configured for this agent.`,
        },
        { status: 404 }
      )
    }

    // Get the API URL from tool config or from payload
    const apiUrl = toolConfig.server_url || payload.tool_config?.server_url

    if (!apiUrl) {
      log.error(`❌ No API URL configured for tool "${toolName}"`)
      return NextResponse.json(
        {
          success: false,
          error: `No API URL configured for tool "${toolName}".`,
        },
        { status: 400 }
      )
    }

    // Get auth token and HTTP method if configured
    const authToken = toolConfig.metadata?.authToken || payload.tool_config?.metadata?.authToken
    const httpMethod = toolConfig.metadata?.apiMethod || "POST"

    log.info(`📤 Forwarding to user API: ${httpMethod} ${apiUrl}`)

    // Forward the request to the user's API
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }
    
    if (authToken) {
      headers["Authorization"] = authToken.startsWith("Bearer ") 
        ? authToken 
        : `Bearer ${authToken}`
    }

    const forwardPayload = {
      tool: toolName,
      arguments: args,
      metadata: {
        agent_id: agentId,
        call_id: payload.call_id,
        workspace_id: payload.workspace_id,
        partner_id: payload.partner_id,
        timestamp: payload.timestamp || new Date().toISOString(),
      }
    }

    try {
      // For GET requests, append arguments as query params instead of body
      let fetchUrl = apiUrl
      let fetchBody: string | undefined = JSON.stringify(forwardPayload)

      if (httpMethod === "GET") {
        const queryParams = new URLSearchParams()
        for (const [key, value] of Object.entries(args)) {
          queryParams.append(key, String(value))
        }
        queryParams.append("_metadata", JSON.stringify(forwardPayload.metadata))
        fetchUrl = `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}${queryParams.toString()}`
        fetchBody = undefined
      }

      const response = await fetch(fetchUrl, {
        method: httpMethod,
        headers,
        body: fetchBody,
      })

      if (!response.ok) {
        const errorText = await response.text()
        log.error(`❌ User API error: ${response.status}`, { errorText })
        return NextResponse.json(
          {
            success: false,
            error: `API returned error: ${response.status}`,
            details: errorText,
          },
          { status: response.status }
        )
      }

      // Try to parse as JSON, fallback to text
      let result: ToolExecutionResult
      const contentType = response.headers.get("content-type")
      
      if (contentType?.includes("application/json")) {
        result = await response.json()
      } else {
        const text = await response.text()
        result = {
          success: true,
          message: text,
        }
      }

      const duration = Date.now() - startTime
      log.info("📤 Response:", { result, duration })
      log.info("════════════════════════════════════════════════════════════════════")

      return NextResponse.json(result)

    } catch (fetchError) {
      log.error(`❌ Failed to reach user API: ${apiUrl}`, { error: fetchError })
      return NextResponse.json(
        {
          success: false,
          error: `Failed to reach API: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
        },
        { status: 502 }
      )
    }

  } catch (error) {
    const duration = Date.now() - startTime
    
    log.error("❌ Error processing request:", { error, duration })
    log.info("════════════════════════════════════════════════════════════════════")

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "mcp-execute",
    description: "Dynamic tool execution endpoint - forwards to user-configured APIs",
    version: "2.0",
  })
}

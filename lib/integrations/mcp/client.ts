/**
 * MCP Server Client
 * 
 * API client for communicating with the MCP server from Next.js.
 * Used to register, update, and manage custom tools for Retell agents.
 */

import { env } from "@/lib/env"

// ============================================================================
// CONFIGURATION
// ============================================================================

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3001"
const MCP_API_KEY = process.env.MCP_API_KEY || ""

// ============================================================================
// TYPES
// ============================================================================

export interface ToolParameterProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object"
  description?: string
  enum?: string[]
  items?: ToolParameterProperty
  properties?: Record<string, ToolParameterProperty>
  required?: string[]
  default?: unknown
}

export interface ToolParameters {
  type: "object"
  properties: Record<string, ToolParameterProperty>
  required?: string[]
}

export interface MCPToolInput {
  id?: string
  name: string
  description: string
  parameters: ToolParameters
  webhook_url: string
  timeout_ms?: number
  enabled?: boolean
}

export interface MCPToolDefinition extends MCPToolInput {
  id: string
  created_at: string
  updated_at: string
}

export interface RegisterToolsRequest {
  partner_id: string
  workspace_id: string
  agent_id: string
  tools: MCPToolInput[]
}

export interface RegisterToolsResponse {
  success: boolean
  agent_id: string
  tools_count: number
  mcp_identifier: string
  error?: string
}

export interface ListToolsResponse {
  success: boolean
  agent_id: string
  workspace_id: string
  partner_id: string
  tools: MCPToolDefinition[]
  created_at: string
  updated_at: string
  error?: string
}

export interface MCPClientResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ============================================================================
// MCP CLIENT CLASS
// ============================================================================

export class MCPClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = baseUrl || MCP_SERVER_URL
    this.apiKey = apiKey || MCP_API_KEY
  }

  /**
   * Make an authenticated request to the MCP server
   */
  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<MCPClientResponse<T>> {
    const url = `${this.baseUrl}${path}`

    console.log(`[MCPClient] ${method} ${url}`)

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      const data = await response.json()

      if (!response.ok) {
        console.error(`[MCPClient] Error response:`, data)
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
        }
      }

      return {
        success: true,
        data: data as T,
      }
    } catch (error) {
      console.error(`[MCPClient] Request failed:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Check if MCP server is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.request<{ status: string }>("GET", "/api/health")
      return result.success && result.data?.status === "healthy"
    } catch {
      return false
    }
  }

  /**
   * Register or update tools for an agent
   * This replaces all existing tools with the new set
   */
  async registerTools(
    agentId: string,
    workspaceId: string,
    partnerId: string,
    tools: MCPToolInput[]
  ): Promise<MCPClientResponse<RegisterToolsResponse>> {
    console.log(`[MCPClient] Registering ${tools.length} tools for agent ${agentId}`)

    return this.request<RegisterToolsResponse>(
      "POST",
      `/api/agents/${agentId}/tools`,
      {
        partner_id: partnerId,
        workspace_id: workspaceId,
        tools,
      }
    )
  }

  /**
   * Get tools registered for an agent
   */
  async getTools(agentId: string): Promise<MCPClientResponse<ListToolsResponse>> {
    return this.request<ListToolsResponse>("GET", `/api/agents/${agentId}/tools`)
  }

  /**
   * Delete all tools for an agent
   */
  async deleteTools(agentId: string): Promise<MCPClientResponse<{ message: string }>> {
    return this.request<{ message: string }>("DELETE", `/api/agents/${agentId}/tools`)
  }

  /**
   * Delete a specific tool from an agent
   */
  async deleteTool(
    agentId: string,
    toolName: string
  ): Promise<MCPClientResponse<{ message: string }>> {
    return this.request<{ message: string }>(
      "DELETE",
      `/api/agents/${agentId}/tools/${encodeURIComponent(toolName)}`
    )
  }

  /**
   * Add or update a single tool for an agent
   */
  async upsertTool(
    agentId: string,
    tool: MCPToolInput
  ): Promise<MCPClientResponse<{ tool: MCPToolDefinition }>> {
    return this.request<{ tool: MCPToolDefinition }>(
      "PUT",
      `/api/agents/${agentId}/tools/${encodeURIComponent(tool.name)}`,
      tool
    )
  }

  /**
   * Get the MCP URL to configure in Retell
   * This is the URL that Retell will call to execute tools
   */
  getMCPUrl(): string {
    return `${this.baseUrl}/mcp`
  }

  /**
   * Get the MCP configuration object for Retell LLM
   * This should be added to the `mcps` array when creating/updating an LLM
   */
  getMCPConfig(agentId: string): {
    name: string
    url: string
    query_params: { agent_id: string }
    headers?: { Authorization: string }
    timeout_ms: number
  } {
    return {
      name: "genius365-mcp",
      url: this.getMCPUrl(),
      query_params: {
        agent_id: agentId,
      },
      // Only include auth header if API key is set
      ...(this.apiKey && {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }),
      timeout_ms: 30000,
    }
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

/**
 * Default MCP client instance using environment variables
 */
export const mcpClient = new MCPClient()

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if MCP server is configured
 */
export function isMCPConfigured(): boolean {
  return Boolean(MCP_SERVER_URL && MCP_API_KEY)
}

/**
 * Get the single dynamic webhook URL for tool execution
 * All tools use this same endpoint - routing is done based on tool name
 */
export function getToolExecutionWebhookUrl(): string {
  // In production, this should be the public URL of the Next.js app
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL 
    || process.env.NEXTAUTH_URL 
    || "http://localhost:3000"
  
  return `${baseUrl}/api/webhooks/mcp/execute`
}

/**
 * Convert internal FunctionTool format to MCP tool format
 */
export function convertToMCPTool(
  tool: {
    id?: string
    name: string
    description: string
    parameters?: {
      type: "object"
      properties: Record<string, unknown>
      required?: string[]
    }
    server_url?: string
    timeout_ms?: number
    enabled?: boolean
  },
  defaultWebhookUrl?: string
): MCPToolInput | null {
  // Use the single dynamic endpoint for all tools
  // Individual tool.server_url is ignored - all tools go to the same endpoint
  const webhookUrl = getToolExecutionWebhookUrl()

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters: (tool.parameters as ToolParameters) || {
      type: "object",
      properties: {},
    },
    webhook_url: webhookUrl,
    timeout_ms: tool.timeout_ms,
    enabled: tool.enabled ?? true,
  }
}

/**
 * Convert a predefined tool to MCP format
 * Uses the single webhook URL automatically
 */
export function convertPredefinedToolToMCP(
  tool: {
    id: string
    name?: string
    aiDescription: string
    parameters: {
      type: "object"
      properties: Record<string, unknown>
      required?: string[]
    }
  }
): MCPToolInput {
  return {
    id: tool.id,
    name: tool.id, // Predefined tools use their ID as the name
    description: tool.aiDescription,
    parameters: tool.parameters as ToolParameters,
    webhook_url: getToolExecutionWebhookUrl(),
    enabled: true,
  }
}

export default MCPClient


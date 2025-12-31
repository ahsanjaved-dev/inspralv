/**
 * VAPI MCP Tool
 * Model Context Protocol integration tool
 */

import type { VapiMcpTool } from '../../types'
import type { VapiToolMessage } from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface McpToolOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** MCP server URL (required) */
  serverUrl: string
  /** Tool name from MCP server (required) */
  toolName: string
  /** MCP server arguments */
  arguments?: Record<string, unknown>
  /** Message to speak during execution */
  executionMessage?: string
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI MCP tool configuration
 */
export function createMcpTool(options: McpToolOptions): VapiMcpTool {
  const {
    name,
    description = 'Execute an MCP tool action.',
    serverUrl,
    toolName,
    arguments: mcpArgs,
    executionMessage,
  } = options

  const tool: VapiMcpTool = {
    type: 'mcp',
    name: name || toolName,
    description,
    serverUrl,
    toolName,
  }

  if (mcpArgs) tool.arguments = mcpArgs

  if (executionMessage) {
    tool.messages = [
      {
        type: 'request-start',
        content: executionMessage,
        blocking: false,
      },
    ]
  }

  return tool
}

// ============================================================================
// HELPER
// ============================================================================

/**
 * Creates multiple MCP tools from a single server
 */
export function createMcpToolsFromServer(
  serverUrl: string,
  tools: Array<{
    name: string
    toolName: string
    description: string
    arguments?: Record<string, unknown>
    executionMessage?: string
  }>
): VapiMcpTool[] {
  return tools.map((tool) =>
    createMcpTool({
      ...tool,
      serverUrl,
    })
  )
}


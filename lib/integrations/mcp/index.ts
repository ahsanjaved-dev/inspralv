/**
 * MCP Integration Module
 * 
 * Exports for MCP server communication
 */

export {
  MCPClient,
  mcpClient,
  isMCPConfigured,
  convertToMCPTool,
  type MCPToolInput,
  type MCPToolDefinition,
  type ToolParameters,
  type ToolParameterProperty,
  type RegisterToolsRequest,
  type RegisterToolsResponse,
  type ListToolsResponse,
  type MCPClientResponse,
} from "./client"


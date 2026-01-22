/**
 * MCP Server Type Definitions
 * 
 * Types for the MCP protocol, tool registry, and API communication
 */

import { z } from 'zod';

// ============================================================================
// TOOL PARAMETER SCHEMAS (JSON Schema compatible)
// ============================================================================

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  default?: unknown;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

// ============================================================================
// TOOL DEFINITION
// ============================================================================

/**
 * Tool definition stored in the registry
 */
export interface ToolDefinition {
  /** Unique identifier for the tool */
  id: string;
  /** Tool name (used by LLM to call the tool) */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** Parameters schema (JSON Schema format) */
  parameters: ToolParameters;
  /** Webhook URL to call when tool is executed */
  webhook_url: string;
  /** Optional timeout in milliseconds */
  timeout_ms?: number;
  /** Whether the tool is enabled */
  enabled: boolean;
  /** Created timestamp */
  created_at: string;
  /** Updated timestamp */
  updated_at: string;
}

/**
 * Input for creating/updating a tool
 */
export interface ToolInput {
  id?: string;
  name: string;
  description: string;
  parameters: ToolParameters;
  webhook_url: string;
  timeout_ms?: number;
  enabled?: boolean;
}

// ============================================================================
// AGENT REGISTRATION
// ============================================================================

/**
 * Agent registration in the MCP server
 * Holds all tools for a specific agent
 */
export interface AgentRegistration {
  /** Agent ID from Genius365 */
  agent_id: string;
  /** Workspace ID for isolation */
  workspace_id: string;
  /** Partner/Organization ID for multi-tenancy */
  partner_id: string;
  /** Tools registered for this agent */
  tools: ToolDefinition[];
  /** Created timestamp */
  created_at: string;
  /** Updated timestamp */
  updated_at: string;
}

// ============================================================================
// MCP PROTOCOL TYPES (What Retell expects)
// ============================================================================

/**
 * MCP Tool format returned to Retell
 * Reference: Retell's GET /get-mcp-tools/{agent_id} response
 */
export interface MCPTool {
  /** Name of the MCP tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** JSON schema defining input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP Tool execution request from Retell
 */
export interface MCPToolCallRequest {
  /** Tool name to execute */
  tool: string;
  /** Tool arguments/parameters */
  arguments: Record<string, unknown>;
  /** Optional call context */
  call_id?: string;
}

/**
 * MCP Tool execution response to Retell
 */
export interface MCPToolCallResponse {
  /** Whether execution was successful */
  success: boolean;
  /** Result data (on success) */
  result?: unknown;
  /** Error message (on failure) */
  error?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES (Next.js ↔ MCP Server)
// ============================================================================

/**
 * Request to register/update tools for an agent
 */
export interface RegisterToolsRequest {
  partner_id: string;
  workspace_id: string;
  agent_id: string;
  tools: ToolInput[];
}

/**
 * Response from tool registration
 */
export interface RegisterToolsResponse {
  success: boolean;
  agent_id: string;
  tools_count: number;
  mcp_identifier: string;
  error?: string;
}

/**
 * Request to delete tools for an agent
 */
export interface DeleteAgentToolsRequest {
  partner_id: string;
  workspace_id: string;
  agent_id: string;
}

/**
 * Response from listing agent tools
 */
export interface ListToolsResponse {
  success: boolean;
  agent_id: string;
  tools: ToolDefinition[];
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

export const ToolParameterPropertySchema: z.ZodType<ToolParameterProperty> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    items: ToolParameterPropertySchema.optional(),
    properties: z.record(ToolParameterPropertySchema).optional(),
    required: z.array(z.string()).optional(),
    default: z.unknown().optional(),
  })
);

export const ToolParametersSchema = z.object({
  type: z.literal('object'),
  properties: z.record(ToolParameterPropertySchema),
  required: z.array(z.string()).optional(),
});

export const ToolInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Tool name is required'),
  description: z.string().min(1, 'Tool description is required'),
  parameters: ToolParametersSchema,
  webhook_url: z.string().url('Invalid webhook URL'),
  timeout_ms: z.number().positive().optional(),
  enabled: z.boolean().optional().default(true),
});

export const RegisterToolsRequestSchema = z.object({
  partner_id: z.string().min(1, 'Partner ID is required'),
  workspace_id: z.string().min(1, 'Workspace ID is required'),
  agent_id: z.string().min(1, 'Agent ID is required'),
  tools: z.array(ToolInputSchema),
});

export const MCPToolCallRequestSchema = z.object({
  tool: z.string().min(1, 'Tool name is required'),
  arguments: z.record(z.unknown()).optional().default({}),
  call_id: z.string().optional(),
});

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}


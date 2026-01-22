/**
 * Tool Registry
 * 
 * Multi-tenant tool storage with agent isolation.
 * Each agent has its own set of tools that don't interfere with other agents.
 * 
 * Storage structure:
 * - Key: agent_id
 * - Value: AgentRegistration (contains all tools for that agent)
 * 
 * LAZY LOADING: If tools are not in cache, fetches from Next.js API
 * which reads from Supabase (source of truth).
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AgentRegistration,
  ToolDefinition,
  ToolInput,
  MCPTool,
} from '../types/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Next.js app URL to fetch tools from (source of truth)
function getNextJsUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function getApiKey(): string {
  return process.env.MCP_API_KEY || '';
}

// ============================================================================
// IN-MEMORY STORAGE (CACHE)
// ============================================================================

/**
 * In-memory registry cache
 * Key: agent_id
 * Value: AgentRegistration
 */
const registry = new Map<string, AgentRegistration>();

// Track which agents we've tried to fetch (to avoid repeated failed fetches)
const fetchAttempts = new Map<string, { timestamp: number; failed: boolean }>();
const FETCH_RETRY_DELAY_MS = 60000; // Wait 1 minute before retrying failed fetches

// ============================================================================
// LAZY LOADING FROM NEXT.JS
// ============================================================================

/**
 * Fetch tools from Next.js API (source of truth: Supabase)
 * Called when cache is empty for an agent
 */
async function fetchToolsFromNextJs(agentId: string): Promise<AgentRegistration | null> {
  const baseUrl = getNextJsUrl();
  const apiKey = getApiKey();
  const url = `${baseUrl}/api/mcp/agents/${agentId}/tools`;

  console.log(`[ToolRegistry] Fetching tools from Next.js: ${url}`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`[ToolRegistry] Failed to fetch from Next.js: ${response.status}`);
      return null;
    }

    interface NextJsToolsResponse {
      success: boolean;
      error?: string;
      agent_id: string;
      workspace_id: string;
      partner_id: string;
      tools: ToolInput[];
    }

    const data = await response.json() as NextJsToolsResponse;

    if (!data.success) {
      console.error(`[ToolRegistry] Next.js returned error: ${data.error}`);
      return null;
    }

    const now = new Date().toISOString();
    const registration: AgentRegistration = {
      agent_id: data.agent_id,
      workspace_id: data.workspace_id,
      partner_id: data.partner_id,
      tools: (data.tools || []).map((tool: ToolInput) => ({
        id: tool.id || uuidv4(),
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        webhook_url: tool.webhook_url,
        timeout_ms: tool.timeout_ms,
        enabled: tool.enabled ?? true,
        created_at: now,
        updated_at: now,
      })),
      created_at: now,
      updated_at: now,
    };

    // Cache the result
    registry.set(agentId, registration);
    fetchAttempts.set(agentId, { timestamp: Date.now(), failed: false });

    console.log(`[ToolRegistry] Fetched and cached ${registration.tools.length} tools for agent ${agentId}`);
    return registration;

  } catch (error) {
    console.error(`[ToolRegistry] Error fetching from Next.js:`, error);
    fetchAttempts.set(agentId, { timestamp: Date.now(), failed: true });
    return null;
  }
}

/**
 * Check if we should attempt to fetch tools from Next.js
 */
function shouldFetchFromNextJs(agentId: string): boolean {
  const attempt = fetchAttempts.get(agentId);
  
  if (!attempt) {
    return true; // Never tried
  }

  if (!attempt.failed) {
    return false; // Previous fetch succeeded, use cache
  }

  // If previous fetch failed, wait before retrying
  const elapsed = Date.now() - attempt.timestamp;
  return elapsed > FETCH_RETRY_DELAY_MS;
}

// ============================================================================
// REGISTRY CLASS
// ============================================================================

export class ToolRegistry {
  /**
   * Register or update tools for an agent
   * Replaces all existing tools with the new set
   */
  static registerTools(
    agentId: string,
    workspaceId: string,
    partnerId: string,
    tools: ToolInput[]
  ): AgentRegistration {
    const now = new Date().toISOString();
    
    // Convert ToolInput to ToolDefinition
    const toolDefinitions: ToolDefinition[] = tools.map((tool) => ({
      id: tool.id || uuidv4(),
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      webhook_url: tool.webhook_url,
      timeout_ms: tool.timeout_ms,
      enabled: tool.enabled ?? true,
      created_at: now,
      updated_at: now,
    }));

    // Check if agent already exists
    const existing = registry.get(agentId);

    const registration: AgentRegistration = {
      agent_id: agentId,
      workspace_id: workspaceId,
      partner_id: partnerId,
      tools: toolDefinitions,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    registry.set(agentId, registration);

    console.log(`[ToolRegistry] Registered ${tools.length} tools for agent ${agentId}`);
    
    return registration;
  }

  /**
   * Get agent registration by agent ID
   * Uses lazy loading: if not in cache, fetches from Next.js
   */
  static getAgent(agentId: string): AgentRegistration | null {
    return registry.get(agentId) || null;
  }

  /**
   * Get agent registration with lazy loading (async)
   * If not in cache, fetches from Next.js API
   */
  static async getAgentAsync(agentId: string): Promise<AgentRegistration | null> {
    // Check cache first
    const cached = registry.get(agentId);
    if (cached) {
      return cached;
    }

    // Try to fetch from Next.js
    if (shouldFetchFromNextJs(agentId)) {
      const fetched = await fetchToolsFromNextJs(agentId);
      if (fetched) {
        return fetched;
      }
    }

    return null;
  }

  /**
   * Get all tools for an agent (sync - cache only)
   */
  static getTools(agentId: string): ToolDefinition[] {
    const agent = registry.get(agentId);
    return agent?.tools || [];
  }

  /**
   * Get all tools for an agent with lazy loading (async)
   */
  static async getToolsAsync(agentId: string): Promise<ToolDefinition[]> {
    const agent = await this.getAgentAsync(agentId);
    return agent?.tools || [];
  }

  /**
   * Get enabled tools for an agent (for MCP protocol) - sync
   */
  static getEnabledTools(agentId: string): ToolDefinition[] {
    const tools = this.getTools(agentId);
    return tools.filter((tool) => tool.enabled);
  }

  /**
   * Get enabled tools for an agent with lazy loading (async)
   */
  static async getEnabledToolsAsync(agentId: string): Promise<ToolDefinition[]> {
    const tools = await this.getToolsAsync(agentId);
    return tools.filter((tool) => tool.enabled);
  }

  /**
   * Get a specific tool by name for an agent (sync)
   */
  static getTool(agentId: string, toolName: string): ToolDefinition | null {
    const tools = this.getTools(agentId);
    return tools.find((tool) => tool.name === toolName) || null;
  }

  /**
   * Get a specific tool by name with lazy loading (async)
   */
  static async getToolAsync(agentId: string, toolName: string): Promise<ToolDefinition | null> {
    const tools = await this.getToolsAsync(agentId);
    return tools.find((tool) => tool.name === toolName) || null;
  }

  /**
   * Add a single tool to an agent
   */
  static addTool(agentId: string, tool: ToolInput): ToolDefinition | null {
    const agent = registry.get(agentId);
    if (!agent) {
      console.warn(`[ToolRegistry] Agent ${agentId} not found, cannot add tool`);
      return null;
    }

    const now = new Date().toISOString();
    const toolDefinition: ToolDefinition = {
      id: tool.id || uuidv4(),
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      webhook_url: tool.webhook_url,
      timeout_ms: tool.timeout_ms,
      enabled: tool.enabled ?? true,
      created_at: now,
      updated_at: now,
    };

    // Check if tool with same name exists
    const existingIndex = agent.tools.findIndex((t) => t.name === tool.name);
    if (existingIndex >= 0) {
      // Update existing tool
      const existingTool = agent.tools[existingIndex];
      agent.tools[existingIndex] = {
        ...toolDefinition,
        created_at: existingTool?.created_at || toolDefinition.created_at,
      };
    } else {
      // Add new tool
      agent.tools.push(toolDefinition);
    }

    agent.updated_at = now;
    registry.set(agentId, agent);

    console.log(`[ToolRegistry] Added/updated tool "${tool.name}" for agent ${agentId}`);
    
    return toolDefinition;
  }

  /**
   * Remove a tool from an agent
   */
  static removeTool(agentId: string, toolName: string): boolean {
    const agent = registry.get(agentId);
    if (!agent) {
      return false;
    }

    const initialLength = agent.tools.length;
    agent.tools = agent.tools.filter((tool) => tool.name !== toolName);
    
    if (agent.tools.length < initialLength) {
      agent.updated_at = new Date().toISOString();
      registry.set(agentId, agent);
      console.log(`[ToolRegistry] Removed tool "${toolName}" from agent ${agentId}`);
      return true;
    }

    return false;
  }

  /**
   * Delete all tools for an agent
   */
  static deleteAgent(agentId: string): boolean {
    const deleted = registry.delete(agentId);
    if (deleted) {
      console.log(`[ToolRegistry] Deleted all tools for agent ${agentId}`);
    }
    return deleted;
  }

  /**
   * Check if an agent exists in the registry
   */
  static hasAgent(agentId: string): boolean {
    return registry.has(agentId);
  }

  /**
   * Convert tools to MCP format for Retell (sync)
   */
  static toMCPTools(agentId: string): MCPTool[] {
    const tools = this.getEnabledTools(agentId);
    
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object' as const,
        properties: tool.parameters.properties as Record<string, unknown>,
        required: tool.parameters.required,
      },
    }));
  }

  /**
   * Convert tools to MCP format with lazy loading (async)
   * This is the main method Retell calls - uses lazy loading
   */
  static async toMCPToolsAsync(agentId: string): Promise<MCPTool[]> {
    const tools = await this.getEnabledToolsAsync(agentId);
    
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object' as const,
        properties: tool.parameters.properties as Record<string, unknown>,
        required: tool.parameters.required,
      },
    }));
  }

  /**
   * Get registry statistics
   */
  static getStats(): {
    total_agents: number;
    total_tools: number;
    agents: Array<{ agent_id: string; tools_count: number }>;
  } {
    const agents: Array<{ agent_id: string; tools_count: number }> = [];
    let totalTools = 0;

    registry.forEach((agent, agentId) => {
      agents.push({
        agent_id: agentId,
        tools_count: agent.tools.length,
      });
      totalTools += agent.tools.length;
    });

    return {
      total_agents: registry.size,
      total_tools: totalTools,
      agents,
    };
  }

  /**
   * Clear all registrations (for testing)
   */
  static clear(): void {
    registry.clear();
    console.log('[ToolRegistry] Cleared all registrations');
  }

  /**
   * Get all agents for a workspace (for debugging/admin)
   */
  static getAgentsByWorkspace(workspaceId: string): AgentRegistration[] {
    const agents: AgentRegistration[] = [];
    registry.forEach((agent) => {
      if (agent.workspace_id === workspaceId) {
        agents.push(agent);
      }
    });
    return agents;
  }

  /**
   * Get all agents for a partner (for debugging/admin)
   */
  static getAgentsByPartner(partnerId: string): AgentRegistration[] {
    const agents: AgentRegistration[] = [];
    registry.forEach((agent) => {
      if (agent.partner_id === partnerId) {
        agents.push(agent);
      }
    });
    return agents;
  }
}

export default ToolRegistry;


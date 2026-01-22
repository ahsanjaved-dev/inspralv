/**
 * Tool Executor
 * 
 * Executes tools by forwarding requests to user-defined webhooks.
 * When Retell calls the MCP server to execute a tool, this module:
 * 1. Looks up the tool's webhook URL
 * 2. Forwards the request to the webhook
 * 3. Returns the result to Retell
 */

import type { ToolDefinition, MCPToolCallResponse } from '../types/index.js';
import { ToolRegistry } from '../registry/tool-registry.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

// ============================================================================
// TOOL EXECUTOR CLASS
// ============================================================================

export class ToolExecutor {
  /**
   * Execute a tool for an agent
   * 
   * @param agentId - The agent ID
   * @param toolName - The name of the tool to execute
   * @param args - Arguments to pass to the tool
   * @param callId - Optional call ID for context
   */
  static async execute(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>,
    callId?: string
  ): Promise<MCPToolCallResponse> {
    console.log(`[ToolExecutor] Executing tool "${toolName}" for agent ${agentId}`);
    console.log(`[ToolExecutor] Arguments:`, JSON.stringify(args, null, 2));

    // 1. Look up the tool and agent registration (with lazy loading)
    const tool = await ToolRegistry.getToolAsync(agentId, toolName);
    const agent = await ToolRegistry.getAgentAsync(agentId);
    
    if (!tool) {
      console.error(`[ToolExecutor] Tool "${toolName}" not found for agent ${agentId}`);
      return {
        success: false,
        error: `Tool "${toolName}" not found`,
      };
    }

    if (!tool.enabled) {
      console.error(`[ToolExecutor] Tool "${toolName}" is disabled for agent ${agentId}`);
      return {
        success: false,
        error: `Tool "${toolName}" is disabled`,
      };
    }

    // 2. Build context from agent registration
    const context = {
      agent_id: agentId,
      workspace_id: agent?.workspace_id,
      partner_id: agent?.partner_id,
    };

    // 3. Execute the webhook with context
    return this.executeWebhook(tool, args, callId, context);
  }

  /**
   * Execute a webhook call
   */
  private static async executeWebhook(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    callId?: string,
    context?: { agent_id: string; workspace_id?: string; partner_id?: string }
  ): Promise<MCPToolCallResponse> {
    const startTime = Date.now();
    const timeout = tool.timeout_ms || DEFAULT_TIMEOUT_MS;

    console.log(`[ToolExecutor] Calling webhook: ${tool.webhook_url}`);

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Prepare the request body
      // Send both formats for compatibility with different webhook implementations
      const requestBody = {
        // Standard format
        tool: tool.name,
        arguments: args,
        // Alternative naming (for compatibility)
        function: tool.name,
        parameters: args,
        // Metadata
        call_id: callId,
        tool_id: tool.id,
        timestamp: new Date().toISOString(),
        // Context from agent registration
        agent_id: context?.agent_id,
        workspace_id: context?.workspace_id,
        partner_id: context?.partner_id,
      };

      // Make the webhook request
      const response = await fetch(tool.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MCP-Tool': tool.name,
          'X-MCP-Call-ID': callId || '',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      console.log(`[ToolExecutor] Webhook responded in ${duration}ms with status ${response.status}`);

      // Handle non-OK responses
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[ToolExecutor] Webhook error: ${response.status} - ${errorText}`);
        
        return {
          success: false,
          error: `Webhook returned ${response.status}: ${errorText}`,
        };
      }

      // Parse response
      const result = await response.json();
      console.log(`[ToolExecutor] Webhook result:`, JSON.stringify(result, null, 2));

      // Return the result in MCP format
      return {
        success: true,
        result: result,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`[ToolExecutor] Webhook timed out after ${duration}ms`);
        return {
          success: false,
          error: `Webhook timed out after ${timeout}ms`,
        };
      }

      // Handle other errors
      console.error(`[ToolExecutor] Webhook error after ${duration}ms:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate tool arguments against schema
   * (Basic validation - can be extended)
   */
  static validateArguments(
    tool: ToolDefinition,
    args: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const { parameters } = tool;

    // Check required parameters
    if (parameters.required) {
      for (const required of parameters.required) {
        if (!(required in args) || args[required] === undefined || args[required] === null) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    // Basic type checking
    for (const [key, value] of Object.entries(args)) {
      const paramDef = parameters.properties[key];
      if (!paramDef) {
        // Allow extra parameters, just warn
        console.warn(`[ToolExecutor] Unknown parameter "${key}" passed to tool "${tool.name}"`);
        continue;
      }

      // Type validation
      const actualType = typeof value;
      const expectedType = paramDef.type;

      if (expectedType === 'integer' || expectedType === 'number') {
        if (actualType !== 'number') {
          errors.push(`Parameter "${key}" should be a number, got ${actualType}`);
        }
      } else if (expectedType === 'boolean') {
        if (actualType !== 'boolean') {
          errors.push(`Parameter "${key}" should be a boolean, got ${actualType}`);
        }
      } else if (expectedType === 'string') {
        if (actualType !== 'string') {
          errors.push(`Parameter "${key}" should be a string, got ${actualType}`);
        }
      } else if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`Parameter "${key}" should be an array`);
        }
      } else if (expectedType === 'object') {
        if (actualType !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`Parameter "${key}" should be an object`);
        }
      }

      // Enum validation
      if (paramDef.enum && !paramDef.enum.includes(value as string)) {
        errors.push(`Parameter "${key}" must be one of: ${paramDef.enum.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute with validation (uses lazy loading)
   */
  static async executeWithValidation(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>,
    callId?: string
  ): Promise<MCPToolCallResponse> {
    // Look up tool first (with lazy loading)
    const tool = await ToolRegistry.getToolAsync(agentId, toolName);
    
    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolName}" not found`,
      };
    }

    // Validate arguments
    const validation = this.validateArguments(tool, args);
    if (!validation.valid) {
      console.error(`[ToolExecutor] Validation failed for tool "${toolName}":`, validation.errors);
      return {
        success: false,
        error: `Invalid arguments: ${validation.errors.join('; ')}`,
      };
    }

    // Execute
    return this.execute(agentId, toolName, args, callId);
  }
}

export default ToolExecutor;


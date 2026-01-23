/**
 * MCP Protocol Routes
 * 
 * These endpoints implement the MCP (Model Context Protocol) that Retell uses
 * to interact with custom tools.
 * 
 * Endpoints:
 * - GET /mcp/tools?agent_id=xxx - List available tools (Retell queries this)
 * - POST /mcp/execute?agent_id=xxx - Execute a tool (Retell calls this)
 * 
 * Agent isolation is achieved via the agent_id query parameter.
 * Retell will include this in all requests based on the query_params
 * configured in the mcps array.
 */

import { Router, type Request, type Response, type IRouter } from 'express';
import { ToolRegistry } from '../registry/tool-registry.js';
import { ToolExecutor } from '../executor/tool-executor.js';
import { MCPToolCallRequestSchema } from '../types/index.js';
import { requireAgentId, authenticateQueryParam } from '../middleware/auth.js';

const router: IRouter = Router();

// Apply authentication to all MCP routes
// Retell sends Authorization header which we configured in the mcps array
router.use(authenticateQueryParam);

// ============================================================================
// GET /mcp/tools - List available tools for an agent
// ============================================================================

/**
 * GET /mcp/tools?agent_id=xxx
 * 
 * Returns a list of available tools in MCP format.
 * Retell calls this to discover what tools are available.
 * 
 * Uses LAZY LOADING: If tools not in cache, fetches from Next.js API
 * 
 * Response format matches Retell's GET /get-mcp-tools/{agent_id} response
 */
router.get('/tools', requireAgentId, async (req: Request, res: Response) => {
  // @ts-expect-error - agentId added by requireAgentId middleware
  const agentId = req.agentId as string;

  console.log(`[MCP] GET /tools for agent ${agentId}`);

  try {
    // Get tools in MCP format (with lazy loading from Next.js if needed)
    const tools = await ToolRegistry.toMCPToolsAsync(agentId);

    console.log(`[MCP] Returning ${tools.length} tools for agent ${agentId}`);

    // Return in Retell's expected format
    res.json(tools);
  } catch (error) {
    console.error(`[MCP] Error getting tools:`, error);
    res.status(500).json({
      error: 'Failed to get tools',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// POST /mcp/execute - Execute a tool
// ============================================================================

/**
 * POST /mcp/execute?agent_id=xxx
 * 
 * Executes a tool and returns the result.
 * Retell calls this when the agent decides to use a tool.
 * 
 * Request body:
 * {
 *   "tool": "tool_name",
 *   "arguments": { ... },
 *   "call_id": "optional_call_id"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "result": { ... }
 * }
 * or
 * {
 *   "success": false,
 *   "error": "error message"
 * }
 */
router.post('/execute', requireAgentId, async (req: Request, res: Response) => {
  // @ts-expect-error - agentId added by requireAgentId middleware
  const agentId = req.agentId as string;

  console.log(`[MCP] POST /execute for agent ${agentId}`);
  console.log(`[MCP] Request body:`, JSON.stringify(req.body, null, 2));

  try {
    // Validate request body
    const parseResult = MCPToolCallRequestSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      console.error(`[MCP] Invalid request body:`, parseResult.error.errors);
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.errors,
      });
      return;
    }

    const { tool, arguments: args, call_id } = parseResult.data;

    // Execute the tool
    const result = await ToolExecutor.executeWithValidation(
      agentId,
      tool,
      args,
      call_id
    );

    console.log(`[MCP] Tool execution result:`, JSON.stringify(result, null, 2));

    // Return result
    res.json(result);
  } catch (error) {
    console.error(`[MCP] Error executing tool:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Alternative endpoint formats (for compatibility)
// ============================================================================

/**
 * POST /mcp?agent_id=xxx
 * 
 * MCP JSON-RPC 2.0 Protocol Handler
 * 
 * Retell uses JSON-RPC format with methods:
 * - initialize: Initialize the MCP connection
 * - tools/list: List available tools
 * - tools/call: Execute a tool
 */
router.post('/', requireAgentId, async (req: Request, res: Response) => {
  // @ts-expect-error - agentId added by requireAgentId middleware
  const agentId = req.agentId as string;

  const { method, params, id, jsonrpc } = req.body;

  // Check if this is a JSON-RPC request
  if (jsonrpc === '2.0' && method) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[MCP JSON-RPC] Method: ${method}`);
    console.log(`[MCP JSON-RPC] Agent: ${agentId}`);
    console.log(`[MCP JSON-RPC] Request ID: ${id}`);
    console.log(`${'='.repeat(60)}`);

    try {
      switch (method) {
        // ============================================================
        // INITIALIZE - Retell initializes the MCP connection
        // ============================================================
        case 'initialize': {
          console.log(`[MCP] 🟢 INITIALIZE - Retell is connecting to MCP server`);
          console.log(`[MCP] Client: ${params?.clientInfo?.name} v${params?.clientInfo?.version}`);
          console.log(`[MCP] Protocol: ${params?.protocolVersion}`);
          
          res.json({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: {
                tools: { listChanged: true },
              },
              serverInfo: {
                name: 'genius365-mcp-server',
                version: '1.0.0',
              },
            },
          });
          return;
        }

        // ============================================================
        // TOOLS/LIST - Retell requests list of available tools
        // ============================================================
        case 'tools/list': {
          console.log(`[MCP] 📋 TOOLS/LIST - Retell is requesting available tools`);
          
          const tools = await ToolRegistry.toMCPToolsAsync(agentId);
          
          console.log(`[MCP] ✅ Returning ${tools.length} tools to Retell:`);
          tools.forEach((tool, i) => {
            console.log(`[MCP]   ${i + 1}. ${tool.name}: ${tool.description?.substring(0, 50)}...`);
            console.log(`[MCP]      inputSchema:`, JSON.stringify(tool.inputSchema, null, 2));
          });
          
          const response = {
            jsonrpc: '2.0',
            id,
            result: {
              tools: tools,
            },
          };
          
          console.log(`[MCP] 📤 FULL RESPONSE TO RETELL:`, JSON.stringify(response, null, 2));
          
          res.json(response);
          return;
        }

        // ============================================================
        // TOOLS/CALL - Retell executes a tool
        // ============================================================
        case 'tools/call': {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          
          console.log(`[MCP] 🔧 TOOLS/CALL - Retell is executing a tool!`);
          console.log(`[MCP] Tool Name: ${toolName}`);
          console.log(`[MCP] Arguments:`, JSON.stringify(toolArgs, null, 2));
          
          if (!toolName) {
            res.json({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32602,
                message: 'Missing tool name in params',
              },
            });
            return;
          }

          const result = await ToolExecutor.executeWithValidation(
            agentId,
            toolName,
            toolArgs,
            id?.toString()
          );

          console.log(`[MCP] ✅ Tool execution result:`, JSON.stringify(result, null, 2));

          if (result.success) {
            res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result.result || result),
                  },
                ],
              },
            });
          } else {
            res.json({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32000,
                message: result.error || 'Tool execution failed',
              },
            });
          }
          return;
        }

        // ============================================================
        // NOTIFICATIONS/INITIALIZED - Acknowledgment after initialize
        // ============================================================
        case 'notifications/initialized': {
          console.log(`[MCP] 🟢 NOTIFICATIONS/INITIALIZED - Connection confirmed`);
          // This is a notification, no response needed
          res.status(204).send();
          return;
        }

        // ============================================================
        // UNKNOWN METHOD
        // ============================================================
        default: {
          console.log(`[MCP] ⚠️ Unknown method: ${method}`);
          res.json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          });
          return;
        }
      }
    } catch (error) {
      console.error(`[MCP] ❌ Error handling JSON-RPC:`, error);
      res.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      });
      return;
    }
  }

  // ============================================================
  // FALLBACK: Non-JSON-RPC requests (legacy format)
  // ============================================================
  console.log(`[MCP] POST / for agent ${agentId} (legacy format)`);

  try {
    // Check if this is a tool listing request
    if (req.body.list_tools === true) {
      const tools = await ToolRegistry.toMCPToolsAsync(agentId);
      res.json(tools);
      return;
    }

    // Otherwise, treat as tool execution
    const parseResult = MCPToolCallRequestSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.errors,
      });
      return;
    }

    const { tool, arguments: args, call_id } = parseResult.data;

    const result = await ToolExecutor.executeWithValidation(
      agentId,
      tool,
      args,
      call_id
    );

    res.json(result);
  } catch (error) {
    console.error(`[MCP] Error:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /mcp?agent_id=xxx
 * 
 * Alternative GET endpoint for tool listing
 * Uses lazy loading from Next.js if cache is empty
 */
router.get('/', requireAgentId, async (req: Request, res: Response) => {
  // @ts-expect-error - agentId added by requireAgentId middleware
  const agentId = req.agentId as string;

  console.log(`[MCP] GET / for agent ${agentId}`);

  try {
    const tools = await ToolRegistry.toMCPToolsAsync(agentId);
    res.json(tools);
  } catch (error) {
    console.error(`[MCP] Error:`, error);
    res.status(500).json({
      error: 'Failed to get tools',
    });
  }
});

export default router;


/**
 * Management API Routes
 * 
 * These endpoints are called by the Next.js app to manage tools.
 * All routes require API key authentication.
 * 
 * Endpoints:
 * - POST /api/agents/:agentId/tools - Register/update tools for an agent
 * - GET /api/agents/:agentId/tools - List tools for an agent
 * - DELETE /api/agents/:agentId/tools - Delete all tools for an agent
 * - DELETE /api/agents/:agentId/tools/:toolName - Delete a specific tool
 * - GET /api/health - Health check
 * - GET /api/stats - Registry statistics
 */

import { Router, type Request, type Response, type IRouter } from 'express';
import { ToolRegistry } from '../registry/tool-registry.js';
import { RegisterToolsRequestSchema, ToolInputSchema } from '../types/index.js';
import { authenticateApiKey } from '../middleware/auth.js';

const router: IRouter = Router();

// Apply API key authentication to all routes
router.use(authenticateApiKey);

// ============================================================================
// HEALTH & STATS
// ============================================================================

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/stats
 * Get registry statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  const stats = ToolRegistry.getStats();
  res.json({
    success: true,
    data: stats,
  });
});

// ============================================================================
// TOOL MANAGEMENT
// ============================================================================

/**
 * POST /api/agents/:agentId/tools
 * Register or update tools for an agent
 * 
 * Request body:
 * {
 *   "partner_id": "xxx",
 *   "workspace_id": "xxx",
 *   "agent_id": "xxx",
 *   "tools": [...]
 * }
 */
router.post('/agents/:agentId/tools', (req: Request, res: Response) => {
  const agentId = req.params.agentId;

  if (!agentId) {
    res.status(400).json({ success: false, error: 'Missing agentId parameter' });
    return;
  }

  console.log(`[API] POST /agents/${agentId}/tools`);

  try {
    // Validate request body
    const parseResult = RegisterToolsRequestSchema.safeParse({
      ...req.body,
      agent_id: agentId,
    });

    if (!parseResult.success) {
      console.error(`[API] Validation error:`, parseResult.error.errors);
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.errors,
      });
      return;
    }

    const { partner_id, workspace_id, tools } = parseResult.data;

    // Register tools
    const registration = ToolRegistry.registerTools(
      agentId,
      workspace_id,
      partner_id,
      tools
    );

    console.log(`[API] Registered ${tools.length} tools for agent ${agentId}`);

    res.json({
      success: true,
      agent_id: agentId,
      tools_count: registration.tools.length,
      mcp_identifier: agentId, // Used to identify agent in MCP requests
    });
  } catch (error) {
    console.error(`[API] Error registering tools:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/agents/:agentId/tools
 * List tools for an agent
 */
router.get('/agents/:agentId/tools', (req: Request, res: Response) => {
  const agentId = req.params.agentId;

  if (!agentId) {
    res.status(400).json({ success: false, error: 'Missing agentId parameter' });
    return;
  }

  console.log(`[API] GET /agents/${agentId}/tools`);

  try {
    const agent = ToolRegistry.getAgent(agentId);

    if (!agent) {
      res.status(404).json({
        success: false,
        error: `Agent ${agentId} not found`,
      });
      return;
    }

    res.json({
      success: true,
      agent_id: agentId,
      workspace_id: agent.workspace_id,
      partner_id: agent.partner_id,
      tools: agent.tools,
      created_at: agent.created_at,
      updated_at: agent.updated_at,
    });
  } catch (error) {
    console.error(`[API] Error getting tools:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/agents/:agentId/tools
 * Delete all tools for an agent
 */
router.delete('/agents/:agentId/tools', (req: Request, res: Response) => {
  const agentId = req.params.agentId;

  if (!agentId) {
    res.status(400).json({ success: false, error: 'Missing agentId parameter' });
    return;
  }

  console.log(`[API] DELETE /agents/${agentId}/tools`);

  try {
    const deleted = ToolRegistry.deleteAgent(agentId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: `Agent ${agentId} not found`,
      });
      return;
    }

    res.json({
      success: true,
      message: `Deleted all tools for agent ${agentId}`,
    });
  } catch (error) {
    console.error(`[API] Error deleting tools:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/agents/:agentId/tools/:toolName
 * Delete a specific tool from an agent
 */
router.delete('/agents/:agentId/tools/:toolName', (req: Request, res: Response) => {
  const agentId = req.params.agentId;
  const toolName = req.params.toolName;

  if (!agentId || !toolName) {
    res.status(400).json({ success: false, error: 'Missing agentId or toolName parameter' });
    return;
  }

  console.log(`[API] DELETE /agents/${agentId}/tools/${toolName}`);

  try {
    const deleted = ToolRegistry.removeTool(agentId, toolName);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: `Tool "${toolName}" not found for agent ${agentId}`,
      });
      return;
    }

    res.json({
      success: true,
      message: `Deleted tool "${toolName}" from agent ${agentId}`,
    });
  } catch (error) {
    console.error(`[API] Error deleting tool:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/agents/:agentId/tools/:toolName
 * Add or update a single tool for an agent
 */
router.put('/agents/:agentId/tools/:toolName', (req: Request, res: Response) => {
  const agentId = req.params.agentId;
  const toolName = req.params.toolName;

  if (!agentId || !toolName) {
    res.status(400).json({ success: false, error: 'Missing agentId or toolName parameter' });
    return;
  }

  console.log(`[API] PUT /agents/${agentId}/tools/${toolName}`);

  try {
    // Check if agent exists
    if (!ToolRegistry.hasAgent(agentId)) {
      res.status(404).json({
        success: false,
        error: `Agent ${agentId} not found. Register tools first with POST /agents/${agentId}/tools`,
      });
      return;
    }

    // Validate tool input
    const parseResult = ToolInputSchema.safeParse({
      ...req.body,
      name: toolName,
    });

    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid tool definition',
        details: parseResult.error.errors,
      });
      return;
    }

    // Add/update tool
    const tool = ToolRegistry.addTool(agentId, parseResult.data);

    if (!tool) {
      res.status(500).json({
        success: false,
        error: 'Failed to add tool',
      });
      return;
    }

    res.json({
      success: true,
      tool,
    });
  } catch (error) {
    console.error(`[API] Error adding tool:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// WORKSPACE & PARTNER QUERIES (Admin/Debug)
// ============================================================================

/**
 * GET /api/workspaces/:workspaceId/agents
 * List all agents in a workspace
 */
router.get('/workspaces/:workspaceId/agents', (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId;

  if (!workspaceId) {
    res.status(400).json({ success: false, error: 'Missing workspaceId parameter' });
    return;
  }

  console.log(`[API] GET /workspaces/${workspaceId}/agents`);

  try {
    const agents = ToolRegistry.getAgentsByWorkspace(workspaceId);

    res.json({
      success: true,
      workspace_id: workspaceId,
      agents: agents.map((a) => ({
        agent_id: a.agent_id,
        tools_count: a.tools.length,
        created_at: a.created_at,
        updated_at: a.updated_at,
      })),
    });
  } catch (error) {
    console.error(`[API] Error:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/partners/:partnerId/agents
 * List all agents for a partner
 */
router.get('/partners/:partnerId/agents', (req: Request, res: Response) => {
  const partnerId = req.params.partnerId;

  if (!partnerId) {
    res.status(400).json({ success: false, error: 'Missing partnerId parameter' });
    return;
  }

  console.log(`[API] GET /partners/${partnerId}/agents`);

  try {
    const agents = ToolRegistry.getAgentsByPartner(partnerId);

    res.json({
      success: true,
      partner_id: partnerId,
      agents: agents.map((a) => ({
        agent_id: a.agent_id,
        workspace_id: a.workspace_id,
        tools_count: a.tools.length,
        created_at: a.created_at,
        updated_at: a.updated_at,
      })),
    });
  } catch (error) {
    console.error(`[API] Error:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;


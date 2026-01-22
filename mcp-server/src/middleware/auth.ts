/**
 * Authentication Middleware
 * 
 * Validates API key for requests from:
 * 1. Next.js app (management API)
 * 2. Retell (MCP protocol requests)
 */

import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Read API key at runtime (not at module load time) to ensure dotenv has loaded
function getApiKey(): string {
  return process.env.MCP_API_KEY || '';
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Validate API key from Authorization header
 * Expects: Authorization: Bearer <api_key>
 */
export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = getApiKey();
  
  // Skip auth if no API key is configured
  if (!apiKey) {
    console.warn('[Auth] No API key configured, skipping authentication');
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Missing Authorization header',
    });
    return;
  }

  // Check Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Invalid Authorization header format. Expected: Bearer <api_key>',
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (token !== apiKey) {
    console.warn('[Auth] Invalid API key attempt');
    res.status(401).json({
      success: false,
      error: 'Invalid API key',
    });
    return;
  }

  next();
}

/**
 * Validate API key from query parameter
 * Used when auth header is not available (e.g., some webhook scenarios)
 * Expects: ?api_key=<api_key>
 */
export function authenticateQueryParam(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = getApiKey();
  
  // Skip auth if no API key is configured
  if (!apiKey) {
    console.warn('[Auth] No API key configured, skipping authentication');
    next();
    return;
  }

  const queryKey = req.query.api_key as string | undefined;
  const headerKey = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers.authorization;

  // Try multiple auth methods
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (headerKey) {
    token = headerKey;
  } else if (queryKey) {
    token = queryKey;
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Missing authentication. Provide Authorization header, X-API-Key header, or api_key query parameter',
    });
    return;
  }

  if (token !== apiKey) {
    console.warn('[Auth] Invalid API key attempt');
    res.status(401).json({
      success: false,
      error: 'Invalid API key',
    });
    return;
  }

  next();
}

/**
 * Optional authentication - doesn't block if no auth provided
 * Useful for endpoints that work with or without auth
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const apiKey = getApiKey();
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (apiKey && token === apiKey) {
      // @ts-expect-error - Adding authenticated flag to request
      req.authenticated = true;
    }
  }

  next();
}

/**
 * Validate that agent_id is provided in query params
 * Required for MCP protocol endpoints to identify the agent
 */
export function requireAgentId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const agentId = req.query.agent_id as string | undefined;

  if (!agentId) {
    res.status(400).json({
      success: false,
      error: 'Missing required query parameter: agent_id',
    });
    return;
  }

  // Store agent_id in request for later use
  // @ts-expect-error - Adding agentId to request
  req.agentId = agentId;
  
  next();
}

/**
 * Log request details (for debugging)
 */
export function requestLogger(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  console.log(`[Request] ${req.method} ${req.originalUrl}`);
  
  if (req.query && Object.keys(req.query).length > 0) {
    console.log(`[Request] Query:`, req.query);
  }
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[Request] Body:`, JSON.stringify(req.body, null, 2));
  }
  
  next();
}

export default {
  authenticateApiKey,
  authenticateQueryParam,
  optionalAuth,
  requireAgentId,
  requestLogger,
};


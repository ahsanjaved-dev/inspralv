/**
 * MCP Server Entry Point
 * 
 * Genius365 MCP Server - Handles custom tool execution for Retell AI agents.
 * 
 * This server provides:
 * 1. MCP Protocol endpoints (for Retell to query and execute tools)
 * 2. Management API endpoints (for Next.js app to register tools)
 * 
 * Each agent's tools are isolated - one agent cannot access another's tools.
 */

import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import mcpRoutes from './routes/mcp.js';
import apiRoutes from './routes/api.js';
import { requestLogger } from './middleware/auth.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app: Application = express();

// Security middleware
app.use(helmet({
  // Allow cross-origin requests (Retell needs to call this server)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: NODE_ENV === 'development' 
    ? '*' 
    : [
        process.env.NEXTJS_URL || 'https://genius365.ai',
        'https://api.retellai.com',
      ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-MCP-Tool', 'X-MCP-Call-ID'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (in development)
if (NODE_ENV === 'development') {
  app.use(requestLogger);
}

// ============================================================================
// ROUTES
// ============================================================================

// Root health check
app.get('/', (_req, res) => {
  res.json({
    name: 'Genius365 MCP Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      mcp: '/mcp',
      api: '/api',
    },
  });
});

// MCP Protocol routes (called by Retell)
// These do NOT require API key auth (Retell authenticates via query params configured in mcps array)
app.use('/mcp', mcpRoutes);

// Management API routes (called by Next.js app)
// These require API key authentication
app.use('/api', apiRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// ============================================================================
// SERVER START
// ============================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   🚀 Genius365 MCP Server                                  ║');
  console.log('║                                                            ║');
  console.log(`║   Environment: ${NODE_ENV.padEnd(42)}║`);
  console.log(`║   Port: ${PORT.toString().padEnd(48)}║`);
  console.log('║                                                            ║');
  console.log('║   Endpoints:                                               ║');
  console.log(`║   - MCP Protocol:  http://localhost:${PORT}/mcp               ║`);
  console.log(`║   - Management API: http://localhost:${PORT}/api              ║`);
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;


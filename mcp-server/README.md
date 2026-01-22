# Genius365 MCP Server

MCP (Model Context Protocol) server for custom tool execution with Retell AI agents.

## Overview

This server provides:
1. **MCP Protocol endpoints** - Called by Retell to list and execute custom tools
2. **Management API** - Called by the Next.js app to register/manage tools

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│                 │     │                 │     │              │
│  Next.js App    │────▶│  MCP Server     │◀────│  Retell AI   │
│  (Genius365)    │     │  (This server)  │     │              │
│                 │     │                 │     │              │
└─────────────────┘     └─────────────────┘     └──────────────┘
        │                       │                      │
  Register tools          Store tools           Execute tools
  via /api               in registry            via /mcp
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Edit .env with your API key
# MCP_API_KEY=your-secret-key

# Run development server
npm run dev
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

## Endpoints

### MCP Protocol (for Retell)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mcp/tools?agent_id=xxx` | List available tools for an agent |
| POST | `/mcp/execute?agent_id=xxx` | Execute a tool |

### Management API (for Next.js)

All management endpoints require `Authorization: Bearer <API_KEY>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Registry statistics |
| POST | `/api/agents/:agentId/tools` | Register tools for an agent |
| GET | `/api/agents/:agentId/tools` | List tools for an agent |
| DELETE | `/api/agents/:agentId/tools` | Delete all tools for an agent |
| DELETE | `/api/agents/:agentId/tools/:name` | Delete a specific tool |

## Tool Registration

To register tools for an agent:

```bash
curl -X POST http://localhost:3001/api/agents/agent_123/tools \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "partner_id": "partner_1",
    "workspace_id": "workspace_1",
    "tools": [
      {
        "name": "book_appointment",
        "description": "Book an appointment for the caller",
        "parameters": {
          "type": "object",
          "properties": {
            "date": { "type": "string", "description": "Date in YYYY-MM-DD format" },
            "time": { "type": "string", "description": "Time in HH:MM format" },
            "name": { "type": "string", "description": "Customer name" }
          },
          "required": ["date", "time", "name"]
        },
        "webhook_url": "https://your-app.com/api/webhooks/book-appointment"
      }
    ]
  }'
```

## Retell Integration

When configuring an agent in Retell, add the MCP server to the `mcps` array:

```json
{
  "mcps": [{
    "name": "genius365-mcp",
    "url": "https://your-mcp-server.com/mcp",
    "query_params": {
      "agent_id": "agent_123"
    },
    "headers": {
      "Authorization": "Bearer your-api-key"
    },
    "timeout_ms": 30000
  }]
}
```

## Agent Isolation

Each agent's tools are isolated by `agent_id`. When Retell calls the MCP server:
1. It includes `agent_id` in the query parameters
2. The server only returns/executes tools registered for that specific agent
3. One agent cannot access another agent's tools

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `MCP_API_KEY` | API key for authentication | (required in production) |

## Deployment

This server can be deployed to:
- **Railway** - `railway up`
- **Render** - Connect GitHub repo
- **Fly.io** - `flyctl deploy`
- **Docker** - Build and run container

## License

MIT


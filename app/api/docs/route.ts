/**
 * GET /api/docs
 * Returns the OpenAPI specification document as JSON
 * 
 * NOTE: Dynamic OpenAPI generation is temporarily disabled due to
 * @asteasolutions/zod-to-openapi incompatibility with Zod v4.
 * Using a static spec until the library is updated.
 */

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Static OpenAPI spec until zod-to-openapi supports Zod v4
const staticOpenAPIDocument = {
  openapi: "3.0.0",
  info: {
    title: "Genius365 API",
    version: "1.0.0",
    description: `
# Genius365 API Documentation

Genius365 is a white-label voice AI platform that enables agencies to deploy intelligent voice agents for their clients.

## Authentication

All API endpoints require authentication using a Bearer token. Include your access token in the Authorization header:

\`\`\`
Authorization: Bearer <your_access_token>
\`\`\`

## Rate Limiting

API requests are rate limited based on your plan tier:
- Free: 100 requests/minute
- Pro: 500 requests/minute
- Enterprise: Custom limits

## Error Handling

The API uses standard HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request (validation error)
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Too Many Requests
- 500: Internal Server Error
    `,
    contact: {
      name: "API Support",
      email: "support@genius365.ai",
    },
  },
  servers: [
    {
      url: "https://app.genius365.ai",
      description: "Production",
    },
    {
      url: "http://localhost:3000",
      description: "Local Development",
    },
  ],
  tags: [
    {
      name: "Agents",
      description: "Voice AI agent management",
    },
    {
      name: "Conversations",
      description: "Call logs and conversation data",
    },
    {
      name: "Workspaces",
      description: "Workspace management",
    },
    {
      name: "Campaigns",
      description: "Outbound calling campaigns",
    },
    {
      name: "Billing",
      description: "Credits and billing management",
    },
  ],
  paths: {
    "/api/w/{workspaceSlug}/agents": {
      get: {
        summary: "List agents",
        description: "Get all agents in a workspace",
        tags: ["Agents"],
        parameters: [
          {
            name: "workspaceSlug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Workspace slug",
          },
          {
            name: "provider",
            in: "query",
            schema: { type: "string", enum: ["vapi", "retell"] },
          },
          {
            name: "is_active",
            in: "query",
            schema: { type: "boolean" },
          },
        ],
        responses: {
          "200": {
            description: "List of agents",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    agents: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Agent" },
                    },
                    total: { type: "number" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      post: {
        summary: "Create agent",
        description: "Create a new voice AI agent",
        tags: ["Agents"],
        parameters: [
          {
            name: "workspaceSlug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Workspace slug",
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateAgent" },
            },
          },
        },
        responses: {
          "201": {
            description: "Agent created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Agent" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/w/{workspaceSlug}/calls": {
      get: {
        summary: "List conversations",
        description: "Get call logs and conversations for a workspace",
        tags: ["Conversations"],
        parameters: [
          {
            name: "workspaceSlug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Workspace slug",
          },
        ],
        responses: {
          "200": {
            description: "List of conversations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    calls: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Conversation" },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/partner/workspaces": {
      get: {
        summary: "List workspaces",
        description: "Get all workspaces for the current partner",
        tags: ["Workspaces"],
        responses: {
          "200": {
            description: "List of workspaces",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    workspaces: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Workspace" },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      post: {
        summary: "Create workspace",
        description: "Create a new workspace under the current partner",
        tags: ["Workspaces"],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateWorkspace" },
            },
          },
        },
        responses: {
          "201": {
            description: "Workspace created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Workspace" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", description: "Error message" },
          code: { type: "string", description: "Error code" },
          details: { type: "object", description: "Additional error details" },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "number", description: "Current page number" },
          page_size: { type: "number", description: "Items per page" },
          total: { type: "number", description: "Total number of items" },
          total_pages: { type: "number", description: "Total number of pages" },
        },
      },
      Agent: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          provider: { type: "string", enum: ["vapi", "retell"] },
          is_active: { type: "boolean" },
          sync_status: { type: "string", enum: ["not_synced", "pending", "synced", "error"] },
          external_agent_id: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      CreateAgent: {
        type: "object",
        required: ["name", "provider"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 40 },
          description: { type: "string" },
          provider: { type: "string", enum: ["vapi", "retell"] },
          is_active: { type: "boolean", default: true },
        },
      },
      Workspace: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          partner_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: "string", nullable: true },
          status: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      CreateWorkspace: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
      },
      Conversation: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          workspace_id: { type: "string", format: "uuid" },
          agent_id: { type: "string", format: "uuid", nullable: true },
          direction: { type: "string", enum: ["inbound", "outbound"] },
          status: {
            type: "string",
            enum: ["initiated", "ringing", "in_progress", "completed", "failed", "no_answer", "busy", "canceled"],
          },
          phone_number: { type: "string", nullable: true },
          duration_seconds: { type: "number" },
          total_cost: { type: "number" },
          transcript: { type: "string", nullable: true },
          summary: { type: "string", nullable: true },
          sentiment: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
}

export async function GET() {
  return NextResponse.json(staticOpenAPIDocument, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

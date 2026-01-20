/**
 * OpenAPI Specification Generator
 * Generates OpenAPI 3.0 spec from the application's API routes and Zod schemas
 */

import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi"
import { z } from "zod"
import {
  createWorkspaceAgentSchema,
  updateWorkspaceAgentSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  conversationFiltersSchema,
  updateConversationSchema,
  inviteWorkspaceMemberSchema,
  invitePartnerMemberSchema,
} from "@/types/api.types"

// ============================================================================
// REGISTRY SETUP
// ============================================================================

export const registry = new OpenAPIRegistry()

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

// Error response
const errorResponseSchema = z.object({
  error: z.string().describe("Error message"),
  code: z.string().optional().describe("Error code"),
  details: z.record(z.unknown()).optional().describe("Additional error details"),
})

registry.register("ErrorResponse", errorResponseSchema)

// Pagination response
const paginationSchema = z.object({
  page: z.number().describe("Current page number"),
  page_size: z.number().describe("Items per page"),
  total: z.number().describe("Total number of items"),
  total_pages: z.number().describe("Total number of pages"),
})

registry.register("Pagination", paginationSchema)

// ============================================================================
// AGENT SCHEMAS
// ============================================================================

registry.register("CreateAgent", createWorkspaceAgentSchema)
registry.register("UpdateAgent", updateWorkspaceAgentSchema)

const agentResponseSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  provider: z.enum(["vapi", "retell"]),
  is_active: z.boolean(),
  sync_status: z.enum(["not_synced", "pending", "synced", "error"]),
  external_agent_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

registry.register("Agent", agentResponseSchema)

// ============================================================================
// WORKSPACE SCHEMAS
// ============================================================================

registry.register("CreateWorkspace", createWorkspaceSchema)
registry.register("UpdateWorkspace", updateWorkspaceSchema)

const workspaceResponseSchema = z.object({
  id: z.string().uuid(),
  partner_id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

registry.register("Workspace", workspaceResponseSchema)

// ============================================================================
// CONVERSATION SCHEMAS
// ============================================================================

registry.register("ConversationFilters", conversationFiltersSchema)
registry.register("UpdateConversation", updateConversationSchema)

const conversationResponseSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  agent_id: z.string().uuid().nullable(),
  direction: z.enum(["inbound", "outbound"]),
  status: z.enum(["initiated", "ringing", "in_progress", "completed", "failed", "no_answer", "busy", "canceled"]),
  phone_number: z.string().nullable(),
  duration_seconds: z.number(),
  total_cost: z.number(),
  transcript: z.string().nullable(),
  summary: z.string().nullable(),
  sentiment: z.string().nullable(),
  created_at: z.string(),
})

registry.register("Conversation", conversationResponseSchema)

// ============================================================================
// MEMBER SCHEMAS
// ============================================================================

registry.register("InviteWorkspaceMember", inviteWorkspaceMemberSchema)
registry.register("InvitePartnerMember", invitePartnerMemberSchema)

// ============================================================================
// API PATHS
// ============================================================================

// Agents
registry.registerPath({
  method: "get",
  path: "/api/w/{workspaceSlug}/agents",
  summary: "List agents",
  description: "Get all agents in a workspace",
  tags: ["Agents"],
  request: {
    params: z.object({
      workspaceSlug: z.string().describe("Workspace slug"),
    }),
    query: z.object({
      provider: z.enum(["vapi", "retell"]).optional(),
      is_active: z.boolean().optional(),
    }),
  },
  responses: {
    200: {
      description: "List of agents",
      content: {
        "application/json": {
          schema: z.object({
            agents: z.array(agentResponseSchema),
            total: z.number(),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: "post",
  path: "/api/w/{workspaceSlug}/agents",
  summary: "Create agent",
  description: "Create a new voice AI agent",
  tags: ["Agents"],
  request: {
    params: z.object({
      workspaceSlug: z.string().describe("Workspace slug"),
    }),
    body: {
      content: {
        "application/json": {
          schema: createWorkspaceAgentSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Agent created",
      content: {
        "application/json": {
          schema: agentResponseSchema,
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

// Conversations
registry.registerPath({
  method: "get",
  path: "/api/w/{workspaceSlug}/calls",
  summary: "List conversations",
  description: "Get call logs and conversations for a workspace",
  tags: ["Conversations"],
  request: {
    params: z.object({
      workspaceSlug: z.string().describe("Workspace slug"),
    }),
    query: conversationFiltersSchema,
  },
  responses: {
    200: {
      description: "List of conversations",
      content: {
        "application/json": {
          schema: z.object({
            calls: z.array(conversationResponseSchema),
            pagination: paginationSchema,
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

// Workspaces
registry.registerPath({
  method: "get",
  path: "/api/partner/workspaces",
  summary: "List workspaces",
  description: "Get all workspaces for the current partner",
  tags: ["Workspaces"],
  responses: {
    200: {
      description: "List of workspaces",
      content: {
        "application/json": {
          schema: z.object({
            workspaces: z.array(workspaceResponseSchema),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: "post",
  path: "/api/partner/workspaces",
  summary: "Create workspace",
  description: "Create a new workspace under the current partner",
  tags: ["Workspaces"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createWorkspaceSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Workspace created",
      content: {
        "application/json": {
          schema: workspaceResponseSchema,
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

// ============================================================================
// GENERATE OPENAPI DOCUMENT
// ============================================================================

export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions)

  return generator.generateDocument({
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
    security: [
      {
        bearerAuth: [],
      },
    ],
  })
}

// Export the generated document
export const openAPIDocument = generateOpenAPIDocument()


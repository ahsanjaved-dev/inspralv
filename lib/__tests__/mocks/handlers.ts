/**
 * MSW Request Handlers
 * Mock API handlers for testing
 */

import { http, HttpResponse } from "msw"

const API_BASE = "/api"

// Workspace API handlers
const workspaceHandlers = [
  // List agents
  http.get(`${API_BASE}/w/:workspaceSlug/agents`, () => {
    return HttpResponse.json({
      agents: [
        {
          id: "agent-1",
          name: "Test Agent 1",
          provider: "vapi",
          is_active: true,
          sync_status: "synced",
        },
        {
          id: "agent-2",
          name: "Test Agent 2",
          provider: "retell",
          is_active: true,
          sync_status: "synced",
        },
      ],
      total: 2,
    })
  }),

  // Get single agent
  http.get(`${API_BASE}/w/:workspaceSlug/agents/:agentId`, ({ params }) => {
    return HttpResponse.json({
      id: params.agentId,
      name: "Test Agent",
      provider: "vapi",
      is_active: true,
      sync_status: "synced",
      config: {},
    })
  }),

  // Create agent
  http.post(`${API_BASE}/w/:workspaceSlug/agents`, async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      id: "new-agent-id",
      ...body,
      sync_status: "pending",
      created_at: new Date().toISOString(),
    })
  }),

  // List calls
  http.get(`${API_BASE}/w/:workspaceSlug/calls`, () => {
    return HttpResponse.json({
      calls: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
  }),

  // List campaigns
  http.get(`${API_BASE}/w/:workspaceSlug/campaigns`, () => {
    return HttpResponse.json({
      campaigns: [],
      total: 0,
    })
  }),
]

// Auth API handlers
const authHandlers = [
  http.get(`${API_BASE}/auth/me`, () => {
    return HttpResponse.json({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        first_name: "Test",
        last_name: "User",
      },
      partner: {
        id: "test-partner-id",
        name: "Test Partner",
        slug: "test-partner",
      },
      workspaces: [],
    })
  }),
]

// Partner API handlers
const partnerHandlers = [
  // List partner integrations
  http.get(`${API_BASE}/partner/integrations`, () => {
    return HttpResponse.json({
      integrations: [
        {
          id: "int-1",
          provider: "vapi",
          name: "VAPI Production",
          is_active: true,
        },
      ],
    })
  }),
]

// Billing API handlers
const billingHandlers = [
  // Get workspace credits
  http.get(`${API_BASE}/w/:workspaceSlug/billing/credits`, () => {
    return HttpResponse.json({
      balance_cents: 10000,
      low_balance_threshold_cents: 500,
    })
  }),
]

// Export all handlers
export const handlers = [
  ...workspaceHandlers,
  ...authHandlers,
  ...partnerHandlers,
  ...billingHandlers,
]


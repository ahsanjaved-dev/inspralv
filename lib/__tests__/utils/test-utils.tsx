/**
 * Test Utilities
 * Common utilities and wrappers for testing React components
 */

import React, { ReactElement } from "react"
import { render, RenderOptions } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Create a new QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

// Wrapper component with all providers
interface ProvidersProps {
  children: React.ReactNode
}

function AllProviders({ children }: ProvidersProps) {
  const queryClient = createTestQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

// Custom render function that includes providers
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Re-export everything from testing library
export * from "@testing-library/react"

// Override render with custom render
export { customRender as render }

// Helper to wait for async operations
export const waitForLoadingToFinish = () =>
  new Promise((resolve) => setTimeout(resolve, 0))

// Mock data factories
export const createMockUser = (overrides = {}) => ({
  id: "test-user-id",
  email: "test@example.com",
  first_name: "Test",
  last_name: "User",
  avatar_url: null,
  ...overrides,
})

export const createMockWorkspace = (overrides = {}) => ({
  id: "test-workspace-id",
  name: "Test Workspace",
  slug: "test-workspace",
  partner_id: "test-partner-id",
  description: "A test workspace",
  status: "active",
  resource_limits: {},
  role: "owner" as const,
  is_partner_admin_access: false,
  created_at: new Date().toISOString(),
  ...overrides,
})

export const createMockPartner = (overrides = {}) => ({
  id: "test-partner-id",
  name: "Test Partner",
  slug: "test-partner",
  is_platform_partner: false,
  branding: {},
  ...overrides,
})

export const createMockAgent = (overrides = {}) => ({
  id: "test-agent-id",
  workspace_id: "test-workspace-id",
  name: "Test Agent",
  description: "A test voice agent",
  provider: "vapi" as const,
  is_active: true,
  sync_status: "synced" as const,
  config: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

export const createMockConversation = (overrides = {}) => ({
  id: "test-conversation-id",
  workspace_id: "test-workspace-id",
  agent_id: "test-agent-id",
  direction: "inbound" as const,
  status: "completed" as const,
  phone_number: "+1234567890",
  duration_seconds: 120,
  total_cost: 0.50,
  created_at: new Date().toISOString(),
  ...overrides,
})

export const createMockCampaign = (overrides = {}) => ({
  id: "test-campaign-id",
  workspace_id: "test-workspace-id",
  agent_id: "test-agent-id",
  name: "Test Campaign",
  status: "draft" as const,
  total_recipients: 0,
  completed_calls: 0,
  successful_calls: 0,
  failed_calls: 0,
  created_at: new Date().toISOString(),
  ...overrides,
})


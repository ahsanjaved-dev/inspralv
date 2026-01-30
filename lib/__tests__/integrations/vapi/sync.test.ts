/**
 * Tests for VAPI Agent Sync logic
 * Tests sync conditions, API key retrieval, and sync operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AIAgent } from "@/types/database.types"

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock the supabase client
const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    update: vi.fn().mockReturnThis(),
  })),
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock VAPI config functions
vi.mock("@/lib/integrations/vapi/agent/config", () => ({
  createVapiAgentWithKey: vi.fn(),
  updateVapiAgentWithKey: vi.fn(),
  deleteVapiAgentWithKey: vi.fn(),
}))

// Mock VAPI response processor
vi.mock("@/lib/integrations/vapi/agent/response", () => ({
  processVapiResponse: vi.fn(),
  processDeleteResponse: vi.fn(),
}))

// Mock VAPI mapper
vi.mock("@/lib/integrations/vapi/agent/mapper", () => ({
  mapToVapi: vi.fn(() => ({
    name: "Test Agent",
    model: { model: "gpt-4" },
    voice: { voiceId: "test-voice" },
  })),
}))

// Mock function tools sync
vi.mock("@/lib/integrations/function_tools/vapi/api/sync", () => ({
  syncVapiFunctionTools: vi.fn(() => ({
    tools: [],
    errors: [],
  })),
}))

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}))

// =============================================================================
// TEST DATA
// =============================================================================

const createMockAgent = (overrides: Partial<AIAgent> = {}): AIAgent => ({
  id: "agent-123",
  workspace_id: "workspace-456",
  name: "Test VAPI Agent",
  description: "A test agent",
  provider: "vapi",
  is_active: true,
  sync_status: "pending",
  external_agent_id: null,
  external_phone_number: null,
  config: {
    voice_id: "test-voice",
    model: "gpt-4",
  },
  tags: [],
  version: 1,
  total_conversations: 0,
  total_minutes: 0,
  total_cost: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_by: null,
  deleted_at: null,
  last_synced_at: null,
  last_sync_error: null,
  last_conversation_at: null,
  needs_resync: false,
  model_provider: null,
  voice_provider: null,
  transcriber_provider: null,
  retell_llm_id: null,
  agent_public_api_key: null,
  agent_secret_api_key: null,
  agent_direction: "inbound",
  allow_outbound: false,
  assigned_phone_number_id: null,
  ...overrides,
} as AIAgent)

// =============================================================================
// SHOULD SYNC TO VAPI TESTS
// =============================================================================

describe("VAPI Sync - shouldSyncToVapi", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return true for VAPI agents", async () => {
    const { shouldSyncToVapi } = await import("@/lib/integrations/vapi/agent/sync")
    const agent = createMockAgent({ provider: "vapi" })
    
    expect(shouldSyncToVapi(agent)).toBe(true)
  })

  it("should return false for Retell agents", async () => {
    const { shouldSyncToVapi } = await import("@/lib/integrations/vapi/agent/sync")
    const agent = createMockAgent({ provider: "retell" })
    
    expect(shouldSyncToVapi(agent)).toBe(false)
  })

  it("should return false for agents with unknown provider", async () => {
    const { shouldSyncToVapi } = await import("@/lib/integrations/vapi/agent/sync")
    const agent = createMockAgent({ provider: "unknown" as any })
    
    expect(shouldSyncToVapi(agent)).toBe(false)
  })
})

// =============================================================================
// SAFE VAPI SYNC TESTS
// =============================================================================

describe("VAPI Sync - safeVapiSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Non-VAPI agents", () => {
    it("should return success without syncing for Retell agents", async () => {
      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent({ provider: "retell" })

      const result = await safeVapiSync(agent, "create")

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe("Missing API key", () => {
    it("should return error when no API key is configured", async () => {
      // Setup mock to return no integration assignment
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "No rows" },
        }),
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent()

      const result = await safeVapiSync(agent, "create")

      expect(result.success).toBe(false)
      expect(result.error).toContain("No VAPI API key configured")
    })
  })

  describe("Create operation", () => {
    it("should create agent when API key is available", async () => {
      // Setup mock to return valid integration assignment
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: {
                default_secret_key: "sk_test_123",
                default_public_key: "pk_test_123",
              },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { createVapiAgentWithKey } = await import("@/lib/integrations/vapi/agent/config")
      const { processVapiResponse } = await import("@/lib/integrations/vapi/agent/response")

      vi.mocked(createVapiAgentWithKey).mockResolvedValue({
        success: true,
        data: { id: "vapi-agent-123", name: "Test Agent" },
      })

      vi.mocked(processVapiResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "vapi-agent-123" }),
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent()

      const result = await safeVapiSync(agent, "create")

      expect(result.success).toBe(true)
      expect(createVapiAgentWithKey).toHaveBeenCalledWith(
        expect.any(Object),
        "sk_test_123"
      )
    })
  })

  describe("Update operation", () => {
    it("should create agent if no external_agent_id exists", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "sk_test_123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { createVapiAgentWithKey } = await import("@/lib/integrations/vapi/agent/config")
      const { processVapiResponse } = await import("@/lib/integrations/vapi/agent/response")

      vi.mocked(createVapiAgentWithKey).mockResolvedValue({
        success: true,
        data: { id: "vapi-agent-new", name: "Test Agent" },
      })

      vi.mocked(processVapiResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "vapi-agent-new" }),
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent({ external_agent_id: null })

      const result = await safeVapiSync(agent, "update")

      expect(result.success).toBe(true)
      expect(createVapiAgentWithKey).toHaveBeenCalled()
    })

    it("should update agent if external_agent_id exists", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "sk_test_123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { updateVapiAgentWithKey } = await import("@/lib/integrations/vapi/agent/config")
      const { processVapiResponse } = await import("@/lib/integrations/vapi/agent/response")

      vi.mocked(updateVapiAgentWithKey).mockResolvedValue({
        success: true,
        data: { id: "vapi-agent-existing", name: "Updated Agent" },
      })

      vi.mocked(processVapiResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "vapi-agent-existing" }),
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent({ external_agent_id: "vapi-agent-existing" })

      const result = await safeVapiSync(agent, "update")

      expect(result.success).toBe(true)
      expect(updateVapiAgentWithKey).toHaveBeenCalledWith(
        "vapi-agent-existing",
        expect.any(Object),
        "sk_test_123"
      )
    })

    it("should fallback to create if update fails", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "sk_test_123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { updateVapiAgentWithKey, createVapiAgentWithKey } = await import("@/lib/integrations/vapi/agent/config")
      const { processVapiResponse } = await import("@/lib/integrations/vapi/agent/response")

      vi.mocked(updateVapiAgentWithKey).mockResolvedValue({
        success: false,
        error: "Agent not found on VAPI",
      })

      vi.mocked(createVapiAgentWithKey).mockResolvedValue({
        success: true,
        data: { id: "vapi-agent-recreated", name: "Recreated Agent" },
      })

      vi.mocked(processVapiResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "vapi-agent-recreated" }),
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent({ external_agent_id: "vapi-agent-stale" })

      const result = await safeVapiSync(agent, "update")

      expect(result.success).toBe(true)
      expect(createVapiAgentWithKey).toHaveBeenCalled()
    })
  })

  describe("Delete operation", () => {
    it("should return success if no external_agent_id to delete", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "sk_test_123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { deleteVapiAgentWithKey } = await import("@/lib/integrations/vapi/agent/config")
      
      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent({ external_agent_id: null })

      const result = await safeVapiSync(agent, "delete")

      expect(result.success).toBe(true)
      expect(deleteVapiAgentWithKey).not.toHaveBeenCalled()
    })

    it("should delete agent if external_agent_id exists", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "sk_test_123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { deleteVapiAgentWithKey } = await import("@/lib/integrations/vapi/agent/config")
      const { processDeleteResponse } = await import("@/lib/integrations/vapi/agent/response")

      vi.mocked(deleteVapiAgentWithKey).mockResolvedValue({
        success: true,
      })

      vi.mocked(processDeleteResponse).mockResolvedValue({
        success: true,
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent({ external_agent_id: "vapi-agent-to-delete" })

      const result = await safeVapiSync(agent, "delete")

      expect(result.success).toBe(true)
      expect(deleteVapiAgentWithKey).toHaveBeenCalledWith(
        "vapi-agent-to-delete",
        "sk_test_123"
      )
    })
  })

  describe("Error handling", () => {
    it("should return error when API key retrieval fails", async () => {
      // When getVapiApiKeyForAgent catches an exception, it returns null
      // which results in "No VAPI API key configured" error
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error("Database connection failed")
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent()

      const result = await safeVapiSync(agent, "create")

      // The error is caught in getVapiApiKeyForAgent which returns null
      // leading to the "No VAPI API key configured" message
      expect(result.success).toBe(false)
      expect(result.error).toContain("No VAPI API key configured")
    })

    it("should handle invalid sync operation", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "sk_test_123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
      const agent = createMockAgent()

      const result = await safeVapiSync(agent, "invalid" as any)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Invalid sync operation")
    })
  })
})

// =============================================================================
// API KEY RETRIEVAL TESTS
// =============================================================================

describe("VAPI Sync - API Key Retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle agent without workspace_id", async () => {
    const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
    const agent = createMockAgent({ workspace_id: null })

    const result = await safeVapiSync(agent, "create")

    expect(result.success).toBe(false)
    expect(result.error).toContain("No VAPI API key configured")
  })

  it("should handle inactive integration", async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          partner_integration: {
            id: "int-1",
            api_keys: { default_secret_key: "sk_test_123" },
            is_active: false, // Inactive
          },
        },
        error: null,
      }),
    })

    const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
    const agent = createMockAgent()

    const result = await safeVapiSync(agent, "create")

    expect(result.success).toBe(false)
    expect(result.error).toContain("No VAPI API key configured")
  })

  it("should handle missing secret key", async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          partner_integration: {
            id: "int-1",
            api_keys: { default_public_key: "pk_test_123" }, // No secret key
            is_active: true,
          },
        },
        error: null,
      }),
    })

    const { safeVapiSync } = await import("@/lib/integrations/vapi/agent/sync")
    const agent = createMockAgent()

    const result = await safeVapiSync(agent, "create")

    expect(result.success).toBe(false)
    expect(result.error).toContain("No VAPI API key configured")
  })
})


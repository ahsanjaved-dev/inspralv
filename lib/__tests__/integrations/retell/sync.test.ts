/**
 * Tests for Retell Agent Sync logic
 * Tests sync conditions, LLM creation, and agent sync operations
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AIAgent, FunctionTool } from "@/types/database.types"

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock the supabase client
const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  })),
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock Retell config functions
vi.mock("@/lib/integrations/retell/agent/config", () => ({
  createRetellLLMWithKey: vi.fn(),
  updateRetellLLMWithKey: vi.fn(),
  deleteRetellLLMWithKey: vi.fn(),
  createRetellAgentWithKey: vi.fn(),
  updateRetellAgentWithKey: vi.fn(),
  deleteRetellAgentWithKey: vi.fn(),
  getMCPToolsWithKey: vi.fn(),
}))

// Mock Retell response processor
vi.mock("@/lib/integrations/retell/agent/response", () => ({
  processRetellResponse: vi.fn(),
  processRetellDeleteResponse: vi.fn(),
}))

// Mock Retell mapper
vi.mock("@/lib/integrations/retell/agent/mapper", () => ({
  mapToRetellLLM: vi.fn(() => ({
    model: "gpt-4",
    general_prompt: "You are a helpful assistant",
  })),
  mapToRetellAgent: vi.fn((agent, llmId) => ({
    agent_name: agent.name,
    response_engine: { type: "retell_llm", llm_id: llmId },
  })),
}))

// Mock MCP client
vi.mock("@/lib/integrations/mcp", () => ({
  mcpClient: {
    registerTools: vi.fn(() => ({ success: true })),
    deleteTools: vi.fn(() => ({ success: true })),
  },
  convertToMCPTool: vi.fn((tool) => tool),
  isMCPConfigured: vi.fn(() => true),
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
  name: "Test Retell Agent",
  description: "A test agent",
  provider: "retell",
  is_active: true,
  sync_status: "pending",
  external_agent_id: null,
  external_phone_number: null,
  config: {
    voice_id: "test-voice",
    model: "gpt-4",
    retell_llm_id: null,
    tools: [],
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

const createMockTool = (overrides: Partial<FunctionTool> = {}): FunctionTool => ({
  id: "tool-1",
  name: "get_weather",
  description: "Get the weather",
  tool_type: "function",
  enabled: true,
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "The city name" },
    },
    required: ["city"],
  },
  webhook_url: "https://example.com/webhook",
  ...overrides,
} as FunctionTool)

// =============================================================================
// SHOULD SYNC TO RETELL TESTS
// =============================================================================

describe("Retell Sync - shouldSyncToRetell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return true for Retell agents", async () => {
    const { shouldSyncToRetell } = await import("@/lib/integrations/retell/agent/sync")
    const agent = createMockAgent({ provider: "retell" })
    
    expect(shouldSyncToRetell(agent)).toBe(true)
  })

  it("should return false for VAPI agents", async () => {
    const { shouldSyncToRetell } = await import("@/lib/integrations/retell/agent/sync")
    const agent = createMockAgent({ provider: "vapi" })
    
    expect(shouldSyncToRetell(agent)).toBe(false)
  })
})

// =============================================================================
// SAFE RETELL SYNC TESTS
// =============================================================================

describe("Retell Sync - safeRetellSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("Non-Retell agents", () => {
    it("should return success without syncing for VAPI agents", async () => {
      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent({ provider: "vapi" })

      const result = await safeRetellSync(agent, "create")

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe("Missing API key", () => {
    it("should return error when no API key is configured", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "No rows" },
        }),
      })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent()

      const result = await safeRetellSync(agent, "create")

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Retell API key configured")
    })
  })

  describe("Create operation", () => {
    it("should create LLM then Agent when API key is available", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const {
        createRetellLLMWithKey,
        createRetellAgentWithKey,
      } = await import("@/lib/integrations/retell/agent/config")
      const { processRetellResponse } = await import("@/lib/integrations/retell/agent/response")

      vi.mocked(createRetellLLMWithKey).mockResolvedValue({
        success: true,
        data: { llm_id: "llm-123" },
      })

      vi.mocked(createRetellAgentWithKey).mockResolvedValue({
        success: true,
        data: { agent_id: "retell-agent-123" },
      })

      vi.mocked(processRetellResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "retell-agent-123" }),
      })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent()

      const result = await safeRetellSync(agent, "create")

      expect(result.success).toBe(true)
      expect(createRetellLLMWithKey).toHaveBeenCalledWith(
        expect.any(Object),
        "retell_sk_test123"
      )
      expect(createRetellAgentWithKey).toHaveBeenCalledWith(
        expect.any(Object),
        "retell_sk_test123"
      )
    })

    it("should cleanup LLM if agent creation fails", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const {
        createRetellLLMWithKey,
        createRetellAgentWithKey,
        deleteRetellLLMWithKey,
      } = await import("@/lib/integrations/retell/agent/config")

      vi.mocked(createRetellLLMWithKey).mockResolvedValue({
        success: true,
        data: { llm_id: "llm-orphan" },
      })

      vi.mocked(createRetellAgentWithKey).mockResolvedValue({
        success: false,
        error: "Agent creation failed",
      })

      vi.mocked(deleteRetellLLMWithKey).mockResolvedValue({ success: true })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent()

      const result = await safeRetellSync(agent, "create")

      expect(result.success).toBe(false)
      expect(deleteRetellLLMWithKey).toHaveBeenCalledWith("llm-orphan", "retell_sk_test123")
    })
  })

  describe("Update operation", () => {
    it("should fallback to create if no external_agent_id", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const {
        createRetellLLMWithKey,
        createRetellAgentWithKey,
      } = await import("@/lib/integrations/retell/agent/config")
      const { processRetellResponse } = await import("@/lib/integrations/retell/agent/response")

      vi.mocked(createRetellLLMWithKey).mockResolvedValue({
        success: true,
        data: { llm_id: "llm-new" },
      })

      vi.mocked(createRetellAgentWithKey).mockResolvedValue({
        success: true,
        data: { agent_id: "retell-agent-new" },
      })

      vi.mocked(processRetellResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "retell-agent-new" }),
      })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent({ external_agent_id: null })

      const result = await safeRetellSync(agent, "update")

      expect(result.success).toBe(true)
      expect(createRetellLLMWithKey).toHaveBeenCalled()
      expect(createRetellAgentWithKey).toHaveBeenCalled()
    })

    it("should update both LLM and Agent if IDs exist", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const {
        updateRetellLLMWithKey,
        updateRetellAgentWithKey,
      } = await import("@/lib/integrations/retell/agent/config")
      const { processRetellResponse } = await import("@/lib/integrations/retell/agent/response")

      vi.mocked(updateRetellLLMWithKey).mockResolvedValue({
        success: true,
        data: { llm_id: "llm-existing" },
      })

      vi.mocked(updateRetellAgentWithKey).mockResolvedValue({
        success: true,
        data: { agent_id: "retell-agent-existing" },
      })

      vi.mocked(processRetellResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "retell-agent-existing" }),
      })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent({
        external_agent_id: "retell-agent-existing",
        config: {
          retell_llm_id: "llm-existing",
        },
      })

      const result = await safeRetellSync(agent, "update")

      expect(result.success).toBe(true)
      expect(updateRetellLLMWithKey).toHaveBeenCalledWith(
        "llm-existing",
        expect.any(Object),
        "retell_sk_test123"
      )
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
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { deleteRetellAgentWithKey, deleteRetellLLMWithKey } = await import("@/lib/integrations/retell/agent/config")
      
      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent({ external_agent_id: null })

      const result = await safeRetellSync(agent, "delete")

      expect(result.success).toBe(true)
      expect(deleteRetellAgentWithKey).not.toHaveBeenCalled()
      expect(deleteRetellLLMWithKey).not.toHaveBeenCalled()
    })

    it("should delete both Agent and LLM if IDs exist", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const {
        deleteRetellAgentWithKey,
        deleteRetellLLMWithKey,
      } = await import("@/lib/integrations/retell/agent/config")
      const { processRetellDeleteResponse } = await import("@/lib/integrations/retell/agent/response")

      vi.mocked(deleteRetellAgentWithKey).mockResolvedValue({ success: true })
      vi.mocked(deleteRetellLLMWithKey).mockResolvedValue({ success: true })
      vi.mocked(processRetellDeleteResponse).mockResolvedValue({ success: true })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent({
        external_agent_id: "retell-agent-to-delete",
        config: {
          retell_llm_id: "llm-to-delete",
        },
      })

      const result = await safeRetellSync(agent, "delete")

      expect(result.success).toBe(true)
      expect(deleteRetellAgentWithKey).toHaveBeenCalledWith(
        "retell-agent-to-delete",
        "retell_sk_test123"
      )
      expect(deleteRetellLLMWithKey).toHaveBeenCalledWith(
        "llm-to-delete",
        "retell_sk_test123"
      )
    })
  })

  describe("Update tools operation", () => {
    it("should only update LLM for tools-only sync without custom tools", async () => {
      // Test update_tools without custom function tools (simpler path)
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const { updateRetellLLMWithKey, updateRetellAgentWithKey } = await import("@/lib/integrations/retell/agent/config")

      vi.mocked(updateRetellLLMWithKey).mockResolvedValue({
        success: true,
        data: { llm_id: "llm-updated" },
      })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      // Agent without custom function tools - just native tools
      const agent = createMockAgent({
        external_agent_id: "retell-agent-existing",
        config: {
          retell_llm_id: "llm-existing",
          tools: [], // No custom function tools
        },
      })

      const result = await safeRetellSync(agent, "update_tools")

      expect(result.success).toBe(true)
      expect(result.llm_id).toBe("llm-existing")
      expect(updateRetellLLMWithKey).toHaveBeenCalled()
      expect(updateRetellAgentWithKey).not.toHaveBeenCalled()
    })

    it("should fallback to full update if no LLM ID", async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        }),
      })

      const {
        createRetellLLMWithKey,
        createRetellAgentWithKey,
      } = await import("@/lib/integrations/retell/agent/config")
      const { processRetellResponse } = await import("@/lib/integrations/retell/agent/response")

      vi.mocked(createRetellLLMWithKey).mockResolvedValue({
        success: true,
        data: { llm_id: "llm-new" },
      })

      vi.mocked(createRetellAgentWithKey).mockResolvedValue({
        success: true,
        data: { agent_id: "retell-agent-new" },
      })

      vi.mocked(processRetellResponse).mockResolvedValue({
        success: true,
        agent: createMockAgent({ external_agent_id: "retell-agent-new" }),
      })

      const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
      const agent = createMockAgent({
        config: { retell_llm_id: null },
      })

      const result = await safeRetellSync(agent, "update_tools")

      // Should fallback to full update -> create
      expect(result.success).toBe(true)
      expect(createRetellLLMWithKey).toHaveBeenCalled()
    })
  })
})

// =============================================================================
// MCP TOOL REGISTRATION TESTS
// =============================================================================

describe("Retell Sync - MCP Tool Registration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should register custom function tools with MCP", async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({
          data: {
            partner_integration: {
              id: "int-1",
              api_keys: { default_secret_key: "retell_sk_test123" },
              is_active: true,
            },
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { partner_id: "partner-123" },
          error: null,
        }),
    })

    const { mcpClient } = await import("@/lib/integrations/mcp")
    const {
      createRetellLLMWithKey,
      createRetellAgentWithKey,
    } = await import("@/lib/integrations/retell/agent/config")
    const { processRetellResponse } = await import("@/lib/integrations/retell/agent/response")

    vi.mocked(createRetellLLMWithKey).mockResolvedValue({
      success: true,
      data: { llm_id: "llm-123" },
    })

    vi.mocked(createRetellAgentWithKey).mockResolvedValue({
      success: true,
      data: { agent_id: "retell-agent-123" },
    })

    vi.mocked(processRetellResponse).mockResolvedValue({
      success: true,
      agent: createMockAgent(),
    })

    const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
    const agent = createMockAgent({
      config: {
        tools: [createMockTool()],
      },
    })

    await safeRetellSync(agent, "create")

    expect(mcpClient.registerTools).toHaveBeenCalled()
  })

  it("should skip MCP registration if no custom tools", async () => {
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          partner_integration: {
            id: "int-1",
            api_keys: { default_secret_key: "retell_sk_test123" },
            is_active: true,
          },
        },
        error: null,
      }),
    })

    const { mcpClient } = await import("@/lib/integrations/mcp")
    const {
      createRetellLLMWithKey,
      createRetellAgentWithKey,
    } = await import("@/lib/integrations/retell/agent/config")
    const { processRetellResponse } = await import("@/lib/integrations/retell/agent/response")

    vi.mocked(createRetellLLMWithKey).mockResolvedValue({
      success: true,
      data: { llm_id: "llm-123" },
    })

    vi.mocked(createRetellAgentWithKey).mockResolvedValue({
      success: true,
      data: { agent_id: "retell-agent-123" },
    })

    vi.mocked(processRetellResponse).mockResolvedValue({
      success: true,
      agent: createMockAgent(),
    })

    const { safeRetellSync } = await import("@/lib/integrations/retell/agent/sync")
    const agent = createMockAgent({
      config: { tools: [] }, // No tools
    })

    await safeRetellSync(agent, "create")

    expect(mcpClient.registerTools).not.toHaveBeenCalled()
  })
})


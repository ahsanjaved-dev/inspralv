import { z } from "zod"
import {
  agentSecretApiKeySchema,
  agentPublicApiKeySchema,
  agentApiKeyConfigSchema,
  additionalApiKeySchema,
  functionToolsArraySchema,
  type AgentApiKeyConfig,
  type AdditionalApiKey,
  type FunctionTool,
} from "./database.types"

// Re-export for convenience
export { 
  agentSecretApiKeySchema, 
  agentPublicApiKeySchema, 
  agentApiKeyConfigSchema,
  additionalApiKeySchema,
  functionToolsArraySchema,
}
export type { AgentApiKeyConfig, AdditionalApiKey, FunctionTool }

export const createAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  department_id: z.string().uuid(),
  provider: z.enum(["vapi", "retell", "synthflow"] as const),
  voice_provider: z
    .enum(["elevenlabs", "deepgram", "azure", "openai", "cartesia"] as const)
    .optional(),
  model_provider: z.enum(["openai", "anthropic", "google", "groq"] as const).optional(),
  transcriber_provider: z.enum(["deepgram", "assemblyai", "openai"] as const).optional(),
  config: z
    .object({
      system_prompt: z.string().optional(),
      first_message: z.string().optional(),
      voice_id: z.string().optional(),
      voice_settings: z
        .object({
          stability: z.number().min(0).max(1).optional(),
          similarity_boost: z.number().min(0).max(1).optional(),
          speed: z.number().min(0.5).max(2).optional(),
        })
        .optional(),
      model_settings: z
        .object({
          model: z.string().optional(),
          temperature: z.number().min(0).max(2).optional(),
          max_tokens: z.number().min(1).max(4096).optional(),
        })
        .optional(),
      max_duration_seconds: z.number().min(60).max(3600).optional(),
      api_key_config: agentApiKeyConfigSchema.optional(),
    })
    .optional(),
  agent_secret_api_key: z.array(agentSecretApiKeySchema).optional().default([]),
  agent_public_api_key: z.array(agentPublicApiKeySchema).optional().default([]),
  is_active: z.boolean().optional().default(true),
})

export type CreateAgentInput = z.infer<typeof createAgentSchema>

export const updateAgentSchema = createAgentSchema.partial()
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  branding_config: z
    .object({
      logo_url: z.string().url().optional(),
      favicon_url: z.string().url().optional(),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
      company_name: z.string().optional(),
    })
    .optional(),
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

export const createIntegrationSchema = z.object({
  integration_type: z.enum([
    "make",
    "ghl",
    "twilio",
    "slack",
    "zapier",
    "calendar",
    "crm",
  ] as const),
  name: z.string().min(1).max(255),
  credentials: z.record(z.string(), z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>

export interface VapiAgentConfig {
  name: string
  voice?: {
    provider: string
    voiceId: string
    stability?: number
    similarityBoost?: number
  }
  model?: {
    provider: string
    model: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }
  transcriber?: {
    provider: string
    model?: string
    language?: string
  }
  firstMessage?: string
  endCallPhrases?: string[]
  maxDurationSeconds?: number
}

export interface RetellAgentConfig {
  agent_name: string
  voice_id: string
  llm_websocket_url?: string
  webhook_url?: string
}

export interface SynthflowAgentConfig {
  name: string
  voice_id: string
  model_id: string
  instructions: string
}

export const createDepartmentSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  resource_limits: z
    .object({
      max_agents: z.number().min(1).max(100).optional(),
      max_users: z.number().min(1).max(100).optional(),
      max_minutes_per_month: z.number().min(0).optional(),
    })
    .optional(),
})

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>

export const updateDepartmentSchema = createDepartmentSchema.partial()
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>

// ============================================================================
// WORKSPACE-SCOPED SCHEMAS (Milestone 5)
// ============================================================================

// Agent schema for workspace context (no department_id, workspace comes from URL)
export const createWorkspaceAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  provider: z.enum(["vapi", "retell", "synthflow"] as const),
  voice_provider: z
    .enum(["elevenlabs", "deepgram", "azure", "openai", "cartesia"] as const)
    .optional(),
  model_provider: z.enum(["openai", "anthropic", "google", "groq"] as const).optional(),
  transcriber_provider: z.enum(["deepgram", "assemblyai", "openai"] as const).optional(),
  config: z
    .object({
      system_prompt: z.string().optional(),
      first_message: z.string().optional(),
      voice_id: z.string().optional(),
      voice_settings: z
        .object({
          stability: z.number().min(0).max(1).optional(),
          similarity_boost: z.number().min(0).max(1).optional(),
          speed: z.number().min(0.5).max(2).optional(),
        })
        .optional(),
      model_settings: z
        .object({
          model: z.string().optional(),
          temperature: z.number().min(0).max(2).optional(),
          max_tokens: z.number().min(1).max(4096).optional(),
        })
        .optional(),
      max_duration_seconds: z.number().min(60).max(3600).optional(),
      api_key_config: agentApiKeyConfigSchema.optional(),
      // Function tools configuration
      tools: functionToolsArraySchema.optional(),
      tools_server_url: z.string().url().optional(),
    })
    .optional(),
  agent_secret_api_key: z.array(agentSecretApiKeySchema).optional().default([]),
  agent_public_api_key: z.array(agentPublicApiKeySchema).optional().default([]),
  is_active: z.boolean().optional().default(true),
})

export type CreateWorkspaceAgentInput = z.infer<typeof createWorkspaceAgentSchema>

export const updateWorkspaceAgentSchema = createWorkspaceAgentSchema.partial()
export type UpdateWorkspaceAgentInput = z.infer<typeof updateWorkspaceAgentSchema>

// ============================================================================
// WORKSPACE INTEGRATION SCHEMAS (Re-exported from database.types.ts)
// ============================================================================

export type IntegrationProvider =
  | "vapi"
  | "retell"
  | "synthflow"
  | "hubspot"
  | "salesforce"
  | "zapier"
  | "slack"

// Re-export integration schemas from database.types to avoid duplication
export {
  createWorkspaceIntegrationSchema,
  updateWorkspaceIntegrationSchema,
  type CreateWorkspaceIntegrationInput,
  type UpdateWorkspaceIntegrationInput,
} from "./database.types"

// ============================================================================
// PARTNER REQUEST API TYPES (Phase 1 - Milestone 1)
// ============================================================================

export interface SubdomainCheckResponse {
  available: boolean
  message?: string
}

export interface PartnerRequestSubmissionResponse {
  success: boolean
  requestId: string
  message: string
}

export interface ApprovePartnerRequestInput {
  requestId: string
  notes?: string
}

export interface RejectPartnerRequestInput {
  requestId: string
  reason: string
  sendEmail?: boolean
}

export interface ProvisionPartnerInput {
  requestId: string
  overrides?: {
    plan_tier?: string
    resource_limits?: Record<string, number>
    features?: Record<string, boolean>
  }
}

export interface ProvisionPartnerResponse {
  success: boolean
  partnerId: string
  ownerEmail: string
  temporaryPassword: string
  loginUrl: string
  message: string
}

export interface PartnerRequestFilters {
  status?: "pending" | "approved" | "rejected" | "provisioning" | "all"
  search?: string
  page?: number
  pageSize?: number
  sortBy?: "requested_at" | "company_name" | "status"
  sortOrder?: "asc" | "desc"
}
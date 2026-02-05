import { z } from "zod"
import {
  agentSecretApiKeySchema,
  agentPublicApiKeySchema,
  agentApiKeyConfigSchema,
  additionalApiKeySchema,
  functionToolsArraySchema,
  agentCustomVariablesArraySchema,
  type AgentApiKeyConfig,
  type AdditionalApiKey,
  type FunctionTool,
  type AgentCustomVariableDefinition,
} from "./database.types"

// Re-export for convenience
export {
  agentSecretApiKeySchema,
  agentPublicApiKeySchema,
  agentApiKeyConfigSchema,
  additionalApiKeySchema,
  functionToolsArraySchema,
  agentCustomVariablesArraySchema,
}
export type { AgentApiKeyConfig, AdditionalApiKey, FunctionTool, AgentCustomVariableDefinition }

// ============================================================================
// WORKSPACE AGENT SCHEMAS
// ============================================================================

// Knowledge base config schema for agents
export const agentKnowledgeBaseConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  document_ids: z.array(z.string().uuid()).optional().default([]),
  injection_mode: z.enum(["system_prompt"]).optional().default("system_prompt"),
})

// Agent direction schema
export const agentDirectionSchema = z.enum(["inbound", "outbound"] as const)

// Calendar settings schema for agents with appointment tools
export const calendarSettingsSchema = z.object({
  slot_duration_minutes: z.number().min(15).max(240).optional().default(30),
  buffer_between_slots_minutes: z.number().min(0).max(60).optional().default(0),
  preferred_days: z.array(z.enum(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"])).optional().default(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]),
  preferred_hours_start: z.string().optional().default("09:00"),
  preferred_hours_end: z.string().optional().default("17:00"),
  timezone: z.string().optional().default("America/New_York"),
  min_notice_hours: z.number().min(0).max(168).optional().default(0),
  max_advance_days: z.number().min(1).max(365).optional().default(60),
  // Email notification settings
  enable_owner_email: z.boolean().optional().default(false),
  owner_email: z.string().email().optional().nullable(),
  // Calendar source settings (for using existing calendars)
  calendar_source: z.enum(["new", "existing"]).optional().default("new"),
  existing_calendar_id: z.string().optional(),
  existing_calendar_name: z.string().optional(),
})

// Agent schema for workspace context (workspace comes from URL)
export const createWorkspaceAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(40, "Agent name must be 40 characters or less"),
  description: z.string().optional(),
  provider: z.enum(["vapi", "retell"] as const),
  voice_provider: z
    .enum(["elevenlabs", "deepgram", "azure", "openai", "cartesia"] as const)
    .optional(),
  model_provider: z.enum(["openai", "anthropic", "google", "groq"] as const).optional(),
  transcriber_provider: z.enum(["deepgram", "assemblyai", "openai"] as const).optional(),
  // Agent direction and telephony
  agent_direction: agentDirectionSchema.optional().default("inbound"),
  allow_outbound: z.boolean().optional(), // For inbound agents, allow outbound campaigns
  assigned_phone_number_id: z.string().uuid().optional().nullable(),
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
      transcriber_settings: z
        .object({
          language: z.string().optional(),
          model: z.string().optional(),
        })
        .optional(),
      max_duration_seconds: z.number().min(60).max(3600).optional(),
      api_key_config: agentApiKeyConfigSchema.optional(),
      end_call_phrases: z.array(z.string()).optional(),
      // Function tools configuration
      tools: functionToolsArraySchema.optional(),
      tools_server_url: z.string().url().optional(),
      // CRM/Webhook URL for forwarding call data (transcript, summary, etc.)
      crm_webhook_url: z.string().url().optional(),
      // Knowledge base configuration
      knowledge_base: agentKnowledgeBaseConfigSchema.optional(),
      // Agent-level custom variables (specific to this agent)
      custom_variables: agentCustomVariablesArraySchema.optional(),
      // Calendar settings for agents with appointment tools
      calendar_settings: calendarSettingsSchema.optional(),
    })
    .optional(),
  agent_secret_api_key: z.array(agentSecretApiKeySchema).optional().default([]),
  agent_public_api_key: z.array(agentPublicApiKeySchema).optional().default([]),
  is_active: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
  // Knowledge document IDs to link with agent (convenience field)
  knowledge_document_ids: z.array(z.string().uuid()).optional().default([]),
})

export type CreateWorkspaceAgentInput = z.infer<typeof createWorkspaceAgentSchema>

export const updateWorkspaceAgentSchema = createWorkspaceAgentSchema.partial()
export type UpdateWorkspaceAgentInput = z.infer<typeof updateWorkspaceAgentSchema>

// Legacy alias for backward compatibility
export const createAgentSchema = createWorkspaceAgentSchema
export type CreateAgentInput = CreateWorkspaceAgentInput
export const updateAgentSchema = updateWorkspaceAgentSchema
export type UpdateAgentInput = UpdateWorkspaceAgentInput

// ============================================================================
// PARTNER/ORGANIZATION SCHEMAS
// ============================================================================

export const updatePartnerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  branding: z
    .object({
      logo_url: z.string().url().optional().nullable(),
      favicon_url: z.string().url().optional().nullable(),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
      background_color: z.string().optional(),
      text_color: z.string().optional(),
      company_name: z.string().optional(),
    })
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
})

export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>

// Legacy alias
export const updateOrganizationSchema = updatePartnerSchema
export type UpdateOrganizationInput = UpdatePartnerInput

// ============================================================================
// WORKSPACE SCHEMAS
// ============================================================================

export const createWorkspaceSchema = z.object({
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
  settings: z.record(z.string(), z.unknown()).optional(),
})

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>

export const updateWorkspaceSchema = createWorkspaceSchema.partial()
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>

// Legacy aliases for backward compatibility
export const createDepartmentSchema = createWorkspaceSchema
export type CreateDepartmentInput = CreateWorkspaceInput
export const updateDepartmentSchema = updateWorkspaceSchema
export type UpdateDepartmentInput = UpdateWorkspaceInput

// ============================================================================
// INTEGRATION SCHEMAS
// ============================================================================

export type IntegrationProvider =
  | "vapi"
  | "retell"
  | "hubspot"
  | "salesforce"
  | "zapier"
  | "slack"

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

/**
 * @deprecated These workspace-level integration schemas are deprecated.
 * Use org-level PartnerIntegration management instead:
 * - Create: POST /api/partner/integrations
 * - Assign: POST /api/partner/workspaces/[id]/integrations
 * - Update: PATCH /api/partner/integrations/[id]
 * 
 * Sunset date: 2026-06-01
 */
export {
  createWorkspaceIntegrationSchema,
  updateWorkspaceIntegrationSchema,
  type CreateWorkspaceIntegrationInput,
  type UpdateWorkspaceIntegrationInput,
} from "./database.types"

// ============================================================================
// PROVIDER-SPECIFIC AGENT CONFIGS
// ============================================================================

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

// ============================================================================
// KNOWLEDGE BASE SCHEMAS (Re-exported from database.types)
// ============================================================================

export {
  knowledgeDocumentTypeSchema,
  knowledgeDocumentStatusSchema,
  createKnowledgeDocumentSchema,
  updateKnowledgeDocumentSchema,
  type KnowledgeDocument,
  type KnowledgeDocumentType,
  type KnowledgeDocumentStatus,
  type CreateKnowledgeDocumentInput,
  type UpdateKnowledgeDocumentInput,
} from "./database.types"

// ============================================================================
// CONVERSATION SCHEMAS
// ============================================================================

export const conversationFiltersSchema = z.object({
  status: z
    .enum([
      "initiated",
      "ringing",
      "in_progress",
      "completed",
      "failed",
      "no_answer",
      "busy",
      "canceled",
    ])
    .optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  agent_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  requires_follow_up: z.boolean().optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  sort_by: z
    .enum(["created_at", "duration_seconds", "total_cost"])
    .optional()
    .default("created_at"),
  sort_order: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type ConversationFilters = z.infer<typeof conversationFiltersSchema>

export const updateConversationSchema = z.object({
  requires_follow_up: z.boolean().optional(),
  follow_up_notes: z.string().optional().nullable(),
  followed_up_at: z.string().datetime().optional().nullable(),
  summary: z.string().optional().nullable(),
  sentiment: z.string().optional().nullable(),
  quality_score: z.number().min(0).max(100).optional().nullable(),
  customer_rating: z.number().min(1).max(5).optional().nullable(),
})

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>

// ============================================================================
// PARTNER REQUEST API TYPES
// ============================================================================

export interface SubdomainCheckResponse {
  available: boolean
  message?: string
}

export interface DomainCheckResponse {
  available: boolean
  valid: boolean
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

// ============================================================================
// USAGE TRACKING TYPES
// ============================================================================

export interface UsageSummary {
  total_minutes: number
  total_cost: number
  total_conversations: number
  by_resource_type: {
    resource_type: string
    quantity: number
    total_cost: number
  }[]
  by_agent: {
    agent_id: string
    agent_name: string
    minutes: number
    cost: number
    conversations: number
  }[]
}

export interface UsageFilters {
  date_from?: string
  date_to?: string
  resource_type?: string
  billing_period?: string
  agent_id?: string
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export interface AuditLogFilters {
  user_id?: string
  action?: string
  entity_type?: string
  entity_id?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

// ============================================================================
// MEMBER/INVITATION TYPES
// ============================================================================

export const inviteWorkspaceMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member", "viewer"] as const),
  message: z.string().max(500).optional(),
})

export type InviteWorkspaceMemberInput = z.infer<typeof inviteWorkspaceMemberSchema>

export const invitePartnerMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"] as const),
  message: z.string().max(500).optional(),
})

export type InvitePartnerMemberInput = z.infer<typeof invitePartnerMemberSchema>

export const updateMemberRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"] as const),
})

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>

// ============================================================================
// SUPER ADMIN TYPES
// ============================================================================

export interface SuperAdminStats {
  total_partners: number
  total_workspaces: number
  total_users: number
  total_agents: number
  total_conversations: number
  total_minutes: number
  pending_partner_requests: number
  partners_by_plan: {
    plan_tier: string
    count: number
  }[]
  recent_signups: {
    date: string
    count: number
  }[]
}

export interface PartnerOverview {
  id: string
  name: string
  slug: string
  plan_tier: string
  subscription_status: string
  workspace_count: number
  user_count: number
  agent_count: number
  total_minutes: number
  total_cost: number
  created_at: string
}

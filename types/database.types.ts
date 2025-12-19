import { z } from "zod"

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const agentSecretApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  key: z.string().min(1),
  provider: z.string().optional(),
  is_active: z.boolean().default(true),
})

export const agentPublicApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  key: z.string().min(1),
  provider: z.string().optional(),
  is_active: z.boolean().default(true),
})

export type AgentSecretApiKey = z.infer<typeof agentSecretApiKeySchema>
export type AgentPublicApiKey = z.infer<typeof agentPublicApiKeySchema>

export type AgentProvider = "vapi" | "retell" | "synthflow"

export const createAgentSchema = z.object({
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

export type PlanTier = "free" | "starter" | "pro" | "enterprise"

export interface User {
  id: string
  email: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  role: string
  status: "active" | "invited" | "disabled"
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationBranding {
  logo_url?: string
  favicon_url?: string
  primary_color?: string
  secondary_color?: string
  company_name?: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan_tier: PlanTier
  status: "active" | "pending_activation" | "suspended" | "cancelled"
  subscription_status: "trialing" | "active" | "past_due" | "cancelled" | null
  branding_config: OrganizationBranding | null
  branding: OrganizationBranding | null
  resource_limits: {
    max_departments?: number
    max_agents?: number
    max_users?: number
    max_minutes_per_month?: number
  } | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Computed fields
  current_month_minutes?: number
  current_month_cost?: number
}

export interface OrganizationWithStats extends Organization {
  total_users?: number
  total_agents?: number
  total_conversations?: number
  total_minutes?: number
}

// ============================================================================
// AGENT TYPES
// ============================================================================

export interface AgentConfig {
  system_prompt?: string
  first_message?: string
  voice_id?: string
  voice_settings?: {
    stability?: number
    similarity_boost?: number
    speed?: number
  }
  model_settings?: {
    model?: string
    temperature?: number
    max_tokens?: number
  }
  transcriber_settings?: {
    model?: string
    language?: string
  }
  end_call_phrases?: string[]
  max_duration_seconds?: number
  retell_llm_id?: string
}

export interface AIAgent {
  id: string
  name: string
  description: string | null
  provider: AgentProvider
  voice_provider: string | null
  model_provider: string | null
  transcriber_provider: string | null
  config: AgentConfig
  is_active: boolean
  organization_id: string
  created_by: string
  external_agent_id: string | null
  agent_secret_api_key: AgentSecretApiKey[]
  agent_public_api_key: AgentPublicApiKey[]
  created_at: string
  updated_at: string
  // Computed fields (optional, from joins/aggregations)
  total_conversations?: number
  total_minutes?: number
  total_cost?: number
}

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

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface Conversation {
  id: string
  organization_id: string
  agent_id: string
  external_call_id: string | null
  direction: "inbound" | "outbound"
  status: "queued" | "in_progress" | "completed" | "failed" | "no_answer"
  phone_number: string | null
  caller_name: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number
  recording_url: string | null
  transcript: string | null
  summary: string | null
  sentiment: "positive" | "neutral" | "negative" | null
  quality_score: number | null
  customer_rating: number | null
  total_cost: number | null
  cost_breakdown: Record<string, number> | null
  requires_follow_up: boolean
  follow_up_notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface ConversationWithAgent extends Conversation {
  agent?: AIAgent
}

export interface ConversationWithDetails extends Conversation {
  agent?: AIAgent
}

// ============================================================================
// DASHBOARD & ADMIN TYPES
// ============================================================================

export interface DashboardStats {
  total_agents: number
  total_conversations: number
  total_minutes: number
  total_cost: number
  conversations_this_month: number
  minutes_this_month: number
  cost_this_month: number // <-- ADD THIS LINE
  active_agents?: number
  conversations_today?: number
  average_duration?: number
  success_rate?: number
}

export interface SuperAdmin {
  id: string
  email: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// API TYPES
// ============================================================================

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// PARTNER & WORKSPACE TYPES (Milestone 1)
// ============================================================================

export interface PartnerBranding {
  company_name?: string
  logo_url?: string
  favicon_url?: string
  primary_color?: string
  secondary_color?: string
}

export interface PartnerFeatures {
  white_label?: boolean
  custom_domain?: boolean
  api_access?: boolean
  sso?: boolean
  advanced_analytics?: boolean
}

export interface PartnerResourceLimits {
  max_workspaces?: number
  max_users_per_workspace?: number
  max_agents_per_workspace?: number
}

export interface Partner {
  id: string
  name: string
  slug: string
  branding: PartnerBranding
  plan_tier: string
  features: PartnerFeatures
  resource_limits: PartnerResourceLimits
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string
  settings: Record<string, unknown>
  is_platform_partner: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface PartnerDomain {
  id: string
  partner_id: string
  hostname: string
  is_primary: boolean
  verified_at: string | null
  verification_token: string | null
  created_at: string
}

export interface WorkspaceResourceLimits {
  max_agents?: number
  max_users?: number
  max_minutes_per_month?: number
}

export interface Workspace {
  id: string
  partner_id: string
  name: string
  slug: string
  description: string | null
  resource_limits: WorkspaceResourceLimits
  settings: Record<string, unknown>
  current_month_minutes: number
  current_month_cost: number
  last_usage_reset_at: string
  status: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer"

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceMemberRole
  invited_by: string | null
  invited_at: string | null
  joined_at: string | null
  removed_at: string | null
  removed_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  user?: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  }
}

export interface WorkspaceWithMembership extends Workspace {
  role: WorkspaceMemberRole
}

// Zod schemas for validation
export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(1000).optional(),
  resource_limits: z
    .object({
      max_agents: z.number().min(1).max(100).optional(),
      max_users: z.number().min(1).max(100).optional(),
      max_minutes_per_month: z.number().min(0).optional(),
    })
    .optional(),
})

// ============================================================================
// PARTNER AUTH CONTEXT TYPES (Milestone 3)
// ============================================================================

export interface PartnerAuthUser {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export interface AccessibleWorkspace {
  id: string
  name: string
  slug: string
  partner_id: string
  description: string | null
  role: WorkspaceMemberRole
  resource_limits: WorkspaceResourceLimits
  status: string
}

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>

// ============================================================================
// WORKSPACE INVITATION TYPES (Milestone 2)
// ============================================================================

export type WorkspaceInvitationStatus = "pending" | "accepted" | "expired" | "cancelled"

export interface WorkspaceInvitation {
  id: string
  workspace_id: string
  email: string
  role: "admin" | "member" | "viewer"
  token: string
  message: string | null
  invited_by: string
  status: WorkspaceInvitationStatus
  expires_at: string
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceInvitationWithInviter extends WorkspaceInvitation {
  inviter?: {
    email: string
    first_name: string | null
    last_name: string | null
  }
}

export const createWorkspaceInvitationSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["admin", "member", "viewer"]),
  message: z.string().max(500).optional(),
})

export type CreateWorkspaceInvitationInput = z.infer<typeof createWorkspaceInvitationSchema>

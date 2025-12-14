export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type PlanTier = "starter" | "professional" | "enterprise" | "custom"
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid"
export type OrganizationStatus =
  | "pending_activation"
  | "onboarding"
  | "active"
  | "suspended"
  | "churned"

export type UserRole = "org_owner" | "org_admin" | "org_member"
export type UserStatus = "pending_invitation" | "active" | "inactive" | "suspended"
export type DepartmentRole = "owner" | "admin" | "member" | "viewer"

export type InvitationType = "org_owner" | "org_member" | "department_member"
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked"

export type AgentProvider = "vapi" | "retell" | "synthflow"
export type VoiceProvider = "elevenlabs" | "deepgram" | "azure" | "openai" | "cartesia"
export type ModelProvider = "openai" | "anthropic" | "google" | "groq"
export type TranscriberProvider = "deepgram" | "assemblyai" | "openai"

export type CallDirection = "inbound" | "outbound"
export type CallStatus =
  | "initiated"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "busy"
  | "canceled"

export type ResourceType =
  | "voice_minutes"
  | "api_calls"
  | "storage_gb"
  | "tts_characters"
  | "llm_tokens"
  | "stt_minutes"
  | "phone_number_rental"
  | "sms_messages"

export interface OrganizationBranding {
  logo_url?: string
  favicon_url?: string
  primary_color?: string
  secondary_color?: string
  company_name?: string
}

export interface ResourceLimits {
  max_departments?: number
  max_users?: number
  max_agents?: number
  max_minutes_per_month?: number
}

export interface DepartmentResourceLimits {
  max_agents?: number
  max_users?: number
  max_minutes_per_month?: number
}

export interface OrganizationFeatures {
  departments_enabled?: boolean
  api_access?: boolean
  white_label?: boolean
  sso?: boolean
  advanced_analytics?: boolean
}

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
    language?: string
    model?: string
  }
  end_call_phrases?: string[]
  max_duration_seconds?: number
}

export interface CostBreakdown {
  voice_cost?: number
  llm_cost?: number
  transcription_cost?: number
  telephony_cost?: number
}

export interface SuperAdmin {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  status: OrganizationStatus
  plan_tier: PlanTier
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  branding: OrganizationBranding
  custom_domain: string | null
  resource_limits: ResourceLimits
  features: OrganizationFeatures
  settings: Json
  onboarding_completed: boolean
  onboarding_step: number
  current_month_minutes: number
  current_month_cost: number
  last_usage_reset_at: string
  activated_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Invitation {
  id: string
  token: string
  type: InvitationType
  email: string
  organization_id: string | null
  department_id: string | null
  role: string
  message: string | null
  invited_by: string
  status: InvitationStatus
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface User {
  id: string
  organization_id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  phone_number: string | null
  role: UserRole
  status: UserStatus
  settings: Json
  invitation_id: string | null
  invitation_accepted_at: string | null
  last_login_at: string | null
  last_activity_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string | null
  settings: Json
  resource_limits: DepartmentResourceLimits
  total_agents: number
  total_users: number
  current_month_minutes: number
  current_month_cost: number
  created_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DepartmentPermission {
  id: string
  user_id: string
  department_id: string
  role: DepartmentRole
  permissions: string[]
  granted_by: string | null
  granted_at: string
  expires_at: string | null
  revoked_at: string | null
  revoked_by: string | null
  created_at: string
}

export interface AIAgent {
  id: string
  organization_id: string
  department_id: string
  name: string
  description: string | null
  provider: AgentProvider
  voice_provider: VoiceProvider | null
  model_provider: ModelProvider | null
  transcriber_provider: TranscriberProvider | null
  config: AgentConfig
  is_active: boolean
  version: number
  external_agent_id: string | null
  external_phone_number: string | null
  tags: string[]
  total_conversations: number
  total_minutes: number
  total_cost: number
  last_conversation_at: string | null
  created_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  organization_id: string
  department_id: string
  agent_id: string | null
  external_id: string | null
  phone_number: string | null
  caller_name: string | null
  direction: CallDirection
  status: CallStatus
  duration_seconds: number
  started_at: string | null
  ended_at: string | null
  recording_url: string | null
  transcript: string | null
  summary: string | null
  sentiment: string | null
  quality_score: number | null
  customer_rating: number | null
  requires_follow_up: boolean
  follow_up_notes: string | null
  followed_up_at: string | null
  followed_up_by: string | null
  cost_breakdown: CostBreakdown
  total_cost: number
  error_message: string | null
  error_code: string | null
  metadata: Json
  deleted_at: string | null
  created_at: string
}

export interface UsageTracking {
  id: string
  organization_id: string
  department_id: string | null
  conversation_id: string | null
  resource_type: ResourceType
  resource_provider: string | null
  quantity: number
  unit: string | null
  unit_cost: number | null
  total_cost: number | null
  billing_period: string | null
  is_billable: boolean
  invoice_id: string | null
  metadata: Json
  recorded_at: string
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  organization_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_values: Json | null
  new_values: Json | null
  metadata: Json | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface ApiResponse<T> {
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

export interface OrganizationWithStats extends Organization {
  total_departments?: number
  total_users?: number
  total_agents?: number
}

export interface UserWithOrganization extends User {
  organization: Organization
}

export interface UserWithDepartments extends User {
  department_permissions: (DepartmentPermission & { department: Department })[]
}

export interface InvitationWithDetails extends Invitation {
  organization?: Organization | null
  department?: Department | null
}

export interface DashboardStats {
  total_agents: number
  total_conversations: number
  total_minutes: number
  total_cost: number
  conversations_this_month: number
  minutes_this_month: number
  cost_this_month: number
}

export interface CreateOrganizationInput {
  name: string
  email: string
  plan_tier?: PlanTier
  trial_days?: number
  message?: string
}

export interface CreateDepartmentInput {
  name: string
  slug: string
  description?: string
  resource_limits?: DepartmentResourceLimits
}

export interface CreateAgentInput {
  name: string
  description?: string
  department_id: string
  provider: AgentProvider
  voice_provider?: VoiceProvider
  model_provider?: ModelProvider
  transcriber_provider?: TranscriberProvider
  config?: AgentConfig
  is_active?: boolean
}

export interface CreateInvitationInput {
  email: string
  type: InvitationType
  organization_id?: string
  department_id?: string
  role: string
  message?: string
}

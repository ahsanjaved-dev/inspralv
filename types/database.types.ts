export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_agents: {
        Row: {
          agent_public_api_key: Json[] | null
          agent_secret_api_key: Json[] | null
          config: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          external_agent_id: string | null
          external_phone_number: string | null
          id: string
          is_active: boolean
          last_conversation_at: string | null
          last_sync_error: string | null
          last_synced_at: string | null
          model_provider: Database["public"]["Enums"]["model_provider"] | null
          name: string
          needs_resync: boolean
          provider: Database["public"]["Enums"]["agent_provider"]
          retell_llm_id: string | null
          sync_status: string
          tags: string[]
          total_conversations: number
          total_cost: number
          total_minutes: number
          transcriber_provider:
            | Database["public"]["Enums"]["transcriber_provider"]
            | null
          updated_at: string
          version: number
          voice_provider: Database["public"]["Enums"]["voice_provider"] | null
          workspace_id: string | null
        }
        Insert: {
          agent_public_api_key?: Json[] | null
          agent_secret_api_key?: Json[] | null
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          external_agent_id?: string | null
          external_phone_number?: string | null
          id?: string
          is_active?: boolean
          last_conversation_at?: string | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          model_provider?: Database["public"]["Enums"]["model_provider"] | null
          name: string
          needs_resync?: boolean
          provider: Database["public"]["Enums"]["agent_provider"]
          retell_llm_id?: string | null
          sync_status?: string
          tags?: string[]
          total_conversations?: number
          total_cost?: number
          total_minutes?: number
          transcriber_provider?:
            | Database["public"]["Enums"]["transcriber_provider"]
            | null
          updated_at?: string
          version?: number
          voice_provider?: Database["public"]["Enums"]["voice_provider"] | null
          workspace_id?: string | null
        }
        Update: {
          agent_public_api_key?: Json[] | null
          agent_secret_api_key?: Json[] | null
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          external_agent_id?: string | null
          external_phone_number?: string | null
          id?: string
          is_active?: boolean
          last_conversation_at?: string | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          model_provider?: Database["public"]["Enums"]["model_provider"] | null
          name?: string
          needs_resync?: boolean
          provider?: Database["public"]["Enums"]["agent_provider"]
          retell_llm_id?: string | null
          sync_status?: string
          tags?: string[]
          total_conversations?: number
          total_cost?: number
          total_minutes?: number
          transcriber_provider?:
            | Database["public"]["Enums"]["transcriber_provider"]
            | null
          updated_at?: string
          version?: number
          voice_provider?: Database["public"]["Enums"]["voice_provider"] | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string | null
          caller_name: string | null
          cost_breakdown: Json
          created_at: string
          customer_rating: number | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["call_direction"]
          duration_seconds: number
          ended_at: string | null
          error_code: string | null
          error_message: string | null
          external_id: string | null
          follow_up_notes: string | null
          followed_up_at: string | null
          followed_up_by: string | null
          id: string
          metadata: Json
          phone_number: string | null
          quality_score: number | null
          recording_url: string | null
          requires_follow_up: boolean
          sentiment: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["call_status"]
          summary: string | null
          total_cost: number
          transcript: string | null
          transcript_search: unknown
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          caller_name?: string | null
          cost_breakdown?: Json
          created_at?: string
          customer_rating?: number | null
          deleted_at?: string | null
          direction: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          follow_up_notes?: string | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          metadata?: Json
          phone_number?: string | null
          quality_score?: number | null
          recording_url?: string | null
          requires_follow_up?: boolean
          sentiment?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          summary?: string | null
          total_cost?: number
          transcript?: string | null
          transcript_search?: unknown
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          caller_name?: string | null
          cost_breakdown?: Json
          created_at?: string
          customer_rating?: number | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number
          ended_at?: string | null
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          follow_up_notes?: string | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          metadata?: Json
          phone_number?: string | null
          quality_score?: number | null
          recording_url?: string | null
          requires_follow_up?: boolean
          sentiment?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          summary?: string | null
          total_cost?: number
          transcript?: string | null
          transcript_search?: unknown
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_followed_up_by_fkey"
            columns: ["followed_up_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_domains: {
        Row: {
          created_at: string
          hostname: string
          id: string
          is_primary: boolean
          partner_id: string
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          hostname: string
          id?: string
          is_primary?: boolean
          partner_id: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          partner_id?: string
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_domains_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          message: string | null
          partner_id: string
          role: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          message?: string | null
          partner_id: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          message?: string | null
          partner_id?: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invitations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          partner_id: string
          removed_at: string | null
          removed_by: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          partner_id: string
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          partner_id?: string
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_requests: {
        Row: {
          billing_info: Json | null
          branding_data: Json
          business_description: string
          company_name: string
          contact_email: string
          contact_name: string
          created_at: string
          custom_domain: string
          desired_subdomain: string
          expected_users: number | null
          id: string
          metadata: Json
          phone: string | null
          provisioned_partner_id: string | null
          rejection_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          selected_plan: string
          status: Database["public"]["Enums"]["partner_request_status"]
          updated_at: string
          use_case: string
        }
        Insert: {
          billing_info?: Json | null
          branding_data?: Json
          business_description: string
          company_name: string
          contact_email: string
          contact_name: string
          created_at?: string
          custom_domain: string
          desired_subdomain: string
          expected_users?: number | null
          id?: string
          metadata?: Json
          phone?: string | null
          provisioned_partner_id?: string | null
          rejection_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_plan?: string
          status?: Database["public"]["Enums"]["partner_request_status"]
          updated_at?: string
          use_case: string
        }
        Update: {
          billing_info?: Json | null
          branding_data?: Json
          business_description?: string
          company_name?: string
          contact_email?: string
          contact_name?: string
          created_at?: string
          custom_domain?: string
          desired_subdomain?: string
          expected_users?: number | null
          id?: string
          metadata?: Json
          phone?: string | null
          provisioned_partner_id?: string | null
          rejection_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_plan?: string
          status?: Database["public"]["Enums"]["partner_request_status"]
          updated_at?: string
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_requests_provisioned_partner_id_fkey"
            columns: ["provisioned_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          branding: Json
          created_at: string
          deleted_at: string | null
          features: Json
          id: string
          is_platform_partner: boolean
          name: string
          onboarding_status: string | null
          plan_tier: string
          request_id: string | null
          resource_limits: Json
          settings: Json
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          deleted_at?: string | null
          features?: Json
          id?: string
          is_platform_partner?: boolean
          name: string
          onboarding_status?: string | null
          plan_tier?: string
          request_id?: string | null
          resource_limits?: Json
          settings?: Json
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          deleted_at?: string | null
          features?: Json
          id?: string
          is_platform_partner?: boolean
          name?: string
          onboarding_status?: string | null
          plan_tier?: string
          request_id?: string | null
          resource_limits?: Json
          settings?: Json
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "partner_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_login_at: string | null
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_login_at?: string | null
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_login_at?: string | null
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          billing_period: string | null
          conversation_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          is_billable: boolean
          metadata: Json
          quantity: number
          recorded_at: string
          resource_provider: string | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_cost: number | null
          unit: string | null
          unit_cost: number | null
          workspace_id: string | null
        }
        Insert: {
          billing_period?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          metadata?: Json
          quantity: number
          recorded_at?: string
          resource_provider?: string | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          total_cost?: number | null
          unit?: string | null
          unit_cost?: number | null
          workspace_id?: string | null
        }
        Update: {
          billing_period?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          metadata?: Json
          quantity?: number
          recorded_at?: string
          resource_provider?: string | null
          resource_type?: Database["public"]["Enums"]["resource_type"]
          total_cost?: number | null
          unit?: string | null
          unit_cost?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_tracking_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string
          first_name: string | null
          id: string
          last_activity_at: string | null
          last_login_at: string | null
          last_name: string | null
          phone_number: string | null
          role: Database["public"]["Enums"]["user_role"]
          settings: Json
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_activity_at?: string | null
          last_login_at?: string | null
          last_name?: string | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          settings?: Json
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_activity_at?: string | null
          last_login_at?: string | null
          last_name?: string | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          settings?: Json
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      workspace_integrations: {
        Row: {
          api_keys: Json
          config: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          provider: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          api_keys?: Json
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          provider: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          api_keys?: Json
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          provider?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          message: string | null
          role: string
          status: string
          token: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          message?: string | null
          role: string
          status?: string
          token?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          message?: string | null
          role?: string
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          removed_at: string | null
          removed_by: string | null
          role: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          removed_at?: string | null
          removed_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          current_month_cost: number
          current_month_minutes: number
          deleted_at: string | null
          description: string | null
          id: string
          last_usage_reset_at: string
          name: string
          partner_id: string
          resource_limits: Json
          settings: Json
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_month_cost?: number
          current_month_minutes?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          last_usage_reset_at?: string
          name: string
          partner_id: string
          resource_limits?: Json
          settings?: Json
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_month_cost?: number
          current_month_minutes?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          last_usage_reset_at?: string
          name?: string
          partner_id?: string
          resource_limits?: Json
          settings?: Json
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_slug: { Args: { input_text: string }; Returns: string }
      get_my_org_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
    }
    Enums: {
      agent_provider: "vapi" | "retell" | "synthflow"
      call_direction: "inbound" | "outbound"
      call_status:
        | "initiated"
        | "ringing"
        | "in_progress"
        | "completed"
        | "failed"
        | "no_answer"
        | "busy"
        | "canceled"
      department_role: "owner" | "admin" | "member" | "viewer"
      integration_status: "active" | "inactive" | "error" | "pending_setup"
      integration_type:
        | "make"
        | "ghl"
        | "twilio"
        | "slack"
        | "zapier"
        | "calendar"
        | "crm"
        | "webhook"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      invitation_type: "org_owner" | "org_member" | "department_member"
      invoice_status:
        | "draft"
        | "open"
        | "paid"
        | "void"
        | "uncollectible"
        | "overdue"
      model_provider: "openai" | "anthropic" | "google" | "groq"
      organization_status:
        | "pending_activation"
        | "onboarding"
        | "active"
        | "suspended"
        | "churned"
      partner_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "provisioning"
      plan_tier: "starter" | "professional" | "enterprise" | "custom"
      resource_type:
        | "voice_minutes"
        | "api_calls"
        | "storage_gb"
        | "tts_characters"
        | "llm_tokens"
        | "stt_minutes"
        | "phone_number_rental"
        | "sms_messages"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
      transcriber_provider: "deepgram" | "assemblyai" | "openai"
      user_role: "org_owner" | "org_admin" | "org_member"
      user_status: "pending_invitation" | "active" | "inactive" | "suspended"
      voice_provider:
        | "elevenlabs"
        | "deepgram"
        | "azure"
        | "openai"
        | "cartesia"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_provider: ["vapi", "retell", "synthflow"],
      call_direction: ["inbound", "outbound"],
      call_status: [
        "initiated",
        "ringing",
        "in_progress",
        "completed",
        "failed",
        "no_answer",
        "busy",
        "canceled",
      ],
      department_role: ["owner", "admin", "member", "viewer"],
      integration_status: ["active", "inactive", "error", "pending_setup"],
      integration_type: [
        "make",
        "ghl",
        "twilio",
        "slack",
        "zapier",
        "calendar",
        "crm",
        "webhook",
      ],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      invitation_type: ["org_owner", "org_member", "department_member"],
      invoice_status: [
        "draft",
        "open",
        "paid",
        "void",
        "uncollectible",
        "overdue",
      ],
      model_provider: ["openai", "anthropic", "google", "groq"],
      organization_status: [
        "pending_activation",
        "onboarding",
        "active",
        "suspended",
        "churned",
      ],
      partner_request_status: [
        "pending",
        "approved",
        "rejected",
        "provisioning",
      ],
      plan_tier: ["starter", "professional", "enterprise", "custom"],
      resource_type: [
        "voice_minutes",
        "api_calls",
        "storage_gb",
        "tts_characters",
        "llm_tokens",
        "stt_minutes",
        "phone_number_rental",
        "sms_messages",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
      ],
      transcriber_provider: ["deepgram", "assemblyai", "openai"],
      user_role: ["org_owner", "org_admin", "org_member"],
      user_status: ["pending_invitation", "active", "inactive", "suspended"],
      voice_provider: ["elevenlabs", "deepgram", "azure", "openai", "cartesia"],
    },
  },
} as const

// ============================================================================
// ZOD SCHEMAS FOR API VALIDATION
// ============================================================================
import { z } from "zod"

// Agent API Key Schemas
export const agentSecretApiKeySchema = z.object({
  id: z.string(),
  provider: z.string(),
  key: z.string(),
  is_active: z.boolean(),
})

export const agentPublicApiKeySchema = z.object({
  id: z.string(),
  provider: z.string(),
  key: z.string(),
  is_active: z.boolean(),
})

export const additionalApiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  secret_key: z.string().optional(),
  public_key: z.string().optional(),
})

export const apiKeyConfigEntrySchema = z.object({
  type: z.enum(["none", "default", "additional"]),
  additional_key_id: z.string().optional(),
})

export const agentApiKeyConfigSchema = z.object({
  public_key: apiKeyConfigEntrySchema.optional(),
  secret_key: apiKeyConfigEntrySchema.optional(),
  assigned_key_id: z.string().nullable().optional(),
})

export type AgentSecretApiKey = z.infer<typeof agentSecretApiKeySchema>
export type AgentPublicApiKey = z.infer<typeof agentPublicApiKeySchema>
export type AdditionalApiKey = z.infer<typeof additionalApiKeySchema>
export type ApiKeyConfigEntry = z.infer<typeof apiKeyConfigEntrySchema>
export type AgentApiKeyConfig = z.infer<typeof agentApiKeyConfigSchema>

// ============================================================================
// CUSTOM TYPES FOR API KEY WORKFLOW
// ============================================================================
export type SyncStatus = 'not_synced' | 'pending' | 'synced' | 'error'

export interface ApiKey {
  id: string
  name: string
  secret_key: string
  public_key: string
}

export interface WorkspaceIntegrationApiKeys {
  api_keys: ApiKey[]
}

// ============================================================================
// ENTITY TYPES (Derived from Supabase Database Types)
// ============================================================================

// Table types using the Tables helper
export type SuperAdmin = Tables<'super_admin'>
export type Partner = Tables<'partners'>
export type PartnerDomain = Tables<'partner_domains'>
export type PartnerRequest = Tables<'partner_requests'>
export type Workspace = Tables<'workspaces'>
export type WorkspaceInvitation = Tables<'workspace_invitations'>
export type WorkspaceMember = Tables<'workspace_members'>
export type Conversation = Tables<'conversations'>
export type UsageTracking = Tables<'usage_tracking'>
export type User = Tables<'users'>
export type AuditLog = Tables<'audit_log'>
export type WorkspaceIntegration = Tables<'workspace_integrations'>
export type PartnerMember = Tables<'partner_members'>
export type PartnerInvitation = Tables<'partner_invitations'>

// AIAgent type with typed config and api keys
export type AIAgent = Omit<Tables<'ai_agents'>, 'config' | 'agent_secret_api_key' | 'agent_public_api_key'> & {
  config: AgentConfig
  agent_secret_api_key: AgentSecretApiKey[] | null
  agent_public_api_key: AgentPublicApiKey[] | null
}

// Agent provider type from enum
export type AgentProvider = Database['public']['Enums']['agent_provider']

// ============================================================================
// FUNCTION TOOL TYPES
// ============================================================================

/**
 * JSON Schema for function parameters
 * Follows OpenAI function calling schema format
 */
export interface FunctionToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  items?: FunctionToolParameterProperty
  properties?: Record<string, FunctionToolParameterProperty>
  required?: string[]
  default?: unknown
}

export interface FunctionToolParameters {
  type: 'object'
  properties: Record<string, FunctionToolParameterProperty>
  required?: string[]
}

/**
 * Built-in tool types supported by voice AI providers
 * - 'function': Custom function that calls your server
 * - 'endCall': Built-in tool to end the call
 * - 'transferCall': Built-in tool to transfer the call
 * - 'dtmf': Built-in tool for dial-tone multi-frequency signals
 */
export type FunctionToolType = 'function' | 'endCall' | 'transferCall' | 'dtmf'

/**
 * Base function tool definition (provider-agnostic)
 * This is stored in the database and mapped to provider-specific formats
 */
export interface FunctionTool {
  /** Unique identifier for the tool */
  id: string
  /** Function name (used by LLM to call the tool) */
  name: string
  /** Description of what the function does (helps LLM decide when to use it) */
  description: string
  /** Parameters schema following JSON Schema format */
  parameters: FunctionToolParameters
  /** Tool type - 'function' for custom tools, or built-in types like 'endCall' */
  tool_type?: FunctionToolType
  /** Whether the function runs asynchronously (VAPI only) */
  async?: boolean
  /** Server URL to call when this tool is invoked (optional - uses default if not set) */
  server_url?: string
  /** Speak during tool execution (VAPI messages) */
  speak_during_execution?: boolean
  /** Message to speak while the tool is executing */
  execution_message?: string
  /** Whether the tool is enabled */
  enabled?: boolean
}

/**
 * Zod schema for FunctionTool validation
 */
export const functionToolParameterPropertySchema: z.ZodType<FunctionToolParameterProperty> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    items: functionToolParameterPropertySchema.optional(),
    properties: z.record(z.string(), functionToolParameterPropertySchema).optional(),
    required: z.array(z.string()).optional(),
    default: z.unknown().optional(),
  })
)

export const functionToolParametersSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), functionToolParameterPropertySchema),
  required: z.array(z.string()).optional(),
})

export const functionToolTypeSchema = z.enum(['function', 'endCall', 'transferCall', 'dtmf'])

export const functionToolSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Function name is required').regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Function name must be a valid identifier'),
  description: z.string().min(1, 'Description is required'),
  parameters: functionToolParametersSchema,
  tool_type: functionToolTypeSchema.optional().default('function'),
  async: z.boolean().optional(),
  server_url: z.string().url().optional(),
  speak_during_execution: z.boolean().optional(),
  execution_message: z.string().optional(),
  enabled: z.boolean().optional().default(true),
})

export const functionToolsArraySchema = z.array(functionToolSchema)

// ============================================================================
// AGENT CONFIG TYPES
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
    language?: string
    model?: string
  }
  max_duration_seconds?: number
  api_key_config?: AgentApiKeyConfig
  retell_llm_id?: string
  end_call_phrases?: string[]
  /** Custom function tools for the agent */
  tools?: FunctionTool[]
  /** Default server URL for tool calls (used if tool doesn't specify its own) */
  tools_server_url?: string
  /** Knowledge base configuration */
  knowledge_base?: {
    /** Whether knowledge base is enabled */
    enabled?: boolean
    /** IDs of linked knowledge documents */
    document_ids?: string[]
    /** How to inject knowledge into the prompt: 'system_prompt' appends to system prompt */
    injection_mode?: 'system_prompt'
  }
  /** Telephony configuration (Vapi phone numbers) */
  telephony?: AgentTelephonyConfig
}

// ============================================================================
// AGENT TELEPHONY CONFIG
// ============================================================================

export interface AgentTelephonyConfig {
  /** Vapi phone number ID assigned to this agent (for inbound calls) */
  vapi_phone_number_id?: string
}

// ============================================================================
// VAPI INTEGRATION CONFIG (SIP TRUNK)
// ============================================================================

/**
 * Configuration for Vapi workspace integration
 * Stored in workspace_integrations.config for provider="vapi"
 */
export interface VapiIntegrationConfig {
  /** Vapi SIP trunk credential ID (created via byo-sip-trunk) */
  sip_trunk_credential_id?: string
  /** Shared outbound phone number ID (all agents call from this number) */
  shared_outbound_phone_number_id?: string
  /** E164 number for display (e.g., +15551234567) */
  shared_outbound_phone_number?: string
}

/**
 * Zod schema for VapiIntegrationConfig validation
 */
export const vapiIntegrationConfigSchema = z.object({
  sip_trunk_credential_id: z.string().optional(),
  shared_outbound_phone_number_id: z.string().optional(),
  shared_outbound_phone_number: z.string().optional(),
})

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface ConversationWithAgent extends Conversation {
  agent?: Pick<Tables<'ai_agents'>, 'id' | 'name' | 'provider'> | null
}

// ============================================================================
// PARTNER BRANDING TYPES
// ============================================================================

export interface PartnerBranding {
  logo_url?: string
  favicon_url?: string
  primary_color?: string
  secondary_color?: string
  company_name?: string
  background_color?: string
  text_color?: string
}

// ============================================================================
// AUTH TYPES
// ============================================================================

export interface PartnerAuthUser {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export type WorkspaceMemberRole = 'owner' | 'admin' | 'member' | 'viewer'
export type PartnerMemberRole = 'owner' | 'admin' | 'member'

export interface AccessibleWorkspace {
  id: string
  name: string
  slug: string
  partner_id: string
  description: string | null
  role: WorkspaceMemberRole
  resource_limits: Record<string, unknown>
  status: string
}

export interface PartnerMembership {
  id: string
  partner_id: string
  partner_name: string
  partner_slug: string
  role: PartnerMemberRole
  is_platform_partner: boolean
}

// ============================================================================
// DASHBOARD STATS TYPES
// ============================================================================

export interface DashboardStats {
  total_agents?: number
  active_agents?: number
  total_conversations?: number
  conversations_this_month?: number
  minutes_this_month?: number
  cost_this_month?: number
  total_minutes?: number
  total_cost?: number
  avg_duration_seconds?: number
  avg_quality_score?: number | null
  conversations_trend?: number
  recent_activity?: {
    date: string
    conversations: number
    minutes: number
  }[]
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  success?: boolean
}

export interface PaginatedResponse<T = unknown> {
  data: T[]
  total: number
  totalPages: number
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

// ============================================================================
// INTEGRATION API KEYS TYPES
// ============================================================================

export interface IntegrationApiKeys {
  default_secret_key?: string
  default_public_key?: string
  additional_keys?: AdditionalApiKey[]
  has_default_secret_key?: boolean
  has_default_public_key?: boolean
}

// ============================================================================
// WORKSPACE INVITATION INPUT TYPES
// ============================================================================

export interface CreateWorkspaceInvitationInput {
  email: string
  role: WorkspaceMemberRole
  message?: string
}

// ============================================================================
// ZOD VALIDATION SCHEMAS FOR FORMS/API
// ============================================================================

export const createPartnerRequestSchema = z.object({
  company_name: z.string().min(1, "Company name is required").max(255),
  contact_name: z.string().min(1, "Contact name is required").max(255),
  contact_email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  business_description: z.string().min(10, "Please provide a business description"),
  use_case: z.string().min(10, "Please describe your use case"),
  desired_subdomain: z.string().min(3, "Subdomain must be at least 3 characters").max(50),
  custom_domain: z.string().optional().default(""),
  selected_plan: z.enum(["starter", "professional", "enterprise"]).default("starter"),
  expected_users: z.number().optional(),
  branding_data: z.object({
    logo_url: z.string().optional(),
    primary_color: z.string().optional(),
    secondary_color: z.string().optional(),
    company_name: z.string().optional(),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type CreatePartnerRequestInput = z.infer<typeof createPartnerRequestSchema>

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  slug: z.string().min(1, "Slug is required").max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  resource_limits: z.object({
    max_agents: z.number().optional(),
    max_users: z.number().optional(),
    max_minutes_per_month: z.number().optional(),
  }).optional(),
})

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>

export const createWorkspaceIntegrationSchema = z.object({
  provider: z.enum(["vapi", "retell", "synthflow", "hubspot", "salesforce", "zapier", "slack"] as const),
  name: z.string().min(1, "Connection name is required").max(255),
  default_secret_key: z.string().min(1, "Default secret API key is required"),
  default_public_key: z.string().optional(),
  additional_keys: z.array(additionalApiKeySchema).optional().default([]),
  config: z.record(z.string(), z.unknown()).optional(),
})

export const updateWorkspaceIntegrationSchema = z.object({
  name: z.string().min(1, "Connection name is required").max(255).optional(),
  default_secret_key: z.string().min(1, "Default secret API key is required").optional(),
  default_public_key: z.string().optional(),
  additional_keys: z.array(additionalApiKeySchema).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

// Infer types from Zod schemas
export type CreateWorkspaceIntegrationInput = z.infer<typeof createWorkspaceIntegrationSchema>
export type UpdateWorkspaceIntegrationInput = z.infer<typeof updateWorkspaceIntegrationSchema>

export const createWorkspaceInvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["owner", "admin", "member", "viewer"] as const),
  message: z.string().optional(),
})

// ============================================================================
// KNOWLEDGE BASE TYPES AND SCHEMAS
// ============================================================================

export type KnowledgeDocumentType = 'document' | 'faq' | 'product_info' | 'policy' | 'script' | 'other'
export type KnowledgeDocumentStatus = 'draft' | 'processing' | 'active' | 'archived' | 'error'

export interface KnowledgeDocument {
  id: string
  workspace_id: string
  title: string
  description: string | null
  document_type: KnowledgeDocumentType
  status: KnowledgeDocumentStatus
  content: string | null
  file_name: string | null
  file_url: string | null
  file_type: string | null
  file_size_bytes: number | null
  tags: string[]
  category: string | null
  content_hash: string | null
  embedding_status: string | null
  usage_count: number
  last_used_at: string | null
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export const knowledgeDocumentTypeSchema = z.enum([
  'document',
  'faq',
  'product_info',
  'policy',
  'script',
  'other',
])

export const knowledgeDocumentStatusSchema = z.enum([
  'draft',
  'processing',
  'active',
  'archived',
  'error',
])

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(2000).optional(),
  document_type: knowledgeDocumentTypeSchema.default('document'),
  content: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  category: z.string().max(255).optional(),
  // File upload fields (set by server after upload)
  file_name: z.string().optional(),
  file_url: z.string().optional(),
  file_type: z.string().optional(),
  file_size_bytes: z.number().optional(),
})

export type CreateKnowledgeDocumentInput = z.infer<typeof createKnowledgeDocumentSchema>

export const updateKnowledgeDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  document_type: knowledgeDocumentTypeSchema.optional(),
  status: knowledgeDocumentStatusSchema.optional(),
  content: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  category: z.string().max(255).optional().nullable(),
})

export type UpdateKnowledgeDocumentInput = z.infer<typeof updateKnowledgeDocumentSchema>

// ============================================================================
// LEADS TYPES AND SCHEMAS
// ============================================================================

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'nurturing'
export type LeadSource = 'voice_agent' | 'manual' | 'import' | 'api' | 'webhook'

export interface Lead {
  id: string
  workspace_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  job_title: string | null
  status: LeadStatus
  source: LeadSource
  priority: number
  score: number
  agent_id: string | null
  conversation_id: string | null
  assigned_to: string | null
  notes: string | null
  tags: string[]
  custom_fields: Json
  last_contacted_at: string | null
  next_follow_up_at: string | null
  created_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface LeadWithAgent extends Lead {
  agent?: Pick<Tables<'ai_agents'>, 'id' | 'name' | 'provider'> | null
}

export const leadStatusSchema = z.enum(['new', 'contacted', 'qualified', 'converted', 'lost', 'nurturing'])
export const leadSourceSchema = z.enum(['voice_agent', 'manual', 'import', 'api', 'webhook'])

export const createLeadSchema = z.object({
  first_name: z.string().max(255).optional().nullable(),
  last_name: z.string().max(255).optional().nullable(),
  email: z.string().max(255).optional().nullable().or(z.literal('')).transform(v => v === '' ? null : v),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(255).optional().nullable(),
  job_title: z.string().max(255).optional().nullable(),
  status: leadStatusSchema.optional().default('new'),
  source: leadSourceSchema.optional().default('manual'),
  priority: z.number().min(0).max(2).optional().default(0),
  score: z.number().min(0).max(100).optional().default(0),
  agent_id: z.string().uuid().optional().nullable(),
  conversation_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  custom_fields: z.record(z.string(), z.unknown()).optional().default({}),
  next_follow_up_at: z.string().datetime().optional().nullable(),
})

export const updateLeadSchema = createLeadSchema.partial()

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>

// Form input type for React Hook Form (all fields optional for form handling)
export type LeadFormInput = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  job_title?: string | null
  status?: LeadStatus
  source?: LeadSource
  priority?: number
  score?: number
  agent_id?: string | null
  conversation_id?: string | null
  assigned_to?: string | null
  notes?: string | null
  tags?: string[]
  custom_fields?: Record<string, unknown>
  next_follow_up_at?: string | null
}
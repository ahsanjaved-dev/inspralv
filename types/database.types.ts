export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_knowledge_documents: {
        Row: {
          agent_id: string
          created_at: string | null
          id: string
          knowledge_document_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          id?: string
          knowledge_document_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          id?: string
          knowledge_document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_documents_knowledge_document_id_fkey"
            columns: ["knowledge_document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
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
          transcriber_provider: Database["public"]["Enums"]["transcriber_provider"] | null
          updated_at: string
          version: number
          voice_provider: Database["public"]["Enums"]["voice_provider"] | null
          workspace_id: string | null
          // Telephony / Direction fields
          agent_direction: "inbound" | "outbound"
          allow_outbound: boolean
          assigned_phone_number_id: string | null
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
          transcriber_provider?: Database["public"]["Enums"]["transcriber_provider"] | null
          updated_at?: string
          version?: number
          voice_provider?: Database["public"]["Enums"]["voice_provider"] | null
          workspace_id?: string | null
          // Telephony / Direction fields
          agent_direction?: "inbound" | "outbound"
          allow_outbound?: boolean
          assigned_phone_number_id?: string | null
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
          transcriber_provider?: Database["public"]["Enums"]["transcriber_provider"] | null
          updated_at?: string
          version?: number
          voice_provider?: Database["public"]["Enums"]["voice_provider"] | null
          workspace_id?: string | null
          // Telephony / Direction fields
          agent_direction?: "inbound" | "outbound"
          allow_outbound?: boolean
          assigned_phone_number_id?: string | null
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
          partner_id: string | null
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
          partner_id?: string | null
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
          partner_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      knowledge_documents: {
        Row: {
          category: string | null
          content: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_type: Database["public"]["Enums"]["knowledge_document_type"]
          embedding_status: string | null
          file_name: string | null
          file_size_bytes: number | null
          file_type: string | null
          file_url: string | null
          id: string
          last_used_at: string | null
          status: Database["public"]["Enums"]["knowledge_document_status"]
          tags: string[] | null
          title: string
          updated_at: string
          updated_by: string | null
          usage_count: number | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type?: Database["public"]["Enums"]["knowledge_document_type"]
          embedding_status?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          last_used_at?: string | null
          status?: Database["public"]["Enums"]["knowledge_document_status"]
          tags?: string[] | null
          title: string
          updated_at?: string
          updated_by?: string | null
          usage_count?: number | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          content?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type?: Database["public"]["Enums"]["knowledge_document_type"]
          embedding_status?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          last_used_at?: string | null
          status?: Database["public"]["Enums"]["knowledge_document_status"]
          tags?: string[] | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          usage_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agent_id: string | null
          assigned_to: string | null
          company: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_contacted_at: string | null
          last_name: string | null
          next_follow_up_at: string | null
          notes: string | null
          phone: string | null
          priority: number
          score: number
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          tags: string[] | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id?: string | null
          assigned_to?: string | null
          company?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          priority?: number
          score?: number
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_id?: string | null
          assigned_to?: string | null
          company?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          priority?: number
          score?: number
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          tags?: string[] | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
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
          assigned_white_label_variant_id: string | null
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
          assigned_white_label_variant_id?: string | null
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
          assigned_white_label_variant_id?: string | null
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
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_assigned_white_label_variant_id_fkey"
            columns: ["assigned_white_label_variant_id"]
            isOneToOne: false
            referencedRelation: "white_label_variants"
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
          is_billing_exempt: boolean
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
          white_label_variant_id: string | null
        }
        Insert: {
          branding?: Json
          created_at?: string
          deleted_at?: string | null
          features?: Json
          id?: string
          is_billing_exempt?: boolean
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
          white_label_variant_id?: string | null
        }
        Update: {
          branding?: Json
          created_at?: string
          deleted_at?: string | null
          features?: Json
          id?: string
          is_billing_exempt?: boolean
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
          white_label_variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "partner_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_white_label_variant_id_fkey"
            columns: ["white_label_variant_id"]
            isOneToOne: false
            referencedRelation: "white_label_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_variants: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          monthly_price_cents: number
          stripe_price_id: string | null
          max_workspaces: number
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          monthly_price_cents?: number
          stripe_price_id?: string | null
          max_workspaces?: number
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          monthly_price_cents?: number
          stripe_price_id?: string | null
          max_workspaces?: number
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
    }
    Enums: {
      agent_provider: "vapi" | "retell" | "synthflow"
      agent_direction: "inbound" | "outbound"
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
      knowledge_document_status: "draft" | "processing" | "active" | "archived" | "error"
      knowledge_document_type: "document" | "faq" | "product_info" | "policy" | "script" | "other"
      lead_source: "voice_agent" | "manual" | "import" | "api" | "webhook"
      lead_status: "new" | "contacted" | "qualified" | "converted" | "lost" | "nurturing"
      model_provider: "openai" | "anthropic" | "google" | "groq"
      partner_request_status: "pending" | "approved" | "rejected" | "provisioning"
      phone_number_status: "available" | "assigned" | "pending" | "inactive" | "error"
      phone_number_provider: "sip" | "vapi" | "retell" | "twilio"
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
      subscription_status: "trialing" | "active" | "past_due" | "canceled" | "unpaid"
      sync_status: "not_synced" | "pending" | "synced" | "error"
      transcriber_provider: "deepgram" | "assemblyai" | "openai"
      user_role: "org_owner" | "org_admin" | "org_member"
      user_status: "pending_invitation" | "active" | "inactive" | "suspended"
      voice_provider: "elevenlabs" | "deepgram" | "azure" | "openai" | "cartesia"
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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
      knowledge_document_status: ["draft", "processing", "active", "archived", "error"],
      knowledge_document_type: ["document", "faq", "product_info", "policy", "script", "other"],
      lead_source: ["voice_agent", "manual", "import", "api", "webhook"],
      lead_status: ["new", "contacted", "qualified", "converted", "lost", "nurturing"],
      model_provider: ["openai", "anthropic", "google", "groq"],
      partner_request_status: ["pending", "approved", "rejected", "provisioning"],
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
      subscription_status: ["trialing", "active", "past_due", "canceled", "unpaid"],
      sync_status: ["not_synced", "pending", "synced", "error"],
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
export type SyncStatus = "not_synced" | "pending" | "synced" | "error"

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
export type SuperAdmin = Tables<"super_admin">
export type Partner = Tables<"partners">
export type PartnerDomain = Tables<"partner_domains">
export type PartnerRequest = Tables<"partner_requests">
export type Workspace = Tables<"workspaces">
export type WorkspaceInvitation = Tables<"workspace_invitations">
export type WorkspaceMember = Tables<"workspace_members">
export type Conversation = Tables<"conversations">
export type UsageTracking = Tables<"usage_tracking">
export type User = Tables<"users">
export type AuditLog = Tables<"audit_log">
export type WorkspaceIntegration = Tables<"workspace_integrations">
export type PartnerMember = Tables<"partner_members">
export type PartnerInvitation = Tables<"partner_invitations">

// AIAgent type with typed config and api keys
export type AIAgent = Omit<
  Tables<"ai_agents">,
  "config" | "agent_secret_api_key" | "agent_public_api_key"
> & {
  config: AgentConfig
  agent_secret_api_key: AgentSecretApiKey[] | null
  agent_public_api_key: AgentPublicApiKey[] | null
}

// Agent provider type from enum
export type AgentProvider = Database["public"]["Enums"]["agent_provider"]

// ============================================================================
// FUNCTION TOOL TYPES
// ============================================================================

/**
 * JSON Schema for function parameters
 * Follows OpenAI function calling schema format
 */
export interface FunctionToolParameterProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object"
  description?: string
  enum?: string[]
  items?: FunctionToolParameterProperty
  properties?: Record<string, FunctionToolParameterProperty>
  required?: string[]
  default?: unknown
}

export interface FunctionToolParameters {
  type: "object"
  properties: Record<string, FunctionToolParameterProperty>
  required?: string[]
}

/**
 * Built-in tool types supported by voice AI providers
 * 
 * Call Control:
 * - 'endCall': Built-in tool to end the call
 * - 'transferCall': Built-in tool to transfer the call
 * - 'dtmf': Built-in tool for dial-tone multi-frequency signals
 * - 'handoff': Hand off to another assistant
 * 
 * API Integration:
 * - 'function': Custom function that calls your server
 * - 'apiRequest': Make HTTP API requests
 * 
 * Code Execution:
 * - 'code': Execute Node.js or Python code
 * - 'bash': Execute bash commands
 * - 'computer': Computer use automation
 * - 'textEditor': Text editing
 * 
 * Data:
 * - 'query': Query knowledge bases
 * 
 * Google Integration:
 * - 'googleCalendarCreateEvent': Create Google Calendar events
 * - 'googleCalendarCheckAvailability': Check calendar availability
 * - 'googleSheetsRowAppend': Append rows to Google Sheets
 * 
 * Communication:
 * - 'slackSendMessage': Send Slack messages
 * - 'smsSend': Send SMS messages
 * 
 * GoHighLevel:
 * - 'goHighLevelCalendarAvailability': Check GHL calendar availability
 * - 'goHighLevelCalendarEventCreate': Create GHL calendar events
 * - 'goHighLevelContactCreate': Create GHL contacts
 * - 'goHighLevelContactGet': Get GHL contacts
 * 
 * Other:
 * - 'mcp': Model Context Protocol integration
 */
export type FunctionToolType =
  // Call Control (VAPI)
  | 'endCall'
  | 'transferCall'
  | 'dtmf'
  | 'handoff'
  // Call Control (Retell)
  | 'end_call'
  | 'transfer_call'
  | 'press_digit'   // Retell uses singular form
  | 'press_digits'  // Legacy/alias
  // Calendar Integration (Retell)
  | 'check_availability_cal'
  | 'book_appointment_cal'
  // Communication (Retell)
  | 'send_sms'
  // API Integration
  | 'function'        // Custom webhook function
  | 'custom_function' // Retell explicit custom function
  | 'apiRequest'
  // Code Execution
  | 'code'
  | 'bash'
  | 'computer'
  | 'textEditor'
  // Data
  | 'query'
  // Google
  | 'googleCalendarCreateEvent'
  | 'googleCalendarCheckAvailability'
  | 'googleSheetsRowAppend'
  // Communication (VAPI)
  | 'slackSendMessage'
  | 'smsSend'
  // GoHighLevel
  | 'goHighLevelCalendarAvailability'
  | 'goHighLevelCalendarEventCreate'
  | 'goHighLevelContactCreate'
  | 'goHighLevelContactGet'
  // Other
  | 'mcp'

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

  // ============================================================================
  // API REQUEST TOOL PROPERTIES
  // ============================================================================
  
  /** HTTP method for apiRequest tool */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Target URL for apiRequest tool */
  url?: string
  /** Request timeout in seconds */
  timeout_seconds?: number
  /** Request headers schema */
  headers_schema?: FunctionToolParameters
  /** Request headers as key-value pairs */
  headers?: Record<string, string>
  /** Request body schema */
  body_schema?: FunctionToolParameters

  // ============================================================================
  // TRANSFER CALL TOOL PROPERTIES
  // ============================================================================
  
  /** Transfer destinations for transferCall tool */
  destinations?: Array<{
    type: 'number' | 'sip'
    number?: string
    sipUri?: string
    description?: string
  }>

  // ============================================================================
  // CODE EXECUTION TOOL PROPERTIES
  // ============================================================================
  
  /** Runtime for code tool */
  runtime?: 'node18' | 'python3.11'
  /** Code to execute */
  code?: string
  /** Dependencies to install */
  dependencies?: string[]

  // ============================================================================
  // HANDOFF TOOL PROPERTIES
  // ============================================================================
  
  /** Assistant ID for handoff tool */
  assistant_id?: string
  /** Squad ID for handoff tool */
  squad_id?: string

  // ============================================================================
  // QUERY TOOL PROPERTIES
  // ============================================================================
  
  /** Knowledge base IDs for query tool */
  knowledge_base_ids?: string[]
  /** Number of results to return */
  top_k?: number

  // ============================================================================
  // CREDENTIAL-BASED TOOL PROPERTIES
  // (Google, GHL, Slack, SMS)
  // ============================================================================
  
  /** Credential ID for authenticated tools */
  credential_id?: string

  // ============================================================================
  // MCP TOOL PROPERTIES
  // ============================================================================
  
  /** MCP server URL */
  mcp_server_url?: string
  /** MCP tool name */
  mcp_tool_name?: string
  /** MCP arguments */
  mcp_arguments?: Record<string, unknown>

  // ============================================================================
  // RETELL PRE-BUILT TOOL PROPERTIES (general_tools)
  // ============================================================================

  /**
   * Retell transfer destination (for transfer_call).
   * Matches the structure Retell expects under `transfer_destination`.
   */
  transfer_destination?: {
    type: 'predefined'
    number: string
    /** If true, bypass E.164 phone number format validation */
    ignore_e164_validation?: boolean
  }

  /**
   * Retell transfer options (for transfer_call).
   */
  transfer_option?: {
    type: 'cold_transfer' | 'warm_transfer'
    /** If true, show the transferee as the caller */
    show_transferee_as_caller?: boolean
  }

  /** Digits to press (for press_digit / press_digits). */
  digits?: string

  /** Cal.com API key (for check_availability_cal / book_appointment_cal). */
  cal_api_key?: string
  /** Cal.com event type id (for check_availability_cal / book_appointment_cal). */
  event_type_id?: number
  /** Timezone (for check_availability_cal / book_appointment_cal). */
  timezone?: string

  /** From number for send_sms (Twilio integration). */
  from_number?: string

  // ============================================================================
  // CUSTOM FUNCTION TOOL PROPERTIES (Retell custom_function)
  // ============================================================================

  /** Message to speak when the webhook succeeds */
  success_message?: string
  /** Message to speak when the webhook fails */
  error_message?: string

  // ============================================================================
  // EXTERNAL SYNC
  // ============================================================================
  
  /** External tool ID (if synced to provider) */
  external_tool_id?: string
}

/**
 * Zod schema for FunctionTool validation
 */
export const functionToolParameterPropertySchema: z.ZodType<FunctionToolParameterProperty> = z.lazy(
  () =>
    z.object({
      type: z.enum(["string", "number", "integer", "boolean", "array", "object"]),
      description: z.string().optional(),
      enum: z.array(z.string()).optional(),
      items: functionToolParameterPropertySchema.optional(),
      properties: z.record(z.string(), functionToolParameterPropertySchema).optional(),
      required: z.array(z.string()).optional(),
      default: z.unknown().optional(),
    })
)

export const functionToolParametersSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), functionToolParameterPropertySchema),
  required: z.array(z.string()).optional(),
})

export const functionToolTypeSchema = z.enum([
  // Call Control (VAPI)
  'endCall',
  'transferCall',
  'dtmf',
  'handoff',
  // Call Control (Retell)
  'end_call',
  'transfer_call',
  'press_digit',
  'press_digits',
  // Calendar Integration (Retell)
  'check_availability_cal',
  'book_appointment_cal',
  // Communication (Retell)
  'send_sms',
  // API Integration
  'function',
  'custom_function',
  'apiRequest',
  // Code Execution
  'code',
  'bash',
  'computer',
  'textEditor',
  // Data
  'query',
  // Google
  'googleCalendarCreateEvent',
  'googleCalendarCheckAvailability',
  'googleSheetsRowAppend',
  // Communication (VAPI)
  'slackSendMessage',
  'smsSend',
  // GoHighLevel
  'goHighLevelCalendarAvailability',
  'goHighLevelCalendarEventCreate',
  'goHighLevelContactCreate',
  'goHighLevelContactGet',
  // Other
  'mcp',
])

export const functionToolSchema = z.object({
  id: z.string(),
  name: z
    .string()
    .min(1, "Function name is required")
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Function name must be a valid identifier"),
  description: z.string().min(1, "Description is required"),
  parameters: functionToolParametersSchema,
  tool_type: functionToolTypeSchema.optional().default("function"),
  async: z.boolean().optional(),
  server_url: z.string().url().optional(),
  speak_during_execution: z.boolean().optional(),
  execution_message: z.string().optional(),
  enabled: z.boolean().optional().default(true),

  // API Request properties
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  url: z.string().optional(),  // URL can be empty initially
  timeout_seconds: z.number().positive().optional(),
  headers_schema: functionToolParametersSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body_schema: functionToolParametersSchema.optional(),

  // Transfer Call properties
  destinations: z.array(z.object({
    type: z.enum(['number', 'sip']),
    number: z.string().optional(),
    sipUri: z.string().optional(),
    description: z.string().optional(),
  })).optional(),

  // Retell transfer_call properties
  transfer_destination: z.object({
    type: z.literal('predefined'),
    number: z.string().min(1),
  }).optional(),

  // Retell Cal.com tool properties
  cal_api_key: z.string().optional(),
  event_type_id: z.number().int().positive().optional(),
  timezone: z.string().optional(),

  // Code Execution properties
  runtime: z.enum(['node18', 'python3.11']).optional(),
  code: z.string().optional(),
  dependencies: z.array(z.string()).optional(),

  // Handoff properties
  assistant_id: z.string().optional(),
  squad_id: z.string().optional(),

  // Query properties
  knowledge_base_ids: z.array(z.string()).optional(),
  top_k: z.number().positive().optional(),

  // Credential-based properties
  credential_id: z.string().optional(),

  // MCP properties
  mcp_server_url: z.string().url().optional(),
  mcp_tool_name: z.string().optional(),
  mcp_arguments: z.record(z.string(), z.unknown()).optional(),

  // External sync
  external_tool_id: z.string().optional(),
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
    injection_mode?: "system_prompt"
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
// TELEPHONY TYPES
// ============================================================================

export type AgentDirection = "inbound" | "outbound"
export type PhoneNumberStatus = "available" | "assigned" | "pending" | "inactive" | "error"
export type PhoneNumberProvider = "sip" | "vapi" | "retell" | "twilio"

/**
 * SIP Trunk configuration for partner-level telephony
 */
export interface SipTrunk {
  id: string
  partner_id: string
  name: string
  description: string | null
  sip_server: string
  sip_port: number
  sip_transport: "udp" | "tcp" | "tls"
  sip_username: string
  sip_password: string
  sip_realm: string | null
  register: boolean
  registration_expiry: number
  outbound_proxy: string | null
  outbound_caller_id: string | null
  is_active: boolean
  is_default: boolean
  last_registration_at: string | null
  registration_status: string | null
  registration_error: string | null
  provider: string | null
  external_credential_id: string | null
  config: Record<string, unknown>
  created_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Phone number in the partner's inventory
 */
export interface PhoneNumber {
  id: string
  partner_id: string
  phone_number: string
  phone_number_e164: string | null
  friendly_name: string | null
  description: string | null
  country_code: string | null
  provider: PhoneNumberProvider
  external_id: string | null
  sip_uri: string | null
  sip_trunk_id: string | null
  sip_trunk_id_ref: string | null
  status: PhoneNumberStatus
  assigned_agent_id: string | null
  assigned_workspace_id: string | null
  assigned_at: string | null
  supports_inbound: boolean
  supports_outbound: boolean
  supports_sms: boolean
  config: Record<string, unknown>
  created_by: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Zod schemas for telephony validation
 */
export const agentDirectionSchema = z.enum(["inbound", "outbound"])
export const phoneNumberStatusSchema = z.enum(["available", "assigned", "pending", "inactive", "error"])
export const phoneNumberProviderSchema = z.enum(["sip", "vapi", "retell", "twilio"])

export const createSipTrunkSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional().nullable(),
  sip_server: z.string().min(1, "SIP server is required").max(255),
  sip_port: z.number().int().min(1).max(65535).default(5060),
  sip_transport: z.enum(["udp", "tcp", "tls"]).default("udp"),
  sip_username: z.string().min(1, "SIP username is required").max(255),
  sip_password: z.string().min(1, "SIP password is required"),
  sip_realm: z.string().max(255).optional().nullable(),
  register: z.boolean().default(true),
  registration_expiry: z.number().int().min(60).max(86400).default(3600),
  outbound_proxy: z.string().max(255).optional().nullable(),
  outbound_caller_id: z.string().max(50).optional().nullable(),
  is_default: z.boolean().default(false),
})

export type CreateSipTrunkInput = z.infer<typeof createSipTrunkSchema>

export const updateSipTrunkSchema = createSipTrunkSchema.partial()
export type UpdateSipTrunkInput = z.infer<typeof updateSipTrunkSchema>

export const createPhoneNumberSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required").max(50),
  phone_number_e164: z.string().max(20).optional().nullable(),
  friendly_name: z.string().max(255).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  country_code: z.string().max(5).optional().nullable(),
  provider: phoneNumberProviderSchema.default("sip"),
  external_id: z.string().max(255).optional().nullable(),
  sip_uri: z.string().max(500).optional().nullable(),
  sip_trunk_id_ref: z.string().uuid().optional().nullable(),
  supports_inbound: z.boolean().default(true),
  supports_outbound: z.boolean().default(true),
  supports_sms: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()).optional().default({}),
})

export type CreatePhoneNumberInput = z.infer<typeof createPhoneNumberSchema>

export const updatePhoneNumberSchema = createPhoneNumberSchema.partial().extend({
  status: phoneNumberStatusSchema.optional(),
  assigned_agent_id: z.string().uuid().optional().nullable(),
  assigned_workspace_id: z.string().uuid().optional().nullable(),
})

export type UpdatePhoneNumberInput = z.infer<typeof updatePhoneNumberSchema>

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface ConversationWithAgent extends Conversation {
  agent?: Pick<Tables<"ai_agents">, "id" | "name" | "provider" | "voice_provider" | "model_provider" | "transcriber_provider"> | null
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

export type WorkspaceMemberRole = "owner" | "admin" | "member" | "viewer"
export type PartnerMemberRole = "owner" | "admin" | "member"

export interface AccessibleWorkspace {
  id: string
  name: string
  slug: string
  partner_id: string
  description: string | null
  role: WorkspaceMemberRole
  resource_limits: Record<string, unknown>
  status: string
  /** True if user has access via partner admin role (not direct workspace membership) */
  is_partner_admin_access?: boolean
  /** Owner email for display purposes (only populated for partner admin view) */
  owner_email?: string | null
  /** Member count for display purposes (only populated for partner admin view) */
  member_count?: number
  /** Agent count for display purposes (only populated for partner admin view) */
  agent_count?: number
  /** Created at timestamp */
  created_at?: string
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
  // Subdomain for the platform (e.g., "acme-corp" → acme-corp.genius365.app)
  desired_subdomain: z
    .string()
    .min(3, "Subdomain must be at least 3 characters")
    .max(50, "Subdomain must be 50 characters or less")
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/,
      "Subdomain must be lowercase alphanumeric with hyphens (no leading/trailing hyphens)"
    ),
  // Custom domain is now OPTIONAL - configured during onboarding after approval
  custom_domain: z.string().optional().nullable(),
  // Partner tier selection - all white-label partners default to "partner" tier
  // Legacy values (starter, professional, enterprise) are mapped to "partner" tier
  selected_plan: z.string().default("partner"),
  // Selected white-label variant ID (agency's desired plan)
  selected_white_label_variant_id: z.string().uuid().optional(),
  expected_users: z.number().optional(),
  branding_data: z
    .object({
      logo_url: z.string().optional(),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
      company_name: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type CreatePartnerRequestInput = z.infer<typeof createPartnerRequestSchema>

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  resource_limits: z
    .object({
      max_agents: z.number().optional(),
      max_users: z.number().optional(),
      max_minutes_per_month: z.number().optional(),
    })
    .optional(),
})

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>

export const createWorkspaceIntegrationSchema = z.object({
  provider: z.enum([
    "vapi",
    "retell",
    "synthflow",
    "hubspot",
    "salesforce",
    "zapier",
    "slack",
    "algolia",
  ] as const),
  name: z.string().min(1, "Connection name is required").max(255),
  default_secret_key: z.string().min(1, "Default secret API key is required"),
  default_public_key: z.string().optional(),
  additional_keys: z.array(additionalApiKeySchema).optional().default([]),
  config: z.record(z.string(), z.unknown()).optional(),
})

// ============================================================================
// WHITE-LABEL VARIANT TYPES AND SCHEMAS
// ============================================================================

/**
 * White-label variant (plan tier for agencies)
 * Managed by super admin to define pricing and workspace limits
 */
export interface WhiteLabelVariant {
  id: string
  slug: string
  name: string
  description: string | null
  monthly_price_cents: number
  stripe_product_id: string | null
  stripe_price_id: string | null
  max_workspaces: number // -1 = unlimited
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export const createWhiteLabelVariantSchema = z.object({
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be 50 characters or less")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  monthly_price_cents: z.number().int().min(0, "Price must be non-negative").default(0),
  // stripe_product_id and stripe_price_id are auto-created when monthlyPriceCents > 0
  max_workspaces: z.number().int().default(10), // -1 = unlimited
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

export type CreateWhiteLabelVariantInput = z.infer<typeof createWhiteLabelVariantSchema>

export const updateWhiteLabelVariantSchema = z.object({
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be 50 characters or less")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  name: z.string().min(1, "Name is required").max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  monthly_price_cents: z.number().int().min(0, "Price must be non-negative").optional(),
  // stripe_product_id and stripe_price_id are auto-managed based on price changes
  max_workspaces: z.number().int().optional(), // -1 = unlimited
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

export type UpdateWhiteLabelVariantInput = z.infer<typeof updateWhiteLabelVariantSchema>

// ============================================================================
// ALGOLIA INTEGRATION CONFIG
// ============================================================================

/**
 * Configuration for Algolia workspace integration
 * Stored in workspace_integrations.config for provider="algolia"
 */
export interface AlgoliaIntegrationConfig {
  /** Algolia Application ID */
  app_id: string
  /** Algolia Admin API Key (for indexing - server-side only) */
  admin_api_key: string
  /** Algolia Search API Key (for querying - can be exposed to client) */
  search_api_key: string
  /** Index name for call logs */
  call_logs_index?: string
}

export const algoliaIntegrationConfigSchema = z.object({
  app_id: z.string().min(1, "Algolia App ID is required"),
  admin_api_key: z.string().min(1, "Algolia Admin API Key is required"),
  search_api_key: z.string().min(1, "Algolia Search API Key is required"),
  call_logs_index: z.string().optional(),
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

export type KnowledgeDocumentType =
  | "document"
  | "faq"
  | "product_info"
  | "policy"
  | "script"
  | "other"
export type KnowledgeDocumentStatus = "draft" | "processing" | "active" | "archived" | "error"

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
  "document",
  "faq",
  "product_info",
  "policy",
  "script",
  "other",
])

export const knowledgeDocumentStatusSchema = z.enum([
  "draft",
  "processing",
  "active",
  "archived",
  "error",
])

export const createKnowledgeDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(2000).optional(),
  document_type: knowledgeDocumentTypeSchema.default("document"),
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
// CALL CAMPAIGNS TYPES AND SCHEMAS
// ============================================================================

export type CampaignStatus = "draft" | "ready" | "scheduled" | "active" | "paused" | "completed" | "cancelled"
export type CampaignScheduleType = "immediate" | "scheduled"
export type RecipientCallStatus =
  | "pending"
  | "queued"
  | "calling"
  | "completed"
  | "failed"
  | "skipped"
export type RecipientCallOutcome =
  | "answered"
  | "no_answer"
  | "busy"
  | "voicemail"
  | "invalid_number"
  | "declined"
  | "error"

export const campaignStatusSchema = z.enum(["draft", "ready", "scheduled", "active", "paused", "completed", "cancelled"])
export const campaignScheduleTypeSchema = z.enum(["immediate", "scheduled"])
export const recipientCallStatusSchema = z.enum([
  "pending",
  "queued",
  "calling",
  "completed",
  "failed",
  "skipped",
])
export const recipientCallOutcomeSchema = z.enum([
  "answered",
  "no_answer",
  "busy",
  "voicemail",
  "invalid_number",
  "declined",
  "error",
])

export interface CallCampaign {
  id: string
  workspace_id: string
  agent_id: string
  name: string
  description: string | null
  status: CampaignStatus
  schedule_type: CampaignScheduleType
  scheduled_start_at: string | null
  scheduled_expires_at: string | null
  business_hours_only: boolean
  business_hours_start: string | null
  business_hours_end: string | null
  timezone: string
  concurrency_limit: number
  max_attempts: number
  retry_delay_minutes: number
  total_recipients: number
  pending_calls: number
  completed_calls: number
  successful_calls: number
  failed_calls: number
  created_by: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  deleted_at: string | null
  // New wizard fields
  business_hours_config: BusinessHoursConfig | null
  variable_mappings: VariableMapping[]
  agent_prompt_overrides: AgentPromptOverrides | null
  wizard_completed: boolean
  csv_column_headers: string[]
}

export interface CallCampaignWithAgent extends CallCampaign {
  agent?: Pick<Tables<"ai_agents">, "id" | "name" | "provider" | "is_active"> | null
}

export interface CallRecipient {
  id: string
  campaign_id: string
  workspace_id: string
  phone_number: string
  phone_country_code: string | null
  phone_validated: boolean
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
  custom_variables: Record<string, unknown>
  call_status: RecipientCallStatus
  call_outcome: RecipientCallOutcome | null
  attempts: number
  last_attempt_at: string | null
  next_attempt_at: string | null
  conversation_id: string | null
  external_call_id: string | null
  call_duration_seconds: number | null
  call_started_at: string | null
  call_ended_at: string | null
  call_cost: number | null
  last_error: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// ENHANCED CAMPAIGN TYPES FOR WIZARD FLOW
// ============================================================================

// Business hours time slot
export interface BusinessHoursTimeSlot {
  start: string  // "09:00"
  end: string    // "18:00"
}

// Days of the week type
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"

// Business hours schedule per day
export interface BusinessHoursSchedule {
  monday: BusinessHoursTimeSlot[]
  tuesday: BusinessHoursTimeSlot[]
  wednesday: BusinessHoursTimeSlot[]
  thursday: BusinessHoursTimeSlot[]
  friday: BusinessHoursTimeSlot[]
  saturday: BusinessHoursTimeSlot[]
  sunday: BusinessHoursTimeSlot[]
}

// Full business hours configuration
export interface BusinessHoursConfig {
  enabled: boolean
  timezone: string
  schedule: BusinessHoursSchedule
}

// Variable mapping from CSV to agent prompt
export interface VariableMapping {
  csv_column: string
  prompt_placeholder: string
  default_value: string
}

// Agent prompt overrides for campaign
export interface AgentPromptOverrides {
  greeting_override?: string
  system_prompt_additions?: string
}

// Zod schemas for new types
export const businessHoursTimeSlotSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
})

export const businessHoursScheduleSchema = z.object({
  monday: z.array(businessHoursTimeSlotSchema).default([]),
  tuesday: z.array(businessHoursTimeSlotSchema).default([]),
  wednesday: z.array(businessHoursTimeSlotSchema).default([]),
  thursday: z.array(businessHoursTimeSlotSchema).default([]),
  friday: z.array(businessHoursTimeSlotSchema).default([]),
  saturday: z.array(businessHoursTimeSlotSchema).default([]),
  sunday: z.array(businessHoursTimeSlotSchema).default([]),
})

export const businessHoursConfigSchema = z.object({
  enabled: z.boolean().default(false),
  timezone: z.string().default("UTC"),
  schedule: businessHoursScheduleSchema.default({
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }),
})

export const variableMappingSchema = z.object({
  csv_column: z.string().min(1),
  prompt_placeholder: z.string().min(1),
  default_value: z.string().optional().default(""),
})

export const agentPromptOverridesSchema = z.object({
  greeting_override: z.string().optional(),
  system_prompt_additions: z.string().optional(),
}).nullable()

// Create Recipient Schema (phone is required) - MUST be defined before wizard schema
export const createRecipientSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required").max(50),
  first_name: z.string().max(255).optional().nullable(),
  last_name: z.string().max(255).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  company: z.string().max(255).optional().nullable(),
  // New standard columns for Inspra API integration
  reason_for_call: z.string().max(500).optional().nullable(),
  address_line_1: z.string().max(255).optional().nullable(),
  address_line_2: z.string().max(255).optional().nullable(),
  suburb: z.string().max(255).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  post_code: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
})

// Create Campaign Schema (legacy - still works)
export const createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(255),
  description: z.string().max(2000).optional().nullable(),
  agent_id: z.string().uuid("Please select an agent"),
  schedule_type: campaignScheduleTypeSchema.default("immediate"),
  scheduled_start_at: z.string().datetime().optional().nullable(),
  scheduled_expires_at: z.string().datetime().optional().nullable(),
  business_hours_only: z.boolean().default(false),
  business_hours_start: z.string().optional().nullable(),
  business_hours_end: z.string().optional().nullable(),
  timezone: z.string().default("UTC"),
  concurrency_limit: z.number().int().min(1).max(10).default(1),
  max_attempts: z.number().int().min(1).max(5).default(3),
  retry_delay_minutes: z.number().int().min(5).default(30),
})

// Enhanced Campaign Wizard Schema (new wizard flow)
export const createCampaignWizardSchema = z.object({
  // Step 1: Basic Details
  name: z.string().min(1, "Campaign name is required").max(255),
  description: z.string().max(2000).optional().nullable(),
  agent_id: z.string().uuid("Please select an agent"),
  
  // Step 2: Recipients (optional - can be added separately)
  recipients: z.array(createRecipientSchema).optional().default([]),
  csv_column_headers: z.array(z.string()).optional().default([]),
  
  // Step 3: Variable Mappings (auto-generated from CSV)
  variable_mappings: z.array(variableMappingSchema).optional().default([]),
  agent_prompt_overrides: agentPromptOverridesSchema.optional().nullable(),
  
  // Step 3: Schedule & Business Hours
  schedule_type: campaignScheduleTypeSchema.default("immediate"),
  scheduled_start_at: z.string().datetime().optional().nullable(),
  scheduled_expires_at: z.string().datetime().optional().nullable(),
  business_hours_config: businessHoursConfigSchema.optional(),
  
  // Step 4: Advanced Settings (legacy fields still supported)
  business_hours_only: z.boolean().default(false),
  business_hours_start: z.string().optional().nullable(),
  business_hours_end: z.string().optional().nullable(),
  timezone: z.string().default("UTC"),
  concurrency_limit: z.number().int().min(1).max(10).default(1),
  max_attempts: z.number().int().min(1).max(5).default(3),
  retry_delay_minutes: z.number().int().min(5).default(30),
  
  // Wizard metadata
  wizard_completed: z.boolean().default(true),
  
  // Optional: Existing draft ID to update instead of creating new
  draft_id: z.string().uuid().optional(),
})
.refine(
  (data) => {
    // If scheduled, start date is required
    if (data.schedule_type === "scheduled" && !data.scheduled_start_at) {
      return false
    }
    // If expiry is set, it must be after start date
    if (data.scheduled_expires_at && data.scheduled_start_at) {
      return new Date(data.scheduled_expires_at) > new Date(data.scheduled_start_at)
    }
    return true
  },
  {
    message: "Expiry date must be after start date",
    path: ["scheduled_expires_at"],
  }
)

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: campaignStatusSchema.optional(),
  // New wizard fields can be updated too
  business_hours_config: businessHoursConfigSchema.optional(),
  variable_mappings: z.array(variableMappingSchema).optional(),
  agent_prompt_overrides: agentPromptOverridesSchema.optional(),
  csv_column_headers: z.array(z.string()).optional(),
  scheduled_expires_at: z.string().datetime().optional().nullable(),
})

// Input types for form handling
export type CreateCampaignFormInput = z.input<typeof createCampaignSchema>
// Output types after validation/transforms
export type CreateCampaignInput = z.output<typeof createCampaignSchema>
export type UpdateCampaignInput = z.output<typeof updateCampaignSchema>

// Wizard types
export type CreateCampaignWizardFormInput = z.input<typeof createCampaignWizardSchema>
export type CreateCampaignWizardInput = z.output<typeof createCampaignWizardSchema>

export const updateRecipientSchema = createRecipientSchema.partial().extend({
  call_status: recipientCallStatusSchema.optional(),
  call_outcome: recipientCallOutcomeSchema.optional().nullable(),
})

// Bulk import schema
export const importRecipientsSchema = z.object({
  recipients: z
    .array(createRecipientSchema)
    .min(1, "At least one recipient is required")
    .max(10000, "Maximum 10,000 recipients per import"),
})

// Input types for form handling  
export type CreateRecipientFormInput = z.input<typeof createRecipientSchema>
// Output types after validation/transforms
export type CreateRecipientInput = z.output<typeof createRecipientSchema>
export type UpdateRecipientInput = z.output<typeof updateRecipientSchema>
export type ImportRecipientsInput = z.output<typeof importRecipientsSchema>

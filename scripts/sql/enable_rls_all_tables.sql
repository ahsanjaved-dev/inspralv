-- =============================================================================
-- GENIUS365 ROW LEVEL SECURITY (RLS) MIGRATION
-- =============================================================================
-- This script:
-- 1. Checks which tables have RLS disabled
-- 2. Enables RLS on all tables
-- 3. Creates appropriate policies for each table
--
-- Run this in Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- STEP 1: CHECK CURRENT RLS STATUS
-- Run this first to see which tables need RLS
-- =============================================================================

SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE '_prisma_%'
ORDER BY rls_enabled, tablename;

-- =============================================================================
-- STEP 2: ENABLE RLS ON ALL TABLES
-- =============================================================================

-- Partners (Organizations/Agencies)
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- Partner Domains
ALTER TABLE public.partner_domains ENABLE ROW LEVEL SECURITY;

-- Partner Members
ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;

-- Partner Invitations
ALTER TABLE public.partner_invitations ENABLE ROW LEVEL SECURITY;

-- Partner Requests
ALTER TABLE public.partner_requests ENABLE ROW LEVEL SECURITY;

-- Workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Workspace Members
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspace Invitations
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Workspace Integrations (Legacy)
ALTER TABLE public.workspace_integrations ENABLE ROW LEVEL SECURITY;

-- Partner Integrations
ALTER TABLE public.partner_integrations ENABLE ROW LEVEL SECURITY;

-- Workspace Integration Assignments
ALTER TABLE public.workspace_integration_assignments ENABLE ROW LEVEL SECURITY;

-- AI Agents
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Conversations (Call Records)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Usage Tracking
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Super Admin
ALTER TABLE public.super_admin ENABLE ROW LEVEL SECURITY;

-- Knowledge Documents
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Agent Knowledge Documents (Junction)
ALTER TABLE public.agent_knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- SIP Trunks
ALTER TABLE public.sip_trunks ENABLE ROW LEVEL SECURITY;

-- Phone Numbers
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;

-- Audit Log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Billing Credits
ALTER TABLE public.billing_credits ENABLE ROW LEVEL SECURITY;

-- Credit Transactions
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Workspace Credits
ALTER TABLE public.workspace_credits ENABLE ROW LEVEL SECURITY;

-- Workspace Credit Transactions
ALTER TABLE public.workspace_credit_transactions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 3: CREATE RLS POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- USERS TABLE
-- Users can only see their own profile
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users_service_role_all" ON public.users;
CREATE POLICY "users_service_role_all" ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- SUPER ADMIN TABLE
-- Only service role can access
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_service_role_only" ON public.super_admin;
CREATE POLICY "super_admin_service_role_only" ON public.super_admin
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PARTNERS TABLE
-- Partner members can see their own partner
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "partners_select" ON public.partners;
CREATE POLICY "partners_select" ON public.partners
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partners_update" ON public.partners;
CREATE POLICY "partners_update" ON public.partners
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partners_service_role_all" ON public.partners;
CREATE POLICY "partners_service_role_all" ON public.partners
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PARTNER DOMAINS TABLE
-- Partner members can see/manage domains for their partner
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_domains_select" ON public.partner_domains;
CREATE POLICY "partner_domains_select" ON public.partner_domains
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_domains_insert" ON public.partner_domains;
CREATE POLICY "partner_domains_insert" ON public.partner_domains
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_domains_update" ON public.partner_domains;
CREATE POLICY "partner_domains_update" ON public.partner_domains
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_domains_delete" ON public.partner_domains;
CREATE POLICY "partner_domains_delete" ON public.partner_domains
  FOR DELETE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_domains_service_role_all" ON public.partner_domains;
CREATE POLICY "partner_domains_service_role_all" ON public.partner_domains
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PARTNER MEMBERS TABLE
-- Partner members can see other members of their partner
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_members_select" ON public.partner_members;
CREATE POLICY "partner_members_select" ON public.partner_members
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members pm2 
      WHERE pm2.user_id = auth.uid() AND pm2.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_members_insert" ON public.partner_members;
CREATE POLICY "partner_members_insert" ON public.partner_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_members_update" ON public.partner_members;
CREATE POLICY "partner_members_update" ON public.partner_members
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_members_delete" ON public.partner_members;
CREATE POLICY "partner_members_delete" ON public.partner_members
  FOR DELETE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_members_service_role_all" ON public.partner_members;
CREATE POLICY "partner_members_service_role_all" ON public.partner_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PARTNER INVITATIONS TABLE
-- Partner admins can manage invitations
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_invitations_select" ON public.partner_invitations;
CREATE POLICY "partner_invitations_select" ON public.partner_invitations
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "partner_invitations_insert" ON public.partner_invitations;
CREATE POLICY "partner_invitations_insert" ON public.partner_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_invitations_update" ON public.partner_invitations;
CREATE POLICY "partner_invitations_update" ON public.partner_invitations
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "partner_invitations_delete" ON public.partner_invitations;
CREATE POLICY "partner_invitations_delete" ON public.partner_invitations
  FOR DELETE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_invitations_service_role_all" ON public.partner_invitations;
CREATE POLICY "partner_invitations_service_role_all" ON public.partner_invitations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PARTNER REQUESTS TABLE (White-label onboarding)
-- Only service role can manage (super admin operations)
-- Users can see their own requests
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_requests_select_own" ON public.partner_requests;
CREATE POLICY "partner_requests_select_own" ON public.partner_requests
  FOR SELECT
  TO authenticated
  USING (
    contact_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "partner_requests_insert" ON public.partner_requests;
CREATE POLICY "partner_requests_insert" ON public.partner_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "partner_requests_service_role_all" ON public.partner_requests;
CREATE POLICY "partner_requests_service_role_all" ON public.partner_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- WORKSPACES TABLE
-- Partner members can see workspaces in their partner
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select" ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
    OR id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert" ON public.workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
CREATE POLICY "workspaces_update" ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
    OR id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;
CREATE POLICY "workspaces_delete" ON public.workspaces
  FOR DELETE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role = 'owner' 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspaces_service_role_all" ON public.workspaces;
CREATE POLICY "workspaces_service_role_all" ON public.workspaces
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- WORKSPACE MEMBERS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members wm2 
      WHERE wm2.user_id = auth.uid() AND wm2.removed_at IS NULL
    )
    OR workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
CREATE POLICY "workspace_members_insert" ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
    OR workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() 
        AND pm.role IN ('owner', 'admin') 
        AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
CREATE POLICY "workspace_members_update" ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
    OR workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() 
        AND pm.role IN ('owner', 'admin') 
        AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;
CREATE POLICY "workspace_members_delete" ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
    OR workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() 
        AND pm.role IN ('owner', 'admin') 
        AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_members_service_role_all" ON public.workspace_members;
CREATE POLICY "workspace_members_service_role_all" ON public.workspace_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- WORKSPACE INVITATIONS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_invitations_select" ON public.workspace_invitations;
CREATE POLICY "workspace_invitations_select" ON public.workspace_invitations
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "workspace_invitations_insert" ON public.workspace_invitations;
CREATE POLICY "workspace_invitations_insert" ON public.workspace_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_invitations_update" ON public.workspace_invitations;
CREATE POLICY "workspace_invitations_update" ON public.workspace_invitations
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "workspace_invitations_delete" ON public.workspace_invitations;
CREATE POLICY "workspace_invitations_delete" ON public.workspace_invitations
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_invitations_service_role_all" ON public.workspace_invitations;
CREATE POLICY "workspace_invitations_service_role_all" ON public.workspace_invitations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- WORKSPACE INTEGRATIONS TABLE (Legacy)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_integrations_select" ON public.workspace_integrations;
CREATE POLICY "workspace_integrations_select" ON public.workspace_integrations
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integrations_insert" ON public.workspace_integrations;
CREATE POLICY "workspace_integrations_insert" ON public.workspace_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integrations_update" ON public.workspace_integrations;
CREATE POLICY "workspace_integrations_update" ON public.workspace_integrations
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integrations_delete" ON public.workspace_integrations;
CREATE POLICY "workspace_integrations_delete" ON public.workspace_integrations
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integrations_service_role_all" ON public.workspace_integrations;
CREATE POLICY "workspace_integrations_service_role_all" ON public.workspace_integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PARTNER INTEGRATIONS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_integrations_select" ON public.partner_integrations;
CREATE POLICY "partner_integrations_select" ON public.partner_integrations
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_integrations_insert" ON public.partner_integrations;
CREATE POLICY "partner_integrations_insert" ON public.partner_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_integrations_update" ON public.partner_integrations;
CREATE POLICY "partner_integrations_update" ON public.partner_integrations
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_integrations_delete" ON public.partner_integrations;
CREATE POLICY "partner_integrations_delete" ON public.partner_integrations
  FOR DELETE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "partner_integrations_service_role_all" ON public.partner_integrations;
CREATE POLICY "partner_integrations_service_role_all" ON public.partner_integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- WORKSPACE INTEGRATION ASSIGNMENTS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_integration_assignments_select" ON public.workspace_integration_assignments;
CREATE POLICY "workspace_integration_assignments_select" ON public.workspace_integration_assignments
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
    OR workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integration_assignments_insert" ON public.workspace_integration_assignments;
CREATE POLICY "workspace_integration_assignments_insert" ON public.workspace_integration_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() 
        AND pm.role IN ('owner', 'admin') 
        AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integration_assignments_update" ON public.workspace_integration_assignments;
CREATE POLICY "workspace_integration_assignments_update" ON public.workspace_integration_assignments
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() 
        AND pm.role IN ('owner', 'admin') 
        AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integration_assignments_delete" ON public.workspace_integration_assignments;
CREATE POLICY "workspace_integration_assignments_delete" ON public.workspace_integration_assignments
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() 
        AND pm.role IN ('owner', 'admin') 
        AND pm.removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_integration_assignments_service_role_all" ON public.workspace_integration_assignments;
CREATE POLICY "workspace_integration_assignments_service_role_all" ON public.workspace_integration_assignments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- AI AGENTS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ai_agents_select" ON public.ai_agents;
CREATE POLICY "ai_agents_select" ON public.ai_agents
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "ai_agents_insert" ON public.ai_agents;
CREATE POLICY "ai_agents_insert" ON public.ai_agents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin', 'member') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "ai_agents_update" ON public.ai_agents;
CREATE POLICY "ai_agents_update" ON public.ai_agents
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin', 'member') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "ai_agents_delete" ON public.ai_agents;
CREATE POLICY "ai_agents_delete" ON public.ai_agents
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "ai_agents_service_role_all" ON public.ai_agents;
CREATE POLICY "ai_agents_service_role_all" ON public.ai_agents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- CONVERSATIONS TABLE (Call Records)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;
CREATE POLICY "conversations_delete" ON public.conversations
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "conversations_service_role_all" ON public.conversations;
CREATE POLICY "conversations_service_role_all" ON public.conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- USAGE TRACKING TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "usage_tracking_select" ON public.usage_tracking;
CREATE POLICY "usage_tracking_select" ON public.usage_tracking
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "usage_tracking_service_role_all" ON public.usage_tracking;
CREATE POLICY "usage_tracking_service_role_all" ON public.usage_tracking
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- KNOWLEDGE DOCUMENTS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "knowledge_documents_select" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_select" ON public.knowledge_documents
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_insert" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_insert" ON public.knowledge_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin', 'member') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_update" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_update" ON public.knowledge_documents
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin', 'member') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_delete" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_delete" ON public.knowledge_documents
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_service_role_all" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_service_role_all" ON public.knowledge_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- AGENT KNOWLEDGE DOCUMENTS TABLE (Junction)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "agent_knowledge_documents_select" ON public.agent_knowledge_documents;
CREATE POLICY "agent_knowledge_documents_select" ON public.agent_knowledge_documents
  FOR SELECT
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents 
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members 
        WHERE user_id = auth.uid() AND removed_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "agent_knowledge_documents_insert" ON public.agent_knowledge_documents;
CREATE POLICY "agent_knowledge_documents_insert" ON public.agent_knowledge_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    agent_id IN (
      SELECT id FROM ai_agents 
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin', 'member') 
          AND removed_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "agent_knowledge_documents_delete" ON public.agent_knowledge_documents;
CREATE POLICY "agent_knowledge_documents_delete" ON public.agent_knowledge_documents
  FOR DELETE
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM ai_agents 
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin', 'member') 
          AND removed_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "agent_knowledge_documents_service_role_all" ON public.agent_knowledge_documents;
CREATE POLICY "agent_knowledge_documents_service_role_all" ON public.agent_knowledge_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- LEADS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "leads_insert" ON public.leads;
CREATE POLICY "leads_insert" ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "leads_delete" ON public.leads;
CREATE POLICY "leads_delete" ON public.leads
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "leads_service_role_all" ON public.leads;
CREATE POLICY "leads_service_role_all" ON public.leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- SIP TRUNKS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "sip_trunks_select" ON public.sip_trunks;
CREATE POLICY "sip_trunks_select" ON public.sip_trunks
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "sip_trunks_insert" ON public.sip_trunks;
CREATE POLICY "sip_trunks_insert" ON public.sip_trunks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "sip_trunks_update" ON public.sip_trunks;
CREATE POLICY "sip_trunks_update" ON public.sip_trunks
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "sip_trunks_delete" ON public.sip_trunks;
CREATE POLICY "sip_trunks_delete" ON public.sip_trunks
  FOR DELETE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "sip_trunks_service_role_all" ON public.sip_trunks;
CREATE POLICY "sip_trunks_service_role_all" ON public.sip_trunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PHONE NUMBERS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "phone_numbers_select" ON public.phone_numbers;
CREATE POLICY "phone_numbers_select" ON public.phone_numbers
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
    OR assigned_workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "phone_numbers_insert" ON public.phone_numbers;
CREATE POLICY "phone_numbers_insert" ON public.phone_numbers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "phone_numbers_update" ON public.phone_numbers;
CREATE POLICY "phone_numbers_update" ON public.phone_numbers
  FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "phone_numbers_delete" ON public.phone_numbers;
CREATE POLICY "phone_numbers_delete" ON public.phone_numbers
  FOR DELETE
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "phone_numbers_service_role_all" ON public.phone_numbers;
CREATE POLICY "phone_numbers_service_role_all" ON public.phone_numbers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- AUDIT LOG TABLE
-- Service role only - audit logs are write-only for security
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_log_service_role_all" ON public.audit_log;
CREATE POLICY "audit_log_service_role_all" ON public.audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Partner admins can read their own audit logs
DROP POLICY IF EXISTS "audit_log_partner_select" ON public.audit_log;
CREATE POLICY "audit_log_partner_select" ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
    OR (
      workspace_id IN (
        SELECT workspace_id FROM workspace_members 
        WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin') 
          AND removed_at IS NULL
      )
    )
  );

-- -----------------------------------------------------------------------------
-- BILLING CREDITS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "billing_credits_select" ON public.billing_credits;
CREATE POLICY "billing_credits_select" ON public.billing_credits
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "billing_credits_service_role_all" ON public.billing_credits;
CREATE POLICY "billing_credits_service_role_all" ON public.billing_credits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- CREDIT TRANSACTIONS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "credit_transactions_select" ON public.credit_transactions;
CREATE POLICY "credit_transactions_select" ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (
    billing_credits_id IN (
      SELECT id FROM billing_credits 
      WHERE partner_id IN (
        SELECT partner_id FROM partner_members 
        WHERE user_id = auth.uid() AND removed_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "credit_transactions_service_role_all" ON public.credit_transactions;
CREATE POLICY "credit_transactions_service_role_all" ON public.credit_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- WORKSPACE CREDITS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_credits_select" ON public.workspace_credits;
CREATE POLICY "workspace_credits_select" ON public.workspace_credits
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "workspace_credits_service_role_all" ON public.workspace_credits;
CREATE POLICY "workspace_credits_service_role_all" ON public.workspace_credits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- WORKSPACE CREDIT TRANSACTIONS TABLE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "workspace_credit_transactions_select" ON public.workspace_credit_transactions;
CREATE POLICY "workspace_credit_transactions_select" ON public.workspace_credit_transactions
  FOR SELECT
  TO authenticated
  USING (
    workspace_credits_id IN (
      SELECT id FROM workspace_credits 
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members 
        WHERE user_id = auth.uid() AND removed_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "workspace_credit_transactions_service_role_all" ON public.workspace_credit_transactions;
CREATE POLICY "workspace_credit_transactions_service_role_all" ON public.workspace_credit_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- STEP 4: VERIFY RLS IS ENABLED ON ALL TABLES
-- Run this after the migration to verify
-- =============================================================================

SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT LIKE '_prisma_%'
ORDER BY rls_enabled DESC, tablename;

-- =============================================================================
-- STEP 5: VIEW ALL POLICIES
-- Optional: Run this to see all created policies
-- =============================================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =============================================================================
-- DONE!
-- Run: pnpm prisma db pull && pnpm prisma generate
-- to update Prisma client after running this migration
-- =============================================================================


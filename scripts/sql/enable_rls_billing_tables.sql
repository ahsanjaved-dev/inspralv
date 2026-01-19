-- =============================================================================
-- ENABLE RLS ON BILLING/CREDITS TABLES
-- =============================================================================
-- Tables: billing_credits, credit_transactions, workspace_credits, workspace_credit_transactions
-- Run this in Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- STEP 1: ENABLE RLS ON ALL 4 TABLES
-- =============================================================================

ALTER TABLE public.billing_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_credit_transactions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 2: CREATE POLICIES FOR billing_credits
-- Partner members can view their partner's billing credits
-- Only service role can modify (for billing operations)
-- =============================================================================

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

-- =============================================================================
-- STEP 3: CREATE POLICIES FOR credit_transactions
-- Partner members can view transactions for their partner's billing credits
-- Only service role can insert/modify (for billing operations)
-- =============================================================================

DROP POLICY IF EXISTS "credit_transactions_select" ON public.credit_transactions;
CREATE POLICY "credit_transactions_select" ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (
    billing_credits_id IN (
      SELECT bc.id FROM billing_credits bc
      WHERE bc.partner_id IN (
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

-- =============================================================================
-- STEP 4: CREATE POLICIES FOR workspace_credits
-- Workspace members can view their workspace's credits
-- Only service role can modify (for billing operations)
-- =============================================================================

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

-- =============================================================================
-- STEP 5: CREATE POLICIES FOR workspace_credit_transactions
-- Workspace members can view transactions for their workspace's credits
-- Only service role can insert/modify (for billing operations)
-- =============================================================================

DROP POLICY IF EXISTS "workspace_credit_transactions_select" ON public.workspace_credit_transactions;
CREATE POLICY "workspace_credit_transactions_select" ON public.workspace_credit_transactions
  FOR SELECT
  TO authenticated
  USING (
    workspace_credits_id IN (
      SELECT wc.id FROM workspace_credits wc
      WHERE wc.workspace_id IN (
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
-- STEP 6: GRANT PERMISSIONS
-- =============================================================================

GRANT ALL ON public.billing_credits TO authenticated;
GRANT ALL ON public.billing_credits TO service_role;
GRANT ALL ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
GRANT ALL ON public.workspace_credits TO authenticated;
GRANT ALL ON public.workspace_credits TO service_role;
GRANT ALL ON public.workspace_credit_transactions TO authenticated;
GRANT ALL ON public.workspace_credit_transactions TO service_role;

-- =============================================================================
-- STEP 7: VERIFY RLS IS ENABLED
-- =============================================================================

SELECT 
  tablename as "Table Name",
  CASE 
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as "RLS Status"
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('billing_credits', 'credit_transactions', 'workspace_credits', 'workspace_credit_transactions')
ORDER BY tablename;

-- =============================================================================
-- STEP 8: VIEW CREATED POLICIES
-- =============================================================================

SELECT 
  tablename as "Table",
  policyname as "Policy Name",
  cmd as "Command",
  roles as "Roles"
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN ('billing_credits', 'credit_transactions', 'workspace_credits', 'workspace_credit_transactions')
ORDER BY tablename, policyname;

-- =============================================================================
-- DONE!
-- =============================================================================


-- =============================================================================
-- SUPABASE SECURITY ADVISOR FIXES
-- =============================================================================
-- This migration fixes the following security warnings:
-- 1. function_search_path_mutable - Functions without SET search_path
-- 2. rls_policy_always_true - Overly permissive RLS policies
-- 
-- Run this in Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- PART 1: FIX FUNCTION SEARCH_PATH MUTABLE WARNINGS
-- =============================================================================
-- Adding SET search_path = public to all functions prevents search_path hijacking
-- vulnerabilities where malicious schemas could intercept function calls.
--
-- NOTE: We use DROP FUNCTION IF EXISTS before CREATE to handle signature changes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 Trigger Functions (updated_at triggers)
-- -----------------------------------------------------------------------------

-- Fix: update_updated_at_column
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
CREATE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Recreate triggers that use update_updated_at_column
DROP TRIGGER IF EXISTS update_workspace_subscription_plans_updated_at ON public.workspace_subscription_plans;
CREATE TRIGGER update_workspace_subscription_plans_updated_at
  BEFORE UPDATE ON public.workspace_subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_subscriptions_updated_at ON public.workspace_subscriptions;
CREATE TRIGGER update_workspace_subscriptions_updated_at
  BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fix: update_call_campaigns_updated_at
DROP FUNCTION IF EXISTS public.update_call_campaigns_updated_at() CASCADE;
CREATE FUNCTION public.update_call_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Recreate trigger if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'call_campaigns') THEN
    DROP TRIGGER IF EXISTS trigger_call_campaigns_updated_at ON public.call_campaigns;
    CREATE TRIGGER trigger_call_campaigns_updated_at
      BEFORE UPDATE ON public.call_campaigns
      FOR EACH ROW EXECUTE FUNCTION public.update_call_campaigns_updated_at();
  END IF;
END $$;

-- Fix: update_call_recipients_updated_at
DROP FUNCTION IF EXISTS public.update_call_recipients_updated_at() CASCADE;
CREATE FUNCTION public.update_call_recipients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Recreate trigger if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'call_recipients') THEN
    DROP TRIGGER IF EXISTS trigger_call_recipients_updated_at ON public.call_recipients;
    CREATE TRIGGER trigger_call_recipients_updated_at
      BEFORE UPDATE ON public.call_recipients
      FOR EACH ROW EXECUTE FUNCTION public.update_call_recipients_updated_at();
  END IF;
END $$;

-- Fix: update_campaign_queue_updated_at
DROP FUNCTION IF EXISTS public.update_campaign_queue_updated_at() CASCADE;
CREATE FUNCTION public.update_campaign_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Recreate trigger if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_queue') THEN
    DROP TRIGGER IF EXISTS trigger_campaign_queue_updated_at ON public.campaign_queue;
    CREATE TRIGGER trigger_campaign_queue_updated_at
      BEFORE UPDATE ON public.campaign_queue
      FOR EACH ROW EXECUTE FUNCTION public.update_campaign_queue_updated_at();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1.2 Campaign Bulk Operations Functions
-- -----------------------------------------------------------------------------

-- Fix: bulk_update_recipients_calling
DROP FUNCTION IF EXISTS public.bulk_update_recipients_calling(UUID[], TEXT[], TIMESTAMPTZ);
CREATE FUNCTION public.bulk_update_recipients_calling(
  recipient_ids UUID[],
  call_ids TEXT[],
  started_at TIMESTAMPTZ
)
RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..array_length(recipient_ids, 1) LOOP
    UPDATE public.call_recipients
    SET 
      call_status = 'calling',
      external_call_id = call_ids[i],
      call_started_at = started_at,
      last_attempt_at = started_at,
      updated_at = NOW()
    WHERE id = recipient_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: bulk_update_recipient_status
DROP FUNCTION IF EXISTS public.bulk_update_recipient_status(UUID[], TEXT, TEXT);
CREATE FUNCTION public.bulk_update_recipient_status(
  recipient_ids UUID[],
  new_status TEXT,
  error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..array_length(recipient_ids, 1) LOOP
    UPDATE public.call_recipients
    SET 
      call_status = new_status,
      last_error = error_message,
      updated_at = NOW()
    WHERE id = recipient_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: increment_campaign_stats
-- Drop all overloaded versions
DROP FUNCTION IF EXISTS public.increment_campaign_stats(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.increment_campaign_stats(UUID, INT, INT, INT, INT);
CREATE FUNCTION public.increment_campaign_stats(
  p_campaign_id UUID,
  p_successful_delta INT DEFAULT 0,
  p_failed_delta INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.call_campaigns
  SET 
    completed_calls = COALESCE(completed_calls, 0) + p_successful_delta + p_failed_delta,
    successful_calls = COALESCE(successful_calls, 0) + p_successful_delta,
    failed_calls = COALESCE(failed_calls, 0) + p_failed_delta,
    pending_calls = GREATEST(0, COALESCE(pending_calls, 0) - p_successful_delta - p_failed_delta),
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: get_campaign_progress
DROP FUNCTION IF EXISTS public.get_campaign_progress(UUID);
CREATE FUNCTION public.get_campaign_progress(p_campaign_id UUID)
RETURNS TABLE(
  total_recipients BIGINT,
  pending_count BIGINT,
  calling_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT,
  successful_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_recipients,
    COUNT(*) FILTER (WHERE call_status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE call_status = 'calling') as calling_count,
    COUNT(*) FILTER (WHERE call_status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE call_status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE call_status = 'completed' AND call_outcome = 'answered') as successful_count
  FROM public.call_recipients
  WHERE campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: reset_stale_calling_recipients
DROP FUNCTION IF EXISTS public.reset_stale_calling_recipients(UUID, INT);
CREATE FUNCTION public.reset_stale_calling_recipients(
  p_campaign_id UUID,
  p_timeout_minutes INT DEFAULT 5
)
RETURNS INT AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE public.call_recipients
  SET 
    call_status = 'failed',
    last_error = 'Call timed out without webhook response',
    updated_at = NOW()
  WHERE 
    campaign_id = p_campaign_id
    AND call_status = 'calling'
    AND call_started_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: batch_cancel_pending_recipients
DROP FUNCTION IF EXISTS public.batch_cancel_pending_recipients(UUID);
CREATE FUNCTION public.batch_cancel_pending_recipients(p_campaign_id UUID)
RETURNS INT AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE public.call_recipients
  SET 
    call_status = 'cancelled',
    updated_at = NOW()
  WHERE 
    campaign_id = p_campaign_id
    AND call_status = 'pending';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: cancel_expired_campaigns
DROP FUNCTION IF EXISTS public.cancel_expired_campaigns();
CREATE FUNCTION public.cancel_expired_campaigns()
RETURNS INT AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE public.call_campaigns
  SET 
    status = 'cancelled',
    updated_at = NOW()
  WHERE 
    status = 'active'
    AND scheduled_end_at IS NOT NULL
    AND scheduled_end_at < NOW();
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: update_campaign_stats
DROP FUNCTION IF EXISTS public.update_campaign_stats(UUID);
CREATE FUNCTION public.update_campaign_stats(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.call_campaigns c
  SET 
    -- FIXED: Using total_recipients instead of total_calls (actual column name)
    total_recipients = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id),
    completed_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'completed'),
    successful_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'completed' AND call_outcome = 'answered'),
    failed_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status = 'failed'),
    pending_calls = (SELECT COUNT(*) FROM public.call_recipients WHERE campaign_id = p_campaign_id AND call_status IN ('pending', 'queued')),
    updated_at = NOW()
  WHERE c.id = p_campaign_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Fix: get_campaign_stats_batch
DROP FUNCTION IF EXISTS public.get_campaign_stats_batch(UUID[]);
CREATE FUNCTION public.get_campaign_stats_batch(campaign_ids UUID[])
RETURNS TABLE(
  campaign_id UUID,
  total_recipients BIGINT,
  pending_count BIGINT,
  calling_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT,
  successful_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.campaign_id,
    COUNT(*) as total_recipients,
    COUNT(*) FILTER (WHERE r.call_status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE r.call_status = 'calling') as calling_count,
    COUNT(*) FILTER (WHERE r.call_status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE r.call_status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE r.call_status = 'completed' AND r.call_outcome = 'answered') as successful_count
  FROM public.call_recipients r
  WHERE r.campaign_id = ANY(campaign_ids)
  GROUP BY r.campaign_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- -----------------------------------------------------------------------------
-- 1.3 Campaign Queue Functions
-- -----------------------------------------------------------------------------

-- Fix: get_campaign_queue_progress
DROP FUNCTION IF EXISTS public.get_campaign_queue_progress(UUID);
CREATE FUNCTION public.get_campaign_queue_progress(p_campaign_id UUID)
RETURNS TABLE(
  status VARCHAR(20),
  total_recipients INTEGER,
  processed_count INTEGER,
  successful_count INTEGER,
  failed_count INTEGER,
  chunks_processed INTEGER,
  total_chunks INTEGER,
  progress_percent NUMERIC,
  estimated_remaining_chunks INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cq.status,
    cq.total_recipients,
    cq.processed_count,
    cq.successful_count,
    cq.failed_count,
    cq.chunks_processed,
    cq.total_chunks,
    CASE 
      WHEN cq.total_recipients > 0 
      THEN ROUND((cq.processed_count::NUMERIC / cq.total_recipients) * 100, 2)
      ELSE 0
    END as progress_percent,
    GREATEST(0, cq.total_chunks - cq.chunks_processed) as estimated_remaining_chunks
  FROM public.campaign_queue cq
  WHERE cq.campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Fix: cleanup_old_campaign_queue_entries
DROP FUNCTION IF EXISTS public.cleanup_old_campaign_queue_entries(INTEGER);
CREATE FUNCTION public.cleanup_old_campaign_queue_entries(
  p_days_old INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.campaign_queue
  WHERE 
    status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - (p_days_old || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Fix: detect_stalled_campaign_queues
DROP FUNCTION IF EXISTS public.detect_stalled_campaign_queues(INTEGER);
CREATE FUNCTION public.detect_stalled_campaign_queues(
  p_stall_minutes INTEGER DEFAULT 10
)
RETURNS TABLE(
  queue_id UUID,
  campaign_id UUID,
  stalled_since TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cq.id as queue_id,
    cq.campaign_id,
    cq.last_chunk_at as stalled_since
  FROM public.campaign_queue cq
  WHERE 
    cq.status = 'processing'
    AND cq.last_chunk_at < NOW() - (p_stall_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- -----------------------------------------------------------------------------
-- 1.4 Postpaid Billing Functions
-- -----------------------------------------------------------------------------

-- Fix: can_make_postpaid_call
DROP FUNCTION IF EXISTS public.can_make_postpaid_call(UUID);
CREATE FUNCTION public.can_make_postpaid_call(p_workspace_id UUID)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining_minutes INTEGER,
  current_usage INTEGER,
  limit_minutes INTEGER,
  message TEXT
) AS $$
DECLARE
  v_subscription public.workspace_subscriptions%ROWTYPE;
  v_plan public.workspace_subscription_plans%ROWTYPE;
BEGIN
  -- Get the workspace's subscription
  SELECT ws.* INTO v_subscription
  FROM public.workspace_subscriptions ws
  WHERE ws.workspace_id = p_workspace_id
    AND ws.status = 'active';

  -- No active subscription
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false::BOOLEAN, 
      0::INTEGER, 
      0::INTEGER, 
      0::INTEGER, 
      'No active subscription'::TEXT;
    RETURN;
  END IF;

  -- Get the plan
  SELECT wsp.* INTO v_plan
  FROM public.workspace_subscription_plans wsp
  WHERE wsp.id = v_subscription.plan_id;

  -- If prepaid plan, always allow (handled by credits check elsewhere)
  IF v_plan.billing_type = 'prepaid' THEN
    RETURN QUERY SELECT 
      true::BOOLEAN, 
      -1::INTEGER, -- unlimited for prepaid
      0::INTEGER, 
      0::INTEGER, 
      'Prepaid plan - use credits'::TEXT;
    RETURN;
  END IF;

  -- Postpaid: check against limit
  IF v_subscription.postpaid_minutes_used >= v_plan.postpaid_minutes_limit THEN
    RETURN QUERY SELECT 
      false::BOOLEAN, 
      0::INTEGER, 
      v_subscription.postpaid_minutes_used::INTEGER, 
      v_plan.postpaid_minutes_limit::INTEGER, 
      'Postpaid minutes limit exceeded'::TEXT;
    RETURN;
  END IF;

  -- Under limit, can make call
  RETURN QUERY SELECT 
    true::BOOLEAN, 
    (v_plan.postpaid_minutes_limit - v_subscription.postpaid_minutes_used)::INTEGER, 
    v_subscription.postpaid_minutes_used::INTEGER, 
    v_plan.postpaid_minutes_limit::INTEGER, 
    'OK'::TEXT;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.can_make_postpaid_call(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_make_postpaid_call(UUID) TO service_role;

-- Fix: record_postpaid_usage
DROP FUNCTION IF EXISTS public.record_postpaid_usage(UUID, INTEGER, INTEGER);
CREATE FUNCTION public.record_postpaid_usage(
  p_workspace_id UUID,
  p_minutes INTEGER,
  p_rate_cents INTEGER DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  new_usage INTEGER,
  blocked BOOLEAN,
  charge_cents INTEGER,
  message TEXT
) AS $$
DECLARE
  v_subscription public.workspace_subscriptions%ROWTYPE;
  v_plan public.workspace_subscription_plans%ROWTYPE;
  v_rate INTEGER;
  v_new_usage INTEGER;
  v_charge INTEGER;
BEGIN
  -- Get subscription with FOR UPDATE lock
  SELECT ws.* INTO v_subscription
  FROM public.workspace_subscriptions ws
  WHERE ws.workspace_id = p_workspace_id
    AND ws.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, false, 0, 'No active subscription';
    RETURN;
  END IF;

  -- Get plan
  SELECT wsp.* INTO v_plan
  FROM public.workspace_subscription_plans wsp
  WHERE wsp.id = v_subscription.plan_id;

  -- Only for postpaid plans
  IF v_plan.billing_type != 'postpaid' THEN
    RETURN QUERY SELECT false, 0, false, 0, 'Not a postpaid subscription';
    RETURN;
  END IF;

  -- Calculate new usage
  v_new_usage := v_subscription.postpaid_minutes_used + p_minutes;

  -- Check if would exceed limit
  IF v_new_usage > v_plan.postpaid_minutes_limit THEN
    RETURN QUERY SELECT 
      false, 
      v_subscription.postpaid_minutes_used, 
      true, 
      0, 
      'Would exceed postpaid limit';
    RETURN;
  END IF;

  -- Calculate charge
  v_rate := COALESCE(p_rate_cents, v_plan.overage_rate_cents);
  v_charge := p_minutes * v_rate;

  -- Update subscription atomically
  UPDATE public.workspace_subscriptions
  SET 
    postpaid_minutes_used = v_new_usage,
    pending_invoice_amount_cents = pending_invoice_amount_cents + v_charge,
    updated_at = NOW()
  WHERE id = v_subscription.id;

  RETURN QUERY SELECT 
    true, 
    v_new_usage, 
    false, 
    v_charge, 
    'Usage recorded';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.record_postpaid_usage(UUID, INTEGER, INTEGER) TO service_role;

-- Fix: reset_postpaid_period
DROP FUNCTION IF EXISTS public.reset_postpaid_period(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION public.reset_postpaid_period(
  p_subscription_id UUID,
  p_new_period_start TIMESTAMPTZ DEFAULT NOW(),
  p_new_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  previous_usage INTEGER,
  previous_charges_cents INTEGER,
  message TEXT
) AS $$
DECLARE
  v_subscription public.workspace_subscriptions%ROWTYPE;
BEGIN
  -- Get and lock subscription
  SELECT * INTO v_subscription
  FROM public.workspace_subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, 'Subscription not found';
    RETURN;
  END IF;

  -- Store previous values for return
  -- Reset the usage counters
  UPDATE public.workspace_subscriptions
  SET 
    postpaid_minutes_used = 0,
    pending_invoice_amount_cents = 0,
    current_period_start = p_new_period_start,
    current_period_end = COALESCE(p_new_period_end, p_new_period_start + INTERVAL '1 month'),
    updated_at = NOW()
  WHERE id = p_subscription_id;

  RETURN QUERY SELECT 
    true, 
    v_subscription.postpaid_minutes_used, 
    v_subscription.pending_invoice_amount_cents, 
    'Period reset successfully';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.reset_postpaid_period(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- =============================================================================
-- PART 2: FIX RLS POLICY ALWAYS TRUE WARNINGS
-- =============================================================================
-- The partner_requests table has overly permissive INSERT policies.
-- 
-- ANALYSIS: The /api/partner-requests endpoint uses createAdminClient() (service_role)
-- to insert partner requests, bypassing RLS. However, having permissive INSERT policies
-- is still a security risk if the database is accessed directly.
--
-- SOLUTION: Remove direct INSERT access for authenticated/anon users.
-- All partner request inserts MUST go through the API which validates and uses service_role.
-- =============================================================================

-- Drop the overly permissive INSERT policies
DROP POLICY IF EXISTS "partner_requests_insert" ON public.partner_requests;
DROP POLICY IF EXISTS "Authenticated can insert partner requests" ON public.partner_requests;
DROP POLICY IF EXISTS "Public can insert partner requests" ON public.partner_requests;

-- Keep the existing SELECT policy (users can see their own requests)
-- This is already defined in enable_rls_all_tables.sql as partner_requests_select_own

-- Ensure service_role policy exists for full access (API uses this)
DROP POLICY IF EXISTS "partner_requests_service_role_all" ON public.partner_requests;
CREATE POLICY "partner_requests_service_role_all" ON public.partner_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- IMPORTANT: Partner request inserts now MUST go through:
-- - POST /api/partner-requests (uses service_role via createAdminClient())
-- 
-- Direct database inserts from authenticated/anon users are blocked.
-- This is the correct security posture since:
-- 1. The API validates all data before insertion
-- 2. The API checks subdomain availability
-- 3. The API sends notification emails
-- 4. Direct inserts would bypass all these validations

-- =============================================================================
-- PART 3: LEAKED PASSWORD PROTECTION (MANUAL STEP REQUIRED)
-- =============================================================================
-- The auth_leaked_password_protection warning requires enabling this feature
-- in the Supabase Dashboard. This cannot be done via SQL.
--
-- Steps to enable:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to Authentication > Settings
-- 3. Find "Password Protection" or "Leaked Password Detection"
-- 4. Enable the HaveIBeenPwned integration
--
-- This feature checks passwords against HaveIBeenPwned.org database
-- to prevent users from using compromised passwords.
-- =============================================================================

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these after the migration to verify the fixes:

-- Check function search_path settings:
-- SELECT 
--   n.nspname as schema,
--   p.proname as function_name,
--   pg_get_function_arguments(p.oid) as arguments,
--   p.proconfig as config
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'update_updated_at_column',
--     'update_call_campaigns_updated_at',
--     'update_call_recipients_updated_at',
--     'update_campaign_queue_updated_at',
--     'bulk_update_recipients_calling',
--     'bulk_update_recipient_status',
--     'increment_campaign_stats',
--     'get_campaign_progress',
--     'reset_stale_calling_recipients',
--     'batch_cancel_pending_recipients',
--     'cancel_expired_campaigns',
--     'update_campaign_stats',
--     'get_campaign_stats_batch',
--     'get_campaign_queue_progress',
--     'cleanup_old_campaign_queue_entries',
--     'detect_stalled_campaign_queues',
--     'can_make_postpaid_call',
--     'record_postpaid_usage',
--     'reset_postpaid_period'
--   )
-- ORDER BY p.proname;

-- Check RLS policies on partner_requests:
-- SELECT policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies 
-- WHERE tablename = 'partner_requests';

-- =============================================================================
-- DONE!
-- =============================================================================

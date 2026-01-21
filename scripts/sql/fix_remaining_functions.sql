-- =============================================================================
-- FIX REMAINING FUNCTION SEARCH_PATH WARNINGS
-- =============================================================================
-- These functions have multiple overloaded versions with different signatures.
-- We need to drop ALL versions and recreate them with SET search_path.
-- =============================================================================

-- First, let's see all versions of these functions
-- Run this query to see what exists:
/*
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.proconfig as config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('update_campaign_stats', 'bulk_update_recipient_status')
ORDER BY p.proname, args;
*/

-- =============================================================================
-- DROP ALL VERSIONS of update_campaign_stats
-- =============================================================================
-- Drop any existing versions (different signatures)
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT p.oid, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_campaign_stats'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.update_campaign_stats(%s)', func_record.args);
    RAISE NOTICE 'Dropped: update_campaign_stats(%)', func_record.args;
  END LOOP;
END $$;

-- Recreate update_campaign_stats with SET search_path
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

-- =============================================================================
-- DROP ALL VERSIONS of bulk_update_recipient_status
-- =============================================================================
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT p.oid, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'bulk_update_recipient_status'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.bulk_update_recipient_status(%s)', func_record.args);
    RAISE NOTICE 'Dropped: bulk_update_recipient_status(%)', func_record.args;
  END LOOP;
END $$;

-- Recreate bulk_update_recipient_status with SET search_path
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

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Run this to verify all functions now have search_path set:

SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.proconfig as config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('update_campaign_stats', 'bulk_update_recipient_status')
ORDER BY p.proname;

-- Expected: config should show {search_path=public} for all functions
-- =============================================================================


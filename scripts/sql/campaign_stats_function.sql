-- ============================================================================
-- Campaign Stats Batch Function
-- ============================================================================
-- This function calculates accurate campaign statistics from the call_recipients 
-- table in a single efficient query for multiple campaigns.
--
-- Created: 2026-01-21
-- Purpose: Fix campaign stats calculation for listing page
-- ============================================================================

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS get_campaign_stats_batch(uuid[]) CASCADE;

-- Create the batch stats function
-- SET search_path to prevent search_path manipulation attacks (Supabase security best practice)
CREATE FUNCTION get_campaign_stats_batch(campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid,
  total_recipients bigint,
  pending_calls bigint,
  completed_calls bigint,
  successful_calls bigint,
  failed_calls bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.campaign_id,
    COUNT(*)::bigint AS total_recipients,
    COUNT(*) FILTER (WHERE cr.call_status IN ('pending', 'queued', 'calling'))::bigint AS pending_calls,
    COUNT(*) FILTER (WHERE cr.call_status IN ('completed', 'failed'))::bigint AS completed_calls,
    COUNT(*) FILTER (WHERE cr.call_status = 'completed' AND cr.call_outcome = 'answered')::bigint AS successful_calls,
    COUNT(*) FILTER (WHERE cr.call_status = 'failed')::bigint AS failed_calls
  FROM public.call_recipients cr
  WHERE cr.campaign_id = ANY(campaign_ids)
  GROUP BY cr.campaign_id;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION get_campaign_stats_batch(uuid[]) TO service_role;

-- Test the function (optional - uncomment to test)
-- SELECT * FROM get_campaign_stats_batch(ARRAY['your-campaign-id-here']::uuid[]);

-- ============================================================================
-- Alternative: Single campaign stats function
-- ============================================================================

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS get_campaign_stats(uuid) CASCADE;

-- SET search_path to prevent search_path manipulation attacks (Supabase security best practice)
CREATE FUNCTION get_campaign_stats(p_campaign_id uuid)
RETURNS TABLE (
  total_recipients bigint,
  pending_calls bigint,
  completed_calls bigint,
  successful_calls bigint,
  failed_calls bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint AS total_recipients,
    COUNT(*) FILTER (WHERE cr.call_status IN ('pending', 'queued', 'calling'))::bigint AS pending_calls,
    COUNT(*) FILTER (WHERE cr.call_status IN ('completed', 'failed'))::bigint AS completed_calls,
    COUNT(*) FILTER (WHERE cr.call_status = 'completed' AND cr.call_outcome = 'answered')::bigint AS successful_calls,
    COUNT(*) FILTER (WHERE cr.call_status = 'failed')::bigint AS failed_calls
  FROM public.call_recipients cr
  WHERE cr.campaign_id = p_campaign_id;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION get_campaign_stats(uuid) TO service_role;

-- ============================================================================
-- Index for better performance (if not exists)
-- ============================================================================

-- Index on campaign_id and call_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_call_recipients_campaign_status 
ON call_recipients(campaign_id, call_status);

-- Composite index for outcome queries
CREATE INDEX IF NOT EXISTS idx_call_recipients_campaign_status_outcome 
ON call_recipients(campaign_id, call_status, call_outcome);


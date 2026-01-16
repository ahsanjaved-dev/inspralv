-- ============================================================================
-- Campaign Call Processor Cron Job
-- ============================================================================
-- This creates a pg_cron job that periodically checks active campaigns
-- and starts new calls when slots are available.
--
-- This is a BACKUP mechanism - the primary trigger is the webhook when calls end.
-- The cron job handles:
-- 1. Initial call starts when campaign begins
-- 2. Recovery from stuck states
-- 3. Campaigns that got paused and resumed
-- ============================================================================

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store project URL in vault for secure access
-- NOTE: Run this manually with your actual project URL:
-- SELECT vault.create_secret('https://your-project.supabase.co', 'project_url');

-- ============================================================================
-- Function to trigger campaign processing via Edge Function
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_campaign_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_campaign RECORD;
  project_url TEXT;
  anon_key TEXT;
BEGIN
  -- Get project URL from vault
  SELECT decrypted_secret INTO project_url 
  FROM vault.decrypted_secrets 
  WHERE name = 'project_url';
  
  -- Get anon key from vault
  SELECT decrypted_secret INTO anon_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'anon_key';
  
  IF project_url IS NULL OR anon_key IS NULL THEN
    RAISE WARNING 'Missing project_url or anon_key in vault';
    RETURN;
  END IF;
  
  -- Find active campaigns that have pending recipients
  FOR active_campaign IN
    SELECT DISTINCT c.id, c.workspace_id
    FROM call_campaigns c
    INNER JOIN call_recipients r ON r.campaign_id = c.id
    WHERE c.status = 'active'
      AND c.deleted_at IS NULL
      AND r.call_status = 'pending'
    LIMIT 10  -- Process up to 10 campaigns per cron run
  LOOP
    -- Trigger processing for this campaign via Edge Function
    PERFORM net.http_post(
      url := project_url || '/api/campaigns/' || active_campaign.id || '/process-calls',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'campaignId', active_campaign.id,
        'workspaceId', active_campaign.workspace_id,
        'source', 'cron'
      ),
      timeout_milliseconds := 30000  -- 30 second timeout
    );
    
    RAISE NOTICE 'Triggered processing for campaign %', active_campaign.id;
  END LOOP;
END;
$$;

-- ============================================================================
-- Create the cron job (runs every 30 seconds)
-- ============================================================================
-- Note: This requires pg_cron to be enabled and configured
-- The job will be created but may need to be activated manually

-- First, remove existing job if it exists
SELECT cron.unschedule('process-active-campaigns') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-active-campaigns'
);

-- Create new job that runs every 30 seconds
SELECT cron.schedule(
  'process-active-campaigns',
  '30 seconds',
  $$SELECT trigger_campaign_processing()$$
);

-- ============================================================================
-- Alternative: Simple SQL-based processor (no Edge Function needed)
-- ============================================================================
-- This is a simpler approach that just marks campaigns for processing
-- The actual call creation happens via the API

CREATE OR REPLACE FUNCTION mark_campaigns_for_processing()
RETURNS TABLE(campaign_id UUID, pending_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as campaign_id,
    COUNT(r.id) as pending_count
  FROM call_campaigns c
  INNER JOIN call_recipients r ON r.campaign_id = c.id
  WHERE c.status = 'active'
    AND c.deleted_at IS NULL
    AND r.call_status = 'pending'
  GROUP BY c.id
  HAVING COUNT(r.id) > 0
  ORDER BY c.started_at ASC
  LIMIT 10;
END;
$$;

-- ============================================================================
-- Function to get campaign processing status
-- ============================================================================
CREATE OR REPLACE FUNCTION get_campaign_call_status(p_campaign_id UUID)
RETURNS TABLE(
  total_recipients BIGINT,
  pending_calls BIGINT,
  calling_calls BIGINT,
  completed_calls BIGINT,
  failed_calls BIGINT,
  stale_calls BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stale_threshold TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calls older than 10 minutes in "calling" status are considered stale
  stale_threshold := NOW() - INTERVAL '10 minutes';
  
  RETURN QUERY
  SELECT 
    COUNT(*) as total_recipients,
    COUNT(*) FILTER (WHERE call_status = 'pending') as pending_calls,
    COUNT(*) FILTER (WHERE call_status = 'calling' AND call_started_at > stale_threshold) as calling_calls,
    COUNT(*) FILTER (WHERE call_status = 'completed') as completed_calls,
    COUNT(*) FILTER (WHERE call_status = 'failed') as failed_calls,
    COUNT(*) FILTER (WHERE call_status = 'calling' AND call_started_at <= stale_threshold) as stale_calls
  FROM call_recipients
  WHERE campaign_id = p_campaign_id;
END;
$$;

-- ============================================================================
-- Function to clean up stale calls and restart them
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_and_restart_stale_calls(p_campaign_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stale_threshold TIMESTAMP WITH TIME ZONE;
  updated_count INTEGER;
BEGIN
  -- Calls older than 10 minutes in "calling" status are considered stale
  stale_threshold := NOW() - INTERVAL '10 minutes';
  
  -- Reset stale calls to pending so they can be retried
  WITH updated AS (
    UPDATE call_recipients
    SET 
      call_status = 'pending',
      external_call_id = NULL,
      call_started_at = NULL,
      last_error = 'Reset from stale calling status',
      updated_at = NOW()
    WHERE campaign_id = p_campaign_id
      AND call_status = 'calling'
      AND call_started_at <= stale_threshold
    RETURNING id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  RETURN updated_count;
END;
$$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION trigger_campaign_processing() TO service_role;
GRANT EXECUTE ON FUNCTION mark_campaigns_for_processing() TO service_role;
GRANT EXECUTE ON FUNCTION get_campaign_call_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_and_restart_stale_calls(UUID) TO service_role;


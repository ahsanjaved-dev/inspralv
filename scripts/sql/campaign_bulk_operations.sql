-- ============================================================================
-- Campaign Module Bulk Operations
-- 
-- These PostgreSQL functions enable efficient bulk operations for large campaigns.
-- Run this migration to optimize campaign processing performance.
-- ============================================================================

-- ============================================================================
-- 1. Bulk Update Recipients to "calling" status
-- ============================================================================
CREATE OR REPLACE FUNCTION bulk_update_recipients_calling(
  recipient_ids UUID[],
  call_ids TEXT[],
  started_at TIMESTAMPTZ
)
RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..array_length(recipient_ids, 1) LOOP
    UPDATE call_recipients
    SET 
      call_status = 'calling',
      external_call_id = call_ids[i],
      call_started_at = started_at,
      last_attempt_at = started_at,
      updated_at = NOW()
    WHERE id = recipient_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Bulk Update Recipients to "failed" status
-- ============================================================================
CREATE OR REPLACE FUNCTION bulk_update_recipients_failed(
  recipient_ids UUID[],
  errors TEXT[],
  attempt_counts INT[]
)
RETURNS VOID AS $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..array_length(recipient_ids, 1) LOOP
    UPDATE call_recipients
    SET 
      call_status = 'failed',
      last_error = errors[i],
      attempts = attempt_counts[i],
      last_attempt_at = NOW(),
      updated_at = NOW()
    WHERE id = recipient_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Atomic Increment Campaign Stats
-- This prevents race conditions when multiple chunks update simultaneously
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_campaign_stats(
  p_campaign_id UUID,
  p_successful_delta INT DEFAULT 0,
  p_failed_delta INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE call_campaigns
  SET 
    completed_calls = COALESCE(completed_calls, 0) + p_successful_delta + p_failed_delta,
    successful_calls = COALESCE(successful_calls, 0) + p_successful_delta,
    failed_calls = COALESCE(failed_calls, 0) + p_failed_delta,
    pending_calls = GREATEST(0, COALESCE(pending_calls, 0) - p_successful_delta - p_failed_delta),
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Bulk Insert Recipients (for CSV import optimization)
-- ============================================================================
CREATE OR REPLACE FUNCTION bulk_insert_recipients(
  p_campaign_id UUID,
  p_workspace_id UUID,
  p_phone_numbers TEXT[],
  p_first_names TEXT[],
  p_last_names TEXT[],
  p_emails TEXT[],
  p_companies TEXT[]
)
RETURNS TABLE(inserted_count INT, duplicate_count INT) AS $$
DECLARE
  v_inserted_count INT := 0;
  v_total_count INT;
  i INT;
BEGIN
  v_total_count := array_length(p_phone_numbers, 1);
  
  FOR i IN 1..v_total_count LOOP
    BEGIN
      INSERT INTO call_recipients (
        campaign_id,
        workspace_id,
        phone_number,
        first_name,
        last_name,
        email,
        company,
        call_status,
        attempts,
        created_at,
        updated_at
      ) VALUES (
        p_campaign_id,
        p_workspace_id,
        p_phone_numbers[i],
        NULLIF(p_first_names[i], ''),
        NULLIF(p_last_names[i], ''),
        NULLIF(p_emails[i], ''),
        NULLIF(p_companies[i], ''),
        'pending',
        0,
        NOW(),
        NOW()
      );
      v_inserted_count := v_inserted_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Skip duplicates
      NULL;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_inserted_count, v_total_count - v_inserted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Get Campaign Progress Stats
-- Efficient single-query stats retrieval
-- ============================================================================
CREATE OR REPLACE FUNCTION get_campaign_progress(p_campaign_id UUID)
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
  FROM call_recipients
  WHERE campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Reset Stale Calling Recipients
-- Mark recipients stuck in "calling" status as failed
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_stale_calling_recipients(
  p_campaign_id UUID,
  p_timeout_minutes INT DEFAULT 5
)
RETURNS INT AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE call_recipients
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Batch Mark Recipients as Cancelled
-- For campaign termination
-- ============================================================================
CREATE OR REPLACE FUNCTION batch_cancel_pending_recipients(p_campaign_id UUID)
RETURNS INT AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE call_recipients
  SET 
    call_status = 'cancelled',
    updated_at = NOW()
  WHERE 
    campaign_id = p_campaign_id
    AND call_status = 'pending';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INDEXES for Campaign Performance
-- ============================================================================

-- Index for fetching pending recipients
CREATE INDEX IF NOT EXISTS idx_call_recipients_campaign_pending 
ON call_recipients (campaign_id, call_status, created_at)
WHERE call_status = 'pending';

-- Index for counting recipients by status
CREATE INDEX IF NOT EXISTS idx_call_recipients_campaign_status
ON call_recipients (campaign_id, call_status);

-- Index for stale call detection
CREATE INDEX IF NOT EXISTS idx_call_recipients_stale_calls
ON call_recipients (campaign_id, call_status, call_started_at)
WHERE call_status = 'calling';

-- Composite index for workspace+campaign queries
CREATE INDEX IF NOT EXISTS idx_call_recipients_workspace_campaign
ON call_recipients (workspace_id, campaign_id);

-- ============================================================================
-- Grant execution permissions
-- ============================================================================
-- Ensure service role can execute these functions
-- (Uncomment if needed for your setup)
-- GRANT EXECUTE ON FUNCTION bulk_update_recipients_calling TO service_role;
-- GRANT EXECUTE ON FUNCTION bulk_update_recipients_failed TO service_role;
-- GRANT EXECUTE ON FUNCTION increment_campaign_stats TO service_role;
-- GRANT EXECUTE ON FUNCTION bulk_insert_recipients TO service_role;
-- GRANT EXECUTE ON FUNCTION get_campaign_progress TO service_role;
-- GRANT EXECUTE ON FUNCTION reset_stale_calling_recipients TO service_role;
-- GRANT EXECUTE ON FUNCTION batch_cancel_pending_recipients TO service_role;


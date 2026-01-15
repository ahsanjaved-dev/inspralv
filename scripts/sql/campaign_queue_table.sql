-- ============================================================================
-- Campaign Queue Table
-- 
-- This table tracks the state of large campaign processing jobs.
-- It enables chunked processing across multiple API calls and
-- provides resume capability for interrupted campaigns.
-- ============================================================================

-- Create the campaign queue table
CREATE TABLE IF NOT EXISTS campaign_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES call_campaigns(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'paused', 'completed', 'failed', 'cancelled')
  ),
  
  -- Progress tracking
  total_recipients INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  successful_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  chunks_processed INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  
  -- Processing metadata
  last_chunk_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Configuration (stored to resume processing)
  config JSONB NOT NULL DEFAULT '{}',
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one queue entry per campaign
  UNIQUE(campaign_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_campaign_queue_status 
ON campaign_queue (status);

CREATE INDEX IF NOT EXISTS idx_campaign_queue_workspace 
ON campaign_queue (workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_queue_campaign 
ON campaign_queue (campaign_id);

-- Index for finding stalled processing jobs
CREATE INDEX IF NOT EXISTS idx_campaign_queue_processing_stalled
ON campaign_queue (status, last_chunk_at)
WHERE status = 'processing';

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE campaign_queue ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY campaign_queue_service_all ON campaign_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Workspace members can read their workspace's queue entries
CREATE POLICY campaign_queue_workspace_read ON campaign_queue
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Helper function to get queue progress
-- ============================================================================

CREATE OR REPLACE FUNCTION get_campaign_queue_progress(p_campaign_id UUID)
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
  FROM campaign_queue cq
  WHERE cq.campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Function to clean up old completed/failed queue entries
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_campaign_queue_entries(
  p_days_old INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM campaign_queue
  WHERE 
    status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - (p_days_old || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to detect and handle stalled processing jobs
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_stalled_campaign_queues(
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
  FROM campaign_queue cq
  WHERE 
    cq.status = 'processing'
    AND cq.last_chunk_at < NOW() - (p_stall_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger to update updated_at on changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_campaign_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_campaign_queue_updated_at ON campaign_queue;

CREATE TRIGGER trigger_campaign_queue_updated_at
BEFORE UPDATE ON campaign_queue
FOR EACH ROW
EXECUTE FUNCTION update_campaign_queue_updated_at();

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE campaign_queue IS 'Tracks state of large campaign processing jobs for chunked execution';
COMMENT ON COLUMN campaign_queue.status IS 'Current processing status: pending, processing, paused, completed, failed, cancelled';
COMMENT ON COLUMN campaign_queue.config IS 'JSON configuration for batch caller, stored to enable resume';
COMMENT ON COLUMN campaign_queue.chunks_processed IS 'Number of recipient chunks that have been processed';
COMMENT ON COLUMN campaign_queue.last_chunk_at IS 'Timestamp of last processed chunk, used for stall detection';


-- =============================================================================
-- ADD CALENDAR_NAME COLUMN TO AGENT_CALENDAR_CONFIGS
-- =============================================================================
-- This migration adds a calendar_name column to store the human-readable 
-- calendar name in the format: workspacename-agentname
-- =============================================================================

-- Add calendar_name column
ALTER TABLE agent_calendar_configs 
ADD COLUMN IF NOT EXISTS calendar_name VARCHAR(500);

-- Create index for faster lookups by workspace
CREATE INDEX IF NOT EXISTS idx_agent_calendar_configs_workspace_calendar 
ON agent_calendar_configs(workspace_id, calendar_id);

-- Add comment for documentation
COMMENT ON COLUMN agent_calendar_configs.calendar_name IS 'Human-readable calendar name in format: workspacename-agentname';


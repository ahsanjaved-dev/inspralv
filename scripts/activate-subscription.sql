-- Manually activate the most recent incomplete subscription
-- Run this in Supabase SQL Editor if you want to test without webhooks

-- First, check what subscriptions exist
SELECT
  ws.id,
  ws.workspace_id,
  w.slug as workspace_slug,
  wsp.name as plan_name,
  ws.status,
  ws.created_at
FROM workspace_subscriptions ws
JOIN workspaces w ON ws.workspace_id = w.id
JOIN workspace_subscription_plans wsp ON ws.plan_id = wsp.id
ORDER BY ws.created_at DESC
LIMIT 5;

-- Update the most recent incomplete subscription to active
-- Replace {workspace_id} with the actual ID from the query above
UPDATE workspace_subscriptions
SET
  status = 'active',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '1 month'
WHERE workspace_id = '{workspace_id}'
  AND status = 'incomplete';

-- Verify the update
SELECT
  ws.id,
  ws.workspace_id,
  w.slug as workspace_slug,
  wsp.name as plan_name,
  ws.status,
  ws.current_period_start,
  ws.current_period_end
FROM workspace_subscriptions ws
JOIN workspaces w ON ws.workspace_id = w.id
JOIN workspace_subscription_plans wsp ON ws.plan_id = wsp.id
WHERE workspace_id = '{workspace_id}';

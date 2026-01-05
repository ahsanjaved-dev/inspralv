-- =============================================================================
-- POSTPAID BILLING FEATURE
-- Run this in Supabase SQL Editor
-- =============================================================================
-- This migration adds:
-- 1. billing_type enum (prepaid/postpaid)
-- 2. New columns on workspace_subscription_plans for postpaid configuration
-- 3. New columns on workspace_subscriptions for postpaid usage tracking
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create billing_type enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE billing_type AS ENUM (
    'prepaid',
    'postpaid'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Add postpaid columns to workspace_subscription_plans
-- -----------------------------------------------------------------------------

-- billing_type: Determines if plan is prepaid (credits) or postpaid (invoice at end of period)
DO $$ BEGIN
  ALTER TABLE workspace_subscription_plans 
    ADD COLUMN billing_type billing_type NOT NULL DEFAULT 'prepaid';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- postpaid_minutes_limit: Maximum minutes allowed before blocking calls (postpaid only)
DO $$ BEGIN
  ALTER TABLE workspace_subscription_plans 
    ADD COLUMN postpaid_minutes_limit INTEGER DEFAULT NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add check constraint: postpaid plans should have a minutes limit
DO $$ BEGIN
  ALTER TABLE workspace_subscription_plans 
    ADD CONSTRAINT check_postpaid_limit 
    CHECK (
      billing_type = 'prepaid' OR 
      (billing_type = 'postpaid' AND postpaid_minutes_limit IS NOT NULL AND postpaid_minutes_limit > 0)
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN workspace_subscription_plans.billing_type IS 'prepaid: deduct from credits; postpaid: track usage, invoice at period end';
COMMENT ON COLUMN workspace_subscription_plans.postpaid_minutes_limit IS 'Maximum minutes allowed in a billing period before calls are blocked (postpaid only)';

-- -----------------------------------------------------------------------------
-- 3. Add postpaid tracking columns to workspace_subscriptions
-- -----------------------------------------------------------------------------

-- postpaid_minutes_used: Cumulative minutes used in current billing period (postpaid only)
DO $$ BEGIN
  ALTER TABLE workspace_subscriptions 
    ADD COLUMN postpaid_minutes_used INTEGER NOT NULL DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- pending_invoice_amount_cents: Accumulated charges to be invoiced at period end
DO $$ BEGIN
  ALTER TABLE workspace_subscriptions 
    ADD COLUMN pending_invoice_amount_cents INTEGER NOT NULL DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN workspace_subscriptions.postpaid_minutes_used IS 'Minutes used in current billing period (postpaid subscriptions only)';
COMMENT ON COLUMN workspace_subscriptions.pending_invoice_amount_cents IS 'Accumulated usage charges to be invoiced at period end (postpaid only)';

-- -----------------------------------------------------------------------------
-- 4. Create index for efficient postpaid subscription lookups
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_workspace_subscription_plans_billing_type 
  ON workspace_subscription_plans(partner_id, billing_type) 
  WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- 5. Create function to check if workspace can make postpaid call
-- This can be called before initiating a call to check threshold
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_make_postpaid_call(p_workspace_id UUID)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining_minutes INTEGER,
  current_usage INTEGER,
  limit_minutes INTEGER,
  message TEXT
) AS $$
DECLARE
  v_subscription workspace_subscriptions%ROWTYPE;
  v_plan workspace_subscription_plans%ROWTYPE;
BEGIN
  -- Get the workspace's subscription
  SELECT ws.* INTO v_subscription
  FROM workspace_subscriptions ws
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
  FROM workspace_subscription_plans wsp
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION can_make_postpaid_call(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_make_postpaid_call(UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Create function to record postpaid usage (atomic operation)
-- Returns: success, new_usage, blocked, message
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_postpaid_usage(
  p_workspace_id UUID,
  p_minutes INTEGER,
  p_rate_cents INTEGER DEFAULT NULL -- If NULL, uses plan's overage_rate_cents
)
RETURNS TABLE (
  success BOOLEAN,
  new_usage INTEGER,
  blocked BOOLEAN,
  charge_cents INTEGER,
  message TEXT
) AS $$
DECLARE
  v_subscription workspace_subscriptions%ROWTYPE;
  v_plan workspace_subscription_plans%ROWTYPE;
  v_rate INTEGER;
  v_new_usage INTEGER;
  v_charge INTEGER;
BEGIN
  -- Get subscription with FOR UPDATE lock
  SELECT ws.* INTO v_subscription
  FROM workspace_subscriptions ws
  WHERE ws.workspace_id = p_workspace_id
    AND ws.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, false, 0, 'No active subscription';
    RETURN;
  END IF;

  -- Get plan
  SELECT wsp.* INTO v_plan
  FROM workspace_subscription_plans wsp
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
  UPDATE workspace_subscriptions
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION record_postpaid_usage(UUID, INTEGER, INTEGER) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Create function to reset postpaid usage at period end
-- Called when generating invoice or on period renewal
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_postpaid_period(
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
  v_subscription workspace_subscriptions%ROWTYPE;
BEGIN
  -- Get and lock subscription
  SELECT * INTO v_subscription
  FROM workspace_subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, 'Subscription not found';
    RETURN;
  END IF;

  -- Store previous values for return
  -- Reset the usage counters
  UPDATE workspace_subscriptions
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION reset_postpaid_period(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- -----------------------------------------------------------------------------
-- 8. Grant permissions on new columns (already handled by table grants)
-- RLS policies from original migration still apply
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- DONE! Now run: pnpm prisma db pull && pnpm prisma generate
-- -----------------------------------------------------------------------------


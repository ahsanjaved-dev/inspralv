-- =============================================================================
-- WORKSPACE SUBSCRIPTION PLANS & SUBSCRIPTIONS
-- Run this in Supabase SQL Editor
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create enum for subscription status
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE workspace_subscription_status AS ENUM (
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'trialing',
    'paused'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Create workspace_subscription_plans table
-- Partners create these plans for their workspaces to subscribe to
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  
  -- Plan details
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Stripe product/price on Partner's Connect account
  stripe_product_id VARCHAR(100),
  stripe_price_id VARCHAR(100),
  
  -- Pricing
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Included usage
  included_minutes INTEGER NOT NULL DEFAULT 0,
  overage_rate_cents INTEGER NOT NULL DEFAULT 20, -- $0.20/min default
  
  -- Features (JSON array of feature strings)
  features JSONB DEFAULT '[]',
  
  -- Limits
  max_agents INTEGER DEFAULT NULL, -- NULL = unlimited
  max_conversations_per_month INTEGER DEFAULT NULL,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true, -- Can workspaces see this plan?
  
  -- Sorting
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workspace_subscription_plans_partner 
  ON workspace_subscription_plans(partner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscription_plans_active 
  ON workspace_subscription_plans(partner_id, is_active);

-- -----------------------------------------------------------------------------
-- 3. Create workspace_subscriptions table
-- Tracks which plan each workspace is subscribed to
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES workspace_subscription_plans(id) ON DELETE RESTRICT,
  
  -- Stripe subscription on Partner's Connect account
  stripe_subscription_id VARCHAR(100),
  stripe_customer_id VARCHAR(100), -- Workspace's customer ID on Connect account
  
  -- Status
  status workspace_subscription_status NOT NULL DEFAULT 'incomplete',
  
  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  
  -- Usage tracking for current period
  minutes_used_this_period INTEGER NOT NULL DEFAULT 0,
  overage_charges_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Cancellation
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  
  -- Trial
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one active subscription per workspace
  CONSTRAINT unique_active_workspace_subscription UNIQUE (workspace_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_workspace 
  ON workspace_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_plan 
  ON workspace_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_stripe 
  ON workspace_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_status 
  ON workspace_subscriptions(status);

-- -----------------------------------------------------------------------------
-- 4. Update trigger for updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_workspace_subscription_plans_updated_at ON workspace_subscription_plans;
CREATE TRIGGER update_workspace_subscription_plans_updated_at
  BEFORE UPDATE ON workspace_subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_subscriptions_updated_at ON workspace_subscriptions;
CREATE TRIGGER update_workspace_subscriptions_updated_at
  BEFORE UPDATE ON workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5. RLS Policies for workspace_subscription_plans
-- -----------------------------------------------------------------------------
ALTER TABLE workspace_subscription_plans ENABLE ROW LEVEL SECURITY;

-- Partners can manage their own plans
DROP POLICY IF EXISTS "Partners can view their own plans" ON workspace_subscription_plans;
CREATE POLICY "Partners can view their own plans" ON workspace_subscription_plans
  FOR SELECT
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Partner admins can insert plans" ON workspace_subscription_plans;
CREATE POLICY "Partner admins can insert plans" ON workspace_subscription_plans
  FOR INSERT
  WITH CHECK (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Partner admins can update plans" ON workspace_subscription_plans;
CREATE POLICY "Partner admins can update plans" ON workspace_subscription_plans
  FOR UPDATE
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Partner admins can delete plans" ON workspace_subscription_plans;
CREATE POLICY "Partner admins can delete plans" ON workspace_subscription_plans
  FOR DELETE
  USING (
    partner_id IN (
      SELECT partner_id FROM partner_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin') 
        AND removed_at IS NULL
    )
  );

-- Workspace members can view public plans from their partner
DROP POLICY IF EXISTS "Workspace members can view public plans" ON workspace_subscription_plans;
CREATE POLICY "Workspace members can view public plans" ON workspace_subscription_plans
  FOR SELECT
  USING (
    is_public = true AND is_active = true AND
    partner_id IN (
      SELECT w.partner_id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.removed_at IS NULL
    )
  );

-- -----------------------------------------------------------------------------
-- 6. RLS Policies for workspace_subscriptions
-- -----------------------------------------------------------------------------
ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Workspace members can view their subscription
DROP POLICY IF EXISTS "Workspace members can view subscription" ON workspace_subscriptions;
CREATE POLICY "Workspace members can view subscription" ON workspace_subscriptions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid() AND removed_at IS NULL
    )
  );

-- Partner members can view subscriptions for their workspaces
DROP POLICY IF EXISTS "Partners can view workspace subscriptions" ON workspace_subscriptions;
CREATE POLICY "Partners can view workspace subscriptions" ON workspace_subscriptions
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT w.id FROM workspaces w
      JOIN partner_members pm ON pm.partner_id = w.partner_id
      WHERE pm.user_id = auth.uid() AND pm.removed_at IS NULL
    )
  );

-- Service role can manage all (for webhooks/API)
DROP POLICY IF EXISTS "Service role full access to subscriptions" ON workspace_subscriptions;
CREATE POLICY "Service role full access to subscriptions" ON workspace_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access to plans" ON workspace_subscription_plans;
CREATE POLICY "Service role full access to plans" ON workspace_subscription_plans
  FOR ALL
  USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- 7. Add subscription_id to workspaces table (optional reference)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE workspaces ADD COLUMN current_subscription_id UUID REFERENCES workspace_subscriptions(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 8. Grant permissions
-- -----------------------------------------------------------------------------
GRANT ALL ON workspace_subscription_plans TO authenticated;
GRANT ALL ON workspace_subscription_plans TO service_role;
GRANT ALL ON workspace_subscriptions TO authenticated;
GRANT ALL ON workspace_subscriptions TO service_role;

-- -----------------------------------------------------------------------------
-- DONE! Now run: pnpm prisma db pull && pnpm prisma generate
-- -----------------------------------------------------------------------------


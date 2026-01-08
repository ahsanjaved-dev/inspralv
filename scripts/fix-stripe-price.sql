-- Update the Stripe Price ID for the Pro plan
-- Run this in Supabase SQL Editor

-- Step 1: Check current state
SELECT
  wsp.id,
  wsp.name,
  wsp.slug,
  wsp.stripe_price_id,
  wsp.monthly_price_cents,
  p.name as partner_name,
  p.is_platform_partner
FROM workspace_subscription_plans wsp
JOIN partners p ON wsp.partner_id = p.id
WHERE p.is_platform_partner = true
  AND wsp.slug = 'pro';

-- Step 2: Update to correct price ID from .env (price_1Sn8dO1E4RCcPHk3ABGrcj2W)
UPDATE workspace_subscription_plans
SET
  stripe_price_id = 'price_1Sn8dO1E4RCcPHk3ABGrcj2W',
  updated_at = NOW()
WHERE slug = 'pro'
  AND partner_id IN (
    SELECT id FROM partners WHERE is_platform_partner = true
  );

-- Step 3: Verify the update
SELECT
  wsp.id,
  wsp.name,
  wsp.slug,
  wsp.stripe_price_id,
  wsp.monthly_price_cents,
  p.name as partner_name,
  p.is_platform_partner
FROM workspace_subscription_plans wsp
JOIN partners p ON wsp.partner_id = p.id
WHERE p.is_platform_partner = true
  AND wsp.slug = 'pro';

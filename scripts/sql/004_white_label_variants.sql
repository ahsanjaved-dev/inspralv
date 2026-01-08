-- =============================================================================
-- WHITE-LABEL VARIANTS MIGRATION
-- =============================================================================
-- This migration adds the white_label_variants table and foreign key columns
-- to support tiered white-label plans with workspace limits.
--
-- Run this migration in Supabase SQL Editor or via psql.
-- =============================================================================

-- 1. Create white_label_variants table
CREATE TABLE IF NOT EXISTS public.white_label_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  stripe_price_id VARCHAR(100),
  max_workspaces INTEGER NOT NULL DEFAULT 10, -- -1 = unlimited
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_white_label_variants_is_active ON public.white_label_variants(is_active);
CREATE INDEX IF NOT EXISTS idx_white_label_variants_sort_order ON public.white_label_variants(sort_order);

-- Add comment
COMMENT ON TABLE public.white_label_variants IS 'White-label plan variants managed by super admin. Each variant defines pricing and workspace limits for agencies.';

-- 2. Add white_label_variant_id to partners table
ALTER TABLE public.partners
ADD COLUMN IF NOT EXISTS white_label_variant_id UUID REFERENCES public.white_label_variants(id);

-- Add index for the foreign key
CREATE INDEX IF NOT EXISTS idx_partners_white_label_variant_id ON public.partners(white_label_variant_id);

-- 3. Add assigned_white_label_variant_id to partner_requests table
ALTER TABLE public.partner_requests
ADD COLUMN IF NOT EXISTS assigned_white_label_variant_id UUID REFERENCES public.white_label_variants(id);

-- Add index for the foreign key
CREATE INDEX IF NOT EXISTS idx_partner_requests_assigned_white_label_variant_id ON public.partner_requests(assigned_white_label_variant_id);

-- 4. Insert default variants (optional - super admin can create more via UI)
-- These are example variants; adjust pricing and limits as needed.
INSERT INTO public.white_label_variants (slug, name, description, monthly_price_cents, max_workspaces, sort_order)
VALUES 
  ('starter', 'Starter', 'For small agencies getting started', 29900, 6, 1),
  ('growth', 'Growth', 'For growing agencies with more clients', 49900, 12, 2),
  ('enterprise', 'Enterprise', 'Unlimited workspaces for large agencies', 99900, -1, 3)
ON CONFLICT (slug) DO NOTHING;

-- 5. Create updated_at trigger for white_label_variants
CREATE OR REPLACE FUNCTION public.update_white_label_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_white_label_variants_updated_at ON public.white_label_variants;
CREATE TRIGGER update_white_label_variants_updated_at
  BEFORE UPDATE ON public.white_label_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_white_label_variants_updated_at();

-- 6. Enable RLS on white_label_variants (read-only for authenticated, write for service role)
ALTER TABLE public.white_label_variants ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read active variants
CREATE POLICY "Allow authenticated users to read active variants"
  ON public.white_label_variants
  FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Allow service role full access (for super admin operations)
CREATE POLICY "Allow service role full access"
  ON public.white_label_variants
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- =============================================================================
-- VERIFICATION QUERIES (run these to verify the migration)
-- =============================================================================
-- SELECT * FROM public.white_label_variants;
-- SELECT id, name, white_label_variant_id FROM public.partners LIMIT 5;
-- SELECT id, company_name, assigned_white_label_variant_id FROM public.partner_requests LIMIT 5;


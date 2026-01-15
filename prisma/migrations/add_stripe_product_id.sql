-- Migration: Add stripe_product_id to white_label_variants
-- Run this in Supabase SQL Editor or via psql

-- Add the stripe_product_id column
ALTER TABLE public.white_label_variants 
ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(100);

-- Comment for documentation
COMMENT ON COLUMN public.white_label_variants.stripe_product_id IS 'Stripe Product ID - auto-created when variant price > 0';

-- Migration: Add Platform Subdomain Support
-- Date: January 7, 2026
-- Description: Make custom_domain optional and support platform subdomains
--
-- This migration supports the new partner request flow where:
-- 1. custom_domain is optional during initial request
-- 2. Partners get a platform subdomain (e.g., acme-corp.genius365.app) immediately
-- 3. Custom domain can be added later during onboarding

-- ============================================================================
-- STEP 1: Make custom_domain nullable in partner_requests
-- ============================================================================

-- Allow custom_domain to be NULL for new requests
ALTER TABLE partner_requests ALTER COLUMN custom_domain DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN partner_requests.custom_domain IS 
  'Optional custom domain. Partners get a platform subdomain initially. Custom domain can be added during onboarding based on plan.';

-- ============================================================================
-- STEP 2: Add platform_subdomain column to partners (optional enhancement)
-- ============================================================================

-- Note: The platform subdomain is currently stored in the 'slug' column.
-- This is a future enhancement if we need to track both separately.
-- For now, the slug column serves as the platform subdomain.

-- Uncomment if you want a dedicated column:
-- ALTER TABLE partners ADD COLUMN IF NOT EXISTS platform_subdomain VARCHAR(100);
-- ALTER TABLE partners ADD COLUMN IF NOT EXISTS domain_setup_complete BOOLEAN DEFAULT FALSE;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_platform_subdomain ON partners(platform_subdomain) WHERE platform_subdomain IS NOT NULL;

-- ============================================================================
-- STEP 3: Update existing data (if needed)
-- ============================================================================

-- For any existing partner_requests with empty custom_domain, set to NULL
UPDATE partner_requests 
SET custom_domain = NULL 
WHERE custom_domain = '';

-- ============================================================================
-- STEP 4: Create index for faster subdomain lookups
-- ============================================================================

-- Index on desired_subdomain for availability checks
CREATE INDEX IF NOT EXISTS idx_partner_requests_desired_subdomain 
ON partner_requests(desired_subdomain);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify the column is now nullable
-- SELECT column_name, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'partner_requests' AND column_name = 'custom_domain';

-- Should return: is_nullable = 'YES'


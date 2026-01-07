import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  CacheKeys,
  CacheTTL,
} from "@/lib/cache"
import { env } from "@/lib/env"
import type { Partner, PartnerBranding } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export interface ResolvedPartner {
  id: string
  name: string
  slug: string
  branding: PartnerBranding
  plan_tier: string
  features: Record<string, boolean>
  resource_limits: Record<string, number>
  is_platform_partner: boolean
}

// ============================================================================
// CACHE MANAGEMENT
// Uses the centralized cache layer from lib/cache
// ============================================================================

/**
 * Clear partner cache for a specific hostname or all partners
 */
export async function clearPartnerCache(hostname?: string): Promise<void> {
  if (hostname) {
    await cacheDelete(CacheKeys.partner(hostname))
  } else {
    await cacheDeletePattern("partner:")
  }
}

// ============================================================================
// HOSTNAME EXTRACTION
// ============================================================================

/**
 * Extracts the hostname from request headers
 * Handles various deployment scenarios (Vercel, custom domains, local dev)
 */
export async function getHostname(): Promise<string> {
  const headersList = await headers()

  // Try various headers in order of preference
  const host =
    headersList.get("x-forwarded-host") || // Behind proxy (Vercel, etc.)
    headersList.get("host") || // Direct access
    "localhost" // Fallback

  // Strip port number for local development (localhost:3000 → localhost)
  const hostname = host.split(":")[0]
  return (hostname ?? host).toLowerCase()
}

// ============================================================================
// PARTNER RESOLUTION
// ============================================================================

/**
 * Extract subdomain from a hostname
 * Examples:
 * - "acme.genius365.app" → "acme"
 * - "acme.localhost" → "acme"
 * - "localhost" → null
 * - "genius365.app" → null
 */
function extractSubdomain(hostname: string): string | null {
  const parts = hostname.split(".")

  // Need at least 2 parts for a subdomain (e.g., "acme.localhost")
  if (parts.length < 2) return null

  // Check if it matches the platform domain pattern
  const platformDomainParts = env.platformDomain.split(".")

  // If hostname has more parts than platform domain, the extra part is the subdomain
  // e.g., "acme.genius365.app" (3 parts) vs "genius365.app" (2 parts) → subdomain = "acme"
  if (parts.length > platformDomainParts.length) {
    // Verify the base domain matches
    const baseParts = parts.slice(-platformDomainParts.length)
    if (baseParts.join(".") === env.platformDomain) {
      return parts.slice(0, -platformDomainParts.length).join(".")
    }
  }

  // For local development with "subdomain.localhost" pattern
  if (parts.length === 2 && parts[1] === "localhost") {
    return parts[0]
  }

  return null
}

/**
 * Helper to create a resolved partner from a database record
 */
function toResolvedPartner(partner: Partner): ResolvedPartner {
  return {
    id: partner.id,
    name: partner.name,
    slug: partner.slug,
    branding: (partner.branding as PartnerBranding) || {},
    plan_tier: partner.plan_tier,
    features: partner.features as Record<string, boolean>,
    resource_limits: partner.resource_limits as Record<string, number>,
    is_platform_partner: partner.is_platform_partner,
  }
}

/**
 * Resolves the partner based on the current request's hostname
 * This is the core of the white-label system
 *
 * Resolution order:
 * 1. [DEV ONLY] DEV_PARTNER_SLUG environment variable
 * 2. Exact hostname match in partner_domains
 * 3. [DEV ONLY] Extract subdomain and match by partner slug
 * 4. Fallback to platform partner (is_platform_partner = true)
 *
 * @returns The resolved partner or throws an error if no partner found
 */
export async function getPartnerFromHost(): Promise<ResolvedPartner> {
  const hostname = await getHostname()
  const adminClient = createAdminClient()

  // ============================================================================
  // DEVELOPMENT MODE: Check DEV_PARTNER_SLUG first
  // ============================================================================
  if (env.isDev && env.devPartnerSlug) {
    const devCacheKey = CacheKeys.partner(`dev:${env.devPartnerSlug}`)
    const devCached = await cacheGet<ResolvedPartner>(devCacheKey)
    if (devCached) {
      console.log(`[Partner] DEV MODE: Cache hit for slug: ${env.devPartnerSlug}`)
      return devCached
    }

    console.log(`[Partner] DEV MODE: Resolving partner by DEV_PARTNER_SLUG: ${env.devPartnerSlug}`)

    const { data: devPartner, error: devError } = await adminClient
      .from("partners")
      .select("*")
      .eq("slug", env.devPartnerSlug)
      .is("deleted_at", null)
      .single()

    if (devPartner && !devError) {
      const resolved = toResolvedPartner(devPartner as Partner)
      await cacheSet(devCacheKey, resolved, CacheTTL.PARTNER)
      console.log(`[Partner] DEV MODE: Resolved to: ${resolved.name} (${resolved.slug})`)
      return resolved
    }

    console.warn(`[Partner] DEV MODE: Partner slug "${env.devPartnerSlug}" not found, continuing normal resolution`)
  }

  // ============================================================================
  // NORMAL RESOLUTION
  // ============================================================================
  const cacheKey = CacheKeys.partner(hostname)

  // Check cache first
  const cached = await cacheGet<ResolvedPartner>(cacheKey)
  if (cached) {
    console.log(`[Partner] Cache hit for hostname: ${hostname}`)
    return cached
  }

  console.log(`[Partner] Resolving partner for hostname: ${hostname}`)

  // Step 1: Try to find partner by exact hostname match in partner_domains
  const { data: domainMatch, error: domainError } = await adminClient
    .from("partner_domains")
    .select(
      `
      hostname,
      is_primary,
      partner:partners!inner(
        id,
        name,
        slug,
        branding,
        plan_tier,
        features,
        resource_limits,
        is_platform_partner
      )
    `
    )
    .eq("hostname", hostname)
    .single()

  if (domainMatch?.partner && !domainError) {
    const resolved = toResolvedPartner(domainMatch.partner as unknown as Partner)
    await cacheSet(cacheKey, resolved, CacheTTL.PARTNER)
    console.log(`[Partner] Resolved by hostname: ${resolved.name} (${resolved.slug})`)
    return resolved
  }

  // Step 2: [DEV MODE] Try to extract subdomain and match by partner slug
  // This allows accessing partners via subdomain.localhost:3000 without hosts file setup
  if (env.isDev) {
    const subdomain = extractSubdomain(hostname)
    if (subdomain) {
      console.log(`[Partner] DEV MODE: Trying to resolve by extracted subdomain: ${subdomain}`)

      const { data: slugMatch, error: slugError } = await adminClient
        .from("partners")
        .select("*")
        .eq("slug", subdomain)
        .is("deleted_at", null)
        .single()

      if (slugMatch && !slugError) {
        const resolved = toResolvedPartner(slugMatch as Partner)
        await cacheSet(cacheKey, resolved, CacheTTL.PARTNER)
        console.log(`[Partner] DEV MODE: Resolved by subdomain slug: ${resolved.name} (${resolved.slug})`)
        return resolved
      }
    }
  }

  // Step 3: Fallback to platform partner
  console.log(`[Partner] No exact match for ${hostname}, falling back to platform partner`)

  const { data: platformPartner, error: platformError } = await adminClient
    .from("partners")
    .select("*")
    .eq("is_platform_partner", true)
    .single()

  if (platformError || !platformPartner) {
    console.error("[Partner] No platform partner configured!", platformError)
    throw new Error("Platform partner not configured. Please run the seed script.")
  }

  const resolved = toResolvedPartner(platformPartner as Partner)
  await cacheSet(cacheKey, resolved, CacheTTL.PARTNER)
  console.log(`[Partner] Resolved to platform partner: ${resolved.name}`)
  return resolved
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a specific feature is enabled for a partner
 */
export function hasPartnerFeature(partner: ResolvedPartner, feature: string): boolean {
  return partner.features[feature] === true
}

/**
 * Get a resource limit value for a partner
 */
export function getPartnerLimit(partner: ResolvedPartner, limit: string): number {
  const value = partner.resource_limits[limit]
  // -1 means unlimited
  return typeof value === "number" ? value : 0
}

/**
 * Get partner's display name (from branding or fallback to name)
 */
export function getPartnerDisplayName(partner: ResolvedPartner): string {
  return partner.branding.company_name || partner.name
}

/**
 * Get partner's primary color with fallback
 */
export function getPartnerPrimaryColor(partner: ResolvedPartner): string {
  return partner.branding.primary_color || "#7c3aed"
}

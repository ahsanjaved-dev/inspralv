import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
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
// CACHE (Simple in-memory cache for development)
// In production, consider using Redis or Vercel KV
// ============================================================================

interface CacheEntry {
  partner: ResolvedPartner
  timestamp: number
}

const partnerCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 1000 // 1 minute

function getCachedPartner(hostname: string): ResolvedPartner | null {
  const cached = partnerCache.get(hostname)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.partner
  }
  return null
}

function setCachedPartner(hostname: string, partner: ResolvedPartner): void {
  partnerCache.set(hostname, { partner, timestamp: Date.now() })
}

// Clear cache for a specific hostname (useful for updates)
export function clearPartnerCache(hostname?: string): void {
  if (hostname) {
    partnerCache.delete(hostname)
  } else {
    partnerCache.clear()
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
  return host.split(":")[0].toLowerCase()
}

// ============================================================================
// PARTNER RESOLUTION
// ============================================================================

/**
 * Resolves the partner based on the current request's hostname
 * This is the core of the white-label system
 *
 * Resolution order:
 * 1. Exact hostname match in partner_domains
 * 2. Fallback to platform partner (is_platform_partner = true)
 *
 * @returns The resolved partner or throws an error if no partner found
 */
export async function getPartnerFromHost(): Promise<ResolvedPartner> {
  const hostname = await getHostname()

  // Check cache first
  const cached = getCachedPartner(hostname)
  if (cached) {
    console.log(`[Partner] Cache hit for hostname: ${hostname}`)
    return cached
  }

  console.log(`[Partner] Resolving partner for hostname: ${hostname}`)

  const adminClient = createAdminClient()

  // Step 1: Try to find partner by exact hostname match
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
    const partner = domainMatch.partner as unknown as Partner
    const resolved: ResolvedPartner = {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      branding: partner.branding || {},
      plan_tier: partner.plan_tier,
      features: partner.features as Record<string, boolean>,
      resource_limits: partner.resource_limits as Record<string, number>,
      is_platform_partner: partner.is_platform_partner,
    }

    setCachedPartner(hostname, resolved)
    console.log(`[Partner] Resolved to: ${resolved.name} (${resolved.slug})`)
    return resolved
  }

  // Step 2: Fallback to platform partner
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

  const resolved: ResolvedPartner = {
    id: platformPartner.id,
    name: platformPartner.name,
    slug: platformPartner.slug,
    branding: platformPartner.branding || {},
    plan_tier: platformPartner.plan_tier,
    features: platformPartner.features as Record<string, boolean>,
    resource_limits: platformPartner.resource_limits as Record<string, number>,
    is_platform_partner: platformPartner.is_platform_partner,
  }

  // Cache the fallback too (with the original hostname as key)
  setCachedPartner(hostname, resolved)
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

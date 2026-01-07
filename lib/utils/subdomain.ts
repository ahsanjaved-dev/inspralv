/**
 * Subdomain Utilities
 *
 * Functions for generating, validating, and managing partner subdomains
 * on the platform domain (e.g., acme-corp.genius365.app)
 */

import { env } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

// Reserved subdomains that cannot be used by partners
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "super-admin",
  "superadmin",
  "dashboard",
  "portal",
  "login",
  "signup",
  "auth",
  "oauth",
  "sso",
  "mail",
  "email",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "media",
  "images",
  "files",
  "docs",
  "help",
  "support",
  "status",
  "blog",
  "news",
  "dev",
  "staging",
  "test",
  "demo",
  "beta",
  "alpha",
  "sandbox",
  "localhost",
  "local",
  "internal",
  "private",
  "public",
  "webhook",
  "webhooks",
  "ws",
  "wss",
  "socket",
  "graphql",
  "rest",
  "genius365",
  "genius",
  "platform",
  "partner",
  "partners",
  "workspace",
  "workspaces",
  "org",
  "organization",
  "account",
  "accounts",
  "billing",
  "payment",
  "payments",
  "subscribe",
  "pricing",
])

/**
 * Generate a URL-safe subdomain slug from a company name
 *
 * @example
 * generateSubdomainSlug("Acme Corporation") // "acme-corporation"
 * generateSubdomainSlug("ABC & Co.") // "abc-co"
 * generateSubdomainSlug("   Test   Company   ") // "test-company"
 */
export function generateSubdomainSlug(companyName: string): string {
  return (
    companyName
      .toLowerCase()
      .trim()
      // Replace non-alphanumeric characters with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
      // Collapse multiple hyphens
      .replace(/-+/g, "-")
      // Limit to 50 characters
      .substring(0, 50)
      // Remove any trailing hyphen after truncation
      .replace(/-$/, "")
  )
}

/**
 * Validate subdomain format
 * - Must be 3-50 characters
 * - Must start and end with alphanumeric
 * - Can contain hyphens in the middle
 * - Must be lowercase
 */
export function isValidSubdomainFormat(subdomain: string): {
  valid: boolean
  message?: string
} {
  if (!subdomain) {
    return { valid: false, message: "Subdomain is required" }
  }

  if (subdomain.length < 3) {
    return { valid: false, message: "Subdomain must be at least 3 characters" }
  }

  if (subdomain.length > 50) {
    return { valid: false, message: "Subdomain must be 50 characters or less" }
  }

  if (subdomain !== subdomain.toLowerCase()) {
    return { valid: false, message: "Subdomain must be lowercase" }
  }

  // Must start with letter or number
  if (!/^[a-z0-9]/.test(subdomain)) {
    return { valid: false, message: "Subdomain must start with a letter or number" }
  }

  // Must end with letter or number
  if (!/[a-z0-9]$/.test(subdomain)) {
    return { valid: false, message: "Subdomain must end with a letter or number" }
  }

  // Can only contain lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    return {
      valid: false,
      message: "Subdomain can only contain lowercase letters, numbers, and hyphens",
    }
  }

  // No consecutive hyphens
  if (/--/.test(subdomain)) {
    return { valid: false, message: "Subdomain cannot contain consecutive hyphens" }
  }

  return { valid: true }
}

/**
 * Check if a subdomain is reserved
 */
export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED_SUBDOMAINS.has(subdomain.toLowerCase())
}

/**
 * Check if a subdomain is available (not taken by another partner or pending request)
 */
export async function isSubdomainAvailable(subdomain: string): Promise<{
  available: boolean
  reason?: string
}> {
  const normalizedSubdomain = subdomain.toLowerCase().trim()

  // Validate format first
  const formatCheck = isValidSubdomainFormat(normalizedSubdomain)
  if (!formatCheck.valid) {
    return { available: false, reason: formatCheck.message }
  }

  // Check reserved list
  if (isReservedSubdomain(normalizedSubdomain)) {
    return { available: false, reason: "This subdomain is reserved" }
  }

  const adminClient = createAdminClient()

  // Check existing partners (subdomain is stored in 'slug' column)
  const { data: existingPartner, error: partnerError } = await adminClient
    .from("partners")
    .select("id")
    .eq("slug", normalizedSubdomain)
    .maybeSingle()

  if (partnerError) {
    console.error("Error checking partner availability:", partnerError)
    return { available: false, reason: "Unable to check availability. Please try again." }
  }

  if (existingPartner) {
    return { available: false, reason: "This subdomain is already in use" }
  }

  // Check pending partner requests
  const { data: pendingRequest } = await adminClient
    .from("partner_requests")
    .select("id")
    .eq("desired_subdomain", normalizedSubdomain)
    .in("status", ["pending", "provisioning"])
    .maybeSingle()

  if (pendingRequest) {
    return { available: false, reason: "This subdomain is pending approval" }
  }

  // Check existing partner domains
  const fullHostname = `${normalizedSubdomain}.${env.platformDomain}`
  const { data: existingDomain } = await adminClient
    .from("partner_domains")
    .select("id")
    .eq("hostname", fullHostname)
    .maybeSingle()

  if (existingDomain) {
    return { available: false, reason: "This subdomain is already registered" }
  }

  return { available: true }
}

/**
 * Generate a unique subdomain, adding a numeric suffix if necessary
 *
 * @example
 * generateUniqueSubdomain("acme-corp") // "acme-corp" (if available)
 * generateUniqueSubdomain("acme-corp") // "acme-corp-2" (if taken)
 */
export async function generateUniqueSubdomain(baseSubdomain: string): Promise<string> {
  let subdomain = generateSubdomainSlug(baseSubdomain)
  let suffix = 1
  const maxAttempts = 100

  while (suffix <= maxAttempts) {
    const candidateSubdomain = suffix === 1 ? subdomain : `${subdomain}-${suffix}`

    // Skip if too long
    if (candidateSubdomain.length > 50) {
      // Truncate base subdomain to make room for suffix
      const maxBaseLength = 50 - String(suffix).length - 1
      subdomain = subdomain.substring(0, maxBaseLength).replace(/-$/, "")
      continue
    }

    const { available } = await isSubdomainAvailable(candidateSubdomain)
    if (available) {
      return candidateSubdomain
    }

    suffix++
  }

  // Fallback: generate random suffix
  const randomSuffix = Math.random().toString(36).substring(2, 8)
  return `${subdomain.substring(0, 40)}-${randomSuffix}`
}

/**
 * Get the full platform URL for a subdomain
 *
 * @example
 * getFullSubdomainUrl("acme-corp") // "acme-corp.genius365.app"
 */
export function getFullSubdomainUrl(subdomain: string): string {
  return `${subdomain}.${env.platformDomain}`
}

/**
 * Get the full login URL for a partner subdomain
 *
 * @example
 * getLoginUrl("acme-corp") // "https://acme-corp.genius365.app/login"
 */
export function getLoginUrl(subdomain: string): string {
  const protocol = env.isProd ? "https" : "http"
  return `${protocol}://${getFullSubdomainUrl(subdomain)}/login`
}


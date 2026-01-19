import { type NextRequest, NextResponse } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"
import { createClient } from "@supabase/supabase-js"

// In-memory cache for partner resolution to avoid redundant API calls
// TTL: 60 seconds, cleared on each deployment
const partnerCache = new Map<string, { data: { is_platform_partner: boolean } | null; timestamp: number }>()
const PARTNER_CACHE_TTL = 60 * 1000 // 60 seconds

/**
 * Partner Domain Access Control Proxy
 *
 * This proxy enforces strict access control for white-label partner domains:
 *
 * PLATFORM PARTNER (genius365.ai):
 * - Full access to all routes (marketing, auth, dashboard, etc.)
 *
 * WHITE-LABEL PARTNERS (partner subdomains/custom domains):
 * - Only allowed routes: /login, /signup (with invitation token), /w/*, /org/*, /select-workspace
 * - All marketing pages return 404
 * - Public APIs restricted
 * - Logged-in users on marketing pages → redirect to dashboard
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */

// Routes that are ALWAYS allowed on partner domains
const PARTNER_ALLOWED_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/accept-partner-invitation",
  "/accept-workspace-invitation",
  "/select-workspace",
  "/setup-profile",
  "/workspace-onboarding",
]

// Route prefixes that are ALWAYS allowed on partner domains
const PARTNER_ALLOWED_PREFIXES = [
  "/w/", // Workspace dashboard routes
  "/org/", // Organization dashboard routes
  "/api/partner/", // Partner API routes
  "/api/w/", // Workspace API routes
  "/api/auth/", // Auth API routes
  "/api/webhooks/", // Webhook routes
  "/_next/", // Next.js internals
  "/favicon", // Favicon
]

// API routes that should be blocked for partners
const PARTNER_BLOCKED_API_ROUTES = [
  "/api/partner-requests", // New partner request form
  "/api/super-admin", // Super admin routes
]

// Static files and special routes to always allow
const STATIC_ROUTES = ["/_next", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.json"]

/**
 * Check if a route should be allowed for partner domains
 */
function isRouteAllowedForPartner(pathname: string): boolean {
  // Check exact matches
  if (PARTNER_ALLOWED_ROUTES.includes(pathname)) {
    return true
  }

  // Check prefixes
  for (const prefix of PARTNER_ALLOWED_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true
    }
  }

  // Check if it's a static file
  for (const staticRoute of STATIC_ROUTES) {
    if (pathname.startsWith(staticRoute)) {
      return true
    }
  }

  return false
}

/**
 * Check if an API route should be blocked for partners
 */
function isApiBlockedForPartner(pathname: string): boolean {
  for (const blockedRoute of PARTNER_BLOCKED_API_ROUTES) {
    if (pathname.startsWith(blockedRoute)) {
      return true
    }
  }
  return false
}

/**
 * Resolve partner from hostname using Supabase directly
 * (Can't use the normal partner resolution as it uses server-only headers)
 * Uses in-memory caching to avoid redundant API calls per request
 * 
 * @param hostname - The cleaned hostname (without port)
 * @param fullHostname - The original hostname (may include port)
 */
async function resolvePartnerFromHostname(
  hostname: string,
  fullHostname?: string
): Promise<{ is_platform_partner: boolean } | null> {
  // Generate cache key
  const cacheKey = `${hostname}|${fullHostname || ""}`
  
  // Check cache first
  const cached = partnerCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < PARTNER_CACHE_TTL) {
    return cached.data
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[Proxy] Supabase credentials not configured")
    return null
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Build list of hostnames to try (handles both with and without port)
  const hostnamesToTry = [hostname]
  if (fullHostname && fullHostname !== hostname) {
    hostnamesToTry.push(fullHostname)
  }
  // Also try with common dev ports if not already included
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "localhost:3000"
  if (platformDomain.includes(":")) {
    const port = platformDomain.split(":")[1]
    const hostnameWithPort = `${hostname}:${port}`
    if (!hostnamesToTry.includes(hostnameWithPort)) {
      hostnamesToTry.push(hostnameWithPort)
    }
  }

  // OPTIMIZATION: Query all hostname variants in one request using OR filter
  const { data: domainMatches } = await supabase
    .from("partner_domains")
    .select(
      `
      hostname,
      partner:partners!inner(
        is_platform_partner
      )
    `
    )
    .in("hostname", hostnamesToTry)

  if (domainMatches && domainMatches.length > 0) {
    // Use first match (prefer the order in hostnamesToTry)
    for (const hostnameVariant of hostnamesToTry) {
      const match = domainMatches.find((d: any) => d.hostname === hostnameVariant)
      if (match?.partner) {
        const result = (match.partner as { is_platform_partner: boolean }[])?.[0] ?? null
        // Cache the result
        partnerCache.set(cacheKey, { data: result, timestamp: Date.now() })
        return result
      }
    }
  }

  // Check if it's a subdomain pattern (for dev mode)
  const parts = hostname.split(".")
  if (parts.length >= 2) {
    const potentialSlug = parts[0]

    // Try to find partner by slug
    const { data: slugMatch } = await supabase
      .from("partners")
      .select("is_platform_partner")
      .eq("slug", potentialSlug)
      .is("deleted_at", null)
      .single()

    if (slugMatch) {
      // Cache the result
      partnerCache.set(cacheKey, { data: slugMatch, timestamp: Date.now() })
      return slugMatch
    }
  }

  // Fallback to platform partner
  const { data: platformPartner } = await supabase
    .from("partners")
    .select("is_platform_partner")
    .eq("is_platform_partner", true)
    .single()

  // Cache the result
  partnerCache.set(cacheKey, { data: platformPartner, timestamp: Date.now() })
  return platformPartner
}

/**
 * Next.js 16 Proxy function (formerly middleware)
 * Runs on the server before a request is completed
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const hostname =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost"
  const cleanHostname = hostname.split(":")[0]?.toLowerCase() || "localhost"

  // Always allow static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next()
  }

  // Update Supabase session
  const { supabaseResponse, user } = await updateSession(request)

  // Resolve partner from hostname (pass both clean and full hostname for port handling)
  const partner = await resolvePartnerFromHostname(cleanHostname, hostname)

  // If we couldn't resolve partner, allow request (fail open for safety)
  if (!partner) {
    console.warn(`[Proxy] Could not resolve partner for hostname: ${cleanHostname}`)
    return supabaseResponse
  }

  // Platform partner: allow all routes
  if (partner.is_platform_partner) {
    return supabaseResponse
  }

  // ============================================================================
  // WHITE-LABEL PARTNER RESTRICTIONS
  // ============================================================================

  // Check if route is allowed for partners
  const isAllowed = isRouteAllowedForPartner(pathname)

  // Root path "/" - redirect to login for partners
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // If user is logged in and trying to access a restricted route, redirect to dashboard
  if (user && !isAllowed) {
    return NextResponse.redirect(new URL("/select-workspace", request.url))
  }

  // Check blocked API routes
  if (pathname.startsWith("/api/") && isApiBlockedForPartner(pathname)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // If route is not allowed and user is not logged in, return 404
  if (!isAllowed) {
    // Create a response that will trigger Next.js 404 page
    return NextResponse.rewrite(new URL("/404", request.url))
  }

  // Special handling for /signup - only allow with invitation token for partners
  // The signup page component handles showing the invitation-only message
  // if no token is present

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

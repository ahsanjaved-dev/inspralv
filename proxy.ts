// proxy.ts
import { updateSession } from "@/lib/supabase/middleware"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Public paths that don't require authentication
const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/accept-partner-invitation",
  "/accept-workspace-invitation",
  "/pricing",
  "/request-partner",
  "/api/health",
]

const superAdminPaths = ["/super-admin"]

const protectedPaths = [
  "/select-workspace",
  "/workspace-onboarding",
  "/w/",
  "/org/",
]

// Cookie name for storing last visited workspace
const LAST_WORKSPACE_COOKIE = "genius365_last_workspace"

/**
 * Build Content Security Policy header
 * Updated: Permissive CSP for VAPI, Retell, Daily.co, Krisp, and LiveKit
 */
function buildCSP(): string {
  const policies = [
    "default-src 'self'",
    // Scripts: permissive for VAPI/Retell/Daily/Krisp/LiveKit worklets + Stripe
    // Note: 'unsafe-eval' is required by Daily.co call machine bundle in both dev and prod
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.daily.co https://*.vapi.ai https://*.krisp.ai https://*.retellai.com https://*.livekit.cloud https://js.stripe.com https://*.stripe.com blob: data:",
    // Styles
    "style-src 'self' 'unsafe-inline'",
    // Images - Added Stripe for card brand icons
    "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://avatars.githubusercontent.com https://*.stripe.com",
    // Fonts
    "font-src 'self' https://fonts.gstatic.com",
    // Connect: all voice provider services + Stripe API + Sentry
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vapi.ai wss://*.vapi.ai https://*.daily.co wss://*.daily.co https://*.krisp.ai wss://*.krisp.ai https://*.retellai.com wss://*.retellai.com https://*.livekit.cloud wss://*.livekit.cloud https://*.cloudfront.net https://api.stripe.com https://*.stripe.com https://*.sentry.io",
    // Frame - Added Stripe for 3D Secure and payment elements
    "frame-src 'self' https://*.daily.co https://*.vapi.ai https://*.retellai.com https://*.livekit.cloud https://js.stripe.com https://*.stripe.com",
    // Media
    "media-src 'self' blob: data: https://*.daily.co https://*.vapi.ai https://*.retellai.com https://*.livekit.cloud",
    // Workers and Child (for audio worklets)
    "worker-src 'self' blob: data: https://*.daily.co https://*.vapi.ai https://*.krisp.ai https://*.retellai.com https://*.livekit.cloud",
    "child-src 'self' blob: https://*.daily.co https://*.retellai.com https://*.livekit.cloud",
    // Frame ancestors
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ]
  return policies.join("; ")
}

/**
 * Apply security headers to response
 */
function applySecurityHeaders(response: NextResponse): void {
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    )
  }

  response.headers.set("Content-Security-Policy", buildCSP())
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), payment=()"
  )
  response.headers.set("X-DNS-Prefetch-Control", "on")
}

// Function named 'proxy' as required by Next.js 16
export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  )
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path))
  const isSuperAdminPath = superAdminPaths.some((path) => pathname.startsWith(path))
  const isApiPath = pathname.startsWith("/api/")
  const isWorkspacePath = pathname.startsWith("/w/")

  // Protected path without user -> redirect to login
  if (isProtectedPath && !user) {
    const redirectUrl = new URL("/login", request.url)
    redirectUrl.searchParams.set("redirect", pathname)
    const response = NextResponse.redirect(redirectUrl)
    applySecurityHeaders(response)
    return response
  }

  const authPaths = ["/login", "/signup"]
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path))
  const redirectParam = request.nextUrl.searchParams.get("redirect")

  // Authenticated user on auth page without redirect param -> smart redirect
  if (isAuthPath && user && !redirectParam) {
    // Check if user has a last visited workspace stored in cookie
    const lastWorkspace = request.cookies.get(LAST_WORKSPACE_COOKIE)?.value
    
    if (lastWorkspace) {
      // Redirect to last visited workspace
      const response = NextResponse.redirect(new URL(`/w/${lastWorkspace}/dashboard`, request.url))
      applySecurityHeaders(response)
      return response
    }
    
    // Otherwise go to workspace selector
    const response = NextResponse.redirect(new URL("/select-workspace", request.url))
    applySecurityHeaders(response)
    return response
  }

  // Track workspace visits for smart redirect
  if (isWorkspacePath && user) {
    // Extract workspace slug from path: /w/[slug]/...
    const pathParts = pathname.split("/")
    const workspaceSlug = pathParts[2]
    
    if (workspaceSlug && workspaceSlug !== "undefined") {
      // Set cookie to remember last visited workspace
      const response = supabaseResponse
      response.cookies.set(LAST_WORKSPACE_COOKIE, workspaceSlug, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        httpOnly: false, // Allow client-side access for UX
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      })
      applySecurityHeaders(response)
      return response
    }
  }

  const response = supabaseResponse
  applySecurityHeaders(response)
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
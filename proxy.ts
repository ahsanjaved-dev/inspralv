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
  "/accept-invitation",
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
]

/**
 * Build Content Security Policy header
 * Updated: Permissive CSP for VAPI, Retell, Daily.co, Krisp, and LiveKit
 */
function buildCSP(): string {
  const policies = [
    "default-src 'self'",
    // Scripts: permissive for VAPI/Retell/Daily/Krisp/LiveKit worklets
    process.env.NODE_ENV === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.daily.co https://*.vapi.ai https://*.krisp.ai https://*.retellai.com https://*.livekit.cloud blob: data:"
      : "script-src 'self' 'unsafe-inline' https://*.daily.co https://*.vapi.ai https://*.krisp.ai https://*.retellai.com https://*.livekit.cloud blob: data:",
    // Styles
    "style-src 'self' 'unsafe-inline'",
    // Images
    "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://avatars.githubusercontent.com",
    // Fonts
    "font-src 'self' https://fonts.gstatic.com",
    // Connect: all voice provider services - ADDED livekit.cloud for Retell WebRTC
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vapi.ai wss://*.vapi.ai https://*.daily.co wss://*.daily.co https://*.krisp.ai wss://*.krisp.ai https://*.retellai.com wss://*.retellai.com https://*.livekit.cloud wss://*.livekit.cloud https://*.cloudfront.net",
    // Frame
    "frame-src 'self' https://*.daily.co https://*.vapi.ai https://*.retellai.com https://*.livekit.cloud",
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

// Function named 'proxy' as required by Next.js 16
export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  )
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path))
  const isSuperAdminPath = superAdminPaths.some((path) => pathname.startsWith(path))

  if (isProtectedPath && !user) {
    const redirectUrl = new URL("/login", request.url)
    redirectUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  const authPaths = ["/login", "/signup"]
  const isAuthPath = authPaths.some((path) => pathname.startsWith(path))
  const redirectParam = request.nextUrl.searchParams.get("redirect")

  if (isAuthPath && user && !redirectParam) {
    return NextResponse.redirect(new URL("/select-workspace", request.url))
  }

  const response = supabaseResponse

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

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
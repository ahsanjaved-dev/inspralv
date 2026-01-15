/**
 * Secure token generation and validation for agency checkout links
 * 
 * Uses HMAC-SHA256 to create signed tokens that encode:
 * - Partner request ID
 * - Expiration timestamp
 * 
 * This prevents tampering and ensures checkout links expire.
 */

import { createHmac, randomBytes } from "crypto"
import { env } from "@/lib/env"

// Token expires in 7 days by default
const DEFAULT_EXPIRY_DAYS = 7

interface TokenPayload {
  requestId: string
  expiresAt: number // Unix timestamp
}

/**
 * Get the secret key for signing tokens
 * Uses NEXTAUTH_SECRET or falls back to a derived key from Supabase JWT secret
 */
function getSigningKey(): string {
  // Prefer NEXTAUTH_SECRET if available
  if (process.env.NEXTAUTH_SECRET) {
    return process.env.NEXTAUTH_SECRET
  }
  // Fall back to Supabase JWT secret
  if (process.env.SUPABASE_JWT_SECRET) {
    return process.env.SUPABASE_JWT_SECRET
  }
  // Last resort: use a combination of available secrets
  const combined = `${env.supabaseServiceRoleKey || ""}:checkout-token-secret`
  return createHmac("sha256", "inspral-checkout").update(combined).digest("hex")
}

/**
 * Create a signed checkout token for a partner request
 */
export function createCheckoutToken(
  requestId: string,
  expiryDays: number = DEFAULT_EXPIRY_DAYS
): string {
  const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000
  
  // Create payload
  const payload: TokenPayload = {
    requestId,
    expiresAt,
  }
  
  // Encode payload as base64
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url")
  
  // Create signature
  const signature = createHmac("sha256", getSigningKey())
    .update(payloadStr)
    .digest("base64url")
  
  // Return token as payload.signature
  return `${payloadStr}.${signature}`
}

/**
 * Verify and decode a checkout token
 * Returns the payload if valid, null if invalid or expired
 */
export function verifyCheckoutToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 2) {
      console.error("[Checkout Token] Invalid token format")
      return null
    }
    
    const payloadStr = parts[0]
    const signature = parts[1]
    
    if (!payloadStr || !signature) {
      console.error("[Checkout Token] Missing payload or signature")
      return null
    }
    
    // Verify signature
    const expectedSignature = createHmac("sha256", getSigningKey())
      .update(payloadStr)
      .digest("base64url")
    
    if (signature !== expectedSignature) {
      console.error("[Checkout Token] Invalid signature")
      return null
    }
    
    // Decode payload
    const payload: TokenPayload = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString("utf-8")
    )
    
    // Check expiration
    if (Date.now() > payload.expiresAt) {
      console.error("[Checkout Token] Token expired")
      return null
    }
    
    return payload
  } catch (error) {
    console.error("[Checkout Token] Failed to verify token:", error)
    return null
  }
}

/**
 * Generate a random nonce for additional security
 */
export function generateNonce(): string {
  return randomBytes(16).toString("hex")
}

/**
 * Get the expiration date from a token (for display purposes)
 */
export function getTokenExpiry(token: string): Date | null {
  const payload = verifyCheckoutToken(token)
  if (!payload) return null
  return new Date(payload.expiresAt)
}

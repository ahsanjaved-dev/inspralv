/**
 * Rate Limiting Utility
 * Phase 2.1.2: Add brute force protection
 *
 * Implements sliding window rate limiting for API endpoints.
 * Uses Redis/Upstash for distributed rate limiting in production.
 * Falls back to in-memory storage for development.
 */

import { Ratelimit } from "@upstash/ratelimit"
import { getRedisClient, isRedisConfigured, redisIncr, redisExpire, redisTtl } from "@/lib/redis"
import { logger } from "@/lib/logger"

// ============================================================================
// TYPES
// ============================================================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  limit: number
  resetAt: number
  retryAfterSeconds?: number
}

interface RateLimitOptions {
  /** Maximum number of requests allowed */
  limit: number
  /** Time window in seconds */
  windowSeconds: number
  /** Identifier for the rate limit (e.g., "login", "api") */
  identifier: string
}

// ============================================================================
// IN-MEMORY STORE (Fallback)
// ============================================================================

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean expired entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key)
      }
    }
  }, 60 * 1000) // Clean every minute
}

// ============================================================================
// UPSTASH RATELIMIT INSTANCES (Cached)
// ============================================================================

const ratelimitInstances = new Map<string, Ratelimit>()

/**
 * Get or create an Upstash Ratelimit instance
 */
function getUpstashRatelimit(identifier: string, limit: number, windowSeconds: number): Ratelimit | null {
  const redis = getRedisClient()
  if (!redis) return null

  const cacheKey = `${identifier}:${limit}:${windowSeconds}`
  
  if (!ratelimitInstances.has(cacheKey)) {
    // Use sliding window algorithm for more accurate rate limiting
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds}s`),
      analytics: true,
      prefix: `ratelimit:${identifier}`,
    })
    ratelimitInstances.set(cacheKey, ratelimit)
  }

  return ratelimitInstances.get(cacheKey)!
}

// ============================================================================
// RATE LIMIT FUNCTION (Redis with Memory Fallback)
// ============================================================================

/**
 * Check rate limit using Redis (distributed) or in-memory (local)
 */
export async function checkRateLimitAsync(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const useRedis = isRedisConfigured()
  
  if (useRedis) {
    return checkRateLimitRedis(key, options)
  }

  // Fallback to in-memory rate limiting
  return checkRateLimitMemory(key, options)
}

/**
 * Check rate limit using Upstash Ratelimit (distributed)
 */
async function checkRateLimitRedis(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const ratelimit = getUpstashRatelimit(options.identifier, options.limit, options.windowSeconds)
  
  if (!ratelimit) {
    logger.warn("Redis ratelimit not available, falling back to memory", { key })
    return checkRateLimitMemory(key, options)
  }

  try {
    const result = await ratelimit.limit(key)
    const now = Date.now()
    
    return {
      success: result.success,
      remaining: result.remaining,
      limit: result.limit,
      resetAt: result.reset,
      retryAfterSeconds: result.success ? undefined : Math.ceil((result.reset - now) / 1000),
    }
  } catch (error) {
    logger.error("Redis rate limit check failed, falling back to memory", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return checkRateLimitMemory(key, options)
  }
}

/**
 * Check rate limit using in-memory store (synchronous, for local development)
 */
function checkRateLimitMemory(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now()
  const fullKey = `${options.identifier}:${key}`
  const windowMs = options.windowSeconds * 1000

  // Get or create entry
  let entry = rateLimitStore.get(fullKey)

  // If entry doesn't exist or has expired, create new one
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    }
  }

  // Increment count
  entry.count++
  rateLimitStore.set(fullKey, entry)

  // Check if over limit
  const isOverLimit = entry.count > options.limit
  const remaining = Math.max(0, options.limit - entry.count)
  const retryAfterSeconds = isOverLimit
    ? Math.ceil((entry.resetAt - now) / 1000)
    : undefined

  return {
    success: !isOverLimit,
    remaining,
    limit: options.limit,
    resetAt: entry.resetAt,
    retryAfterSeconds,
  }
}

/**
 * Synchronous rate limit check (uses in-memory only)
 * For backwards compatibility with existing code
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  return checkRateLimitMemory(key, options)
}

/**
 * Reset rate limit for a key (e.g., after successful login)
 */
export async function resetRateLimitAsync(key: string, identifier: string): Promise<void> {
  const useRedis = isRedisConfigured()
  const fullKey = `${identifier}:${key}`

  if (useRedis) {
    const ratelimit = getUpstashRatelimit(identifier, 1, 1) // Parameters don't matter for reset
    if (ratelimit) {
      try {
        await ratelimit.resetUsedTokens(key)
      } catch (error) {
        logger.warn("Failed to reset Redis rate limit", {
          key: fullKey,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }
  }

  // Always reset memory store too
  rateLimitStore.delete(fullKey)
}

/**
 * Synchronous reset (memory only, for backwards compatibility)
 */
export function resetRateLimit(key: string, identifier: string): void {
  rateLimitStore.delete(`${identifier}:${key}`)
}

// ============================================================================
// PRE-CONFIGURED RATE LIMITERS
// ============================================================================

/**
 * Rate limit for login attempts
 * 5 attempts per 15 minutes
 */
export function checkLoginRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(identifier, {
    limit: 5,
    windowSeconds: 15 * 60, // 15 minutes
    identifier: "login",
  })
}

/**
 * Async version of login rate limit (uses Redis when available)
 */
export async function checkLoginRateLimitAsync(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitAsync(identifier, {
    limit: 5,
    windowSeconds: 15 * 60,
    identifier: "login",
  })
}

/**
 * Rate limit for signup attempts
 * 3 attempts per hour per IP
 */
export function checkSignupRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(identifier, {
    limit: 3,
    windowSeconds: 60 * 60, // 1 hour
    identifier: "signup",
  })
}

/**
 * Async version of signup rate limit
 */
export async function checkSignupRateLimitAsync(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitAsync(identifier, {
    limit: 3,
    windowSeconds: 60 * 60,
    identifier: "signup",
  })
}

/**
 * Rate limit for password reset requests
 * 3 attempts per hour per email
 */
export function checkPasswordResetRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(identifier, {
    limit: 3,
    windowSeconds: 60 * 60, // 1 hour
    identifier: "password-reset",
  })
}

/**
 * Async version of password reset rate limit
 */
export async function checkPasswordResetRateLimitAsync(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitAsync(identifier, {
    limit: 3,
    windowSeconds: 60 * 60,
    identifier: "password-reset",
  })
}

/**
 * Rate limit for API requests (general)
 * 100 requests per minute
 */
export function checkApiRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(identifier, {
    limit: 100,
    windowSeconds: 60, // 1 minute
    identifier: "api",
  })
}

/**
 * Async version of API rate limit
 */
export async function checkApiRateLimitAsync(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitAsync(identifier, {
    limit: 100,
    windowSeconds: 60,
    identifier: "api",
  })
}

// ============================================================================
// TIER-BASED RATE LIMITING (Phase 6.3.2)
// ============================================================================

export type PlanTier = "starter" | "professional" | "enterprise" | "platform"

/**
 * Rate limits per plan tier
 */
export const TIER_RATE_LIMITS: Record<PlanTier, { requestsPerMinute: number; requestsPerHour: number }> = {
  starter: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
  },
  professional: {
    requestsPerMinute: 200,
    requestsPerHour: 5000,
  },
  enterprise: {
    requestsPerMinute: 500,
    requestsPerHour: 20000,
  },
  platform: {
    requestsPerMinute: 1000,
    requestsPerHour: 50000,
  },
}

/**
 * Check rate limit based on plan tier (synchronous, memory only)
 */
export function checkTierRateLimit(
  identifier: string,
  tier: PlanTier
): { minuteResult: RateLimitResult; hourResult: RateLimitResult; allowed: boolean } {
  const limits = TIER_RATE_LIMITS[tier]

  const minuteResult = checkRateLimit(identifier, {
    limit: limits.requestsPerMinute,
    windowSeconds: 60,
    identifier: `tier-minute-${tier}`,
  })

  const hourResult = checkRateLimit(identifier, {
    limit: limits.requestsPerHour,
    windowSeconds: 3600,
    identifier: `tier-hour-${tier}`,
  })

  return {
    minuteResult,
    hourResult,
    allowed: minuteResult.success && hourResult.success,
  }
}

/**
 * Async version of tier rate limit (uses Redis when available)
 */
export async function checkTierRateLimitAsync(
  identifier: string,
  tier: PlanTier
): Promise<{ minuteResult: RateLimitResult; hourResult: RateLimitResult; allowed: boolean }> {
  const limits = TIER_RATE_LIMITS[tier]

  const [minuteResult, hourResult] = await Promise.all([
    checkRateLimitAsync(identifier, {
      limit: limits.requestsPerMinute,
      windowSeconds: 60,
      identifier: `tier-minute-${tier}`,
    }),
    checkRateLimitAsync(identifier, {
      limit: limits.requestsPerHour,
      windowSeconds: 3600,
      identifier: `tier-hour-${tier}`,
    }),
  ])

  return {
    minuteResult,
    hourResult,
    allowed: minuteResult.success && hourResult.success,
  }
}

/**
 * Get combined rate limit headers for tier-based limiting
 */
export function getTierRateLimitHeaders(
  minuteResult: RateLimitResult,
  hourResult: RateLimitResult
): Record<string, string> {
  return {
    "X-RateLimit-Limit-Minute": String(minuteResult.limit),
    "X-RateLimit-Remaining-Minute": String(minuteResult.remaining),
    "X-RateLimit-Limit-Hour": String(hourResult.limit),
    "X-RateLimit-Remaining-Hour": String(hourResult.remaining),
    "X-RateLimit-Reset": String(Math.floor(minuteResult.resetAt / 1000)),
    ...((!minuteResult.success || !hourResult.success) && {
      "Retry-After": String(
        !minuteResult.success
          ? minuteResult.retryAfterSeconds
          : hourResult.retryAfterSeconds
      ),
    }),
  }
}

// ============================================================================
// ENDPOINT-SPECIFIC RATE LIMITS (Phase 6.3.3)
// ============================================================================

export type EndpointCategory = "read" | "write" | "expensive" | "auth"

/**
 * Multipliers for different endpoint categories
 */
const ENDPOINT_MULTIPLIERS: Record<EndpointCategory, number> = {
  read: 1.5, // Higher limits for read operations
  write: 1.0, // Base limit for write operations
  expensive: 0.2, // Much stricter for expensive operations
  auth: 0.1, // Very strict for auth operations
}

/**
 * Check rate limit for specific endpoint category (synchronous)
 */
export function checkEndpointRateLimit(
  identifier: string,
  tier: PlanTier,
  category: EndpointCategory
): RateLimitResult {
  const baseLimits = TIER_RATE_LIMITS[tier]
  const multiplier = ENDPOINT_MULTIPLIERS[category]

  const limit = Math.floor(baseLimits.requestsPerMinute * multiplier)

  return checkRateLimit(identifier, {
    limit,
    windowSeconds: 60,
    identifier: `endpoint-${category}`,
  })
}

/**
 * Async version of endpoint rate limit
 */
export async function checkEndpointRateLimitAsync(
  identifier: string,
  tier: PlanTier,
  category: EndpointCategory
): Promise<RateLimitResult> {
  const baseLimits = TIER_RATE_LIMITS[tier]
  const multiplier = ENDPOINT_MULTIPLIERS[category]

  const limit = Math.floor(baseLimits.requestsPerMinute * multiplier)

  return checkRateLimitAsync(identifier, {
    limit,
    windowSeconds: 60,
    identifier: `endpoint-${category}`,
  })
}

/**
 * Rate limit for partner request submissions
 * 2 per hour per IP
 */
export function checkPartnerRequestRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(identifier, {
    limit: 2,
    windowSeconds: 60 * 60, // 1 hour
    identifier: "partner-request",
  })
}

/**
 * Async version of partner request rate limit
 */
export async function checkPartnerRequestRateLimitAsync(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitAsync(identifier, {
    limit: 2,
    windowSeconds: 60 * 60,
    identifier: "partner-request",
  })
}

/**
 * Rate limit for credits top-up requests
 * 5 attempts per 5 minutes per partner
 */
export function checkCreditsTopupRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(identifier, {
    limit: 5,
    windowSeconds: 5 * 60, // 5 minutes
    identifier: "credits-topup",
  })
}

/**
 * Async version of credits topup rate limit
 */
export async function checkCreditsTopupRateLimitAsync(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitAsync(identifier, {
    limit: 5,
    windowSeconds: 5 * 60,
    identifier: "credits-topup",
  })
}

/**
 * Rate limit for webhook endpoints
 * 1000 requests per minute (high volume for external services)
 */
export async function checkWebhookRateLimitAsync(identifier: string): Promise<RateLimitResult> {
  return checkRateLimitAsync(identifier, {
    limit: 1000,
    windowSeconds: 60,
    identifier: "webhook",
  })
}

// ============================================================================
// HELPER TO GET RATE LIMIT HEADERS
// ============================================================================

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    ...(result.retryAfterSeconds && {
      "Retry-After": String(result.retryAfterSeconds),
    }),
  }
}

// ============================================================================
// RATE LIMIT BACKEND INFO
// ============================================================================

/**
 * Get current rate limiting backend status
 */
export function getRateLimitBackend(): { backend: "redis" | "memory"; configured: boolean } {
  const configured = isRedisConfigured()
  return {
    backend: configured ? "redis" : "memory",
    configured,
  }
}

/**
 * Rate Limiting Utility
 * Phase 2.1.2: Add brute force protection
 *
 * Implements sliding window rate limiting for API endpoints.
 * Uses in-memory storage by default, can be extended for Redis.
 */

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
// IN-MEMORY STORE
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
// RATE LIMIT FUNCTION
// ============================================================================

/**
 * Check and update rate limit for a given key
 */
export function checkRateLimit(
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
 * Reset rate limit for a key (e.g., after successful login)
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
 * Check rate limit based on plan tier
 * Uses both per-minute and per-hour limits
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
 * Check rate limit for specific endpoint category
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


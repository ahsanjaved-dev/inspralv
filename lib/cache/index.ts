/**
 * Cache Layer for Genius365 Platform
 * Phase 1.1.2: Implement caching for performance optimization
 *
 * This module provides a flexible caching interface that supports:
 * - Redis/Upstash caching (for production - distributed across serverless instances)
 * - In-memory caching (fallback for development when Redis is not configured)
 */

import {
  isRedisConfigured,
  redisGet,
  redisSet,
  redisDel,
  redisDeletePattern,
  redisFlush,
} from "@/lib/redis"
import { logger } from "@/lib/logger"

// ============================================================================
// TYPES
// ============================================================================

export interface CacheOptions {
  /** Time-to-live in seconds */
  ttl?: number
  /** Cache key prefix for namespacing */
  prefix?: string
}

export interface CacheEntry<T> {
  value: T
  expiresAt: number
}

// ============================================================================
// IN-MEMORY CACHE (Development/Fallback)
// ============================================================================

const memoryCache = new Map<string, CacheEntry<unknown>>()

// Clean expired entries periodically
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.expiresAt < now) {
        memoryCache.delete(key)
      }
    }
  }, 60 * 1000) // Clean every minute
}

// ============================================================================
// CACHE BACKEND DETECTION
// ============================================================================

/**
 * Check if we're using Redis or in-memory cache
 */
export function getCacheBackend(): "redis" | "memory" {
  return isRedisConfigured() ? "redis" : "memory"
}

// ============================================================================
// CACHE FUNCTIONS
// ============================================================================

/**
 * Get a value from cache (Redis or memory)
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const useRedis = isRedisConfigured()

  if (useRedis) {
    const value = await redisGet<T>(key)
    if (value !== null) {
      trackCacheHit()
    } else {
      trackCacheMiss()
    }
    return value
  }

  // In-memory fallback
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined

  if (!entry) {
    trackCacheMiss()
    return null
  }

  // Check if expired
  if (entry.expiresAt < Date.now()) {
    memoryCache.delete(key)
    trackCacheMiss()
    return null
  }

  trackCacheHit()
  return entry.value
}

/**
 * Set a value in cache (Redis or memory)
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300 // Default 5 minutes
): Promise<void> {
  const useRedis = isRedisConfigured()

  if (useRedis) {
    await redisSet(key, value, ttlSeconds)
    return
  }

  // In-memory fallback
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  }

  memoryCache.set(key, entry)
}

/**
 * Delete a specific key from cache
 */
export async function cacheDelete(key: string): Promise<void> {
  const useRedis = isRedisConfigured()

  if (useRedis) {
    await redisDel(key)
    return
  }

  // In-memory fallback
  memoryCache.delete(key)
}

/**
 * Delete all keys matching a pattern (prefix-based)
 */
export async function cacheDeletePattern(pattern: string): Promise<void> {
  const useRedis = isRedisConfigured()

  if (useRedis) {
    // Redis uses glob-style patterns
    await redisDeletePattern(`${pattern}*`)
    return
  }

  // In-memory fallback
  for (const key of memoryCache.keys()) {
    if (key.startsWith(pattern)) {
      memoryCache.delete(key)
    }
  }
}

/**
 * Clear all cache entries
 */
export async function cacheClear(): Promise<void> {
  const useRedis = isRedisConfigured()

  if (useRedis) {
    await redisFlush()
    return
  }

  // In-memory fallback
  memoryCache.clear()
}

// ============================================================================
// CACHE KEY BUILDERS
// ============================================================================

export const CacheKeys = {
  /** Partner data by hostname */
  partner: (hostname: string) => `partner:${hostname}`,

  /** Partner branding by partner ID */
  partnerBranding: (partnerId: string) => `partner:branding:${partnerId}`,

  /** User's workspace list */
  userWorkspaces: (userId: string, partnerId: string) => `user:workspaces:${userId}:${partnerId}`,

  /** Workspace details */
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,

  /** Workspace agents list */
  workspaceAgents: (workspaceId: string) => `workspace:agents:${workspaceId}`,

  /** Auth context for user+partner combination */
  authContext: (userId: string, partnerId: string) => `auth:context:${userId}:${partnerId}`,

  /** Voice list by provider */
  voices: (provider: string) => `voices:${provider}`,

  /** Subscription plans */
  subscriptionPlans: () => `subscription:plans`,
} as const

// ============================================================================
// CACHE TTL CONSTANTS (in seconds)
// ============================================================================

export const CacheTTL = {
  /** Partner data - 10 minutes (semi-static) */
  PARTNER: 10 * 60,

  /** Partner branding - 1 hour (rarely changes) */
  PARTNER_BRANDING: 60 * 60,

  /** User workspaces - 5 minutes */
  USER_WORKSPACES: 5 * 60,

  /** Auth context - 2 minutes (security sensitive) */
  AUTH_CONTEXT: 2 * 60,

  /** Workspace details - 5 minutes */
  WORKSPACE: 5 * 60,

  /** Static content - 1 hour */
  STATIC: 60 * 60,

  /** Short-lived data - 1 minute */
  SHORT: 60,

  /** Voice list - 30 minutes (rarely changes) */
  VOICES: 30 * 60,

  /** Subscription plans - 1 hour (rarely changes) */
  PLANS: 60 * 60,
} as const

// ============================================================================
// CACHE-ASIDE PATTERN HELPER
// ============================================================================

/**
 * Get from cache or fetch and cache the result
 * Implements the cache-aside pattern
 */
export async function cacheGetOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheGet<T>(key)
  if (cached !== null) {
    return cached
  }

  // Fetch fresh data
  const data = await fetchFn()

  // Cache the result (don't await, fire and forget)
  cacheSet(key, data, ttlSeconds).catch((error) => {
    logger.warn("Failed to cache data", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  })

  return data
}

// ============================================================================
// CACHE INVALIDATION PATTERNS (Phase 6.1.4)
// ============================================================================

/**
 * Invalidation strategies for different resources
 */
export const CacheInvalidation = {
  /**
   * Invalidate all partner-related caches
   */
  async invalidatePartner(partnerId: string): Promise<void> {
    await Promise.all([
      cacheDeletePattern(`partner:`),
      cacheDelete(CacheKeys.partnerBranding(partnerId)),
    ])
  },

  /**
   * Invalidate all workspace-related caches
   */
  async invalidateWorkspace(workspaceId: string): Promise<void> {
    await Promise.all([
      cacheDelete(CacheKeys.workspace(workspaceId)),
      cacheDelete(CacheKeys.workspaceAgents(workspaceId)),
    ])
  },

  /**
   * Invalidate user's auth context and workspaces
   */
  async invalidateUserAuth(userId: string, partnerId: string): Promise<void> {
    await Promise.all([
      cacheDelete(CacheKeys.authContext(userId, partnerId)),
      cacheDelete(CacheKeys.userWorkspaces(userId, partnerId)),
    ])
  },

  /**
   * Invalidate workspace membership caches for a user
   */
  async invalidateUserWorkspaces(userId: string): Promise<void> {
    await cacheDeletePattern(`user:workspaces:${userId}:`)
  },

  /**
   * Invalidate all agent caches for a workspace
   */
  async invalidateWorkspaceAgents(workspaceId: string): Promise<void> {
    await cacheDelete(CacheKeys.workspaceAgents(workspaceId))
  },
}

// ============================================================================
// CACHE WARMING
// ============================================================================

/**
 * Cache warming utility - pre-populate cache for common data
 */
export async function warmCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number
): Promise<void> {
  try {
    const data = await fetchFn()
    await cacheSet(key, data, ttlSeconds)
    logger.debug("Cache warmed", { key })
  } catch (error) {
    logger.error("Failed to warm cache", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

// ============================================================================
// CACHE STATS
// ============================================================================

interface CacheStats {
  backend: "redis" | "memory"
  memorySize: number
  hitRate?: number
  hits: number
  misses: number
}

let cacheHits = 0
let cacheMisses = 0

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  const totalRequests = cacheHits + cacheMisses
  return {
    backend: getCacheBackend(),
    memorySize: memoryCache.size,
    hitRate: totalRequests > 0 ? cacheHits / totalRequests : undefined,
    hits: cacheHits,
    misses: cacheMisses,
  }
}

/**
 * Track cache hits for stats
 */
export function trackCacheHit(): void {
  cacheHits++
}

/**
 * Track cache misses for stats
 */
export function trackCacheMiss(): void {
  cacheMisses++
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheHits = 0
  cacheMisses = 0
}

// ============================================================================
// CACHE OBJECT WRAPPER
// ============================================================================

/**
 * Cache object wrapper for convenient usage with object-style API
 * This provides a simpler interface: cache.get(), cache.set(), cache.delete()
 *
 * Note: TTL can be provided in milliseconds or seconds.
 * Values >= 1000 are treated as milliseconds and auto-converted.
 */
export const cache = {
  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    return cacheGet<T>(key)
  },

  /**
   * Set a value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live (auto-detects ms vs seconds: >= 1000 treated as ms)
   */
  async set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    // Auto-detect milliseconds vs seconds
    // If ttl >= 1000, assume milliseconds and convert to seconds
    const ttlSeconds = ttl >= 1000 ? Math.floor(ttl / 1000) : ttl
    return cacheSet(key, value, ttlSeconds)
  },

  /**
   * Delete a specific key from cache
   */
  async delete(key: string): Promise<void> {
    return cacheDelete(key)
  },

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    return cacheDeletePattern(pattern)
  },

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    return cacheClear()
  },

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return getCacheStats()
  },

  /**
   * Get current cache backend
   */
  getBackend(): "redis" | "memory" {
    return getCacheBackend()
  },
}

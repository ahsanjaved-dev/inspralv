/**
 * Redis Client Configuration
 * Implements distributed caching using Upstash Redis
 *
 * This module provides:
 * - Redis client for production (Upstash Redis)
 * - In-memory fallback for development when Redis is not configured
 * - Unified interface for cache operations
 */

import { Redis } from "@upstash/redis"
import { logger } from "@/lib/logger"

// ============================================================================
// TYPES
// ============================================================================

export interface RedisConfig {
  url: string
  token: string
}

// ============================================================================
// REDIS CLIENT
// ============================================================================

let redisClient: Redis | null = null
let isRedisAvailable = false

/**
 * Get or create the Redis client
 * Returns null if Redis is not configured
 */
export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient
  }

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    logger.debug("Redis not configured - using in-memory fallback", {
      hasUrl: !!url,
      hasToken: !!token,
    })
    return null
  }

  try {
    redisClient = new Redis({
      url,
      token,
    })
    isRedisAvailable = true
    logger.info("Redis client initialized successfully")
    return redisClient
  } catch (error) {
    logger.error("Failed to initialize Redis client", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return null
  }
}

/**
 * Check if Redis is available and configured
 */
export function isRedisConfigured(): boolean {
  if (isRedisAvailable) return true

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  return !!(url && token)
}

// ============================================================================
// REDIS OPERATIONS WITH ERROR HANDLING
// ============================================================================

/**
 * Safe Redis GET operation
 * Returns null on error instead of throwing
 */
export async function redisGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient()
  if (!client) return null

  try {
    const value = await client.get<T>(key)
    return value
  } catch (error) {
    logger.warn("Redis GET failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return null
  }
}

/**
 * Safe Redis SET operation with TTL
 */
export async function redisSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> {
  const client = getRedisClient()
  if (!client) return false

  try {
    if (ttlSeconds) {
      await client.set(key, value, { ex: ttlSeconds })
    } else {
      await client.set(key, value)
    }
    return true
  } catch (error) {
    logger.warn("Redis SET failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return false
  }
}

/**
 * Safe Redis DEL operation
 */
export async function redisDel(key: string): Promise<boolean> {
  const client = getRedisClient()
  if (!client) return false

  try {
    await client.del(key)
    return true
  } catch (error) {
    logger.warn("Redis DEL failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return false
  }
}

/**
 * Safe Redis KEYS operation (pattern matching)
 * Note: Use sparingly in production as KEYS can be slow on large datasets
 */
export async function redisKeys(pattern: string): Promise<string[]> {
  const client = getRedisClient()
  if (!client) return []

  try {
    const keys = await client.keys(pattern)
    return keys
  } catch (error) {
    logger.warn("Redis KEYS failed", {
      pattern,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return []
  }
}

/**
 * Safe Redis SCAN operation for pattern-based deletion
 * More efficient than KEYS for large datasets
 */
export async function redisDeletePattern(pattern: string): Promise<number> {
  const client = getRedisClient()
  if (!client) return 0

  try {
    let cursor = "0"
    let deletedCount = 0
    let iterations = 0
    const maxIterations = 1000 // Safety limit

    do {
      const result = await client.scan(cursor, { match: pattern, count: 100 }) as [string, string[]]
      cursor = result[0]
      const keys = result[1]

      if (keys.length > 0) {
        await client.del(...keys)
        deletedCount += keys.length
      }
      
      iterations++
    } while (cursor !== "0" && iterations < maxIterations)

    return deletedCount
  } catch (error) {
    logger.warn("Redis pattern delete failed", {
      pattern,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return 0
  }
}

/**
 * Safe Redis INCR operation (atomic increment)
 */
export async function redisIncr(key: string): Promise<number | null> {
  const client = getRedisClient()
  if (!client) return null

  try {
    return await client.incr(key)
  } catch (error) {
    logger.warn("Redis INCR failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return null
  }
}

/**
 * Safe Redis EXPIRE operation
 */
export async function redisExpire(key: string, seconds: number): Promise<boolean> {
  const client = getRedisClient()
  if (!client) return false

  try {
    await client.expire(key, seconds)
    return true
  } catch (error) {
    logger.warn("Redis EXPIRE failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return false
  }
}

/**
 * Safe Redis TTL operation
 */
export async function redisTtl(key: string): Promise<number | null> {
  const client = getRedisClient()
  if (!client) return null

  try {
    return await client.ttl(key)
  } catch (error) {
    logger.warn("Redis TTL failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return null
  }
}

/**
 * Safe Redis FLUSHALL operation (use with caution!)
 */
export async function redisFlush(): Promise<boolean> {
  const client = getRedisClient()
  if (!client) return false

  try {
    await client.flushall()
    logger.warn("Redis FLUSHALL executed - all cache cleared")
    return true
  } catch (error) {
    logger.warn("Redis FLUSHALL failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return false
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<{
  available: boolean
  latencyMs?: number
  error?: string
}> {
  const client = getRedisClient()
  if (!client) {
    return { available: false, error: "Redis not configured" }
  }

  try {
    const start = Date.now()
    await client.ping()
    const latencyMs = Date.now() - start

    return { available: true, latencyMs }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}


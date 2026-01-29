import { NextResponse } from "next/server"
import { checkDatabaseHealth, isPrismaConfigured } from "@/lib/prisma"
import { checkRedisHealth, isRedisConfigured } from "@/lib/redis"
import { getCacheStats } from "@/lib/cache"
import { getRateLimitBackend } from "@/lib/rate-limit"

/**
 * Health check endpoint
 * GET /api/health
 * 
 * Checks:
 * - API is running
 * - Database connection (via Prisma, if configured)
 * - Redis connection (via Upstash, if configured)
 */
export async function GET() {
  const startTime = Date.now()
  
  // Check if Prisma is configured
  const prismaEnabled = isPrismaConfigured()
  
  // Check if Redis is configured
  const redisEnabled = isRedisConfigured()
  
  // Check database connection (only if Prisma is configured)
  let dbHealthy: boolean | null = null
  let dbError: string | null = null
  
  if (prismaEnabled) {
    try {
      dbHealthy = await checkDatabaseHealth()
    } catch (error) {
      dbHealthy = false
      dbError = error instanceof Error ? error.message : "Unknown database error"
    }
  }
  
  // Check Redis connection (only if configured)
  let redisHealthy: boolean | null = null
  let redisLatency: number | null = null
  let redisError: string | null = null
  
  if (redisEnabled) {
    try {
      const redisHealth = await checkRedisHealth()
      redisHealthy = redisHealth.available
      redisLatency = redisHealth.latencyMs ?? null
      redisError = redisHealth.error ?? null
    } catch (error) {
      redisHealthy = false
      redisError = error instanceof Error ? error.message : "Unknown Redis error"
    }
  }
  
  const responseTime = Date.now() - startTime
  
  // Get cache and rate limit info
  const cacheStats = getCacheStats()
  const rateLimitInfo = getRateLimitBackend()
  
  // Determine overall status
  // Only consider database health as critical if Prisma is configured
  // Redis is optional - app works with memory fallback
  const isHealthy = prismaEnabled ? dbHealthy === true : true
  
  const health = {
    status: isHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    responseTime: `${responseTime}ms`,
    checks: {
      api: {
        status: "ok",
      },
      database: prismaEnabled
        ? {
            status: dbHealthy ? "ok" : "error",
            type: "postgresql",
            orm: "prisma",
            ...(dbError && { error: dbError }),
          }
        : {
            status: "skipped",
            message: "Prisma not configured (DATABASE_URL not set). Using Supabase client.",
          },
      redis: redisEnabled
        ? {
            status: redisHealthy ? "ok" : "error",
            type: "upstash",
            ...(redisLatency && { latencyMs: redisLatency }),
            ...(redisError && { error: redisError }),
          }
        : {
            status: "skipped",
            message: "Redis not configured. Using in-memory cache/rate-limiting.",
          },
      cache: {
        backend: cacheStats.backend,
        memorySize: cacheStats.memorySize,
        ...(cacheStats.hitRate !== undefined && { hitRate: `${(cacheStats.hitRate * 100).toFixed(1)}%` }),
      },
      rateLimit: {
        backend: rateLimitInfo.backend,
        distributed: rateLimitInfo.configured,
      },
    },
  }
  
  return NextResponse.json(health, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

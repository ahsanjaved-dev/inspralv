// =============================================================================
// PRISMA CLIENT SINGLETON (Prisma 6)
// =============================================================================
// This module provides a singleton Prisma client instance optimized for
// Next.js serverless environment with connection pooling.
//
// Usage:
//   import { prisma } from "@/lib/prisma/client"
//   const users = await prisma.user.findMany()
//
// The client is automatically reused in development (hot reload) and
// production to prevent connection exhaustion.
//
// DATABASE_URL and DIRECT_URL are OPTIONAL:
// - If not set, prisma will be null and you should use Supabase client
// - If set, Prisma queries will work for type-safe database access
// =============================================================================

import { PrismaClient, Prisma } from "@/lib/generated/prisma"

// Export Prisma namespace for types
export { Prisma, PrismaClient }

// Re-export model types from generated Prisma
export type {
  Partner,
  PartnerDomain,
  PartnerMember,
  PartnerInvitation,
  PartnerRequest,
  Workspace,
  WorkspaceMember,
  WorkspaceInvitation,
  WorkspaceIntegration,
  AiAgent,
  Conversation,
  UsageTracking,
  User,
  SuperAdmin,
  AuditLog,
  BillingCredits,
  CreditTransaction,
  WorkspaceCredits,
  WorkspaceCreditTransaction,
} from "@/lib/generated/prisma"

// Re-export enums from generated Prisma
export {
  AgentProvider,
  VoiceProvider,
  ModelProvider,
  TranscriberProvider,
  CallDirection,
  CallStatus,
  UserRole,
  UserStatus,
  PartnerRequestStatus,
  ResourceType,
  SyncStatus,
  CreditTransactionType,
} from "@/lib/generated/prisma"

// Extend the global type to include prisma
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | null | undefined
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Check if DATABASE_URL is configured
 */
export const isPrismaConfigured = (): boolean => {
  return !!process.env.DATABASE_URL
}

/**
 * Create Prisma client with optimized settings for serverless environments.
 * Returns null if DATABASE_URL is not configured.
 */
function createPrismaClient(): PrismaClient | null {
  // If DATABASE_URL is not set, return null
  // This allows the app to run without Prisma (using Supabase client only)
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[Prisma] DATABASE_URL not configured. Prisma queries will not work. " +
        "Using Supabase client for database operations."
    )
    return null
  }

  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })
}

// =============================================================================
// SINGLETON PATTERN
// =============================================================================

/**
 * Prisma client singleton.
 * - Returns null if DATABASE_URL is not configured
 * - In development: Uses global variable to preserve client across hot reloads
 * - In production: Creates a single instance per serverless function
 */
export const prisma: PrismaClient | null =
  globalThis.prisma !== undefined ? globalThis.prisma : createPrismaClient()

// Preserve client across hot reloads in development
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Transaction client type - a subset of PrismaClient for use in transactions
 */
export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

/**
 * Gracefully disconnect the Prisma client.
 * Call this during application shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
  }
}

/**
 * Check if the database connection is healthy.
 * Useful for health check endpoints.
 * Returns null if Prisma is not configured.
 */
export async function checkDatabaseHealth(): Promise<boolean | null> {
  if (!prisma) {
    return null // Prisma not configured
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error("Database health check failed:", error)
    return false
  }
}

/**
 * Execute a raw SQL query with Prisma.
 * Use sparingly - prefer Prisma's type-safe query API.
 * Throws error if Prisma is not configured.
 */
export async function executeRawQuery<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T> {
  if (!prisma) {
    throw new Error(
      "Prisma is not configured. Set DATABASE_URL environment variable."
    )
  }
  // Use $queryRawUnsafe for dynamic queries
  return prisma.$queryRawUnsafe<T>(query, ...params)
}

/**
 * Execute multiple operations in a transaction.
 * If any operation fails, all changes are rolled back.
 * Throws error if Prisma is not configured.
 *
 * @example
 * const [user, workspace] = await withTransaction(async (tx) => {
 *   const user = await tx.user.create({ data: { ... } })
 *   const workspace = await tx.workspace.create({ data: { ... } })
 *   return [user, workspace]
 * })
 */
export async function withTransaction<T>(
  callback: (tx: TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number
    timeout?: number
    isolationLevel?:
      | "ReadUncommitted"
      | "ReadCommitted"
      | "RepeatableRead"
      | "Serializable"
  }
): Promise<T> {
  if (!prisma) {
    throw new Error(
      "Prisma is not configured. Set DATABASE_URL environment variable."
    )
  }
  return prisma.$transaction(callback, {
    maxWait: options?.maxWait ?? 5000,
    timeout: options?.timeout ?? 10000,
    isolationLevel: options?.isolationLevel,
  })
}

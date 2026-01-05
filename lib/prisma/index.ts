// =============================================================================
// PRISMA MODULE EXPORTS
// =============================================================================
// Central export point for all Prisma-related utilities.
//
// Usage:
//   import { prisma, withTransaction } from "@/lib/prisma"
//   import type { AiAgent, Workspace } from "@/lib/prisma"
// =============================================================================

// Client and utilities
export {
  prisma,
  isPrismaConfigured,
  disconnectPrisma,
  checkDatabaseHealth,
  executeRawQuery,
  withTransaction,
  PrismaClient,
  Prisma,
} from "./client"

// Model types
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
} from "./client"

// Enums (both value and type exports - TypeScript handles this correctly)
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
} from "./client"
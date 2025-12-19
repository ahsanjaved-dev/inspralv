import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest } from "next/server"

// ============================================================================
// AUDIT ACTION TYPES
// ============================================================================

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.invited"
  | "user.joined"
  | "user.updated"
  | "user.deleted"
  | "agent.created"
  | "agent.updated"
  | "agent.deleted"
  | "department.created"
  | "department.updated"
  | "department.deleted"
  | "organization.updated"
  | "workspace.created"
  | "workspace.updated"
  | "workspace.deleted"
  | "member.invited"
  | "member.joined"
  | "member.removed"
  | "settings.updated"
  | "invitation.created"
  | "invitation.accepted"
  | "invitation.revoked"

// ============================================================================
// AUDIT LOG INTERFACE
// ============================================================================

export interface AuditLogEntry {
  userId: string
  organizationId?: string
  workspaceId?: string
  action: AuditAction | string
  entityType: string
  entityId?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

// ============================================================================
// CREATE AUDIT LOG
// ============================================================================

export async function createAuditLog(entry: AuditLogEntry) {
  try {
    const adminClient = createAdminClient()

    const { error } = await adminClient.from("audit_log").insert({
      user_id: entry.userId,
      organization_id: entry.organizationId || null,
      workspace_id: entry.workspaceId || null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      old_values: entry.oldValues || null,
      new_values: entry.newValues || null,
      metadata: entry.metadata || null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
    })

    if (error) {
      console.error("[Audit] Failed to create log:", error)
    }
  } catch (error) {
    // Don't throw - audit logging should not break main functionality
    console.error("[Audit] Error:", error)
  }
}

// ============================================================================
// REQUEST METADATA HELPER
// ============================================================================

export function getRequestMetadata(request: Request | NextRequest) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
  }
}

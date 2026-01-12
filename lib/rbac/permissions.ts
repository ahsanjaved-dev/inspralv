/**
 * Role-Based Access Control (RBAC) System
 * Phase 2.2.1: Implement RBAC permission matrix
 *
 * Provides a comprehensive permission system for workspaces and partners.
 */

// ============================================================================
// ROLE TYPES
// ============================================================================

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer"
export type PartnerRole = "owner" | "admin" | "member"

// ============================================================================
// PERMISSION DEFINITIONS
// ============================================================================

/**
 * All available permissions in the system.
 * Organized by resource and action.
 */
export const PERMISSIONS = {
  // Workspace permissions
  "workspace.read": true,
  "workspace.update": true,
  "workspace.delete": true,
  "workspace.settings.read": true,
  "workspace.settings.update": true,

  // Dashboard permissions
  "workspace.dashboard.read": true,
  "workspace.dashboard.stats": true,

  // Agent permissions
  "workspace.agents.read": true,
  "workspace.agents.create": true,
  "workspace.agents.update": true,
  "workspace.agents.delete": true,
  "workspace.agents.sync": true,

  // Member permissions
  "workspace.members.read": true,
  "workspace.members.invite": true,
  "workspace.members.update": true,
  "workspace.members.remove": true,

  // Conversation/Call permissions
  "workspace.conversations.read": true,
  "workspace.conversations.create": true,
  "workspace.conversations.delete": true,

  // Lead permissions
  "workspace.leads.read": true,
  "workspace.leads.create": true,
  "workspace.leads.update": true,
  "workspace.leads.delete": true,
  "workspace.leads.export": true,

  // Integration permissions
  "workspace.integrations.read": true,
  "workspace.integrations.create": true,
  "workspace.integrations.update": true,
  "workspace.integrations.delete": true,

  // Analytics permissions
  "workspace.analytics.read": true,
  "workspace.analytics.export": true,

  // Billing permissions
  "workspace.billing.read": true,
  "workspace.billing.update": true,

  // Knowledge base permissions
  "workspace.knowledge.read": true,
  "workspace.knowledge.create": true,
  "workspace.knowledge.update": true,
  "workspace.knowledge.delete": true,

  // Partner permissions
  "partner.read": true,
  "partner.update": true,
  "partner.delete": true,
  "partner.settings.read": true,
  "partner.settings.update": true,

  // Partner dashboard & stats permissions
  "partner.dashboard.read": true,
  "partner.stats.read": true, // Organization-wide statistics

  // Partner workspace management
  "partner.workspaces.read": true,
  "partner.workspaces.create": true,
  "partner.workspaces.delete": true,

  // Partner member management
  "partner.members.read": true,
  "partner.members.invite": true,
  "partner.members.update": true,
  "partner.members.remove": true,

  // Partner branding
  "partner.branding.read": true,
  "partner.branding.update": true,

  // Partner billing
  "partner.billing.read": true,
  "partner.billing.update": true,
} as const

export type Permission = keyof typeof PERMISSIONS

// ============================================================================
// WORKSPACE ROLE PERMISSIONS
// ============================================================================

/**
 * Maps workspace roles to their allowed permissions.
 * Roles inherit from less privileged roles (viewer < member < admin < owner).
 */
export const WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  viewer: [
    "workspace.read",
    "workspace.dashboard.read",
    "workspace.dashboard.stats",
    "workspace.agents.read",
    "workspace.conversations.read",
    "workspace.leads.read",
    "workspace.analytics.read",
    "workspace.members.read",
    "workspace.integrations.read",
    "workspace.knowledge.read",
    "workspace.billing.read",
    "workspace.settings.read",
  ],
  member: [
    // Inherits viewer permissions
    "workspace.read",
    "workspace.dashboard.read",
    "workspace.dashboard.stats",
    "workspace.settings.read",
    "workspace.agents.read",
    "workspace.conversations.read",
    "workspace.leads.read",
    "workspace.analytics.read",
    "workspace.members.read",
    "workspace.integrations.read",
    "workspace.knowledge.read",
    "workspace.billing.read",
    // Additional member permissions
    "workspace.agents.create",
    "workspace.agents.update",
    "workspace.agents.sync",
    "workspace.conversations.create",
    "workspace.leads.create",
    "workspace.leads.update",
    "workspace.knowledge.create",
    "workspace.knowledge.update",
  ],
  admin: [
    // Inherits member permissions
    "workspace.read",
    "workspace.dashboard.read",
    "workspace.dashboard.stats",
    "workspace.settings.read",
    "workspace.settings.update",
    "workspace.agents.read",
    "workspace.agents.create",
    "workspace.agents.update",
    "workspace.agents.delete",
    "workspace.agents.sync",
    "workspace.conversations.read",
    "workspace.conversations.create",
    "workspace.conversations.delete",
    "workspace.leads.read",
    "workspace.leads.create",
    "workspace.leads.update",
    "workspace.leads.delete",
    "workspace.leads.export",
    "workspace.analytics.read",
    "workspace.analytics.export",
    "workspace.members.read",
    "workspace.members.invite",
    "workspace.members.update",
    "workspace.integrations.read",
    "workspace.integrations.create",
    "workspace.integrations.update",
    "workspace.knowledge.read",
    "workspace.knowledge.create",
    "workspace.knowledge.update",
    "workspace.knowledge.delete",
    "workspace.billing.read",
    // Additional admin permissions
    "workspace.update",
    "workspace.members.remove",
    "workspace.integrations.delete",
    "workspace.billing.update",
  ],
  owner: [
    // Has ALL workspace permissions
    "workspace.read",
    "workspace.dashboard.read",
    "workspace.dashboard.stats",
    "workspace.update",
    "workspace.delete",
    "workspace.settings.read",
    "workspace.settings.update",
    "workspace.agents.read",
    "workspace.agents.create",
    "workspace.agents.update",
    "workspace.agents.delete",
    "workspace.agents.sync",
    "workspace.members.read",
    "workspace.members.invite",
    "workspace.members.update",
    "workspace.members.remove",
    "workspace.conversations.read",
    "workspace.conversations.create",
    "workspace.conversations.delete",
    "workspace.leads.read",
    "workspace.leads.create",
    "workspace.leads.update",
    "workspace.leads.delete",
    "workspace.leads.export",
    "workspace.integrations.read",
    "workspace.integrations.create",
    "workspace.integrations.update",
    "workspace.integrations.delete",
    "workspace.analytics.read",
    "workspace.analytics.export",
    "workspace.billing.read",
    "workspace.billing.update",
    "workspace.knowledge.read",
    "workspace.knowledge.create",
    "workspace.knowledge.update",
    "workspace.knowledge.delete",
  ],
}

// ============================================================================
// PARTNER ROLE PERMISSIONS
// ============================================================================

/**
 * Maps partner roles to their allowed permissions.
 */
export const PARTNER_ROLE_PERMISSIONS: Record<PartnerRole, Permission[]> = {
  member: [
    "partner.read",
    "partner.dashboard.read",
    // NOTE: partner.stats.read is NOT included - members can't see org-wide stats
    "partner.settings.read",
    "partner.workspaces.read",
    "partner.members.read",
    "partner.branding.read",
    "partner.billing.read",
  ],
  admin: [
    // Inherits member permissions
    "partner.read",
    "partner.dashboard.read",
    "partner.stats.read", // Can see organization-wide statistics
    "partner.settings.read",
    "partner.settings.update",
    "partner.workspaces.read",
    "partner.workspaces.create",
    "partner.members.read",
    "partner.members.invite",
    "partner.members.update",
    "partner.branding.read",
    "partner.branding.update",
    "partner.billing.read",
    // Additional admin permissions
    "partner.update",
    "partner.members.remove",
    "partner.billing.update",
  ],
  owner: [
    // Has ALL partner permissions
    "partner.read",
    "partner.dashboard.read",
    "partner.stats.read", // Can see organization-wide statistics
    "partner.update",
    "partner.delete",
    "partner.settings.read",
    "partner.settings.update",
    "partner.workspaces.read",
    "partner.workspaces.create",
    "partner.workspaces.delete",
    "partner.members.read",
    "partner.members.invite",
    "partner.members.update",
    "partner.members.remove",
    "partner.branding.read",
    "partner.branding.update",
    "partner.billing.read",
    "partner.billing.update",
  ],
}

// ============================================================================
// PERMISSION CHECKING UTILITIES
// ============================================================================

/**
 * Check if a workspace role has a specific permission.
 */
export function hasWorkspacePermission(
  role: WorkspaceRole,
  permission: Permission
): boolean {
  const rolePermissions = WORKSPACE_ROLE_PERMISSIONS[role]
  return rolePermissions?.includes(permission) ?? false
}

/**
 * Check if a partner role has a specific permission.
 */
export function hasPartnerPermission(
  role: PartnerRole,
  permission: Permission
): boolean {
  const rolePermissions = PARTNER_ROLE_PERMISSIONS[role]
  return rolePermissions?.includes(permission) ?? false
}

/**
 * Check if a role has ANY of the specified permissions.
 */
export function hasAnyWorkspacePermission(
  role: WorkspaceRole,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasWorkspacePermission(role, p))
}

/**
 * Check if a role has ALL of the specified permissions.
 */
export function hasAllWorkspacePermissions(
  role: WorkspaceRole,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasWorkspacePermission(role, p))
}

/**
 * Get all permissions for a workspace role.
 */
export function getWorkspacePermissions(role: WorkspaceRole): Permission[] {
  return [...WORKSPACE_ROLE_PERMISSIONS[role]]
}

/**
 * Get all permissions for a partner role.
 */
export function getPartnerPermissions(role: PartnerRole): Permission[] {
  return [...PARTNER_ROLE_PERMISSIONS[role]]
}

// ============================================================================
// ROLE HIERARCHY UTILITIES
// ============================================================================

const WORKSPACE_ROLE_HIERARCHY: WorkspaceRole[] = ["viewer", "member", "admin", "owner"]
const PARTNER_ROLE_HIERARCHY: PartnerRole[] = ["member", "admin", "owner"]

/**
 * Check if a role is at least as privileged as another role.
 */
export function isAtLeastWorkspaceRole(
  role: WorkspaceRole,
  minRole: WorkspaceRole
): boolean {
  const roleIndex = WORKSPACE_ROLE_HIERARCHY.indexOf(role)
  const minRoleIndex = WORKSPACE_ROLE_HIERARCHY.indexOf(minRole)
  return roleIndex >= minRoleIndex
}

/**
 * Check if a role is at least as privileged as another partner role.
 */
export function isAtLeastPartnerRole(
  role: PartnerRole,
  minRole: PartnerRole
): boolean {
  const roleIndex = PARTNER_ROLE_HIERARCHY.indexOf(role)
  const minRoleIndex = PARTNER_ROLE_HIERARCHY.indexOf(minRole)
  return roleIndex >= minRoleIndex
}

/**
 * Get roles that a given role can manage (roles below it in hierarchy).
 */
export function getManageableWorkspaceRoles(role: WorkspaceRole): WorkspaceRole[] {
  const roleIndex = WORKSPACE_ROLE_HIERARCHY.indexOf(role)
  return WORKSPACE_ROLE_HIERARCHY.slice(0, roleIndex)
}

/**
 * Check if a user can change another user's role.
 */
export function canChangeWorkspaceRole(
  actorRole: WorkspaceRole,
  targetCurrentRole: WorkspaceRole,
  targetNewRole: WorkspaceRole
): boolean {
  // Must be at least admin to change roles
  if (!isAtLeastWorkspaceRole(actorRole, "admin")) {
    return false
  }

  // Cannot promote to or demote from a role equal to or higher than your own
  const actorIndex = WORKSPACE_ROLE_HIERARCHY.indexOf(actorRole)
  const currentIndex = WORKSPACE_ROLE_HIERARCHY.indexOf(targetCurrentRole)
  const newIndex = WORKSPACE_ROLE_HIERARCHY.indexOf(targetNewRole)

  return currentIndex < actorIndex && newIndex < actorIndex
}

// ============================================================================
// PERMISSION DESCRIPTIONS
// ============================================================================

/**
 * Human-readable descriptions of permissions for UI display.
 */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  "workspace.read": "View workspace details",
  "workspace.update": "Update workspace settings",
  "workspace.delete": "Delete workspace",
  "workspace.settings.read": "View workspace settings",
  "workspace.settings.update": "Update workspace settings",
  "workspace.dashboard.read": "View workspace dashboard",
  "workspace.dashboard.stats": "View workspace statistics",
  "workspace.agents.read": "View AI agents",
  "workspace.agents.create": "Create AI agents",
  "workspace.agents.update": "Update AI agents",
  "workspace.agents.delete": "Delete AI agents",
  "workspace.agents.sync": "Sync agents with providers",
  "workspace.members.read": "View team members",
  "workspace.members.invite": "Invite team members",
  "workspace.members.update": "Update team member roles",
  "workspace.members.remove": "Remove team members",
  "workspace.conversations.read": "View conversations",
  "workspace.conversations.create": "Create conversations",
  "workspace.conversations.delete": "Delete conversations",
  "workspace.leads.read": "View leads",
  "workspace.leads.create": "Create leads",
  "workspace.leads.update": "Update leads",
  "workspace.leads.delete": "Delete leads",
  "workspace.leads.export": "Export leads",
  "workspace.integrations.read": "View integrations",
  "workspace.integrations.create": "Create integrations",
  "workspace.integrations.update": "Update integrations",
  "workspace.integrations.delete": "Delete integrations",
  "workspace.analytics.read": "View analytics",
  "workspace.analytics.export": "Export analytics",
  "workspace.billing.read": "View billing",
  "workspace.billing.update": "Manage billing",
  "workspace.knowledge.read": "View knowledge base",
  "workspace.knowledge.create": "Add to knowledge base",
  "workspace.knowledge.update": "Update knowledge base",
  "workspace.knowledge.delete": "Delete from knowledge base",
  "partner.read": "View partner details",
  "partner.update": "Update partner settings",
  "partner.delete": "Delete partner",
  "partner.settings.read": "View partner settings",
  "partner.settings.update": "Update partner settings",
  "partner.dashboard.read": "View organization dashboard",
  "partner.stats.read": "View organization-wide statistics",
  "partner.workspaces.read": "View workspaces",
  "partner.workspaces.create": "Create workspaces",
  "partner.workspaces.delete": "Delete workspaces",
  "partner.members.read": "View partner members",
  "partner.members.invite": "Invite partner members",
  "partner.members.update": "Update member roles",
  "partner.members.remove": "Remove partner members",
  "partner.branding.read": "View branding settings",
  "partner.branding.update": "Update branding",
  "partner.billing.read": "View partner billing",
  "partner.billing.update": "Manage partner billing",
}


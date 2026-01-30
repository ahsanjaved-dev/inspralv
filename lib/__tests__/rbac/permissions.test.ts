/**
 * Tests for RBAC (Role-Based Access Control) permissions
 * Tests permission checking utilities and role hierarchy
 */

import { describe, it, expect } from "vitest"
import {
  hasWorkspacePermission,
  hasPartnerPermission,
  hasAnyWorkspacePermission,
  hasAllWorkspacePermissions,
  getWorkspacePermissions,
  getPartnerPermissions,
  isAtLeastWorkspaceRole,
  isAtLeastPartnerRole,
  getManageableWorkspaceRoles,
  canChangeWorkspaceRole,
  WORKSPACE_ROLE_PERMISSIONS,
  PARTNER_ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  type WorkspaceRole,
  type PartnerRole,
  type Permission,
} from "@/lib/rbac/permissions"

// =============================================================================
// WORKSPACE PERMISSION TESTS
// =============================================================================

describe("Workspace Permission Checks", () => {
  describe("hasWorkspacePermission", () => {
    it("should return true for viewer with read permissions", () => {
      expect(hasWorkspacePermission("viewer", "workspace.read")).toBe(true)
      expect(hasWorkspacePermission("viewer", "workspace.agents.read")).toBe(true)
      expect(hasWorkspacePermission("viewer", "workspace.conversations.read")).toBe(true)
      expect(hasWorkspacePermission("viewer", "workspace.dashboard.read")).toBe(true)
    })

    it("should return false for viewer with write permissions", () => {
      expect(hasWorkspacePermission("viewer", "workspace.agents.create")).toBe(false)
      expect(hasWorkspacePermission("viewer", "workspace.agents.update")).toBe(false)
      expect(hasWorkspacePermission("viewer", "workspace.agents.delete")).toBe(false)
      expect(hasWorkspacePermission("viewer", "workspace.update")).toBe(false)
    })

    it("should return true for member with create/update permissions", () => {
      expect(hasWorkspacePermission("member", "workspace.agents.create")).toBe(true)
      expect(hasWorkspacePermission("member", "workspace.agents.update")).toBe(true)
      expect(hasWorkspacePermission("member", "workspace.leads.create")).toBe(true)
      expect(hasWorkspacePermission("member", "workspace.knowledge.create")).toBe(true)
    })

    it("should return false for member with delete permissions", () => {
      expect(hasWorkspacePermission("member", "workspace.agents.delete")).toBe(false)
      expect(hasWorkspacePermission("member", "workspace.leads.delete")).toBe(false)
      expect(hasWorkspacePermission("member", "workspace.delete")).toBe(false)
    })

    it("should return true for admin with most permissions", () => {
      expect(hasWorkspacePermission("admin", "workspace.agents.delete")).toBe(true)
      expect(hasWorkspacePermission("admin", "workspace.leads.delete")).toBe(true)
      expect(hasWorkspacePermission("admin", "workspace.members.invite")).toBe(true)
      expect(hasWorkspacePermission("admin", "workspace.billing.update")).toBe(true)
    })

    it("should return false for admin with workspace.delete permission", () => {
      expect(hasWorkspacePermission("admin", "workspace.delete")).toBe(false)
    })

    it("should return true for owner with all workspace permissions", () => {
      expect(hasWorkspacePermission("owner", "workspace.delete")).toBe(true)
      expect(hasWorkspacePermission("owner", "workspace.update")).toBe(true)
      expect(hasWorkspacePermission("owner", "workspace.agents.delete")).toBe(true)
      expect(hasWorkspacePermission("owner", "workspace.billing.update")).toBe(true)
    })

    it("should return false for invalid permission", () => {
      expect(hasWorkspacePermission("viewer", "invalid.permission" as Permission)).toBe(false)
      expect(hasWorkspacePermission("owner", "invalid.permission" as Permission)).toBe(false)
    })

    it("should return false for invalid role", () => {
      expect(hasWorkspacePermission("invalid" as WorkspaceRole, "workspace.read")).toBe(false)
    })
  })

  describe("hasAnyWorkspacePermission", () => {
    it("should return true if role has any of the permissions", () => {
      expect(
        hasAnyWorkspacePermission("viewer", [
          "workspace.agents.create",
          "workspace.read",
        ])
      ).toBe(true)
    })

    it("should return false if role has none of the permissions", () => {
      expect(
        hasAnyWorkspacePermission("viewer", [
          "workspace.agents.create",
          "workspace.agents.delete",
        ])
      ).toBe(false)
    })

    it("should return true for member with at least one matching permission", () => {
      expect(
        hasAnyWorkspacePermission("member", [
          "workspace.agents.delete", // doesn't have
          "workspace.agents.create", // has
        ])
      ).toBe(true)
    })
  })

  describe("hasAllWorkspacePermissions", () => {
    it("should return true if role has all permissions", () => {
      expect(
        hasAllWorkspacePermissions("viewer", [
          "workspace.read",
          "workspace.agents.read",
        ])
      ).toBe(true)
    })

    it("should return false if role is missing any permission", () => {
      expect(
        hasAllWorkspacePermissions("viewer", [
          "workspace.read",
          "workspace.agents.create",
        ])
      ).toBe(false)
    })

    it("should return true for admin with multiple admin permissions", () => {
      expect(
        hasAllWorkspacePermissions("admin", [
          "workspace.agents.delete",
          "workspace.leads.delete",
          "workspace.members.invite",
        ])
      ).toBe(true)
    })
  })

  describe("getWorkspacePermissions", () => {
    it("should return all permissions for viewer role", () => {
      const permissions = getWorkspacePermissions("viewer")
      expect(permissions).toContain("workspace.read")
      expect(permissions).toContain("workspace.agents.read")
      expect(permissions).not.toContain("workspace.agents.create")
    })

    it("should return more permissions for higher roles", () => {
      const viewerPerms = getWorkspacePermissions("viewer")
      const memberPerms = getWorkspacePermissions("member")
      const adminPerms = getWorkspacePermissions("admin")
      const ownerPerms = getWorkspacePermissions("owner")

      expect(memberPerms.length).toBeGreaterThan(viewerPerms.length)
      expect(adminPerms.length).toBeGreaterThan(memberPerms.length)
      expect(ownerPerms.length).toBeGreaterThanOrEqual(adminPerms.length)
    })

    it("should return a copy, not the original array", () => {
      const permissions = getWorkspacePermissions("viewer")
      permissions.push("fake.permission" as Permission)
      expect(WORKSPACE_ROLE_PERMISSIONS.viewer).not.toContain("fake.permission")
    })
  })
})

// =============================================================================
// PARTNER PERMISSION TESTS
// =============================================================================

describe("Partner Permission Checks", () => {
  describe("hasPartnerPermission", () => {
    it("should return true for member with basic read permissions", () => {
      expect(hasPartnerPermission("member", "partner.read")).toBe(true)
      expect(hasPartnerPermission("member", "partner.dashboard.read")).toBe(true)
      expect(hasPartnerPermission("member", "partner.workspaces.read")).toBe(true)
    })

    it("should return false for member with stats.read permission", () => {
      // Members should NOT see org-wide stats
      expect(hasPartnerPermission("member", "partner.stats.read")).toBe(false)
    })

    it("should return true for admin with stats.read permission", () => {
      expect(hasPartnerPermission("admin", "partner.stats.read")).toBe(true)
    })

    it("should return false for member with update permissions", () => {
      expect(hasPartnerPermission("member", "partner.update")).toBe(false)
      expect(hasPartnerPermission("member", "partner.settings.update")).toBe(false)
    })

    it("should return true for admin with update permissions", () => {
      expect(hasPartnerPermission("admin", "partner.update")).toBe(true)
      expect(hasPartnerPermission("admin", "partner.settings.update")).toBe(true)
      expect(hasPartnerPermission("admin", "partner.billing.update")).toBe(true)
    })

    it("should return false for admin with delete permission", () => {
      expect(hasPartnerPermission("admin", "partner.delete")).toBe(false)
    })

    it("should return true for owner with all partner permissions", () => {
      expect(hasPartnerPermission("owner", "partner.delete")).toBe(true)
      expect(hasPartnerPermission("owner", "partner.workspaces.delete")).toBe(true)
      expect(hasPartnerPermission("owner", "partner.stats.read")).toBe(true)
    })
  })

  describe("getPartnerPermissions", () => {
    it("should return all permissions for a partner role", () => {
      const memberPerms = getPartnerPermissions("member")
      expect(memberPerms).toContain("partner.read")
      expect(memberPerms).not.toContain("partner.stats.read")

      const adminPerms = getPartnerPermissions("admin")
      expect(adminPerms).toContain("partner.stats.read")
      expect(adminPerms).not.toContain("partner.delete")

      const ownerPerms = getPartnerPermissions("owner")
      expect(ownerPerms).toContain("partner.delete")
    })
  })
})

// =============================================================================
// ROLE HIERARCHY TESTS
// =============================================================================

describe("Role Hierarchy", () => {
  describe("isAtLeastWorkspaceRole", () => {
    it("should validate viewer role hierarchy", () => {
      expect(isAtLeastWorkspaceRole("viewer", "viewer")).toBe(true)
      expect(isAtLeastWorkspaceRole("viewer", "member")).toBe(false)
      expect(isAtLeastWorkspaceRole("viewer", "admin")).toBe(false)
      expect(isAtLeastWorkspaceRole("viewer", "owner")).toBe(false)
    })

    it("should validate member role hierarchy", () => {
      expect(isAtLeastWorkspaceRole("member", "viewer")).toBe(true)
      expect(isAtLeastWorkspaceRole("member", "member")).toBe(true)
      expect(isAtLeastWorkspaceRole("member", "admin")).toBe(false)
      expect(isAtLeastWorkspaceRole("member", "owner")).toBe(false)
    })

    it("should validate admin role hierarchy", () => {
      expect(isAtLeastWorkspaceRole("admin", "viewer")).toBe(true)
      expect(isAtLeastWorkspaceRole("admin", "member")).toBe(true)
      expect(isAtLeastWorkspaceRole("admin", "admin")).toBe(true)
      expect(isAtLeastWorkspaceRole("admin", "owner")).toBe(false)
    })

    it("should validate owner role hierarchy", () => {
      expect(isAtLeastWorkspaceRole("owner", "viewer")).toBe(true)
      expect(isAtLeastWorkspaceRole("owner", "member")).toBe(true)
      expect(isAtLeastWorkspaceRole("owner", "admin")).toBe(true)
      expect(isAtLeastWorkspaceRole("owner", "owner")).toBe(true)
    })
  })

  describe("isAtLeastPartnerRole", () => {
    it("should validate member role hierarchy", () => {
      expect(isAtLeastPartnerRole("member", "member")).toBe(true)
      expect(isAtLeastPartnerRole("member", "admin")).toBe(false)
      expect(isAtLeastPartnerRole("member", "owner")).toBe(false)
    })

    it("should validate admin role hierarchy", () => {
      expect(isAtLeastPartnerRole("admin", "member")).toBe(true)
      expect(isAtLeastPartnerRole("admin", "admin")).toBe(true)
      expect(isAtLeastPartnerRole("admin", "owner")).toBe(false)
    })

    it("should validate owner role hierarchy", () => {
      expect(isAtLeastPartnerRole("owner", "member")).toBe(true)
      expect(isAtLeastPartnerRole("owner", "admin")).toBe(true)
      expect(isAtLeastPartnerRole("owner", "owner")).toBe(true)
    })
  })

  describe("getManageableWorkspaceRoles", () => {
    it("should return empty array for viewer", () => {
      const roles = getManageableWorkspaceRoles("viewer")
      expect(roles).toEqual([])
    })

    it("should return only viewer for member", () => {
      const roles = getManageableWorkspaceRoles("member")
      expect(roles).toEqual(["viewer"])
    })

    it("should return viewer and member for admin", () => {
      const roles = getManageableWorkspaceRoles("admin")
      expect(roles).toEqual(["viewer", "member"])
    })

    it("should return all roles except owner for owner", () => {
      const roles = getManageableWorkspaceRoles("owner")
      expect(roles).toEqual(["viewer", "member", "admin"])
    })
  })
})

// =============================================================================
// ROLE CHANGE PERMISSION TESTS
// =============================================================================

describe("Role Change Permissions", () => {
  describe("canChangeWorkspaceRole", () => {
    it("should not allow viewer to change roles", () => {
      expect(canChangeWorkspaceRole("viewer", "viewer", "member")).toBe(false)
      expect(canChangeWorkspaceRole("viewer", "member", "admin")).toBe(false)
    })

    it("should not allow member to change roles", () => {
      expect(canChangeWorkspaceRole("member", "viewer", "member")).toBe(false)
      expect(canChangeWorkspaceRole("member", "viewer", "admin")).toBe(false)
    })

    it("should allow admin to change roles below them", () => {
      // Admin can promote viewer to member
      expect(canChangeWorkspaceRole("admin", "viewer", "member")).toBe(true)
      // Admin can demote member to viewer
      expect(canChangeWorkspaceRole("admin", "member", "viewer")).toBe(true)
    })

    it("should not allow admin to promote to their level or higher", () => {
      // Admin cannot promote to admin
      expect(canChangeWorkspaceRole("admin", "viewer", "admin")).toBe(false)
      expect(canChangeWorkspaceRole("admin", "member", "admin")).toBe(false)
      // Admin cannot promote to owner
      expect(canChangeWorkspaceRole("admin", "viewer", "owner")).toBe(false)
    })

    it("should not allow admin to change admin or owner roles", () => {
      expect(canChangeWorkspaceRole("admin", "admin", "member")).toBe(false)
      expect(canChangeWorkspaceRole("admin", "owner", "admin")).toBe(false)
    })

    it("should allow owner to change any role below them", () => {
      expect(canChangeWorkspaceRole("owner", "viewer", "member")).toBe(true)
      expect(canChangeWorkspaceRole("owner", "viewer", "admin")).toBe(true)
      expect(canChangeWorkspaceRole("owner", "member", "admin")).toBe(true)
      expect(canChangeWorkspaceRole("owner", "admin", "member")).toBe(true)
      expect(canChangeWorkspaceRole("owner", "admin", "viewer")).toBe(true)
    })

    it("should not allow owner to change or demote owners", () => {
      expect(canChangeWorkspaceRole("owner", "owner", "admin")).toBe(false)
      expect(canChangeWorkspaceRole("owner", "viewer", "owner")).toBe(false)
    })
  })
})

// =============================================================================
// PERMISSION DESCRIPTIONS TESTS
// =============================================================================

describe("Permission Descriptions", () => {
  it("should have descriptions for all permissions", () => {
    const allWorkspacePermissions = [
      ...new Set([
        ...WORKSPACE_ROLE_PERMISSIONS.viewer,
        ...WORKSPACE_ROLE_PERMISSIONS.member,
        ...WORKSPACE_ROLE_PERMISSIONS.admin,
        ...WORKSPACE_ROLE_PERMISSIONS.owner,
      ]),
    ]

    const allPartnerPermissions = [
      ...new Set([
        ...PARTNER_ROLE_PERMISSIONS.member,
        ...PARTNER_ROLE_PERMISSIONS.admin,
        ...PARTNER_ROLE_PERMISSIONS.owner,
      ]),
    ]

    const allPermissions = [...allWorkspacePermissions, ...allPartnerPermissions]

    for (const permission of allPermissions) {
      expect(PERMISSION_DESCRIPTIONS[permission]).toBeDefined()
      expect(typeof PERMISSION_DESCRIPTIONS[permission]).toBe("string")
      expect(PERMISSION_DESCRIPTIONS[permission].length).toBeGreaterThan(0)
    }
  })

  it("should have human-readable descriptions", () => {
    expect(PERMISSION_DESCRIPTIONS["workspace.read"]).toBe("View workspace details")
    expect(PERMISSION_DESCRIPTIONS["workspace.agents.create"]).toBe("Create AI agents")
    expect(PERMISSION_DESCRIPTIONS["partner.delete"]).toBe("Delete partner")
  })
})


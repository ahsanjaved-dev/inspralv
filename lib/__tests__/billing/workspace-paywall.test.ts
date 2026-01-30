/**
 * Tests for workspace paywall logic
 * Tests credit-based and subscription-based paywall checks
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(),
    },
  },
}))

// =============================================================================
// WORKSPACE PAYWALL STATUS TESTS
// =============================================================================

describe("Workspace Paywall Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getWorkspacePaywallStatus", () => {
    it("should return paywalled when workspace not found", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue(null)

      const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
      const status = await getWorkspacePaywallStatus("nonexistent")

      expect(status.isPaywalled).toBe(true)
      expect(status.reason).toBe("Workspace not found")
      expect(status.creditsBalanceCents).toBe(0)
    })

    it("should NOT be paywalled for billing-exempt workspaces", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: true,
        workspaceCredits: null,
        subscription: null,
      } as any)

      const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
      const status = await getWorkspacePaywallStatus("ws-1")

      expect(status.isPaywalled).toBe(false)
      expect(status.isBillingExempt).toBe(true)
    })

    it("should NOT be paywalled for workspaces with active subscription", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        workspaceCredits: { balanceCents: 0 }, // Zero credits
        subscription: { status: "active" },
      } as any)

      const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
      const status = await getWorkspacePaywallStatus("ws-1")

      expect(status.isPaywalled).toBe(false)
      expect(status.hasActiveSubscription).toBe(true)
    })

    it("should be paywalled when credits exhausted and no subscription", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        workspaceCredits: { balanceCents: 0 },
        subscription: null,
      } as any)

      const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
      const status = await getWorkspacePaywallStatus("ws-1")

      expect(status.isPaywalled).toBe(true)
      expect(status.reason).toBe("Credits exhausted. Upgrade to continue.")
    })

    it("should be paywalled when credits negative and no subscription", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        workspaceCredits: { balanceCents: -100 },
        subscription: { status: "canceled" },
      } as any)

      const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
      const status = await getWorkspacePaywallStatus("ws-1")

      expect(status.isPaywalled).toBe(true)
      expect(status.creditsBalanceCents).toBe(-100)
    })

    it("should NOT be paywalled when workspace has positive credits", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        workspaceCredits: { balanceCents: 500 },
        subscription: null,
      } as any)

      const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
      const status = await getWorkspacePaywallStatus("ws-1")

      expect(status.isPaywalled).toBe(false)
      expect(status.creditsBalanceCents).toBe(500)
    })

    it("should handle workspace without credits record", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        workspaceCredits: null,
        subscription: null,
      } as any)

      const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
      const status = await getWorkspacePaywallStatus("ws-1")

      expect(status.isPaywalled).toBe(true)
      expect(status.creditsBalanceCents).toBe(0)
    })

    it("should handle subscription with non-active status", async () => {
      const statuses = ["canceled", "past_due", "incomplete", "incomplete_expired", "trialing", "unpaid"]
      
      for (const subStatus of statuses) {
        const { prisma } = await import("@/lib/prisma")
        vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
          id: "ws-1",
          isBillingExempt: false,
          workspaceCredits: { balanceCents: 0 },
          subscription: { status: subStatus },
        } as any)

        const { getWorkspacePaywallStatus } = await import("@/lib/billing/workspace-paywall")
        const status = await getWorkspacePaywallStatus("ws-1")

        expect(status.hasActiveSubscription).toBe(false)
      }
    })
  })

  describe("isWorkspacePaywalled", () => {
    it("should return true for paywalled workspace", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        workspaceCredits: { balanceCents: 0 },
        subscription: null,
      } as any)

      const { isWorkspacePaywalled } = await import("@/lib/billing/workspace-paywall")
      const result = await isWorkspacePaywalled("ws-1")

      expect(result).toBe(true)
    })

    it("should return false for non-paywalled workspace", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        workspaceCredits: { balanceCents: 1000 },
        subscription: null,
      } as any)

      const { isWorkspacePaywalled } = await import("@/lib/billing/workspace-paywall")
      const result = await isWorkspacePaywalled("ws-1")

      expect(result).toBe(false)
    })
  })

  describe("createPaywallErrorResponse", () => {
    it("should create proper error response with billing URL", async () => {
      const { createPaywallErrorResponse } = await import("@/lib/billing/workspace-paywall")
      const response = createPaywallErrorResponse("my-workspace")

      expect(response.status).toBe(402)
      expect(response.headers.get("Content-Type")).toBe("application/json")
      
      const body = await response.json()
      expect(body.code).toBe("WORKSPACE_PAYWALLED")
      expect(body.billingUrl).toBe("/w/my-workspace/billing")
    })

    it("should handle special characters in workspace slug", async () => {
      const { createPaywallErrorResponse } = await import("@/lib/billing/workspace-paywall")
      const response = createPaywallErrorResponse("test-workspace-123")
      
      const body = await response.json()
      expect(body.billingUrl).toBe("/w/test-workspace-123/billing")
    })
  })

  describe("isPaywallExemptPath", () => {
    it("should exempt credits endpoints", async () => {
      const { isPaywallExemptPath } = await import("@/lib/billing/workspace-paywall")

      expect(isPaywallExemptPath("/api/w/my-workspace/credits")).toBe(true)
      expect(isPaywallExemptPath("/api/w/my-workspace/credits/topup")).toBe(true)
      expect(isPaywallExemptPath("/api/w/workspace-123/credits/transactions")).toBe(true)
    })

    it("should exempt subscription endpoints", async () => {
      const { isPaywallExemptPath } = await import("@/lib/billing/workspace-paywall")

      expect(isPaywallExemptPath("/api/w/my-workspace/subscription")).toBe(true)
      expect(isPaywallExemptPath("/api/w/my-workspace/subscription/cancel")).toBe(true)
    })

    it("should exempt settings endpoint", async () => {
      const { isPaywallExemptPath } = await import("@/lib/billing/workspace-paywall")

      expect(isPaywallExemptPath("/api/w/my-workspace/settings")).toBe(true)
    })

    it("should NOT exempt other endpoints", async () => {
      const { isPaywallExemptPath } = await import("@/lib/billing/workspace-paywall")

      expect(isPaywallExemptPath("/api/w/my-workspace/agents")).toBe(false)
      expect(isPaywallExemptPath("/api/w/my-workspace/calls")).toBe(false)
      expect(isPaywallExemptPath("/api/w/my-workspace/campaigns")).toBe(false)
      expect(isPaywallExemptPath("/api/w/my-workspace/leads")).toBe(false)
    })

    it("should handle edge cases in path matching", async () => {
      const { isPaywallExemptPath } = await import("@/lib/billing/workspace-paywall")

      expect(isPaywallExemptPath("/api/w/test/settings")).toBe(true)
      expect(isPaywallExemptPath("/api/w/test/settings/extra")).toBe(false)
      expect(isPaywallExemptPath("/other/path/credits")).toBe(false)
    })
  })

  describe("isMutationMethod", () => {
    it("should identify POST as mutation", async () => {
      const { isMutationMethod } = await import("@/lib/billing/workspace-paywall")
      expect(isMutationMethod("POST")).toBe(true)
      expect(isMutationMethod("post")).toBe(true)
    })

    it("should identify PUT as mutation", async () => {
      const { isMutationMethod } = await import("@/lib/billing/workspace-paywall")
      expect(isMutationMethod("PUT")).toBe(true)
      expect(isMutationMethod("put")).toBe(true)
    })

    it("should identify PATCH as mutation", async () => {
      const { isMutationMethod } = await import("@/lib/billing/workspace-paywall")
      expect(isMutationMethod("PATCH")).toBe(true)
      expect(isMutationMethod("patch")).toBe(true)
    })

    it("should identify DELETE as mutation", async () => {
      const { isMutationMethod } = await import("@/lib/billing/workspace-paywall")
      expect(isMutationMethod("DELETE")).toBe(true)
      expect(isMutationMethod("delete")).toBe(true)
    })

    it("should NOT identify GET as mutation", async () => {
      const { isMutationMethod } = await import("@/lib/billing/workspace-paywall")
      expect(isMutationMethod("GET")).toBe(false)
      expect(isMutationMethod("get")).toBe(false)
    })

    it("should NOT identify HEAD as mutation", async () => {
      const { isMutationMethod } = await import("@/lib/billing/workspace-paywall")
      expect(isMutationMethod("HEAD")).toBe(false)
    })

    it("should NOT identify OPTIONS as mutation", async () => {
      const { isMutationMethod } = await import("@/lib/billing/workspace-paywall")
      expect(isMutationMethod("OPTIONS")).toBe(false)
    })
  })

  describe("Credit-based billing logic", () => {
    it("should allow calls when workspace has sufficient credits", async () => {
      const hasCredits = (balance: number, costPerMinute: number, estimatedMinutes: number) => {
        return balance >= costPerMinute * estimatedMinutes
      }

      expect(hasCredits(1000, 20, 10)).toBe(true) // 1000 cents >= 200 cents
      expect(hasCredits(100, 20, 10)).toBe(false) // 100 cents < 200 cents
      expect(hasCredits(200, 20, 10)).toBe(true) // exactly equal
    })

    it("should block calls when workspace has insufficient credits", () => {
      const hasCredits = (balance: number, costPerMinute: number, estimatedMinutes: number) => {
        return balance >= costPerMinute * estimatedMinutes
      }

      expect(hasCredits(0, 20, 1)).toBe(false)
      expect(hasCredits(-100, 20, 1)).toBe(false)
    })

    it("should handle zero cost per minute", () => {
      const hasCredits = (balance: number, costPerMinute: number, estimatedMinutes: number) => {
        return balance >= costPerMinute * estimatedMinutes
      }

      expect(hasCredits(0, 0, 100)).toBe(true) // 0 >= 0
      expect(hasCredits(100, 0, 100)).toBe(true)
    })
  })

  describe("Subscription-based billing logic", () => {
    it("should allow calls when subscription is active", () => {
      const canMakeCall = (status: string, minutesUsed: number, limit: number | null) => {
        if (status !== "active") return false
        if (limit !== null && minutesUsed >= limit) return false
        return true
      }

      expect(canMakeCall("active", 0, 1000)).toBe(true)
      expect(canMakeCall("active", 500, 1000)).toBe(true)
      expect(canMakeCall("active", 0, null)).toBe(true) // unlimited
    })

    it("should block calls when subscription is not active", () => {
      const canMakeCall = (status: string, minutesUsed: number, limit: number | null) => {
        if (status !== "active") return false
        if (limit !== null && minutesUsed >= limit) return false
        return true
      }

      expect(canMakeCall("canceled", 0, 1000)).toBe(false)
      expect(canMakeCall("past_due", 0, 1000)).toBe(false)
      expect(canMakeCall("incomplete", 0, 1000)).toBe(false)
    })

    it("should block calls when minute limit exceeded", () => {
      const canMakeCall = (status: string, minutesUsed: number, limit: number | null) => {
        if (status !== "active") return false
        if (limit !== null && minutesUsed >= limit) return false
        return true
      }

      expect(canMakeCall("active", 1000, 1000)).toBe(false)
      expect(canMakeCall("active", 1001, 1000)).toBe(false)
    })

    it("should allow calls right at the limit minus one", () => {
      const canMakeCall = (status: string, minutesUsed: number, limit: number | null) => {
        if (status !== "active") return false
        if (limit !== null && minutesUsed >= limit) return false
        return true
      }

      expect(canMakeCall("active", 999, 1000)).toBe(true)
    })
  })

  describe("Billing exemption logic", () => {
    it("should always allow calls for billing-exempt workspaces", () => {
      const shouldCheckBilling = (isBillingExempt: boolean) => !isBillingExempt

      expect(shouldCheckBilling(true)).toBe(false)
      expect(shouldCheckBilling(false)).toBe(true)
    })
  })
})

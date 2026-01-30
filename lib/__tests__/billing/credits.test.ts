/**
 * Tests for partner and workspace credits logic
 * Tests credit calculations, deductions, and low balance alerts
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// =============================================================================
// MOCK SETUP
// =============================================================================

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billingCredits: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    creditTransaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    workspaceCredits: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workspaceCreditTransaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
    },
    workspaceSubscription: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    partner: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/stripe/index", () => ({
  getStripe: vi.fn(() => ({
    paymentIntents: {
      create: vi.fn(),
    },
  })),
  getConnectAccountId: vi.fn(),
}))

vi.mock("@/lib/email/send", () => ({
  sendLowBalanceAlertEmail: vi.fn(),
}))

vi.mock("@/lib/env", () => ({
  env: {
    appUrl: "https://test.app",
    stripeConnectPlatformFeePercent: 10,
  },
}))

// =============================================================================
// PARTNER CREDITS TESTS
// =============================================================================

describe("Partner Credits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getOrCreatePartnerCredits", () => {
    it("should return existing credits if found", async () => {
      const { prisma } = await import("@/lib/prisma")
      const mockCredits = {
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 5000,
        lowBalanceThresholdCents: 1000,
        perMinuteRateCents: 15,
      }

      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue(mockCredits as any)

      const { getOrCreatePartnerCredits } = await import("@/lib/stripe/credits")
      const result = await getOrCreatePartnerCredits("partner-1")

      expect(result).toEqual(mockCredits)
      expect(prisma!.billingCredits.create).not.toHaveBeenCalled()
    })

    it("should create new credits record if not found", async () => {
      const { prisma } = await import("@/lib/prisma")
      const newCredits = {
        id: "new-credits-1",
        partnerId: "partner-1",
        balanceCents: 0,
        lowBalanceThresholdCents: 1000,
        perMinuteRateCents: 15,
      }

      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue(null)
      vi.mocked(prisma!.billingCredits.create).mockResolvedValue(newCredits as any)

      const { getOrCreatePartnerCredits } = await import("@/lib/stripe/credits")
      const result = await getOrCreatePartnerCredits("partner-1")

      expect(result).toEqual(newCredits)
      expect(prisma!.billingCredits.create).toHaveBeenCalledWith({
        data: {
          partnerId: "partner-1",
          balanceCents: 0,
          lowBalanceThresholdCents: 1000,
          perMinuteRateCents: 15,
        },
      })
    })
  })

  describe("getPartnerCreditsInfo", () => {
    it("should compute info correctly", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 3000, // $30
        lowBalanceThresholdCents: 1000, // $10
        perMinuteRateCents: 15, // $0.15
      } as any)

      const { getPartnerCreditsInfo } = await import("@/lib/stripe/credits")
      const info = await getPartnerCreditsInfo("partner-1")

      expect(info.balanceCents).toBe(3000)
      expect(info.balanceDollars).toBe(30)
      expect(info.lowBalanceThresholdCents).toBe(1000)
      expect(info.perMinuteRateCents).toBe(15)
      expect(info.isLowBalance).toBe(false) // 3000 > 1000
      expect(info.estimatedMinutesRemaining).toBe(200) // 3000 / 15
    })

    it("should mark as low balance when below threshold", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 500, // $5
        lowBalanceThresholdCents: 1000, // $10
        perMinuteRateCents: 15,
      } as any)

      const { getPartnerCreditsInfo } = await import("@/lib/stripe/credits")
      const info = await getPartnerCreditsInfo("partner-1")

      expect(info.isLowBalance).toBe(true)
      expect(info.estimatedMinutesRemaining).toBe(33) // 500 / 15 = 33.33 -> 33
    })
  })

  describe("hasSufficientCredits", () => {
    it("should return true when balance covers estimated usage", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 1500, // $15
        lowBalanceThresholdCents: 500,
        perMinuteRateCents: 15,
      } as any)

      const { hasSufficientCredits } = await import("@/lib/stripe/credits")
      
      // 10 minutes * 15 cents = 150 cents, balance is 1500
      const result = await hasSufficientCredits("partner-1", 10)
      expect(result).toBe(true)
    })

    it("should return false when balance is insufficient", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 100, // $1
        lowBalanceThresholdCents: 500,
        perMinuteRateCents: 15,
      } as any)

      const { hasSufficientCredits } = await import("@/lib/stripe/credits")
      
      // 10 minutes * 15 cents = 150 cents, but only have 100
      const result = await hasSufficientCredits("partner-1", 10)
      expect(result).toBe(false)
    })
  })

  describe("applyTopup", () => {
    it("should apply topup when not already applied", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.creditTransaction.findFirst).mockResolvedValue(null)
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 1000,
      } as any)
      vi.mocked(prisma!.$transaction).mockResolvedValue([{}, {}])

      const { applyTopup } = await import("@/lib/stripe/credits")
      const result = await applyTopup("partner-1", 2500, "pi_test123")

      expect(result.success).toBe(true)
      expect(result.alreadyApplied).toBe(false)
    })

    it("should return alreadyApplied true for duplicate payment intent", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.creditTransaction.findFirst).mockResolvedValue({
        id: "tx-1",
        stripePaymentIntentId: "pi_test123",
      } as any)

      const { applyTopup } = await import("@/lib/stripe/credits")
      const result = await applyTopup("partner-1", 2500, "pi_test123")

      expect(result.success).toBe(true)
      expect(result.alreadyApplied).toBe(true)
      expect(prisma!.$transaction).not.toHaveBeenCalled()
    })
  })
})

// =============================================================================
// WORKSPACE CREDITS TESTS
// =============================================================================

describe("Workspace Credits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getWorkspaceCreditsInfo", () => {
    it("should return billing exempt info for exempt workspaces", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: true,
        perMinuteRateCents: 15,
        workspaceCredits: null,
      } as any)

      const { getWorkspaceCreditsInfo } = await import("@/lib/stripe/workspace-credits")
      const info = await getWorkspaceCreditsInfo("ws-1")

      expect(info.isBillingExempt).toBe(true)
      expect(info.balanceCents).toBe(0)
      expect(info.isLowBalance).toBe(false)
    })

    it("should return credits info for non-exempt workspaces", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        perMinuteRateCents: 20,
        workspaceCredits: {
          id: "wc-1",
          balanceCents: 2000,
          lowBalanceThresholdCents: 500,
        },
      } as any)

      const { getWorkspaceCreditsInfo } = await import("@/lib/stripe/workspace-credits")
      const info = await getWorkspaceCreditsInfo("ws-1")

      expect(info.isBillingExempt).toBe(false)
      expect(info.balanceCents).toBe(2000)
      expect(info.balanceDollars).toBe(20)
      expect(info.estimatedMinutesRemaining).toBe(100) // 2000 / 20
      expect(info.isLowBalance).toBe(false)
    })
  })

  describe("canMakePostpaidCall", () => {
    it("should return allowed for active postpaid subscription with remaining minutes", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspaceSubscription.findUnique).mockResolvedValue({
        status: "active",
        postpaidMinutesUsed: 500,
        minutesUsedThisPeriod: 500,
        plan: {
          billingType: "postpaid",
          postpaidMinutesLimit: 1000,
          includedMinutes: 0,
        },
      } as any)

      const { canMakePostpaidCall } = await import("@/lib/stripe/workspace-credits")
      const result = await canMakePostpaidCall("ws-1")

      expect(result.allowed).toBe(true)
      expect(result.billingType).toBe("postpaid")
      expect(result.remainingMinutes).toBe(500)
      expect(result.currentUsage).toBe(500)
      expect(result.limitMinutes).toBe(1000)
    })

    it("should return not allowed when postpaid limit exceeded", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspaceSubscription.findUnique).mockResolvedValue({
        status: "active",
        postpaidMinutesUsed: 1000,
        minutesUsedThisPeriod: 1000,
        plan: {
          billingType: "postpaid",
          postpaidMinutesLimit: 1000,
          includedMinutes: 0,
        },
      } as any)

      const { canMakePostpaidCall } = await import("@/lib/stripe/workspace-credits")
      const result = await canMakePostpaidCall("ws-1")

      expect(result.allowed).toBe(false)
      expect(result.billingType).toBe("postpaid")
      expect(result.remainingMinutes).toBe(0)
      expect(result.message).toContain("limit exceeded")
    })

    it("should return allowed for prepaid subscription", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspaceSubscription.findUnique).mockResolvedValue({
        status: "active",
        postpaidMinutesUsed: 0,
        minutesUsedThisPeriod: 200,
        plan: {
          billingType: "prepaid",
          postpaidMinutesLimit: 0,
          includedMinutes: 500,
        },
      } as any)

      const { canMakePostpaidCall } = await import("@/lib/stripe/workspace-credits")
      const result = await canMakePostpaidCall("ws-1")

      expect(result.allowed).toBe(true)
      expect(result.billingType).toBe("prepaid")
      expect(result.remainingMinutes).toBe(300) // 500 - 200
    })

    it("should return no subscription status when subscription is inactive", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspaceSubscription.findUnique).mockResolvedValue({
        status: "canceled",
        postpaidMinutesUsed: 0,
        minutesUsedThisPeriod: 0,
        plan: {
          billingType: "postpaid",
          postpaidMinutesLimit: 1000,
          includedMinutes: 0,
        },
      } as any)

      const { canMakePostpaidCall } = await import("@/lib/stripe/workspace-credits")
      const result = await canMakePostpaidCall("ws-1")

      expect(result.allowed).toBe(true) // Will be handled by credits check
      expect(result.billingType).toBe("none")
    })

    it("should handle no subscription case", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspaceSubscription.findUnique).mockResolvedValue(null)

      const { canMakePostpaidCall } = await import("@/lib/stripe/workspace-credits")
      const result = await canMakePostpaidCall("ws-1")

      expect(result.allowed).toBe(true)
      expect(result.billingType).toBe("none")
      expect(result.message).toContain("No active subscription")
    })
  })

  describe("hasSufficientWorkspaceCredits", () => {
    it("should return true for billing-exempt workspaces", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: true,
        perMinuteRateCents: 15,
        workspaceCredits: null,
      } as any)

      const { hasSufficientWorkspaceCredits } = await import("@/lib/stripe/workspace-credits")
      const result = await hasSufficientWorkspaceCredits("ws-1", 1000)

      expect(result).toBe(true)
    })

    it("should check balance for non-exempt workspaces", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        perMinuteRateCents: 15,
        workspaceCredits: {
          balanceCents: 150, // $1.50
          lowBalanceThresholdCents: 500,
        },
      } as any)

      const { hasSufficientWorkspaceCredits } = await import("@/lib/stripe/workspace-credits")
      
      // 10 minutes * 15 cents = 150 cents - exactly covers it
      expect(await hasSufficientWorkspaceCredits("ws-1", 10)).toBe(true)
      
      // Reset mock for next call
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        perMinuteRateCents: 15,
        workspaceCredits: {
          balanceCents: 150,
          lowBalanceThresholdCents: 500,
        },
      } as any)
      
      // 11 minutes * 15 cents = 165 cents - not enough
      expect(await hasSufficientWorkspaceCredits("ws-1", 11)).toBe(false)
    })
  })
})

// =============================================================================
// FREE TIER GRANTS TESTS
// =============================================================================

describe("Free Tier Credits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("grantInitialFreeTierCredits", () => {
    it("should grant credits for new workspace", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.workspaceCredits.findUnique).mockResolvedValue({
        id: "wc-1",
        workspaceId: "ws-1",
        balanceCents: 0,
        lowBalanceThresholdCents: 500,
      } as any)
      
      vi.mocked(prisma!.workspaceCreditTransaction.findFirst).mockResolvedValue(null)
      vi.mocked(prisma!.$transaction).mockResolvedValue([{}, {}])

      const { grantInitialFreeTierCredits } = await import("@/lib/stripe/workspace-credits")
      const result = await grantInitialFreeTierCredits("ws-1")

      expect(result.success).toBe(true)
      expect(result.alreadyGranted).toBe(false)
      expect(result.newBalanceCents).toBe(1000) // DEFAULT_FREE_TIER
    })

    it("should be idempotent - not re-grant if already granted", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.workspaceCredits.findUnique).mockResolvedValue({
        id: "wc-1",
        workspaceId: "ws-1",
        balanceCents: 1000,
        lowBalanceThresholdCents: 500,
      } as any)
      
      vi.mocked(prisma!.workspaceCreditTransaction.findFirst).mockResolvedValue({
        id: "tx-1",
        metadata: { reason: "free_tier_grant" },
      } as any)

      const { grantInitialFreeTierCredits } = await import("@/lib/stripe/workspace-credits")
      const result = await grantInitialFreeTierCredits("ws-1")

      expect(result.success).toBe(true)
      expect(result.alreadyGranted).toBe(true)
      expect(prisma!.$transaction).not.toHaveBeenCalled()
    })
  })
})


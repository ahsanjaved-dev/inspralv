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

const mockStripe = {
  paymentIntents: {
    create: vi.fn(),
  },
}

vi.mock("@/lib/stripe/index", () => ({
  getStripe: vi.fn(() => mockStripe),
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

    it("should handle zero per-minute rate", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 1000,
        lowBalanceThresholdCents: 500,
        perMinuteRateCents: 0, // Zero rate
      } as any)

      const { getPartnerCreditsInfo } = await import("@/lib/stripe/credits")
      const info = await getPartnerCreditsInfo("partner-1")

      expect(info.estimatedMinutesRemaining).toBe(0) // Protected against division by zero
    })
  })

  describe("getPartnerTransactions", () => {
    it("should return formatted transactions", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 1000,
      } as any)

      const mockTransactions = [
        {
          id: "tx-1",
          type: "topup",
          amountCents: 1000,
          balanceAfterCents: 2000,
          description: "Top-up",
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "tx-2",
          type: "usage",
          amountCents: -500,
          balanceAfterCents: 1500,
          description: "Usage",
          createdAt: new Date("2026-01-02"),
        },
      ]
      vi.mocked(prisma!.creditTransaction.findMany).mockResolvedValue(mockTransactions as any)

      const { getPartnerTransactions } = await import("@/lib/stripe/credits")
      const transactions = await getPartnerTransactions("partner-1", 10)

      expect(transactions).toHaveLength(2)
      expect(transactions[0].id).toBe("tx-1")
      expect(transactions[0].type).toBe("topup")
      expect(transactions[1].type).toBe("usage")
    })

    it("should use default limit when not specified", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 1000,
      } as any)
      vi.mocked(prisma!.creditTransaction.findMany).mockResolvedValue([])

      const { getPartnerTransactions } = await import("@/lib/stripe/credits")
      await getPartnerTransactions("partner-1")

      expect(prisma!.creditTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 })
      )
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

    it("should return true for zero estimated minutes", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 0,
        lowBalanceThresholdCents: 500,
        perMinuteRateCents: 15,
      } as any)

      const { hasSufficientCredits } = await import("@/lib/stripe/credits")
      const result = await hasSufficientCredits("partner-1", 0)
      expect(result).toBe(true)
    })
  })

  describe("createTopupPaymentIntent", () => {
    it("should create payment intent with correct parameters", async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        client_secret: "pi_secret_123",
        id: "pi_123",
      })

      const { createTopupPaymentIntent } = await import("@/lib/stripe/credits")
      const result = await createTopupPaymentIntent("partner-1", 2500, "cus_123")

      expect(result.clientSecret).toBe("pi_secret_123")
      expect(result.paymentIntentId).toBe("pi_123")
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 2500,
        currency: "usd",
        customer: "cus_123",
        metadata: {
          partner_id: "partner-1",
          type: "credits_topup",
          amount_cents: "2500",
        },
        automatic_payment_methods: { enabled: true },
      })
    })

    it("should throw error when client_secret is missing", async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: "pi_123",
        client_secret: null,
      })

      const { createTopupPaymentIntent } = await import("@/lib/stripe/credits")
      
      await expect(
        createTopupPaymentIntent("partner-1", 2500, "cus_123")
      ).rejects.toThrow("Failed to create payment intent")
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

  describe("deductUsage", () => {
    it("should deduct usage and create transaction", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 1000,
        perMinuteRateCents: 15,
        lowBalanceThresholdCents: 500,
      } as any)

      vi.mocked(prisma!.$transaction).mockImplementation(async (callback: any) => {
        // Simulate interactive transaction
        const mockTx = {
          billingCredits: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUnique: vi.fn().mockResolvedValue({
              balanceCents: 970, // 1000 - (2 * 15)
              lowBalanceThresholdCents: 500,
            }),
          },
          creditTransaction: {
            create: vi.fn().mockResolvedValue({}),
          },
        }
        return callback(mockTx)
      })

      const { deductUsage } = await import("@/lib/stripe/credits")
      const result = await deductUsage("partner-1", 90, "conv-1", "Test usage")

      expect(result.amountDeducted).toBe(30) // 2 minutes * 15 cents
      expect(result.newBalanceCents).toBe(970)
      expect(result.isLowBalance).toBe(false)
    })

    it("should throw error when insufficient credits", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 10, // Very low balance
        perMinuteRateCents: 15,
        lowBalanceThresholdCents: 500,
      } as any)

      vi.mocked(prisma!.$transaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          billingCredits: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }), // No rows updated
            findUnique: vi.fn().mockResolvedValue({ balanceCents: 10 }),
          },
        }
        return callback(mockTx)
      })

      const { deductUsage } = await import("@/lib/stripe/credits")
      
      await expect(
        deductUsage("partner-1", 120, "conv-1")
      ).rejects.toThrow("Insufficient credits")
    })

    it("should use default description when not provided", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.billingCredits.findUnique).mockResolvedValue({
        id: "credits-1",
        partnerId: "partner-1",
        balanceCents: 1000,
        perMinuteRateCents: 15,
        lowBalanceThresholdCents: 500,
      } as any)

      let capturedDescription = ""
      vi.mocked(prisma!.$transaction).mockImplementation(async (callback: any) => {
        const mockTx = {
          billingCredits: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUnique: vi.fn().mockResolvedValue({
              balanceCents: 985,
              lowBalanceThresholdCents: 500,
            }),
          },
          creditTransaction: {
            create: vi.fn().mockImplementation((data: any) => {
              capturedDescription = data.data.description
              return {}
            }),
          },
        }
        return callback(mockTx)
      })

      const { deductUsage } = await import("@/lib/stripe/credits")
      await deductUsage("partner-1", 60) // 1 minute, no description

      expect(capturedDescription).toContain("Usage: 1 minute")
    })
  })

  describe("checkAndSendLowBalanceAlert", () => {
    it("should send alert when balance is low", async () => {
      const { prisma } = await import("@/lib/prisma")
      const { sendLowBalanceAlertEmail } = await import("@/lib/email/send")
      
      vi.mocked(prisma!.partner.findUnique).mockResolvedValue({
        name: "Test Partner",
        billingCredits: { lowBalanceThresholdCents: 1000 },
        members: [
          { user: { email: "admin@test.com", firstName: "Admin" } },
        ],
      } as any)

      const { checkAndSendLowBalanceAlert } = await import("@/lib/stripe/credits")
      await checkAndSendLowBalanceAlert("partner-1", 500, true)

      expect(sendLowBalanceAlertEmail).toHaveBeenCalledWith(
        ["admin@test.com"],
        expect.objectContaining({
          recipient_name: "Admin",
          account_name: "Test Partner",
          account_type: "partner",
        })
      )
    })

    it("should not send alert when balance is not low", async () => {
      const { sendLowBalanceAlertEmail } = await import("@/lib/email/send")
      
      const { checkAndSendLowBalanceAlert } = await import("@/lib/stripe/credits")
      await checkAndSendLowBalanceAlert("partner-1", 5000, false)

      expect(sendLowBalanceAlertEmail).not.toHaveBeenCalled()
    })

    it("should handle missing partner gracefully", async () => {
      const { prisma } = await import("@/lib/prisma")
      const { sendLowBalanceAlertEmail } = await import("@/lib/email/send")
      
      vi.mocked(prisma!.partner.findUnique).mockResolvedValue(null)

      const { checkAndSendLowBalanceAlert } = await import("@/lib/stripe/credits")
      await checkAndSendLowBalanceAlert("partner-1", 500, true)

      expect(sendLowBalanceAlertEmail).not.toHaveBeenCalled()
    })

    it("should handle partner with no members gracefully", async () => {
      const { prisma } = await import("@/lib/prisma")
      const { sendLowBalanceAlertEmail } = await import("@/lib/email/send")
      
      vi.mocked(prisma!.partner.findUnique).mockResolvedValue({
        name: "Test Partner",
        billingCredits: { lowBalanceThresholdCents: 1000 },
        members: [],
      } as any)

      const { checkAndSendLowBalanceAlert } = await import("@/lib/stripe/credits")
      await checkAndSendLowBalanceAlert("partner-1", 500, true)

      expect(sendLowBalanceAlertEmail).not.toHaveBeenCalled()
    })

    it("should use default recipient name when firstName is missing", async () => {
      const { prisma } = await import("@/lib/prisma")
      const { sendLowBalanceAlertEmail } = await import("@/lib/email/send")
      
      vi.mocked(prisma!.partner.findUnique).mockResolvedValue({
        name: "Test Partner",
        billingCredits: { lowBalanceThresholdCents: 1000 },
        members: [
          { user: { email: "admin@test.com", firstName: null } },
        ],
      } as any)

      const { checkAndSendLowBalanceAlert } = await import("@/lib/stripe/credits")
      await checkAndSendLowBalanceAlert("partner-1", 500, true)

      expect(sendLowBalanceAlertEmail).toHaveBeenCalledWith(
        ["admin@test.com"],
        expect.objectContaining({
          recipient_name: "Admin", // Default fallback
        })
      )
    })

    it("should handle email send errors gracefully", async () => {
      const { prisma } = await import("@/lib/prisma")
      const { sendLowBalanceAlertEmail } = await import("@/lib/email/send")
      
      vi.mocked(prisma!.partner.findUnique).mockResolvedValue({
        name: "Test Partner",
        billingCredits: { lowBalanceThresholdCents: 1000 },
        members: [
          { user: { email: "admin@test.com", firstName: "Admin" } },
        ],
      } as any)

      vi.mocked(sendLowBalanceAlertEmail).mockRejectedValue(new Error("Email failed"))

      const { checkAndSendLowBalanceAlert } = await import("@/lib/stripe/credits")
      
      // Should not throw
      await expect(
        checkAndSendLowBalanceAlert("partner-1", 500, true)
      ).resolves.toBeUndefined()
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

    it("should create credits record if not exists for non-exempt workspace", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        perMinuteRateCents: 15,
        workspaceCredits: null,
      } as any)

      vi.mocked(prisma!.workspaceCredits.findUnique).mockResolvedValue(null)
      vi.mocked(prisma!.workspaceCredits.create).mockResolvedValue({
        id: "wc-new",
        workspaceId: "ws-1",
        balanceCents: 0,
        lowBalanceThresholdCents: 500,
      } as any)

      const { getWorkspaceCreditsInfo } = await import("@/lib/stripe/workspace-credits")
      const info = await getWorkspaceCreditsInfo("ws-1")

      expect(info.balanceCents).toBe(0)
      expect(info.isLowBalance).toBe(true) // 0 < 500
    })

    it("should handle zero per-minute rate", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        id: "ws-1",
        isBillingExempt: false,
        perMinuteRateCents: 0,
        workspaceCredits: {
          id: "wc-1",
          balanceCents: 1000,
          lowBalanceThresholdCents: 500,
        },
      } as any)

      const { getWorkspaceCreditsInfo } = await import("@/lib/stripe/workspace-credits")
      const info = await getWorkspaceCreditsInfo("ws-1")

      expect(info.estimatedMinutesRemaining).toBe(0) // Protected against division by zero
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

    it("should handle postpaid with zero limit", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspaceSubscription.findUnique).mockResolvedValue({
        status: "active",
        postpaidMinutesUsed: 0,
        minutesUsedThisPeriod: 0,
        plan: {
          billingType: "postpaid",
          postpaidMinutesLimit: null, // No limit set
          includedMinutes: 0,
        },
      } as any)

      const { canMakePostpaidCall } = await import("@/lib/stripe/workspace-credits")
      const result = await canMakePostpaidCall("ws-1")

      expect(result.allowed).toBe(false) // 0 >= 0 limit means exceeded
      expect(result.limitMinutes).toBe(0)
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

    it("should allow custom amount for free tier grant", async () => {
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
      const result = await grantInitialFreeTierCredits("ws-1", 2500) // Custom $25

      expect(result.success).toBe(true)
      expect(result.newBalanceCents).toBe(2500)
    })

    it("should create credits record if not exists", async () => {
      const { prisma } = await import("@/lib/prisma")
      
      vi.mocked(prisma!.workspaceCredits.findUnique).mockResolvedValue(null)
      vi.mocked(prisma!.workspaceCredits.create).mockResolvedValue({
        id: "wc-new",
        workspaceId: "ws-1",
        balanceCents: 0,
        lowBalanceThresholdCents: 500,
      } as any)
      vi.mocked(prisma!.workspaceCreditTransaction.findFirst).mockResolvedValue(null)
      vi.mocked(prisma!.$transaction).mockResolvedValue([{}, {}])

      const { grantInitialFreeTierCredits } = await import("@/lib/stripe/workspace-credits")
      const result = await grantInitialFreeTierCredits("ws-1")

      expect(result.success).toBe(true)
      expect(prisma!.workspaceCredits.create).toHaveBeenCalled()
    })
  })
})

// =============================================================================
// CONSTANTS TESTS
// =============================================================================

describe("Credits Constants", () => {
  it("should export correct topup amounts for partners", async () => {
    const { TOPUP_AMOUNTS_CENTS } = await import("@/lib/stripe/credits")
    
    expect(TOPUP_AMOUNTS_CENTS).toHaveLength(4)
    expect(TOPUP_AMOUNTS_CENTS[0]).toEqual({ label: "$10", value: 1000 })
    expect(TOPUP_AMOUNTS_CENTS[3]).toEqual({ label: "$100", value: 10000 })
  })

  it("should export correct topup amounts for workspaces", async () => {
    const { WORKSPACE_TOPUP_AMOUNTS_CENTS } = await import("@/lib/stripe/workspace-credits")
    
    expect(WORKSPACE_TOPUP_AMOUNTS_CENTS).toHaveLength(4)
    expect(WORKSPACE_TOPUP_AMOUNTS_CENTS[0]).toEqual({ label: "$5", value: 500 })
  })

  it("should export correct free tier amount", async () => {
    const { FREE_TIER_CREDITS_CENTS } = await import("@/lib/stripe/workspace-credits")
    
    expect(FREE_TIER_CREDITS_CENTS).toBe(1000) // $10
  })

  it("should export default per-minute rate", async () => {
    const { DEFAULT_PER_MINUTE_RATE_CENTS } = await import("@/lib/stripe/credits")
    
    expect(DEFAULT_PER_MINUTE_RATE_CENTS).toBe(15) // $0.15
  })
})

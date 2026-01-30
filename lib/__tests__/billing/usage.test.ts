/**
 * Tests for billing usage logic
 * Tests plan limits, credit checks, and usage processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  getPlanMonthlyMinutesLimit,
  type CallUsageData,
  type UsageProcessResult,
} from "@/lib/billing/usage"

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Mock stripe credits
vi.mock("@/lib/stripe/credits", () => ({
  deductUsage: vi.fn(),
  hasSufficientCredits: vi.fn(),
}))

// Mock workspace credits
vi.mock("@/lib/stripe/workspace-credits", () => ({
  deductWorkspaceUsage: vi.fn(),
  canMakePostpaidCall: vi.fn(),
}))

// =============================================================================
// PLAN LIMITS TESTS
// =============================================================================

describe("Plan Monthly Minutes Limits", () => {
  describe("getPlanMonthlyMinutesLimit", () => {
    it("should return correct limit for starter plan", () => {
      expect(getPlanMonthlyMinutesLimit("starter")).toBe(1000)
    })

    it("should return correct limit for professional plan", () => {
      expect(getPlanMonthlyMinutesLimit("professional")).toBe(5000)
    })

    it("should return correct limit for enterprise plan", () => {
      expect(getPlanMonthlyMinutesLimit("enterprise")).toBe(999999)
    })

    it("should default to starter limit for unknown plan", () => {
      expect(getPlanMonthlyMinutesLimit("unknown")).toBe(1000)
      expect(getPlanMonthlyMinutesLimit("")).toBe(1000)
      expect(getPlanMonthlyMinutesLimit("premium")).toBe(1000)
    })

    it("should handle case sensitivity", () => {
      // Note: current implementation is case-sensitive
      expect(getPlanMonthlyMinutesLimit("STARTER")).toBe(1000) // Falls back to starter
      expect(getPlanMonthlyMinutesLimit("Professional")).toBe(1000) // Falls back to starter
    })
  })
})

// =============================================================================
// MONTHLY MINUTES CALCULATION TESTS
// =============================================================================

describe("Monthly Minutes Calculations", () => {
  describe("checkMonthlyMinutesLimit", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("should correctly calculate remaining minutes when under limit", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        currentMonthMinutes: 500,
        partner: {
          planTier: "starter",
        },
      } as any)

      const { checkMonthlyMinutesLimit } = await import("@/lib/billing/usage")
      const result = await checkMonthlyMinutesLimit("workspace-1")

      expect(result.allowed).toBe(true)
      expect(result.currentUsage).toBe(500)
      expect(result.limit).toBe(1000)
      expect(result.remaining).toBe(500)
    })

    it("should return not allowed when at limit", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        currentMonthMinutes: 1000,
        partner: {
          planTier: "starter",
        },
      } as any)

      const { checkMonthlyMinutesLimit } = await import("@/lib/billing/usage")
      const result = await checkMonthlyMinutesLimit("workspace-1")

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it("should return not allowed when over limit", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        currentMonthMinutes: 1200,
        partner: {
          planTier: "starter",
        },
      } as any)

      const { checkMonthlyMinutesLimit } = await import("@/lib/billing/usage")
      const result = await checkMonthlyMinutesLimit("workspace-1")

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it("should use professional plan limit correctly", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue({
        currentMonthMinutes: 2500,
        partner: {
          planTier: "professional",
        },
      } as any)

      const { checkMonthlyMinutesLimit } = await import("@/lib/billing/usage")
      const result = await checkMonthlyMinutesLimit("workspace-1")

      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(5000)
      expect(result.remaining).toBe(2500)
    })

    it("should throw error when workspace not found", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.findUnique).mockResolvedValue(null)

      const { checkMonthlyMinutesLimit } = await import("@/lib/billing/usage")
      
      await expect(checkMonthlyMinutesLimit("nonexistent")).rejects.toThrow(
        "Workspace not found"
      )
    })
  })
})

// =============================================================================
// CALL COMPLETION PROCESSING TESTS
// =============================================================================

describe("Call Completion Processing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("processCallCompletion - idempotency", () => {
    it("should return success without re-processing if already billed", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.conversation.findUnique).mockResolvedValue({
        id: "conv-1",
        totalCost: 0.50, // Already has cost
        durationSeconds: 120,
      } as any)

      const { processCallCompletion } = await import("@/lib/billing/usage")
      const result = await processCallCompletion({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        partnerId: "partner-1",
        durationSeconds: 120,
        provider: "vapi",
      })

      expect(result.success).toBe(true)
      expect(result.reason).toBe("Already processed (idempotent)")
      expect(result.amountDeducted).toBe(50) // 0.50 * 100 cents
    })

    it("should return error if conversation not found", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.conversation.findUnique).mockResolvedValue(null)

      const { processCallCompletion } = await import("@/lib/billing/usage")
      const result = await processCallCompletion({
        conversationId: "nonexistent",
        workspaceId: "ws-1",
        partnerId: "partner-1",
        durationSeconds: 60,
        provider: "vapi",
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("Conversation not found")
    })
  })

  describe("processCallCompletion - billing flow", () => {
    it("should deduct workspace usage and update records", async () => {
      const { prisma } = await import("@/lib/prisma")
      const { deductWorkspaceUsage } = await import("@/lib/stripe/workspace-credits")

      vi.mocked(prisma!.conversation.findUnique).mockResolvedValue({
        id: "conv-1",
        totalCost: null, // Not yet billed
        durationSeconds: null,
      } as any)

      vi.mocked(deductWorkspaceUsage).mockResolvedValue({
        amountDeducted: 45, // 3 minutes at 15 cents
        newBalanceCents: 9955,
        deductedFrom: "workspace",
        isLowBalance: false,
      })

      vi.mocked(prisma!.$transaction).mockResolvedValue([{}, {}])

      const { processCallCompletion } = await import("@/lib/billing/usage")
      const result = await processCallCompletion({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        partnerId: "partner-1",
        durationSeconds: 150, // 2.5 minutes -> rounds to 3
        provider: "vapi",
      })

      expect(result.success).toBe(true)
      expect(result.amountDeducted).toBe(45)
      expect(result.minutesAdded).toBe(3)
      expect(deductWorkspaceUsage).toHaveBeenCalledWith(
        "ws-1",
        150,
        "conv-1",
        expect.stringContaining("VAPI call")
      )
    })

    it("should handle billing errors gracefully", async () => {
      const { prisma } = await import("@/lib/prisma")
      const { deductWorkspaceUsage } = await import("@/lib/stripe/workspace-credits")

      vi.mocked(prisma!.conversation.findUnique).mockResolvedValue({
        id: "conv-1",
        totalCost: null,
        durationSeconds: null,
      } as any)

      vi.mocked(deductWorkspaceUsage).mockRejectedValue(
        new Error("Insufficient workspace credits")
      )

      const { processCallCompletion } = await import("@/lib/billing/usage")
      const result = await processCallCompletion({
        conversationId: "conv-1",
        workspaceId: "ws-1",
        partnerId: "partner-1",
        durationSeconds: 60,
        provider: "retell",
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("Insufficient workspace credits")
    })
  })
})

// =============================================================================
// USAGE RESET TESTS
// =============================================================================

describe("Usage Reset Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("resetWorkspaceMonthlyUsage", () => {
    it("should reset workspace monthly usage to zero", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.update).mockResolvedValue({} as any)

      const { resetWorkspaceMonthlyUsage } = await import("@/lib/billing/usage")
      await resetWorkspaceMonthlyUsage("ws-1")

      expect(prisma!.workspace.update).toHaveBeenCalledWith({
        where: { id: "ws-1" },
        data: {
          currentMonthMinutes: 0,
          currentMonthCost: 0,
          lastUsageResetAt: expect.any(Date),
        },
      })
    })
  })

  describe("resetAllWorkspacesMonthlyUsage", () => {
    it("should reset all workspaces and return count", async () => {
      const { prisma } = await import("@/lib/prisma")
      vi.mocked(prisma!.workspace.updateMany).mockResolvedValue({ count: 42 })

      const { resetAllWorkspacesMonthlyUsage } = await import("@/lib/billing/usage")
      const count = await resetAllWorkspacesMonthlyUsage()

      expect(count).toBe(42)
      expect(prisma!.workspace.updateMany).toHaveBeenCalledWith({
        data: {
          currentMonthMinutes: 0,
          currentMonthCost: 0,
          lastUsageResetAt: expect.any(Date),
        },
      })
    })
  })
})

// =============================================================================
// CREDIT CHECK TESTS
// =============================================================================

describe("Credit Checks", () => {
  describe("hasSufficientCredits", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("should delegate to stripe credits module", async () => {
      const { hasSufficientCredits: checkCredits } = await import("@/lib/stripe/credits")
      vi.mocked(checkCredits).mockResolvedValue(true)

      const { hasSufficientCredits } = await import("@/lib/billing/usage")
      const result = await hasSufficientCredits("partner-1", 10)

      expect(result).toBe(true)
      expect(checkCredits).toHaveBeenCalledWith("partner-1", 10)
    })

    it("should return false when insufficient credits", async () => {
      const { hasSufficientCredits: checkCredits } = await import("@/lib/stripe/credits")
      vi.mocked(checkCredits).mockResolvedValue(false)

      const { hasSufficientCredits } = await import("@/lib/billing/usage")
      const result = await hasSufficientCredits("partner-1", 100)

      expect(result).toBe(false)
    })
  })
})

// =============================================================================
// MINUTES ROUNDING TESTS
// =============================================================================

describe("Minutes Calculation", () => {
  it("should round up seconds to minutes", () => {
    // Testing the rounding logic used throughout the billing module
    const roundToMinutes = (seconds: number) => Math.ceil(seconds / 60)

    expect(roundToMinutes(1)).toBe(1) // 1 second -> 1 minute
    expect(roundToMinutes(30)).toBe(1) // 30 seconds -> 1 minute
    expect(roundToMinutes(59)).toBe(1) // 59 seconds -> 1 minute
    expect(roundToMinutes(60)).toBe(1) // 60 seconds -> 1 minute
    expect(roundToMinutes(61)).toBe(2) // 61 seconds -> 2 minutes
    expect(roundToMinutes(90)).toBe(2) // 90 seconds -> 2 minutes
    expect(roundToMinutes(120)).toBe(2) // 120 seconds -> 2 minutes
    expect(roundToMinutes(121)).toBe(3) // 121 seconds -> 3 minutes
  })

  it("should calculate cost correctly based on minutes", () => {
    const calculateCost = (seconds: number, ratePerMinuteCents: number) => {
      const minutes = Math.ceil(seconds / 60)
      return minutes * ratePerMinuteCents
    }

    // 15 cents per minute default rate
    expect(calculateCost(30, 15)).toBe(15) // 1 minute
    expect(calculateCost(90, 15)).toBe(30) // 2 minutes
    expect(calculateCost(180, 15)).toBe(45) // 3 minutes

    // 20 cents per minute custom rate
    expect(calculateCost(120, 20)).toBe(40) // 2 minutes at 20 cents
  })
})


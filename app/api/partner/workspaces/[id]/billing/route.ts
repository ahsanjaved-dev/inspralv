/**
 * GET /api/partner/workspaces/[id]/billing
 * Get workspace billing settings (for partner admins)
 * 
 * PATCH /api/partner/workspaces/[id]/billing
 * Update workspace billing settings (rate, billing exempt status)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { getWorkspaceCreditsInfo } from "@/lib/stripe/workspace-credits"

const updateBillingSchema = z.object({
  isBillingExempt: z.boolean().optional(),
  perMinuteRateCents: z.number().int().min(1).max(1000).optional(), // $0.01 to $10.00 per minute
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params
    const auth = await getPartnerAuthContext()

    if (!auth || !auth.partner) {
      return unauthorized()
    }

    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can view workspace billing settings")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get workspace (must belong to this partner)
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        partnerId: auth.partner.id,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        isBillingExempt: true,
        perMinuteRateCents: true,
        workspaceCredits: {
          select: {
            balanceCents: true,
            lowBalanceThresholdCents: true,
          },
        },
      },
    })

    if (!workspace) {
      return notFound("Workspace not found")
    }

    // Get full credits info
    const creditsInfo = await getWorkspaceCreditsInfo(workspaceId)

    return apiResponse({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      billing: {
        isBillingExempt: workspace.isBillingExempt,
        perMinuteRateCents: workspace.perMinuteRateCents,
        perMinuteRateDollars: workspace.perMinuteRateCents / 100,
      },
      credits: creditsInfo,
    })
  } catch (error) {
    console.error("GET /api/partner/workspaces/[id]/billing error:", error)
    return serverError((error as Error).message)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params
    const auth = await getPartnerAuthContext()

    if (!auth || !auth.partner) {
      return unauthorized()
    }

    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can update workspace billing settings")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Parse request body
    const body = await request.json()
    const parsed = updateBillingSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid data")
    }

    const { isBillingExempt, perMinuteRateCents } = parsed.data

    // Verify workspace belongs to this partner
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        partnerId: auth.partner.id,
        deletedAt: null,
      },
    })

    if (!workspace) {
      return notFound("Workspace not found")
    }

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (isBillingExempt !== undefined) {
      updateData.isBillingExempt = isBillingExempt
    }
    if (perMinuteRateCents !== undefined) {
      updateData.perMinuteRateCents = perMinuteRateCents
    }

    if (Object.keys(updateData).length === 0) {
      return apiError("No fields to update")
    }

    // Update workspace
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        isBillingExempt: true,
        perMinuteRateCents: true,
      },
    })

    return apiResponse({
      workspace: {
        id: updatedWorkspace.id,
        name: updatedWorkspace.name,
        slug: updatedWorkspace.slug,
      },
      billing: {
        isBillingExempt: updatedWorkspace.isBillingExempt,
        perMinuteRateCents: updatedWorkspace.perMinuteRateCents,
        perMinuteRateDollars: updatedWorkspace.perMinuteRateCents / 100,
      },
    })
  } catch (error) {
    console.error("PATCH /api/partner/workspaces/[id]/billing error:", error)
    return serverError((error as Error).message)
  }
}


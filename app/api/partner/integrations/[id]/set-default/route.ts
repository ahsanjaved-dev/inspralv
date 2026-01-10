/**
 * Set Integration as Default
 * POST - Set this integration as the default for its provider
 */

import { NextRequest } from "next/server"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const auth = await getPartnerAuthContext()
    
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can set default integrations
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can set default integrations")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Check integration exists and belongs to partner
    const integration = await prisma.partnerIntegration.findFirst({
      where: {
        id,
        partnerId: auth.partner.id,
      },
    })

    if (!integration) {
      return notFound("Integration")
    }

    // If already default, nothing to do
    if (integration.isDefault) {
      return apiResponse({
        message: "Integration is already the default",
        integration: {
          id: integration.id,
          provider: integration.provider,
          name: integration.name,
          is_default: integration.isDefault,
        },
      })
    }

    // Transaction: Unset existing default and set this one
    await prisma.$transaction(async (tx) => {
      // Unset existing default for this provider
      await tx.partnerIntegration.updateMany({
        where: {
          partnerId: auth.partner.id,
          provider: integration.provider,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      })

      // Set this integration as default
      await tx.partnerIntegration.update({
        where: { id },
        data: { isDefault: true },
      })

      // Auto-assign to workspaces that don't have an assignment for this provider
      const workspaces = await tx.workspace.findMany({
        where: {
          partnerId: auth.partner.id,
          deletedAt: null,
        },
        select: { id: true },
      })

      // Find workspaces without an assignment for this provider
      const existingAssignments = await tx.workspaceIntegrationAssignment.findMany({
        where: {
          workspaceId: { in: workspaces.map(w => w.id) },
          provider: integration.provider,
        },
        select: { workspaceId: true },
      })

      const assignedWorkspaceIds = new Set(existingAssignments.map(a => a.workspaceId))
      const unassignedWorkspaces = workspaces.filter(w => !assignedWorkspaceIds.has(w.id))

      if (unassignedWorkspaces.length > 0) {
        await tx.workspaceIntegrationAssignment.createMany({
          data: unassignedWorkspaces.map(w => ({
            workspaceId: w.id,
            provider: integration.provider,
            partnerIntegrationId: id,
            assignedBy: auth.user.id,
          })),
        })
      }
    })

    return apiResponse({
      message: "Integration set as default",
      integration: {
        id: integration.id,
        provider: integration.provider,
        name: integration.name,
        is_default: true,
      },
    })
  } catch (error) {
    console.error("POST /api/partner/integrations/[id]/set-default error:", error)
    return serverError((error as Error).message)
  }
}


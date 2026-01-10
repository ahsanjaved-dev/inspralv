/**
 * Workspace Integration Assignment by Provider API
 * DELETE - Remove an integration assignment for a specific provider
 */

import { NextRequest } from "next/server"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ id: string; provider: string }>
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: workspaceId, provider } = await params
    const auth = await getPartnerAuthContext()
    
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can remove assignments
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can remove integration assignments")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Check workspace exists and belongs to partner
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        partnerId: auth.partner.id,
        deletedAt: null,
      },
    })

    if (!workspace) {
      return notFound("Workspace")
    }

    // Check assignment exists
    const assignment = await prisma.workspaceIntegrationAssignment.findFirst({
      where: {
        workspaceId,
        provider,
      },
    })

    if (!assignment) {
      return notFound("Assignment")
    }

    // Delete the assignment
    await prisma.workspaceIntegrationAssignment.delete({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider,
        },
      },
    })

    return apiResponse({ success: true })
  } catch (error) {
    console.error("DELETE /api/partner/workspaces/[id]/integrations/[provider] error:", error)
    return serverError((error as Error).message)
  }
}


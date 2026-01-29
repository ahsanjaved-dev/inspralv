/**
 * Workspace Integration Assignments API
 * GET  - Get assigned integrations for a workspace
 * POST - Assign an integration to a workspace
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { startBackgroundSync } from "@/lib/algolia/sync"

interface RouteContext {
  params: Promise<{ id: string }>
}

// Validation schema for assigning integration
const assignIntegrationSchema = z.object({
  provider: z.enum(["vapi", "retell", "algolia", "google_calendar"]),
  partner_integration_id: z.string().uuid(),
})

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: workspaceId } = await params
    const auth = await getPartnerAuthContext()
    
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can view workspace assignments
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can view workspace integrations")
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
      select: {
        id: true,
        name: true,
        slug: true,
      },
    })

    if (!workspace) {
      return notFound("Workspace")
    }

    // Get assigned integrations
    const assignments = await prisma.workspaceIntegrationAssignment.findMany({
      where: {
        workspaceId,
      },
      include: {
        partnerIntegration: {
          select: {
            id: true,
            provider: true,
            name: true,
            isDefault: true,
            isActive: true,
          },
        },
      },
    })

    // Get all available integrations for context
    const availableIntegrations = await prisma.partnerIntegration.findMany({
      where: {
        partnerId: auth.partner.id,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        name: true,
        isDefault: true,
      },
      orderBy: [
        { provider: "asc" },
        { isDefault: "desc" },
        { createdAt: "asc" },
      ],
    })

    return apiResponse({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      assignments: assignments.map(a => ({
        id: a.id,
        provider: a.provider,
        partner_integration_id: a.partnerIntegrationId,
        integration_name: a.partnerIntegration.name,
        is_default: a.partnerIntegration.isDefault,
        assigned_at: a.createdAt?.toISOString?.() || a.createdAt,
      })),
      available_integrations: availableIntegrations.map(i => ({
        id: i.id,
        provider: i.provider,
        name: i.name,
        is_default: i.isDefault,
      })),
    })
  } catch (error) {
    console.error("GET /api/partner/workspaces/[id]/integrations error:", error)
    return serverError((error as Error).message)
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: workspaceId } = await params
    const auth = await getPartnerAuthContext()
    
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can assign integrations
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can assign integrations")
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

    // Parse and validate request body
    const body = await request.json()
    const parsed = assignIntegrationSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid assignment data")
    }

    const { provider, partner_integration_id } = parsed.data

    // Check integration exists and belongs to partner
    const integration = await prisma.partnerIntegration.findFirst({
      where: {
        id: partner_integration_id,
        partnerId: auth.partner.id,
        provider: provider,
        isActive: true,
      },
    })

    if (!integration) {
      return notFound("Integration")
    }

    // Upsert the assignment (replace existing if any)
    const assignment = await prisma.workspaceIntegrationAssignment.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider,
        },
      },
      update: {
        partnerIntegrationId: partner_integration_id,
        assignedBy: auth.user.id,
        updatedAt: new Date(),
      },
      create: {
        workspaceId,
        provider,
        partnerIntegrationId: partner_integration_id,
        assignedBy: auth.user.id,
      },
      include: {
        partnerIntegration: {
          select: {
            id: true,
            name: true,
            isDefault: true,
          },
        },
      },
    })

    // If this is an Algolia integration assignment, trigger background sync of existing call data
    if (provider === "algolia") {
      console.log(`[Integrations] Triggering Algolia sync for workspace: ${workspaceId}`)
      startBackgroundSync(workspaceId, auth.partner.id)
    }

    return apiResponse({
      assignment: {
        id: assignment.id,
        workspace_id: assignment.workspaceId,
        provider: assignment.provider,
        partner_integration_id: assignment.partnerIntegrationId,
        integration_name: assignment.partnerIntegration.name,
        is_default: assignment.partnerIntegration.isDefault,
        assigned_at: assignment.createdAt?.toISOString?.() || assignment.createdAt,
      },
    }, 201)
  } catch (error) {
    console.error("POST /api/partner/workspaces/[id]/integrations error:", error)
    return serverError((error as Error).message)
  }
}


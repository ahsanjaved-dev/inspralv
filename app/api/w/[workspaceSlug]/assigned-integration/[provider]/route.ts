/**
 * Workspace Assigned Integration by Provider API
 * GET - Get the assigned integration for a specific provider
 */

import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, notFound, serverError, unauthorized } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; provider: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug, provider } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get the integration assignment for this provider
    let assignment = await prisma.workspaceIntegrationAssignment.findFirst({
      where: {
        workspaceId: ctx.workspace.id,
        provider: provider,
      },
      include: {
        partnerIntegration: {
          select: {
            id: true,
            provider: true,
            name: true,
            isDefault: true,
            isActive: true,
            apiKeys: true,
          },
        },
      },
    })

    // If no assignment exists, check if there's a default integration and auto-assign it
    if (!assignment) {
      // First get the workspace's partner_id
      const workspace = await prisma.workspace.findUnique({
        where: { id: ctx.workspace.id },
        select: { partnerId: true },
      })

      if (workspace?.partnerId) {
        // Find the default integration for this provider
        const defaultIntegration = await prisma.partnerIntegration.findFirst({
          where: {
            partnerId: workspace.partnerId,
            provider: provider,
            isDefault: true,
            isActive: true,
          },
          select: {
            id: true,
            provider: true,
            name: true,
            isDefault: true,
            isActive: true,
            apiKeys: true,
          },
        })

        if (defaultIntegration) {
          // Auto-create the assignment
          console.log(`[AssignedIntegration] Auto-assigning default ${provider} integration to workspace ${ctx.workspace.id}`)
          await prisma.workspaceIntegrationAssignment.create({
            data: {
              workspaceId: ctx.workspace.id,
              provider: provider,
              partnerIntegrationId: defaultIntegration.id,
              assignedBy: ctx.user.id,
            },
          })

          // Re-fetch with the new assignment
          assignment = await prisma.workspaceIntegrationAssignment.findFirst({
            where: {
              workspaceId: ctx.workspace.id,
              provider: provider,
            },
            include: {
              partnerIntegration: {
                select: {
                  id: true,
                  provider: true,
                  name: true,
                  isDefault: true,
                  isActive: true,
                  apiKeys: true,
                },
              },
            },
          })
        }
      }
    }

    if (!assignment) {
      return notFound("Integration assignment")
    }

    // Transform to safe response (hide actual keys)
    const apiKeys = assignment.partnerIntegration.apiKeys as any
    return apiResponse({
      provider: assignment.provider,
      integration_id: assignment.partnerIntegration.id,
      integration_name: assignment.partnerIntegration.name,
      is_default: assignment.partnerIntegration.isDefault,
      has_secret_key: !!apiKeys?.default_secret_key,
      has_public_key: !!apiKeys?.default_public_key,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/assigned-integration/[provider] error:", error)
    return serverError((error as Error).message)
  }
}


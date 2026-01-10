/**
 * Workspace Assigned Integrations API
 * GET - Get all assigned integrations for this workspace (from org-level)
 */

import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, serverError, unauthorized } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Get all integration assignments for this workspace
    const assignments = await prisma.workspaceIntegrationAssignment.findMany({
      where: {
        workspaceId: ctx.workspace.id,
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

    // Transform to safe response (hide actual keys)
    const integrations = assignments.map((a) => {
      const apiKeys = a.partnerIntegration.apiKeys as any
      return {
        provider: a.provider,
        integration_id: a.partnerIntegration.id,
        integration_name: a.partnerIntegration.name,
        is_default: a.partnerIntegration.isDefault,
        has_secret_key: !!apiKeys?.default_secret_key,
        has_public_key: !!apiKeys?.default_public_key,
      }
    })

    return apiResponse({ integrations })
  } catch (error) {
    console.error("GET /api/w/[slug]/assigned-integrations error:", error)
    return serverError((error as Error).message)
  }
}


/**
 * Partner Integration Detail API
 * GET    - Get a specific integration
 * PATCH  - Update an integration
 * DELETE - Delete an integration
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ id: string }>
}

// Additional key schema
const additionalKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  secret_key: z.string().optional(),
  public_key: z.string().optional(),
})

// Update schema
const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  default_secret_key: z.string().optional(),
  default_public_key: z.string().optional(),
  additional_keys: z.array(additionalKeySchema).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
})

// Response transformer to hide sensitive data
function sanitizeIntegration(integration: any, includeFullKeys = false) {
  const apiKeys = integration.apiKeys as any
  const config = integration.config as any
  const isAlgolia = integration.provider === "algolia"

  return {
    id: integration.id,
    partner_id: integration.partnerId,
    provider: integration.provider,
    name: integration.name,
    has_default_secret_key: !!apiKeys?.default_secret_key,
    has_default_public_key: !!apiKeys?.default_public_key,
    additional_keys_count: apiKeys?.additional_keys?.length || 0,
    additional_keys: apiKeys?.additional_keys?.map((k: any) => ({
      id: k.id,
      name: k.name,
      has_secret_key: !!k.secret_key,
      has_public_key: !!k.public_key,
    })) || [],
    config: isAlgolia ? {
      app_id: config?.app_id,
      call_logs_index: config?.call_logs_index,
      has_admin_api_key: !!config?.admin_api_key,
      has_search_api_key: !!config?.search_api_key,
    } : config,
    is_default: integration.isDefault,
    is_active: integration.isActive,
    created_at: integration.createdAt?.toISOString?.() || integration.createdAt,
    updated_at: integration.updatedAt?.toISOString?.() || integration.updatedAt,
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const auth = await getPartnerAuthContext()
    
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can view integrations
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can view integrations")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    const integration = await prisma.partnerIntegration.findFirst({
      where: {
        id,
        partnerId: auth.partner.id,
      },
      include: {
        _count: {
          select: { assignments: true },
        },
        assignments: {
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    })

    if (!integration) {
      return notFound("Integration")
    }

    return apiResponse({
      integration: {
        ...sanitizeIntegration(integration),
        assigned_workspaces_count: integration._count.assignments,
        assigned_workspaces: integration.assignments.map(a => ({
          id: a.workspace.id,
          name: a.workspace.name,
          slug: a.workspace.slug,
          assigned_at: a.createdAt?.toISOString?.() || a.createdAt,
        })),
      },
    })
  } catch (error) {
    console.error("GET /api/partner/integrations/[id] error:", error)
    return serverError((error as Error).message)
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const auth = await getPartnerAuthContext()
    
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can update integrations
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can update integrations")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Check integration exists and belongs to partner
    const existing = await prisma.partnerIntegration.findFirst({
      where: {
        id,
        partnerId: auth.partner.id,
      },
    })

    if (!existing) {
      return notFound("Integration")
    }

    // Parse and validate request body
    const body = await request.json()
    const parsed = updateIntegrationSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid integration data")
    }

    const data = parsed.data
    const existingApiKeys = existing.apiKeys as any

    // Build updated API keys
    const updatedApiKeys = {
      default_secret_key: data.default_secret_key ?? existingApiKeys?.default_secret_key,
      default_public_key: data.default_public_key ?? existingApiKeys?.default_public_key,
      additional_keys: data.additional_keys ?? existingApiKeys?.additional_keys ?? [],
    }

    // Build update data
    const updateData: any = {
      apiKeys: updatedApiKeys,
    }

    if (data.name !== undefined) {
      updateData.name = data.name
    }

    if (data.config !== undefined) {
      // Merge config for Algolia
      if (existing.provider === "algolia") {
        const existingConfig = existing.config as any
        updateData.config = {
          ...existingConfig,
          ...data.config,
        }
      } else {
        updateData.config = data.config
      }
    }

    if (data.is_active !== undefined) {
      updateData.isActive = data.is_active
    }

    // Handle is_default change
    if (data.is_default !== undefined && data.is_default !== existing.isDefault) {
      if (data.is_default) {
        // Setting as default: unset other defaults for this provider
        await prisma.partnerIntegration.updateMany({
          where: {
            partnerId: auth.partner.id,
            provider: existing.provider,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        })
        updateData.isDefault = true
      } else {
        // Unsetting default
        updateData.isDefault = false
      }
    }

    // Update the integration
    const integration = await prisma.partnerIntegration.update({
      where: { id },
      data: updateData,
    })

    // If now default, auto-assign to all workspaces that don't have an assignment for this provider
    if (data.is_default === true && integration.isDefault) {
      const workspaces = await prisma.workspace.findMany({
        where: {
          partnerId: auth.partner.id,
          deletedAt: null,
        },
        select: { id: true },
      })

      // Find existing assignments for this provider
      const existingAssignments = await prisma.workspaceIntegrationAssignment.findMany({
        where: {
          workspaceId: { in: workspaces.map(w => w.id) },
          provider: existing.provider,
        },
        select: { workspaceId: true },
      })

      const assignedWorkspaceIds = new Set(existingAssignments.map(a => a.workspaceId))
      const unassignedWorkspaces = workspaces.filter(w => !assignedWorkspaceIds.has(w.id))

      if (unassignedWorkspaces.length > 0) {
        await prisma.workspaceIntegrationAssignment.createMany({
          data: unassignedWorkspaces.map(w => ({
            workspaceId: w.id,
            provider: existing.provider,
            partnerIntegrationId: integration.id,
            assignedBy: auth.user.id,
          })),
        })
        console.log(`[IntegrationUpdate] Auto-assigned ${unassignedWorkspaces.length} workspaces to integration ${integration.id}`)
      }
    }

    return apiResponse({
      integration: sanitizeIntegration(integration),
    })
  } catch (error) {
    console.error("PATCH /api/partner/integrations/[id] error:", error)
    return serverError((error as Error).message)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const auth = await getPartnerAuthContext()
    
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can delete integrations
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can delete integrations")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Check integration exists and belongs to partner
    const existing = await prisma.partnerIntegration.findFirst({
      where: {
        id,
        partnerId: auth.partner.id,
      },
      include: {
        _count: {
          select: { assignments: true },
        },
        assignments: {
          select: {
            workspaceId: true,
          },
        },
      },
    })

    if (!existing) {
      return notFound("Integration")
    }

    // Cannot delete if assigned to workspaces
    if (existing._count.assignments > 0) {
      return apiError(
        `Cannot delete ${existing.provider} integration with ${existing._count.assignments} workspace assignment(s). Reassign workspaces first.`,
        400
      )
    }

    // Delete the integration
    await prisma.partnerIntegration.delete({
      where: { id },
    })

    // If this was the default, set another integration as default
    if (existing.isDefault) {
      const nextDefault = await prisma.partnerIntegration.findFirst({
        where: {
          partnerId: auth.partner.id,
          provider: existing.provider,
        },
        orderBy: { createdAt: "asc" },
      })

      if (nextDefault) {
        await prisma.partnerIntegration.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        })
        console.log(
          `[IntegrationDelete] Set ${nextDefault.id} as default for provider ${existing.provider}`
        )
      }
    }

    return apiResponse({ 
      success: true,
      message: `${existing.provider} integration deleted successfully`,
    })
  } catch (error) {
    console.error("DELETE /api/partner/integrations/[id] error:", error)
    return serverError((error as Error).message)
  }
}


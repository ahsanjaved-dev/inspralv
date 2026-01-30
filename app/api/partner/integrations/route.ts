/**
 * Partner Integrations API (Org-Level)
 * GET  - List all integrations for the partner
 * POST - Create a new integration (add VAPI/Retell/Algolia/Google Calendar API keys)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import { startBackgroundBulkSync } from "@/lib/algolia/sync"

// Provider type enum
const providerEnum = z.enum(["vapi", "retell", "algolia", "google_calendar"])

// Additional key schema
const additionalKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  secret_key: z.string().optional(),
  public_key: z.string().optional(),
})

// API keys schema
const apiKeysSchema = z.object({
  default_secret_key: z.string().optional(),
  default_public_key: z.string().optional(),
  additional_keys: z.array(additionalKeySchema).optional(),
})

// Algolia config schema
const algoliaConfigSchema = z.object({
  app_id: z.string().optional(),
  admin_api_key: z.string().optional(),
  search_api_key: z.string().optional(),
  call_logs_index: z.string().optional(),
})

// Validation schema for creating an integration
const createIntegrationSchema = z.object({
  provider: providerEnum,
  name: z.string().min(1).max(255),
  default_secret_key: z.string().min(1, "Secret key is required"),
  default_public_key: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  is_default: z.boolean().default(false),
})

// Response transformer to hide sensitive data
function sanitizeIntegration(integration: any) {
  const apiKeys = integration.apiKeys as any
  const config = integration.config as any
  const isAlgolia = integration.provider === "algolia"
  const isGoogleCalendar = integration.provider === "google_calendar"

  // Build sanitized config based on provider
  let sanitizedConfig = config
  if (isAlgolia) {
    sanitizedConfig = {
      app_id: config?.app_id,
      call_logs_index: config?.call_logs_index,
      has_admin_api_key: !!config?.admin_api_key,
      has_search_api_key: !!config?.search_api_key,
    }
  } else if (isGoogleCalendar) {
    sanitizedConfig = {
      client_id: config?.client_id,
      has_client_secret: !!config?.client_secret,
    }
  }

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
    config: sanitizedConfig,
    is_default: integration.isDefault,
    is_active: integration.isActive,
    created_at: integration.createdAt?.toISOString?.() || integration.createdAt,
    updated_at: integration.updatedAt?.toISOString?.() || integration.updatedAt,
  }
}

export async function GET() {
  try {
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

    const integrations = await prisma.partnerIntegration.findMany({
      where: {
        partnerId: auth.partner.id,
      },
      orderBy: [
        { provider: "asc" },
        { isDefault: "desc" },
        { createdAt: "asc" },
      ],
      include: {
        _count: {
          select: { assignments: true },
        },
      },
    })

    return apiResponse({
      integrations: integrations.map((integration) => ({
        ...sanitizeIntegration(integration),
        assigned_workspaces_count: integration._count.assignments,
      })),
    })
  } catch (error) {
    console.error("GET /api/partner/integrations error:", error)
    return serverError((error as Error).message)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth?.partner) {
      return unauthorized()
    }

    // Only owners/admins can create integrations
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only owners and admins can create integrations")
    }

    if (!prisma) {
      return serverError("Database not configured")
    }

    // Parse and validate request body
    const body = await request.json()
    const parsed = createIntegrationSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid integration data")
    }

    const data = parsed.data

    // If setting as default, check if another default exists
    if (data.is_default) {
      // Unset any existing default for this provider
      await prisma.partnerIntegration.updateMany({
        where: {
          partnerId: auth.partner.id,
          provider: data.provider,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      })
    }

    // Build API keys object
    const apiKeys = {
      default_secret_key: data.default_secret_key,
      default_public_key: data.default_public_key || null,
      additional_keys: [],
    }

    // Build config based on provider
    let config: any = data.config || {}
    if (data.provider === "algolia" && data.config) {
      config = {
        app_id: (data.config as any).app_id,
        admin_api_key: (data.config as any).admin_api_key,
        search_api_key: (data.config as any).search_api_key,
        call_logs_index: (data.config as any).call_logs_index,
      }
    } else if (data.provider === "google_calendar" && data.config) {
      // Google Calendar uses OAuth client credentials
      config = {
        client_id: (data.config as any).client_id,
        client_secret: (data.config as any).client_secret,
      }
    }

    // Create the integration
    const integration = await prisma.partnerIntegration.create({
      data: {
        partnerId: auth.partner.id,
        provider: data.provider,
        name: data.name,
        apiKeys: apiKeys,
        config: config,
        isDefault: data.is_default,
        isActive: true,
        createdBy: auth.user.id,
      },
    })

    // If this is the first integration for this provider, set it as default
    const countForProvider = await prisma.partnerIntegration.count({
      where: {
        partnerId: auth.partner.id,
        provider: data.provider,
      },
    })

    if (countForProvider === 1 && !integration.isDefault) {
      await prisma.partnerIntegration.update({
        where: { id: integration.id },
        data: { isDefault: true },
      })
      integration.isDefault = true
    }

    // If this is the default integration, auto-assign to all workspaces
    if (integration.isDefault) {
      const workspaces = await prisma.workspace.findMany({
        where: {
          partnerId: auth.partner.id,
          deletedAt: null,
        },
        select: { id: true },
      })

      // Create assignments for workspaces that don't have one for this provider
      const existingAssignments = await prisma.workspaceIntegrationAssignment.findMany({
        where: {
          workspaceId: { in: workspaces.map(w => w.id) },
          provider: data.provider,
        },
        select: { workspaceId: true },
      })

      const assignedWorkspaceIds = new Set(existingAssignments.map(a => a.workspaceId))
      const unassignedWorkspaces = workspaces.filter(w => !assignedWorkspaceIds.has(w.id))

      if (unassignedWorkspaces.length > 0) {
        await prisma.workspaceIntegrationAssignment.createMany({
          data: unassignedWorkspaces.map(w => ({
            workspaceId: w.id,
            provider: data.provider,
            partnerIntegrationId: integration.id,
            assignedBy: auth.user.id,
          })),
        })
      }

      // If this is an Algolia integration, trigger background sync of existing call data
      if (data.provider === "algolia") {
        console.log(`[Integrations] Triggering Algolia sync for partner: ${auth.partner.id}`)
        startBackgroundBulkSync(auth.partner.id, integration.id)
      }
    }

    return apiResponse({
      integration: sanitizeIntegration(integration),
    }, 201)
  } catch (error) {
    console.error("POST /api/partner/integrations error:", error)
    return serverError((error as Error).message)
  }
}


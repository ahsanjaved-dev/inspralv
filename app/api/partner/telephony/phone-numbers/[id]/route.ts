import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { updatePhoneNumberSchema } from "@/types/database.types"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { logger } from "@/lib/logger"

interface RouteParams {
  params: Promise<{ id: string }>
}

// Helper to transform Prisma PhoneNumber to API format (snake_case)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformPhoneNumber(number: any) {
  return {
    id: number.id,
    partner_id: number.partnerId,
    phone_number: number.phoneNumber,
    phone_number_e164: number.phoneNumberE164,
    friendly_name: number.friendlyName,
    description: number.description,
    country_code: number.countryCode,
    provider: number.provider,
    external_id: number.externalId,
    sip_uri: number.sipUri,
    sip_trunk_id: number.sipTrunkId,
    sip_trunk_id_ref: number.sipTrunkIdRef,
    status: number.status,
    assigned_agent_id: number.assignedAgentId,
    assigned_workspace_id: number.assignedWorkspaceId,
    assigned_at: number.assignedAt?.toISOString?.() ?? number.assignedAt ?? null,
    supports_inbound: number.supportsInbound,
    supports_outbound: number.supportsOutbound,
    supports_sms: number.supportsSms,
    config: number.config,
    created_by: number.createdBy,
    deleted_at: number.deletedAt?.toISOString?.() ?? number.deletedAt ?? null,
    created_at: number.createdAt?.toISOString?.() ?? number.createdAt,
    updated_at: number.updatedAt?.toISOString?.() ?? number.updatedAt,
    // Include relations if present
    sipTrunk: number.sipTrunk ? {
      id: number.sipTrunk.id,
      name: number.sipTrunk.name,
      sipServer: number.sipTrunk.sipServer,
      sipPort: number.sipTrunk.sipPort,
    } : null,
    assignedAgent: number.assignedAgent ? {
      id: number.assignedAgent.id,
      name: number.assignedAgent.name,
      provider: number.assignedAgent.provider,
    } : null,
    assignedWorkspace: number.assignedWorkspace ? {
      id: number.assignedWorkspace.id,
      name: number.assignedWorkspace.name,
      slug: number.assignedWorkspace.slug,
    } : null,
  }
}

/**
 * GET /api/partner/telephony/phone-numbers/[id]
 * Get a specific phone number
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole, user } = authContext
    const partnerId = partner.id

    if (!prisma) {
      return NextResponse.json(
        { error: "Database connection unavailable" },
        { status: 500 }
      )
    }

    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
      include: {
        sipTrunk: {
          select: {
            id: true,
            name: true,
            sipServer: true,
            sipPort: true,
          },
        },
        assignedAgent: {
          select: {
            id: true,
            name: true,
            provider: true,
          },
        },
        assignedWorkspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 })
    }

    // If not admin, verify workspace access
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      if (phoneNumber.assignedWorkspaceId) {
        const hasAccess = await prisma.workspaceMember.findFirst({
          where: {
            userId: user.id,
            workspaceId: phoneNumber.assignedWorkspaceId,
            removedAt: null,
          },
        })
        if (!hasAccess) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
      } else {
        // Unassigned numbers are only visible to admins
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    return NextResponse.json({ data: transformPhoneNumber(phoneNumber) })
  } catch (error) {
    logger.error("Error fetching phone number:", error as Record<string, unknown>)
    return NextResponse.json(
      { error: "Failed to fetch phone number" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/partner/telephony/phone-numbers/[id]
 * Update a phone number
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole } = authContext
    const partnerId = partner.id

    // Only partner admins/owners can update phone numbers
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!prisma) {
      return NextResponse.json({ error: "Database connection unavailable" }, { status: 500 })
    }

    // Verify ownership
    const existingNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
    })

    if (!existingNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updatePhoneNumberSchema.parse(body)

    // Build update data
    const updateData: Record<string, unknown> = {}
    
    if (validatedData.phone_number !== undefined) updateData.phoneNumber = validatedData.phone_number
    if (validatedData.phone_number_e164 !== undefined) updateData.phoneNumberE164 = validatedData.phone_number_e164
    if (validatedData.friendly_name !== undefined) updateData.friendlyName = validatedData.friendly_name
    if (validatedData.description !== undefined) updateData.description = validatedData.description
    if (validatedData.country_code !== undefined) updateData.countryCode = validatedData.country_code
    if (validatedData.provider !== undefined) updateData.provider = validatedData.provider
    if (validatedData.external_id !== undefined) updateData.externalId = validatedData.external_id
    if (validatedData.sip_uri !== undefined) updateData.sipUri = validatedData.sip_uri
    if (validatedData.sip_trunk_id_ref !== undefined) updateData.sipTrunkIdRef = validatedData.sip_trunk_id_ref
    if (validatedData.status !== undefined) updateData.status = validatedData.status
    if (validatedData.supports_inbound !== undefined) updateData.supportsInbound = validatedData.supports_inbound
    if (validatedData.supports_outbound !== undefined) updateData.supportsOutbound = validatedData.supports_outbound
    if (validatedData.supports_sms !== undefined) updateData.supportsSms = validatedData.supports_sms
    if (validatedData.config !== undefined) updateData.config = validatedData.config

    // Handle assignment changes
    if (validatedData.assigned_agent_id !== undefined) {
      if (validatedData.assigned_agent_id) {
        // Verify agent exists and belongs to partner
        const agent = await prisma.aiAgent.findFirst({
          where: {
            id: validatedData.assigned_agent_id,
            workspace: {
              partnerId,
            },
            deletedAt: null,
          },
          include: {
            workspace: true,
          },
        })

        if (!agent) {
          return NextResponse.json({ error: "Agent not found" }, { status: 400 })
        }

        updateData.assignedAgentId = validatedData.assigned_agent_id
        updateData.assignedWorkspaceId = agent.workspaceId
        updateData.assignedAt = new Date()
        updateData.status = "assigned"

        // Also update the agent's assigned phone number
        await prisma.aiAgent.update({
          where: { id: validatedData.assigned_agent_id },
          data: { assignedPhoneNumberId: id },
        })
      } else {
        // Unassign from agent
        if (existingNumber.assignedAgentId) {
          await prisma.aiAgent.update({
            where: { id: existingNumber.assignedAgentId },
            data: { assignedPhoneNumberId: null },
          })
        }
        updateData.assignedAgentId = null
        updateData.assignedAt = null
        updateData.status = "available"
      }
    }

    if (validatedData.assigned_workspace_id !== undefined) {
      if (validatedData.assigned_workspace_id) {
        // Verify workspace belongs to partner
        const workspace = await prisma.workspace.findFirst({
          where: {
            id: validatedData.assigned_workspace_id,
            partnerId,
            deletedAt: null,
          },
        })

        if (!workspace) {
          return NextResponse.json({ error: "Workspace not found" }, { status: 400 })
        }

        updateData.assignedWorkspaceId = validatedData.assigned_workspace_id
        if (!updateData.assignedAt) {
          updateData.assignedAt = new Date()
        }
      } else {
        updateData.assignedWorkspaceId = null
      }
    }

    const phoneNumber = await prisma.phoneNumber.update({
      where: { id },
      data: updateData,
      include: {
        sipTrunk: {
          select: {
            id: true,
            name: true,
            sipServer: true,
          },
        },
        assignedAgent: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedWorkspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    logger.info(`Phone number updated: ${phoneNumber.id}`)

    return NextResponse.json({ data: transformPhoneNumber(phoneNumber) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }
    logger.error("Error updating phone number:", error as Record<string, unknown>)
    return NextResponse.json(
      { error: "Failed to update phone number" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/partner/telephony/phone-numbers/[id]
 * Soft delete a phone number
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole } = authContext
    const partnerId = partner.id

    // Only partner admins/owners can delete phone numbers
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!prisma) {
      return NextResponse.json({ error: "Database connection unavailable" }, { status: 500 })
    }

    // Verify ownership
    const existingNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
    })

    if (!existingNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 })
    }

    // If assigned to an agent, unassign first
    if (existingNumber.assignedAgentId) {
      await prisma.aiAgent.update({
        where: { id: existingNumber.assignedAgentId },
        data: { assignedPhoneNumberId: null },
      })
    }

    // Soft delete
    await prisma.phoneNumber.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "inactive",
        assignedAgentId: null,
        assignedWorkspaceId: null,
      },
    })

    logger.info(`Phone number deleted: ${id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error("Error deleting phone number:", error as Record<string, unknown>)
    return NextResponse.json(
      { error: "Failed to delete phone number" },
      { status: 500 }
    )
  }
}


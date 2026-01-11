import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createPhoneNumberSchema } from "@/types/database.types"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { logger } from "@/lib/logger"

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
    } : null,
    assignedAgent: number.assignedAgent ? {
      id: number.assignedAgent.id,
      name: number.assignedAgent.name,
    } : null,
    assignedWorkspace: number.assignedWorkspace ? {
      id: number.assignedWorkspace.id,
      name: number.assignedWorkspace.name,
      slug: number.assignedWorkspace.slug,
    } : null,
  }
}

/**
 * GET /api/partner/telephony/phone-numbers
 * List all phone numbers for the partner
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole, user } = authContext
    const partnerId = partner.id
    const { searchParams } = new URL(request.url)
    
    // Filter params
    const status = searchParams.get("status")
    const workspaceId = searchParams.get("workspace_id")
    const agentId = searchParams.get("agent_id")
    const provider = searchParams.get("provider")

    // Only partner admins/owners can view all phone numbers
    // Members can only see numbers assigned to their workspaces
    const isAdmin = partnerRole && ["owner", "admin"].includes(partnerRole)

    const whereClause: Record<string, unknown> = {
      partnerId,
      deletedAt: null,
    }

    if (status) whereClause.status = status
    if (workspaceId) whereClause.assignedWorkspaceId = workspaceId
    if (agentId) whereClause.assignedAgentId = agentId
    if (provider) whereClause.provider = provider

    // If not admin, only show numbers for workspaces they have access to
    if (!isAdmin) {
      const userWorkspaces = await prisma.workspaceMember.findMany({
        where: {
          userId: user.id,
          removedAt: null,
        },
        select: { workspaceId: true },
      })
      const workspaceIds = userWorkspaces.map(w => w.workspaceId)
      whereClause.assignedWorkspaceId = { in: workspaceIds }
    }

    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: whereClause,
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
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ data: phoneNumbers.map(transformPhoneNumber) })
  } catch (error) {
    logger.error("Error fetching phone numbers:", error)
    return NextResponse.json(
      { error: "Failed to fetch phone numbers" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/partner/telephony/phone-numbers
 * Create a new phone number
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole, user } = authContext
    const partnerId = partner.id
    const userId = user.id

    // Only partner admins/owners can create phone numbers
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createPhoneNumberSchema.parse(body)

    // Check for duplicate phone number
    const existingNumber = await prisma.phoneNumber.findFirst({
      where: {
        partnerId,
        phoneNumber: validatedData.phone_number,
        deletedAt: null,
      },
    })

    if (existingNumber) {
      return NextResponse.json(
        { error: "Phone number already exists" },
        { status: 400 }
      )
    }

    // Validate SIP trunk if provided
    if (validatedData.sip_trunk_id_ref) {
      const sipTrunk = await prisma.sipTrunk.findFirst({
        where: {
          id: validatedData.sip_trunk_id_ref,
          partnerId,
          deletedAt: null,
        },
      })

      if (!sipTrunk) {
        return NextResponse.json(
          { error: "SIP trunk not found" },
          { status: 400 }
        )
      }

      // Auto-generate SIP URI if not provided
      if (!validatedData.sip_uri && validatedData.provider === "sip") {
        const e164Number = validatedData.phone_number_e164 || validatedData.phone_number
        validatedData.sip_uri = `sip:${e164Number}@${sipTrunk.sipServer}:${sipTrunk.sipPort}`
      }
    }

    const phoneNumber = await prisma.phoneNumber.create({
      data: {
        partnerId,
        phoneNumber: validatedData.phone_number,
        phoneNumberE164: validatedData.phone_number_e164,
        friendlyName: validatedData.friendly_name,
        description: validatedData.description,
        countryCode: validatedData.country_code,
        provider: validatedData.provider,
        externalId: validatedData.external_id,
        sipUri: validatedData.sip_uri,
        sipTrunkIdRef: validatedData.sip_trunk_id_ref,
        supportsInbound: validatedData.supports_inbound,
        supportsOutbound: validatedData.supports_outbound,
        supportsSms: validatedData.supports_sms,
        config: validatedData.config,
        status: "available",
        createdBy: userId,
      },
      include: {
        sipTrunk: {
          select: {
            id: true,
            name: true,
            sipServer: true,
          },
        },
      },
    })

    logger.info(`Phone number created: ${phoneNumber.id} for partner ${partnerId}`)

    return NextResponse.json({ data: transformPhoneNumber(phoneNumber) }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    logger.error("Error creating phone number:", error)
    return NextResponse.json(
      { error: "Failed to create phone number" },
      { status: 500 }
    )
  }
}


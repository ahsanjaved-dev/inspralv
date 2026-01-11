import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { updateSipTrunkSchema } from "@/types/database.types"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { logger } from "@/lib/logger"

interface RouteParams {
  params: Promise<{ id: string }>
}

// Helper to transform Prisma SipTrunk to API format (snake_case)
function transformSipTrunk(trunk: {
  id: string
  partnerId: string
  name: string
  description: string | null
  sipServer: string
  sipPort: number
  sipTransport: string
  sipUsername: string
  sipPassword: string
  sipRealm: string | null
  register: boolean
  registrationExpiry: number
  outboundProxy: string | null
  outboundCallerId: string | null
  isActive: boolean
  isDefault: boolean
  lastRegistrationAt: Date | null
  registrationStatus: string | null
  registrationError: string | null
  provider: string | null
  externalCredentialId: string | null
  config: unknown
  createdBy: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: trunk.id,
    partner_id: trunk.partnerId,
    name: trunk.name,
    description: trunk.description,
    sip_server: trunk.sipServer,
    sip_port: trunk.sipPort,
    sip_transport: trunk.sipTransport,
    sip_username: trunk.sipUsername,
    sip_password: trunk.sipPassword,
    sip_realm: trunk.sipRealm,
    register: trunk.register,
    registration_expiry: trunk.registrationExpiry,
    outbound_proxy: trunk.outboundProxy,
    outbound_caller_id: trunk.outboundCallerId,
    is_active: trunk.isActive,
    is_default: trunk.isDefault,
    last_registration_at: trunk.lastRegistrationAt?.toISOString() ?? null,
    registration_status: trunk.registrationStatus,
    registration_error: trunk.registrationError,
    provider: trunk.provider,
    external_credential_id: trunk.externalCredentialId,
    config: trunk.config,
    created_by: trunk.createdBy,
    deleted_at: trunk.deletedAt?.toISOString() ?? null,
    created_at: trunk.createdAt.toISOString(),
    updated_at: trunk.updatedAt.toISOString(),
  }
}

/**
 * GET /api/partner/telephony/sip-trunks/[id]
 * Get a specific SIP trunk
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole } = authContext
    const partnerId = partner.id

    // Only partner admins/owners can view SIP trunks
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const sipTrunk = await prisma.sipTrunk.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
    })

    if (!sipTrunk) {
      return NextResponse.json({ error: "SIP trunk not found" }, { status: 404 })
    }

    // Transform and mask the password for security
    const transformed = transformSipTrunk(sipTrunk)
    transformed.sip_password = "••••••••"

    return NextResponse.json({ data: transformed })
  } catch (error) {
    logger.error("Error fetching SIP trunk:", error)
    return NextResponse.json(
      { error: "Failed to fetch SIP trunk" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/partner/telephony/sip-trunks/[id]
 * Update a SIP trunk
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

    // Only partner admins/owners can update SIP trunks
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Verify ownership
    const existingTrunk = await prisma.sipTrunk.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
    })

    if (!existingTrunk) {
      return NextResponse.json({ error: "SIP trunk not found" }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updateSipTrunkSchema.parse(body)

    // If setting as default, unset other defaults first
    if (validatedData.is_default) {
      await prisma.sipTrunk.updateMany({
        where: {
          partnerId,
          isDefault: true,
          deletedAt: null,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
      })
    }

    const updateData: Record<string, unknown> = {}
    if (validatedData.name !== undefined) updateData.name = validatedData.name
    if (validatedData.description !== undefined) updateData.description = validatedData.description
    if (validatedData.sip_server !== undefined) updateData.sipServer = validatedData.sip_server
    if (validatedData.sip_port !== undefined) updateData.sipPort = validatedData.sip_port
    if (validatedData.sip_transport !== undefined) updateData.sipTransport = validatedData.sip_transport
    if (validatedData.sip_username !== undefined) updateData.sipUsername = validatedData.sip_username
    if (validatedData.sip_password !== undefined) updateData.sipPassword = validatedData.sip_password
    if (validatedData.sip_realm !== undefined) updateData.sipRealm = validatedData.sip_realm
    if (validatedData.register !== undefined) updateData.register = validatedData.register
    if (validatedData.registration_expiry !== undefined) updateData.registrationExpiry = validatedData.registration_expiry
    if (validatedData.outbound_proxy !== undefined) updateData.outboundProxy = validatedData.outbound_proxy
    if (validatedData.outbound_caller_id !== undefined) updateData.outboundCallerId = validatedData.outbound_caller_id
    if (validatedData.is_default !== undefined) updateData.isDefault = validatedData.is_default

    const sipTrunk = await prisma.sipTrunk.update({
      where: { id },
      data: updateData,
    })

    logger.info(`SIP trunk updated: ${sipTrunk.id}`)

    return NextResponse.json({ data: transformSipTrunk(sipTrunk) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    logger.error("Error updating SIP trunk:", error)
    return NextResponse.json(
      { error: "Failed to update SIP trunk" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/partner/telephony/sip-trunks/[id]
 * Soft delete a SIP trunk
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

    // Only partner admins/owners can delete SIP trunks
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Verify ownership
    const existingTrunk = await prisma.sipTrunk.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
    })

    if (!existingTrunk) {
      return NextResponse.json({ error: "SIP trunk not found" }, { status: 404 })
    }

    // Check if any phone numbers are using this trunk
    const phoneNumbersUsingTrunk = await prisma.phoneNumber.count({
      where: {
        sipTrunkIdRef: id,
        deletedAt: null,
      },
    })

    if (phoneNumbersUsingTrunk > 0) {
      return NextResponse.json(
        { error: `Cannot delete SIP trunk: ${phoneNumbersUsingTrunk} phone number(s) are using it` },
        { status: 400 }
      )
    }

    // Soft delete
    await prisma.sipTrunk.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })

    logger.info(`SIP trunk deleted: ${id}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error("Error deleting SIP trunk:", error)
    return NextResponse.json(
      { error: "Failed to delete SIP trunk" },
      { status: 500 }
    )
  }
}


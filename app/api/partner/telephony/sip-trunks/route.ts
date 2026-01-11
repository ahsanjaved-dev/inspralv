import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createSipTrunkSchema } from "@/types/database.types"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { logger } from "@/lib/logger"

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
 * GET /api/partner/telephony/sip-trunks
 * List all SIP trunks for the partner
 */
export async function GET(request: NextRequest) {
  try {
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

    const sipTrunks = await prisma.sipTrunk.findMany({
      where: {
        partnerId,
        deletedAt: null,
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    })

    return NextResponse.json({ data: sipTrunks.map(transformSipTrunk) })
  } catch (error) {
    logger.error("Error fetching SIP trunks:", error)
    return NextResponse.json(
      { error: "Failed to fetch SIP trunks" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/partner/telephony/sip-trunks
 * Create a new SIP trunk
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

    // Only partner admins/owners can create SIP trunks
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createSipTrunkSchema.parse(body)

    // If this is set as default, unset other defaults first
    if (validatedData.is_default) {
      await prisma.sipTrunk.updateMany({
        where: {
          partnerId,
          isDefault: true,
          deletedAt: null,
        },
        data: {
          isDefault: false,
        },
      })
    }

    const sipTrunk = await prisma.sipTrunk.create({
      data: {
        partnerId,
        name: validatedData.name,
        description: validatedData.description,
        sipServer: validatedData.sip_server,
        sipPort: validatedData.sip_port,
        sipTransport: validatedData.sip_transport,
        sipUsername: validatedData.sip_username,
        sipPassword: validatedData.sip_password, // TODO: Encrypt this
        sipRealm: validatedData.sip_realm,
        register: validatedData.register,
        registrationExpiry: validatedData.registration_expiry,
        outboundProxy: validatedData.outbound_proxy,
        outboundCallerId: validatedData.outbound_caller_id,
        isDefault: validatedData.is_default,
        isActive: true,
        createdBy: userId,
      },
    })

    logger.info(`SIP trunk created: ${sipTrunk.id} for partner ${partnerId}`)

    return NextResponse.json({ data: transformSipTrunk(sipTrunk) }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    logger.error("Error creating SIP trunk:", error)
    return NextResponse.json(
      { error: "Failed to create SIP trunk" },
      { status: 500 }
    )
  }
}


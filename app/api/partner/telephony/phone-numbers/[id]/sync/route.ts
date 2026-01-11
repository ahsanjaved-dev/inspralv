import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { logger } from "@/lib/logger"
import { createByoPhoneNumber, deletePhoneNumber, attachPhoneNumberToAssistant } from "@/lib/integrations/vapi/phone-numbers"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/partner/telephony/phone-numbers/[id]/sync
 * Sync a phone number to Vapi (create BYO phone number linked to SIP trunk)
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole } = authContext
    const partnerId = partner.id

    // Only partner admins/owners can sync phone numbers
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get the phone number with SIP trunk
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
      include: {
        sipTrunk: true,
      },
    })

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 })
    }

    // Check if SIP trunk is synced
    if (!phoneNumber.sipTrunk?.externalCredentialId) {
      return NextResponse.json(
        { error: "Phone number's SIP trunk must be synced to Vapi first" },
        { status: 400 }
      )
    }

    // Get Vapi integration for this partner
    const vapiIntegration = await prisma.partnerIntegration.findFirst({
      where: {
        partnerId,
        provider: "vapi",
        isActive: true,
      },
    })

    if (!vapiIntegration) {
      return NextResponse.json(
        { error: "No active Vapi integration found. Please configure Vapi API keys first." },
        { status: 400 }
      )
    }

    const apiKeys = vapiIntegration.apiKeys as { default_secret_key?: string }
    if (!apiKeys?.default_secret_key) {
      return NextResponse.json(
        { error: "Vapi API key not configured" },
        { status: 400 }
      )
    }

    // Check if already synced
    if (phoneNumber.externalId) {
      return NextResponse.json(
        { error: "Phone number is already synced to Vapi", vapiPhoneNumberId: phoneNumber.externalId },
        { status: 400 }
      )
    }

    // Create BYO phone number in Vapi
    const createResult = await createByoPhoneNumber({
      apiKey: apiKeys.default_secret_key,
      number: phoneNumber.phoneNumberE164 || phoneNumber.phoneNumber,
      credentialId: phoneNumber.sipTrunk.externalCredentialId,
      name: phoneNumber.friendlyName || phoneNumber.phoneNumber,
      numberE164CheckEnabled: false, // Allow non-E164 numbers
    })

    if (!createResult.success || !createResult.data) {
      logger.error(`Failed to create Vapi BYO phone number: ${createResult.error}`)
      
      // Update with error status
      await prisma.phoneNumber.update({
        where: { id },
        data: {
          status: "error",
          config: {
            ...(phoneNumber.config as object || {}),
            syncError: createResult.error,
          },
        },
      })

      return NextResponse.json(
        { error: `Failed to sync to Vapi: ${createResult.error}` },
        { status: 500 }
      )
    }

    // Update phone number with Vapi ID
    const updatedPhoneNumber = await prisma.phoneNumber.update({
      where: { id },
      data: {
        externalId: createResult.data.id,
        sipUri: createResult.data.sipUri,
        provider: "vapi",
        config: {
          ...(phoneNumber.config as object || {}),
          vapiPhoneNumberId: createResult.data.id,
          vapiStatus: createResult.data.status,
          syncedAt: new Date().toISOString(),
          syncError: null,
        },
      },
    })

    logger.info(`Phone number ${id} synced to Vapi: ${createResult.data.id}`)

    return NextResponse.json({
      data: {
        phoneNumberId: id,
        vapiPhoneNumberId: createResult.data.id,
        sipUri: createResult.data.sipUri,
        status: "created",
        phoneNumber: updatedPhoneNumber,
      },
    })
  } catch (error) {
    logger.error("Error syncing phone number:", error)
    return NextResponse.json(
      { error: "Failed to sync phone number" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/partner/telephony/phone-numbers/[id]/sync
 * Remove phone number from Vapi
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole } = authContext
    const partnerId = partner.id

    // Only partner admins/owners can unsync phone numbers
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get the phone number
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
    })

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 })
    }

    if (!phoneNumber.externalId) {
      return NextResponse.json(
        { error: "Phone number is not synced to Vapi" },
        { status: 400 }
      )
    }

    // Get Vapi integration for this partner
    const vapiIntegration = await prisma.partnerIntegration.findFirst({
      where: {
        partnerId,
        provider: "vapi",
        isActive: true,
      },
    })

    if (!vapiIntegration) {
      return NextResponse.json(
        { error: "No active Vapi integration found" },
        { status: 400 }
      )
    }

    const apiKeys = vapiIntegration.apiKeys as { default_secret_key?: string }
    if (!apiKeys?.default_secret_key) {
      return NextResponse.json(
        { error: "Vapi API key not configured" },
        { status: 400 }
      )
    }

    // Delete phone number from Vapi
    const deleteResult = await deletePhoneNumber({
      apiKey: apiKeys.default_secret_key,
      phoneNumberId: phoneNumber.externalId,
    })

    if (!deleteResult.success) {
      logger.error(`Failed to delete Vapi phone number: ${deleteResult.error}`)
      return NextResponse.json(
        { error: `Failed to unsync from Vapi: ${deleteResult.error}` },
        { status: 500 }
      )
    }

    // Update phone number to remove Vapi reference
    await prisma.phoneNumber.update({
      where: { id },
      data: {
        externalId: null,
        sipUri: null,
        provider: "sip",
        config: {
          ...(phoneNumber.config as object || {}),
          vapiPhoneNumberId: null,
          vapiStatus: null,
          syncedAt: null,
          unsyncedAt: new Date().toISOString(),
        },
      },
    })

    logger.info(`Phone number ${id} unsynced from Vapi`)

    return NextResponse.json({
      data: {
        phoneNumberId: id,
        status: "unsynced",
      },
    })
  } catch (error) {
    logger.error("Error unsyncing phone number:", error)
    return NextResponse.json(
      { error: "Failed to unsync phone number" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/partner/telephony/phone-numbers/[id]/sync
 * Assign phone number to an agent in Vapi
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { partner, partnerRole } = authContext
    const partnerId = partner.id

    // Only partner admins/owners can assign phone numbers
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { agentId } = body as { agentId: string | null }

    // Get the phone number
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id,
        partnerId,
        deletedAt: null,
      },
    })

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number not found" }, { status: 404 })
    }

    if (!phoneNumber.externalId) {
      return NextResponse.json(
        { error: "Phone number must be synced to Vapi first" },
        { status: 400 }
      )
    }

    // Get Vapi integration for this partner
    const vapiIntegration = await prisma.partnerIntegration.findFirst({
      where: {
        partnerId,
        provider: "vapi",
        isActive: true,
      },
    })

    if (!vapiIntegration) {
      return NextResponse.json(
        { error: "No active Vapi integration found" },
        { status: 400 }
      )
    }

    const apiKeys = vapiIntegration.apiKeys as { default_secret_key?: string }
    if (!apiKeys?.default_secret_key) {
      return NextResponse.json(
        { error: "Vapi API key not configured" },
        { status: 400 }
      )
    }

    // Get the agent's external ID if assigning
    let vapiAssistantId: string | null = null
    if (agentId) {
      const agent = await prisma.aiAgent.findFirst({
        where: {
          id: agentId,
          deletedAt: null,
        },
      })

      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 })
      }

      if (!agent.externalAgentId) {
        return NextResponse.json(
          { error: "Agent must be synced to Vapi first" },
          { status: 400 }
        )
      }

      vapiAssistantId = agent.externalAgentId
    }

    // Attach/detach phone number to/from assistant in Vapi
    const attachResult = await attachPhoneNumberToAssistant({
      apiKey: apiKeys.default_secret_key,
      phoneNumberId: phoneNumber.externalId,
      assistantId: vapiAssistantId,
    })

    if (!attachResult.success) {
      logger.error(`Failed to ${agentId ? 'attach' : 'detach'} Vapi phone number: ${attachResult.error}`)
      return NextResponse.json(
        { error: `Failed to ${agentId ? 'assign' : 'unassign'} phone number: ${attachResult.error}` },
        { status: 500 }
      )
    }

    // Update phone number assignment in database
    const updatedPhoneNumber = await prisma.phoneNumber.update({
      where: { id },
      data: {
        assignedAgentId: agentId,
        status: agentId ? "assigned" : "available",
        assignedAt: agentId ? new Date() : null,
      },
    })

    // Also update the agent's assigned phone number
    if (agentId) {
      await prisma.aiAgent.update({
        where: { id: agentId },
        data: {
          assignedPhoneNumberId: id,
          externalPhoneNumber: phoneNumber.phoneNumber,
        },
      })
    } else if (phoneNumber.assignedAgentId) {
      // Clear the previous agent's assignment
      await prisma.aiAgent.update({
        where: { id: phoneNumber.assignedAgentId },
        data: {
          assignedPhoneNumberId: null,
          externalPhoneNumber: null,
        },
      })
    }

    logger.info(`Phone number ${id} ${agentId ? 'assigned to' : 'unassigned from'} agent ${agentId || phoneNumber.assignedAgentId}`)

    return NextResponse.json({
      data: {
        phoneNumberId: id,
        agentId,
        status: agentId ? "assigned" : "unassigned",
        phoneNumber: updatedPhoneNumber,
      },
    })
  } catch (error) {
    logger.error("Error assigning phone number:", error)
    return NextResponse.json(
      { error: "Failed to assign phone number" },
      { status: 500 }
    )
  }
}


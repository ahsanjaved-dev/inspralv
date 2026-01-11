import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { logger } from "@/lib/logger"
import { createSipTrunkCredential, updateSipTrunkCredential, deleteSipTrunkCredential } from "@/lib/integrations/vapi/sip-trunk"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/partner/telephony/sip-trunks/[id]/sync
 * Sync a SIP trunk to Vapi (create credential in Vapi)
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

    // Only partner admins/owners can sync SIP trunks
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get the SIP trunk
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
    if (sipTrunk.externalCredentialId) {
      // Update existing credential
      // Note: Using outbound-only to avoid validation issues with some SIP providers
      const updateResult = await updateSipTrunkCredential({
        apiKey: apiKeys.default_secret_key,
        credentialId: sipTrunk.externalCredentialId,
        name: sipTrunk.name,
        sipServer: sipTrunk.sipServer,
        sipPort: sipTrunk.sipPort,
        sipUsername: sipTrunk.sipUsername,
        sipPassword: sipTrunk.sipPassword,
        sipTransport: sipTrunk.sipTransport as "udp" | "tcp" | "tls",
        inboundEnabled: false, // Outbound-only to avoid validation issues
        outboundEnabled: true,
      })

      if (!updateResult.success) {
        logger.error(`Failed to update Vapi SIP trunk credential: ${updateResult.error}`)
        return NextResponse.json(
          { error: `Failed to sync to Vapi: ${updateResult.error}` },
          { status: 500 }
        )
      }

      // Update registration status
      await prisma.sipTrunk.update({
        where: { id },
        data: {
          registrationStatus: "synced",
          lastRegistrationAt: new Date(),
          registrationError: null,
        },
      })

      logger.info(`SIP trunk ${id} updated in Vapi: ${sipTrunk.externalCredentialId}`)

      return NextResponse.json({
        data: {
          sipTrunkId: id,
          vapiCredentialId: sipTrunk.externalCredentialId,
          status: "updated",
        },
      })
    }

    // Create new credential in Vapi
    // Note: Some users report that enabling both inbound and outbound simultaneously
    // can cause validation failures. We try outbound-only first, then retry with both.
    let createResult = await createSipTrunkCredential({
      apiKey: apiKeys.default_secret_key,
      name: sipTrunk.name,
      sipServer: sipTrunk.sipServer,
      sipPort: sipTrunk.sipPort,
      sipUsername: sipTrunk.sipUsername,
      sipPassword: sipTrunk.sipPassword,
      sipTransport: sipTrunk.sipTransport as "udp" | "tcp" | "tls",
      inboundEnabled: false, // Start with outbound-only to avoid validation issues
      outboundEnabled: true,
      outboundLeadingPlusEnabled: true,
    })

    // If outbound-only fails, the issue is likely with credentials or server address
    if (!createResult.success || !createResult.data) {
      // Handle error that may be an array (convert to string)
      const errorMessage = Array.isArray(createResult.error) 
        ? createResult.error.join(", ") 
        : createResult.error || "Unknown error"
      
      logger.error(`Failed to create Vapi SIP trunk credential: ${errorMessage}`)
      
      // Provide helpful error suggestions
      let helpfulError = errorMessage
      if (errorMessage.includes("validate") || errorMessage.includes("gateway")) {
        helpfulError = `${errorMessage}. Suggestions: 1) Try using an IP address instead of domain name for the SIP server. 2) Verify your SIP credentials are correct. 3) Ensure your SIP provider has whitelisted Vapi's IP addresses.`
      }
      
      // Update with error status
      await prisma.sipTrunk.update({
        where: { id },
        data: {
          registrationStatus: "error",
          registrationError: helpfulError,
        },
      })

      return NextResponse.json(
        { error: `Failed to sync to Vapi: ${helpfulError}` },
        { status: 500 }
      )
    }

    // Update SIP trunk with Vapi credential ID
    const updatedSipTrunk = await prisma.sipTrunk.update({
      where: { id },
      data: {
        externalCredentialId: createResult.data.id,
        provider: "vapi",
        registrationStatus: "synced",
        lastRegistrationAt: new Date(),
        registrationError: null,
      },
    })

    logger.info(`SIP trunk ${id} synced to Vapi: ${createResult.data.id}`)

    return NextResponse.json({
      data: {
        sipTrunkId: id,
        vapiCredentialId: createResult.data.id,
        status: "created",
        sipTrunk: updatedSipTrunk,
      },
    })
  } catch (error) {
    logger.error("Error syncing SIP trunk:", error)
    return NextResponse.json(
      { error: "Failed to sync SIP trunk" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/partner/telephony/sip-trunks/[id]/sync
 * Remove SIP trunk from Vapi (delete credential)
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

    // Only partner admins/owners can unsync SIP trunks
    if (!partnerRole || !["owner", "admin"].includes(partnerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get the SIP trunk
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

    if (!sipTrunk.externalCredentialId) {
      return NextResponse.json(
        { error: "SIP trunk is not synced to Vapi" },
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

    // Delete credential from Vapi
    const deleteResult = await deleteSipTrunkCredential({
      apiKey: apiKeys.default_secret_key,
      credentialId: sipTrunk.externalCredentialId,
    })

    if (!deleteResult.success) {
      logger.error(`Failed to delete Vapi SIP trunk credential: ${deleteResult.error}`)
      return NextResponse.json(
        { error: `Failed to unsync from Vapi: ${deleteResult.error}` },
        { status: 500 }
      )
    }

    // Update SIP trunk to remove Vapi reference
    await prisma.sipTrunk.update({
      where: { id },
      data: {
        externalCredentialId: null,
        provider: null,
        registrationStatus: null,
        lastRegistrationAt: null,
        registrationError: null,
      },
    })

    logger.info(`SIP trunk ${id} unsynced from Vapi`)

    return NextResponse.json({
      data: {
        sipTrunkId: id,
        status: "unsynced",
      },
    })
  } catch (error) {
    logger.error("Error unsyncing SIP trunk:", error)
    return NextResponse.json(
      { error: "Failed to unsync SIP trunk" },
      { status: 500 }
    )
  }
}


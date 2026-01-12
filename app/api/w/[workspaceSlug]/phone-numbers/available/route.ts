import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

/**
 * GET /api/w/[workspaceSlug]/phone-numbers/available
 * 
 * Returns phone numbers available for agent assignment in this workspace.
 * This includes:
 * - Phone numbers assigned to this workspace (available or assigned to agents in this workspace)
 * - Phone numbers not assigned to any workspace (available for any workspace in the partner)
 * 
 * Workspace members can access this endpoint to see available phone numbers
 * when creating/editing agents.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  try {
    const { workspaceSlug } = await params
    
    // Get workspace context - this validates the user has access to the workspace
    const context = await getWorkspaceContext(workspaceSlug)
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workspace, partner } = context

    if (!prisma) {
      return NextResponse.json(
        { error: "Database connection unavailable" },
        { status: 500 }
      )
    }

    // Fetch phone numbers that are:
    // 1. Assigned to this workspace, OR
    // 2. Not assigned to any workspace (available for assignment)
    // All must belong to the same partner
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: {
        partnerId: partner.id,
        deletedAt: null,
        OR: [
          // Numbers assigned to this workspace
          { assignedWorkspaceId: workspace.id },
          // Numbers not assigned to any workspace (available)
          { assignedWorkspaceId: null },
        ],
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
      },
      orderBy: [
        { status: "asc" }, // Available first
        { friendlyName: "asc" },
        { phoneNumber: "asc" },
      ],
    })

    // Transform to API format
    const transformedNumbers = phoneNumbers.map((number) => ({
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
      assigned_at: number.assignedAt?.toISOString() ?? null,
      supports_inbound: number.supportsInbound,
      supports_outbound: number.supportsOutbound,
      supports_sms: number.supportsSms,
      config: number.config,
      created_at: number.createdAt?.toISOString(),
      updated_at: number.updatedAt?.toISOString(),
      // Relations
      sip_trunk: number.sipTrunk
        ? {
            id: number.sipTrunk.id,
            name: number.sipTrunk.name,
            sip_server: number.sipTrunk.sipServer,
            sip_port: number.sipTrunk.sipPort,
          }
        : null,
      assigned_agent: number.assignedAgent
        ? {
            id: number.assignedAgent.id,
            name: number.assignedAgent.name,
            provider: number.assignedAgent.provider,
          }
        : null,
      // Computed fields for UI
      is_available: number.status === "available" && !number.assignedAgentId,
      is_assigned_to_this_workspace: number.assignedWorkspaceId === workspace.id,
      display_name: number.friendlyName || number.phoneNumber,
    }))

    return NextResponse.json({
      data: transformedNumbers,
      total: transformedNumbers.length,
      workspace_id: workspace.id,
    })
  } catch (error) {
    logger.error("Error fetching available phone numbers:", error as Record<string, unknown>)
    return NextResponse.json(
      { error: "Failed to fetch available phone numbers" },
      { status: 500 }
    )
  }
}


import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

/**
 * GET /api/w/[workspaceSlug]/phone-numbers/available
 * 
 * Returns phone numbers available for assignment to agents in this workspace.
 * Phone numbers are managed at the partner level but can be assigned to workspace agents.
 * 
 * Returns:
 * - Phone numbers owned by the partner that are either:
 *   - Not assigned to any agent (status = 'available')
 *   - Already assigned to this workspace (for editing existing agents)
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Get the partner ID from the workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: ctx.workspace.id },
      select: { partnerId: true },
    })

    if (!workspace) {
      return unauthorized()
    }

    // Fetch phone numbers that are:
    // 1. Owned by this partner
    // 2. Not deleted
    // 3. Either available OR assigned to this workspace
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: {
        partnerId: workspace.partnerId,
        deletedAt: null,
        OR: [
          { status: "available" },
          { assignedWorkspaceId: ctx.workspace.id },
        ],
      },
      select: {
        id: true,
        phoneNumber: true,
        phoneNumberE164: true,
        friendlyName: true,
        provider: true,
        status: true,
        supportsInbound: true,
        supportsOutbound: true,
        supportsSms: true,
        assignedAgentId: true,
        assignedWorkspaceId: true,
        sipTrunk: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { status: "asc" }, // Available first
        { phoneNumber: "asc" },
      ],
    })

    // Transform to a cleaner response format
    const formattedNumbers = phoneNumbers.map((pn) => ({
      id: pn.id,
      phone_number: pn.phoneNumber,
      phone_number_e164: pn.phoneNumberE164,
      friendly_name: pn.friendlyName,
      provider: pn.provider,
      status: pn.status,
      supports_inbound: pn.supportsInbound,
      supports_outbound: pn.supportsOutbound,
      supports_sms: pn.supportsSms,
      assigned_agent_id: pn.assignedAgentId,
      assigned_workspace_id: pn.assignedWorkspaceId,
      sip_trunk: pn.sipTrunk
        ? {
            id: pn.sipTrunk.id,
            name: pn.sipTrunk.name,
          }
        : null,
      // Computed fields for UI
      is_available: pn.status === "available",
      display_name: pn.friendlyName || pn.phoneNumber,
    }))

    return apiResponse({
      data: formattedNumbers,
      total: formattedNumbers.length,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/phone-numbers/available error:", error)
    return serverError()
  }
}


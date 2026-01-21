import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { listRetellVoices } from "@/lib/integrations/retell/voices"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

/**
 * GET /api/w/[workspaceSlug]/voices/retell
 * Fetches available ElevenLabs voices from Retell API
 * Requires workspace to have a Retell API key configured
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Get Retell API key for this workspace using the org-level integration flow
    // Query workspace_integration_assignments -> partner_integrations
    const { data: assignment, error: assignmentError } = await ctx.adminClient
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id,
          api_keys,
          is_active
        )
      `)
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", "retell")
      .single()

    if (assignmentError || !assignment?.partner_integration) {
      console.log("[RetellVoices] No Retell integration assigned to workspace:", assignmentError?.message)
      return apiError(
        "No Retell API key configured for this workspace. Please assign a Retell integration first.",
        400
      )
    }

    // The query returns partner_integration as an object (not array) due to the foreign key relationship
    const partnerIntegration = assignment.partner_integration as unknown as {
      id: string
      api_keys: { default_secret_key?: string; default_public_key?: string }
      is_active: boolean
    }

    if (!partnerIntegration.is_active) {
      return apiError(
        "The assigned Retell integration is not active. Please contact your administrator.",
        400
      )
    }

    const apiKey = partnerIntegration.api_keys?.default_secret_key
    if (!apiKey) {
      return apiError(
        "The assigned Retell integration has no API key configured.",
        400
      )
    }

    // Fetch voices from Retell API
    const result = await listRetellVoices(apiKey)

    if (!result.success) {
      return apiError(result.error || "Failed to fetch voices from Retell", 500)
    }

    return apiResponse({
      voices: result.data,
      count: result.data?.length || 0,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/voices/retell error:", error)
    return serverError()
  }
}


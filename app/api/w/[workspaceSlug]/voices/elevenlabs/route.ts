import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { listElevenLabsVoices } from "@/lib/integrations/elevenlabs/voices"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

/**
 * GET /api/w/[workspaceSlug]/voices/elevenlabs
 * Fetches available voices from ElevenLabs API
 * 
 * For VAPI agents, we need ElevenLabs voices. This endpoint:
 * 1. First checks for a dedicated ElevenLabs integration
 * 2. Falls back to using VAPI integration's ElevenLabs API key if configured
 * 3. Returns error if no ElevenLabs API key is available
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Try to get ElevenLabs API key from workspace integrations
    // First try dedicated ElevenLabs integration, then fall back to VAPI integration
    let apiKey: string | null = null
    let integrationSource: string = ""

    // Check for dedicated ElevenLabs integration
    const { data: elevenLabsAssignment } = await ctx.adminClient
      .from("workspace_integration_assignments")
      .select(`
        partner_integration:partner_integrations (
          id,
          api_keys,
          is_active
        )
      `)
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", "elevenlabs")
      .single()

    if (elevenLabsAssignment?.partner_integration) {
      const integration = elevenLabsAssignment.partner_integration as unknown as {
        id: string
        api_keys: { default_secret_key?: string; elevenlabs_api_key?: string }
        is_active: boolean
      }

      if (integration.is_active) {
        apiKey = integration.api_keys?.elevenlabs_api_key || integration.api_keys?.default_secret_key || null
        if (apiKey) {
          integrationSource = "elevenlabs"
        }
      }
    }

    // Fall back to VAPI integration's ElevenLabs key
    if (!apiKey) {
      const { data: vapiAssignment } = await ctx.adminClient
        .from("workspace_integration_assignments")
        .select(`
          partner_integration:partner_integrations (
            id,
            api_keys,
            is_active
          )
        `)
        .eq("workspace_id", ctx.workspace.id)
        .eq("provider", "vapi")
        .single()

      if (vapiAssignment?.partner_integration) {
        const integration = vapiAssignment.partner_integration as unknown as {
          id: string
          api_keys: { 
            default_secret_key?: string
            elevenlabs_api_key?: string 
          }
          is_active: boolean
        }

        if (integration.is_active) {
          // VAPI integrations may have a dedicated ElevenLabs key stored
          apiKey = integration.api_keys?.elevenlabs_api_key || null
          if (apiKey) {
            integrationSource = "vapi"
          }
        }
      }
    }

    // Check environment variable as last resort
    if (!apiKey) {
      apiKey = process.env.ELEVENLABS_API_KEY || null
      if (apiKey) {
        integrationSource = "env"
      }
    }

    if (!apiKey) {
      console.log("[ElevenLabsVoices] No ElevenLabs API key found for workspace")
      return apiError(
        "No ElevenLabs API key configured. Please add an ElevenLabs integration or configure an ElevenLabs API key in your VAPI integration.",
        400
      )
    }

    console.log(`[ElevenLabsVoices] Using API key from: ${integrationSource}`)

    // Fetch voices from ElevenLabs API
    const result = await listElevenLabsVoices(apiKey)

    if (!result.success) {
      return apiError(result.error || "Failed to fetch voices from ElevenLabs", 500)
    }

    return apiResponse({
      voices: result.data,
      count: result.data?.length || 0,
      source: integrationSource,
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/voices/elevenlabs error:", error)
    return serverError()
  }
}


import { NextRequest } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { createWorkspaceIntegrationSchema } from "@/types/database.types"
import { createAuditLog, getRequestMetadata } from "@/lib/audit"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const { data: integrations, error } = await ctx.adminClient
      .from("workspace_integrations")
      .select(
        "id, workspace_id, provider, name, api_keys, is_active, config, created_at, updated_at"
      )
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("List integrations error:", error)
      return apiError("Failed to fetch integrations")
    }

    // Return safe version without exposing full API keys or secrets in config
    const safeIntegrations = (integrations || []).map((integration: any) => {
      const isAlgolia = integration.provider === "algolia"
      const safeConfig = isAlgolia
        ? {
            app_id: integration.config?.app_id,
            call_logs_index: integration.config?.call_logs_index,
            has_admin_api_key: !!integration.config?.admin_api_key,
            has_search_api_key: !!integration.config?.search_api_key,
          }
        : integration.config

      return {
      id: integration.id,
      workspace_id: integration.workspace_id,
      provider: integration.provider,
      name: integration.name,
      has_public_key: !!integration.api_keys?.default_public_key,
      additional_keys_count: integration.api_keys?.additional_keys?.length || 0,
      is_active: integration.is_active,
      config: safeConfig,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
      }
    })

    return apiResponse({ data: safeIntegrations })
  } catch (error) {
    console.error("GET /api/w/[slug]/integrations error:", error)
    return serverError()
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only workspace admins can manage integrations")
    }

    // Check paywall - block integration creation if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    const body = await request.json()
    const validation = createWorkspaceIntegrationSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues[0]?.message ?? "Validation failed")
    }

    // Check if integration already exists for this provider
    const { data: existing } = await ctx.adminClient
      .from("workspace_integrations")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", validation.data.provider)
      .single()

    if (existing) {
      return apiError(
        `${validation.data.provider} integration already exists. Please update or disconnect it first.`
      )
    }

    // Construct api_keys object
    const apiKeys = {
      default_secret_key: validation.data.default_secret_key,
      default_public_key: validation.data.default_public_key || null,
      additional_keys: validation.data.additional_keys || [],
    }

    // Create integration
    const { data: integration, error } = await ctx.adminClient
      .from("workspace_integrations")
      .insert({
        workspace_id: ctx.workspace.id,
        provider: validation.data.provider,
        name: validation.data.name,
        api_keys: apiKeys,
        config: validation.data.config || {},
        created_by: ctx.user.id,
        is_active: true,
      })
      .select(
        "id, workspace_id, provider, name, api_keys, is_active, config, created_at, updated_at"
      )
      .single()

    if (error) {
      console.error("Create integration error:", error)
      return apiError("Failed to create integration")
    }

    // Audit log
    const { ipAddress, userAgent } = getRequestMetadata(request)
    await createAuditLog({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "integration.created",
      entityType: "workspace_integration",
      entityId: integration.id,
      newValues: {
        provider: validation.data.provider,
        name: validation.data.name,
        additional_keys_count: apiKeys.additional_keys.length,
      },
      ipAddress,
      userAgent,
    })

    // Return safe version
    const safeIntegration = {
      id: integration.id,
      workspace_id: integration.workspace_id,
      provider: integration.provider,
      name: integration.name,
      has_public_key: !!integration.api_keys?.default_public_key,
      additional_keys_count: integration.api_keys?.additional_keys?.length || 0,
      is_active: integration.is_active,
      config: integration.config,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
    }

    return apiResponse(safeIntegration, 201)
  } catch (error) {
    console.error("POST /api/w/[slug]/integrations error:", error)
    return serverError()
  }
}

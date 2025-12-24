import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError } from "@/lib/api/helpers"
import { updateWorkspaceIntegrationSchema } from "@/types/database.types"
import { createAuditLog, getRequestMetadata } from "@/lib/audit"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; provider: string }>
}

// Helper to check if a key value is valid (not __KEEP__ or empty)
function isValidKeyValue(value: string | undefined | null): boolean {
  if (!value) return false
  if (value === "__KEEP__") return false
  if (value.trim() === "") return false
  return true
}

// Helper to merge additional keys while preserving existing values
function mergeAdditionalKeys(
  existingKeys: any[] | undefined,
  newKeys: any[] | undefined
): any[] {
  if (!newKeys) return existingKeys || []
  if (!existingKeys || existingKeys.length === 0) {
    // Filter out any keys with __KEEP__ markers (shouldn't happen, but safety check)
    return newKeys.filter((k) => isValidKeyValue(k.secret_key))
  }

  const result: any[] = []

  for (const newKey of newKeys) {
    // Check if this key already exists
    const existingKey = existingKeys.find((k) => k.id === newKey.id)

    if (!existingKey) {
      // New key - only add if it has valid values (not __KEEP__)
      if (isValidKeyValue(newKey.secret_key)) {
        result.push(newKey)
      }
    } else {
      // Existing key - preserve values marked with __KEEP__, but validate existing values too
      const secretKey = newKey.secret_key === "__KEEP__" 
        ? (isValidKeyValue(existingKey.secret_key) ? existingKey.secret_key : null)
        : newKey.secret_key
      
      const publicKey = newKey.public_key === "__KEEP__"
        ? (isValidKeyValue(existingKey.public_key) ? existingKey.public_key : null)
        : newKey.public_key

      // Only include if we have a valid secret key
      if (isValidKeyValue(secretKey)) {
        result.push({
          id: newKey.id,
          name: newKey.name,
          secret_key: secretKey,
          public_key: publicKey || undefined,
        })
      }
    }
  }

  // Also preserve existing keys that weren't in the new keys list
  for (const existingKey of existingKeys) {
    const isInNewKeys = newKeys.some((k) => k.id === existingKey.id)
    if (!isInNewKeys && isValidKeyValue(existingKey.secret_key)) {
      result.push(existingKey)
    }
  }

  return result
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, provider } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const { data: integration, error } = await ctx.adminClient
      .from("workspace_integrations")
      .select("id, workspace_id, provider, name, api_keys, is_active, config, created_at, updated_at")
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", provider)
      .single()

    if (error || !integration) {
      return notFound("Integration")
    }

    // Filter out any corrupted keys (with __KEEP__ values)
    const additionalKeys = (integration.api_keys?.additional_keys || []).filter(
      (key: any) => isValidKeyValue(key.secret_key)
    )

    // Return safe version with masked keys for display
    const safeIntegration = {
      id: integration.id,
      workspace_id: integration.workspace_id,
      provider: integration.provider,
      name: integration.name,
      has_default_secret_key: isValidKeyValue(integration.api_keys?.default_secret_key),
      has_default_public_key: isValidKeyValue(integration.api_keys?.default_public_key),
      additional_keys: additionalKeys.map((key: any) => ({
        id: key.id,
        name: key.name,
        has_secret_key: isValidKeyValue(key.secret_key),
        has_public_key: isValidKeyValue(key.public_key),
      })),
      is_active: integration.is_active,
      config: integration.config,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
    }

    return apiResponse(safeIntegration)
  } catch (error) {
    console.error("GET /api/w/[slug]/integrations/[provider] error:", error)
    return serverError()
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, provider } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only workspace admins can manage integrations")
    }

    const body = await request.json()
    const validation = updateWorkspaceIntegrationSchema.safeParse(body)

    if (!validation.success) {
      return apiError(validation.error.issues?.[0]?.message || "Invalid request")
    }

    // Get existing integration
    const { data: existing } = await ctx.adminClient
      .from("workspace_integrations")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", provider)
      .single()

    if (!existing) {
      return notFound("Integration")
    }

    // Build update data
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    
    if (validation.data.name) {
      updateData.name = validation.data.name
    }

    // Handle api_keys update with __KEEP__ marker support
    if (validation.data.default_secret_key || validation.data.default_public_key !== undefined || validation.data.additional_keys) {
      const currentApiKeys = existing.api_keys || { default_secret_key: "", additional_keys: [] }
      
      // Handle default_secret_key - preserve if __KEEP__ marker AND existing value is valid
      let newDefaultSecretKey = currentApiKeys.default_secret_key
      if (validation.data.default_secret_key) {
        if (validation.data.default_secret_key === "__KEEP__") {
          // Keep existing only if it's valid
          newDefaultSecretKey = isValidKeyValue(currentApiKeys.default_secret_key) 
            ? currentApiKeys.default_secret_key 
            : ""
        } else {
          newDefaultSecretKey = validation.data.default_secret_key
        }
      }

      // Handle default_public_key - preserve if __KEEP__ marker AND existing value is valid
      let newDefaultPublicKey = currentApiKeys.default_public_key
      if (validation.data.default_public_key !== undefined) {
        if (validation.data.default_public_key === "__KEEP__") {
          // Keep existing only if it's valid
          newDefaultPublicKey = isValidKeyValue(currentApiKeys.default_public_key)
            ? currentApiKeys.default_public_key
            : undefined
        } else {
          newDefaultPublicKey = validation.data.default_public_key
        }
      }

      // Merge additional keys - handle __KEEP__ markers
      const mergedAdditionalKeys = mergeAdditionalKeys(
        currentApiKeys.additional_keys,
        validation.data.additional_keys
      )

      updateData.api_keys = {
        default_secret_key: newDefaultSecretKey,
        default_public_key: newDefaultPublicKey,
        additional_keys: mergedAdditionalKeys,
      }
    }

    if (validation.data.config) {
      updateData.config = validation.data.config
    }

    const { data: integration, error } = await ctx.adminClient
      .from("workspace_integrations")
      .update(updateData)
      .eq("id", existing.id)
      .select("id, workspace_id, provider, name, api_keys, is_active, config, created_at, updated_at")
      .single()

    if (error) {
      console.error("Update integration error:", error)
      return apiError("Failed to update integration")
    }

    // Audit log
    const { ipAddress, userAgent } = getRequestMetadata(request)
    await createAuditLog({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "integration.updated",
      entityType: "workspace_integration",
      entityId: integration.id,
      oldValues: { name: existing.name },
      newValues: { name: integration.name },
      ipAddress,
      userAgent,
    })

    // Return safe version
    const safeIntegration = {
      id: integration.id,
      workspace_id: integration.workspace_id,
      provider: integration.provider,
      name: integration.name,
      has_public_key: isValidKeyValue(integration.api_keys?.default_public_key),
      additional_keys_count: integration.api_keys?.additional_keys?.filter(
        (k: any) => isValidKeyValue(k.secret_key)
      ).length || 0,
      is_active: integration.is_active,
      config: integration.config,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
    }

    return apiResponse(safeIntegration)
  } catch (error) {
    console.error("PATCH /api/w/[slug]/integrations/[provider] error:", error)
    return serverError()
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, provider } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only workspace admins can manage integrations")
    }

    const { data: existing } = await ctx.adminClient
      .from("workspace_integrations")
      .select("id, provider, name")
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", provider)
      .single()

    if (!existing) {
      return notFound("Integration")
    }

    const { error } = await ctx.adminClient
      .from("workspace_integrations")
      .delete()
      .eq("id", existing.id)

    if (error) {
      console.error("Delete integration error:", error)
      return apiError("Failed to disconnect integration")
    }

    // Audit log
    const { ipAddress, userAgent } = getRequestMetadata(request)
    await createAuditLog({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "integration.deleted",
      entityType: "workspace_integration",
      entityId: existing.id,
      oldValues: { provider: existing.provider, name: existing.name },
      ipAddress,
      userAgent,
    })

    return apiResponse({ message: "Integration disconnected" })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/integrations/[provider] error:", error)
    return serverError()
  }
}
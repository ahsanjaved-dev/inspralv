import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
import { createWorkspaceSchema } from "@/types/database.types"

export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth) return unauthorized()

    // Check if user can create workspaces (partner admin/owner)
    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner administrators can create workspaces")
    }

    // Check workspace limit before creating
    const resourceLimits = auth.partner.resource_limits as { max_workspaces?: number } | null
    const maxWorkspaces = resourceLimits?.max_workspaces ?? -1

    if (maxWorkspaces !== -1) {
      // Count existing workspaces for this partner
      const { count: workspaceCount, error: countError } = await auth.adminClient
        .from("workspaces")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", auth.partner.id)
        .is("deleted_at", null)

      if (countError) {
        console.error("Count workspaces error:", countError)
        return serverError("Failed to check workspace limit")
      }

      if ((workspaceCount || 0) >= maxWorkspaces) {
        return apiError(
          `Workspace limit reached (${maxWorkspaces}). Please upgrade your plan or contact support to create more workspaces.`,
          403
        )
      }
    }

    const body = await request.json()

    // Add a timestamp suffix to ensure unique slugs
    const baseSlug =
      body.slug ||
      body.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-")

    // Check slug availability
    const { data: existingWorkspace } = await auth.adminClient
      .from("workspaces")
      .select("id")
      .eq("partner_id", auth.partner.id)
      .eq("slug", baseSlug)
      .maybeSingle()

    const finalSlug = existingWorkspace
      ? `${baseSlug}-${Date.now().toString(36).slice(-4)}`
      : baseSlug

    const validation = createWorkspaceSchema.safeParse({
      ...body,
      slug: finalSlug,
    })

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    const { name, slug, description, resource_limits } = validation.data

    // Create workspace
    const { data: workspace, error: wsError } = await auth.adminClient
      .from("workspaces")
      .insert({
        partner_id: auth.partner.id,
        name,
        slug,
        description: description || null,
        resource_limits: resource_limits || {},
        settings: {},
        status: "active",
      })
      .select()
      .single()

    if (wsError) {
      console.error("Create workspace error:", wsError)
      return apiError("Failed to create workspace")
    }

    // Add creator as workspace owner
    const { error: memberError } = await auth.adminClient.from("workspace_members").insert({
      workspace_id: workspace.id,
      user_id: auth.user.id,
      role: "owner",
      joined_at: new Date().toISOString(),
    })

    if (memberError) {
      console.error("Add workspace owner error:", memberError)
      // Rollback workspace creation
      await auth.adminClient.from("workspaces").delete().eq("id", workspace.id)
      return apiError("Failed to set up workspace owner")
    }

    return apiResponse({
      workspace,
      message: "Workspace created successfully",
      redirect: `/w/${workspace.slug}/dashboard`,
    })
  } catch (error) {
    console.error("POST /api/workspaces error:", error)
    return serverError()
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth) return unauthorized()

    // Get workspace limit info
    const resourceLimits = auth.partner.resource_limits as { max_workspaces?: number } | null
    const maxWorkspaces = resourceLimits?.max_workspaces ?? -1
    const currentWorkspaceCount = auth.workspaces.length

    // Check if user can create more workspaces
    const canCreateWorkspace = isPartnerAdmin(auth) && 
      (maxWorkspaces === -1 || currentWorkspaceCount < maxWorkspaces)

    // Return user's accessible workspaces with limit info
    return apiResponse({
      workspaces: auth.workspaces,
      canCreateWorkspace,
      workspaceLimits: {
        max: maxWorkspaces,
        current: currentWorkspaceCount,
        remaining: maxWorkspaces === -1 ? -1 : Math.max(0, maxWorkspaces - currentWorkspaceCount),
        isUnlimited: maxWorkspaces === -1,
      },
    })
  } catch (error) {
    console.error("GET /api/workspaces error:", error)
    return serverError()
  }
}

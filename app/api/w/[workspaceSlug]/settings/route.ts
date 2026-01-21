import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
import { z } from "zod"
import { 
  createCustomVariableSchema, 
  type CustomVariableDefinition,
  type WorkspaceSettings,
} from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// Common timezones for the settings dropdown
const validTimezones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Stockholm",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
]

// Schema for custom variable operations
const customVariableOperationSchema = z.object({
  action: z.enum(["add", "update", "delete"]),
  variable: createCustomVariableSchema.optional(),
  variable_id: z.string().uuid().optional(),
})

const updateSettingsSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  timezone: z.string().optional(),
  // Custom variable operation (single operation at a time)
  custom_variable_operation: customVariableOperationSchema.optional(),
})

// GET workspace settings
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Get full workspace data
    const { data: workspace, error } = await ctx.adminClient
      .from("workspaces")
      .select("*")
      .eq("id", ctx.workspace.id)
      .single()

    if (error) {
      console.error("Get workspace error:", error)
      return serverError()
    }

    return apiResponse(workspace)
  } catch (error) {
    console.error("GET /api/w/[slug]/settings error:", error)
    return serverError()
  }
}

// PATCH - Update workspace settings
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("Only workspace owners and admins can update settings")
    }

    const body = await request.json()
    const validation = updateSettingsSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    // First get current settings
    const { data: currentWorkspace } = await ctx.adminClient
      .from("workspaces")
      .select("settings")
      .eq("id", ctx.workspace.id)
      .single()

    const currentSettings = (currentWorkspace?.settings as WorkspaceSettings) || {}

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (validation.data.name !== undefined) {
      updates.name = validation.data.name
    }
    if (validation.data.description !== undefined) {
      updates.description = validation.data.description
    }

    // Build new settings object
    let newSettings = { ...currentSettings }

    // Handle timezone update
    if (validation.data.timezone !== undefined) {
      newSettings.timezone = validation.data.timezone
    }

    // Handle custom variable operations
    if (validation.data.custom_variable_operation) {
      const { action, variable, variable_id } = validation.data.custom_variable_operation
      const existingVariables = currentSettings.custom_variables || []

      switch (action) {
        case "add": {
          if (!variable) {
            return apiError("Variable data is required for add operation")
          }
          // Check for duplicate name
          const isDuplicate = existingVariables.some(
            (v) => v.name.toLowerCase() === variable.name.toLowerCase()
          )
          if (isDuplicate) {
            return apiError(`A variable named "${variable.name}" already exists`)
          }
          // Create new variable with generated ID and timestamp
          const newVariable: CustomVariableDefinition = {
            ...variable,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
          }
          newSettings.custom_variables = [...existingVariables, newVariable]
          break
        }
        case "update": {
          if (!variable_id) {
            return apiError("Variable ID is required for update operation")
          }
          if (!variable) {
            return apiError("Variable data is required for update operation")
          }
          const varIndex = existingVariables.findIndex((v) => v.id === variable_id)
          if (varIndex === -1) {
            return apiError("Variable not found")
          }
          // Check if the variable is a standard variable
          if (existingVariables[varIndex].is_standard) {
            return apiError("Cannot modify standard variables")
          }
          // Check for duplicate name (excluding current variable)
          const isDuplicateName = existingVariables.some(
            (v, i) => i !== varIndex && v.name.toLowerCase() === variable.name.toLowerCase()
          )
          if (isDuplicateName) {
            return apiError(`A variable named "${variable.name}" already exists`)
          }
          // Update the variable
          const updatedVariables = [...existingVariables]
          updatedVariables[varIndex] = {
            ...updatedVariables[varIndex],
            ...variable,
            id: variable_id, // Keep original ID
            created_at: updatedVariables[varIndex].created_at, // Keep original timestamp
          }
          newSettings.custom_variables = updatedVariables
          break
        }
        case "delete": {
          if (!variable_id) {
            return apiError("Variable ID is required for delete operation")
          }
          const varToDelete = existingVariables.find((v) => v.id === variable_id)
          if (!varToDelete) {
            return apiError("Variable not found")
          }
          // Check if the variable is a standard variable
          if (varToDelete.is_standard) {
            return apiError("Cannot delete standard variables")
          }
          newSettings.custom_variables = existingVariables.filter((v) => v.id !== variable_id)
          break
        }
      }
    }

    // Only update settings if something changed
    if (
      validation.data.timezone !== undefined ||
      validation.data.custom_variable_operation
    ) {
      updates.settings = newSettings
    }

    const { data: workspace, error } = await ctx.adminClient
      .from("workspaces")
      .update(updates)
      .eq("id", ctx.workspace.id)
      .select()
      .single()

    if (error) {
      console.error("Update workspace error:", error)
      return apiError("Failed to update workspace settings")
    }

    return apiResponse(workspace)
  } catch (error) {
    console.error("PATCH /api/w/[slug]/settings error:", error)
    return serverError()
  }
}

// DELETE - Delete workspace (owner only)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner"])

    if (!ctx) {
      return forbidden("Only the workspace owner can delete this workspace")
    }

    // Soft delete
    const { error } = await ctx.adminClient
      .from("workspaces")
      .update({
        deleted_at: new Date().toISOString(),
        status: "deleted",
      })
      .eq("id", ctx.workspace.id)

    if (error) {
      console.error("Delete workspace error:", error)
      return apiError("Failed to delete workspace")
    }

    return apiResponse({ success: true, message: "Workspace deleted" })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/settings error:", error)
    return serverError()
  }
}

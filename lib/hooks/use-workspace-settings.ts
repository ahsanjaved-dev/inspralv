"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { api } from "@/lib/api/fetcher"
import type { 
  Workspace, 
  CustomVariableDefinition, 
  WorkspaceSettings,
  STANDARD_CAMPAIGN_VARIABLES,
} from "@/types/database.types"

export function useWorkspaceSettings() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery({
    queryKey: ["workspace-settings", workspaceSlug],
    queryFn: () => api.get<Workspace>(`/api/w/${workspaceSlug}/settings`),
    enabled: !!workspaceSlug,
  })
}

/**
 * Hook to get custom variables from workspace settings
 * Returns both standard and custom variables
 */
export function useWorkspaceCustomVariables() {
  const { data: workspace, isLoading, error } = useWorkspaceSettings()
  
  const settings = workspace?.settings as WorkspaceSettings | undefined
  const customVariables = settings?.custom_variables || []
  
  return {
    customVariables,
    isLoading,
    error,
  }
}

interface UpdateSettingsInput {
  name?: string
  description?: string | null
  timezone?: string
}

export function useUpdateWorkspaceSettings() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) =>
      api.patch<Workspace>(`/api/w/${workspaceSlug}/settings`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-settings", workspaceSlug] })
    },
  })
}

// =============================================================================
// CUSTOM VARIABLE OPERATIONS
// =============================================================================

interface AddCustomVariableInput {
  name: string
  description: string
  default_value: string
  is_required: boolean
  category: "contact" | "business" | "custom"
}

interface UpdateCustomVariableInput extends AddCustomVariableInput {
  id: string
}

/**
 * Hook to add a new custom variable to workspace settings
 */
export function useAddCustomVariable() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variable: AddCustomVariableInput) =>
      api.patch<Workspace>(`/api/w/${workspaceSlug}/settings`, {
        custom_variable_operation: {
          action: "add",
          variable,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-settings", workspaceSlug] })
    },
  })
}

/**
 * Hook to update an existing custom variable
 */
export function useUpdateCustomVariable() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...variable }: UpdateCustomVariableInput) =>
      api.patch<Workspace>(`/api/w/${workspaceSlug}/settings`, {
        custom_variable_operation: {
          action: "update",
          variable_id: id,
          variable,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-settings", workspaceSlug] })
    },
  })
}

/**
 * Hook to delete a custom variable
 */
export function useDeleteCustomVariable() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variableId: string) =>
      api.patch<Workspace>(`/api/w/${workspaceSlug}/settings`, {
        custom_variable_operation: {
          action: "delete",
          variable_id: variableId,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-settings", workspaceSlug] })
    },
  })
}

export function useDeleteWorkspace() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete(`/api/w/${workspaceSlug}/settings`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}

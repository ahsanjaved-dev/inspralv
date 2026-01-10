"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// =============================================================================
// TYPES
// =============================================================================

export interface PartnerIntegration {
  id: string
  partner_id: string
  provider: "vapi" | "retell" | "algolia"
  name: string
  has_default_secret_key: boolean
  has_default_public_key: boolean
  additional_keys_count: number
  additional_keys: Array<{
    id: string
    name: string
    has_secret_key: boolean
    has_public_key: boolean
  }>
  config: Record<string, unknown>
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  assigned_workspaces_count?: number
}

export interface PartnerIntegrationDetail extends PartnerIntegration {
  assigned_workspaces: Array<{
    id: string
    name: string
    slug: string
    assigned_at: string
  }>
}

export interface WorkspaceIntegrationAssignment {
  id: string
  provider: string
  partner_integration_id: string
  integration_name: string
  is_default: boolean
  assigned_at: string
}

export interface AvailableIntegration {
  id: string
  provider: string
  name: string
  is_default: boolean
}

export interface CreatePartnerIntegrationInput {
  provider: "vapi" | "retell" | "algolia"
  name: string
  default_secret_key: string
  default_public_key?: string
  config?: Record<string, unknown>
  is_default?: boolean
}

export interface UpdatePartnerIntegrationInput {
  name?: string
  default_secret_key?: string
  default_public_key?: string
  additional_keys?: Array<{
    id: string
    name: string
    secret_key?: string
    public_key?: string
  }>
  config?: Record<string, unknown>
  is_active?: boolean
}

// =============================================================================
// HOOKS - Partner Integrations
// =============================================================================

/**
 * Hook to list all partner integrations
 */
export function usePartnerIntegrations() {
  return useQuery<PartnerIntegration[]>({
    queryKey: ["partner-integrations"],
    queryFn: async () => {
      const res = await fetch("/api/partner/integrations")
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch integrations")
      }
      const json = await res.json()
      return json.data?.integrations || []
    },
  })
}

/**
 * Hook to get a single partner integration with details
 */
export function usePartnerIntegration(id: string | null) {
  return useQuery<PartnerIntegrationDetail | null>({
    queryKey: ["partner-integration", id],
    queryFn: async () => {
      if (!id) return null
      const res = await fetch(`/api/partner/integrations/${id}`)
      if (res.status === 404) {
        return null
      }
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch integration")
      }
      const json = await res.json()
      return json.data?.integration || null
    },
    enabled: !!id,
  })
}

/**
 * Hook to create a new partner integration
 */
export function useCreatePartnerIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreatePartnerIntegrationInput) => {
      const res = await fetch("/api/partner/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create integration")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-integrations"] })
    },
  })
}

/**
 * Hook to update a partner integration
 */
export function useUpdatePartnerIntegration(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdatePartnerIntegrationInput) => {
      const res = await fetch(`/api/partner/integrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update integration")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-integrations"] })
      queryClient.invalidateQueries({ queryKey: ["partner-integration", id] })
    },
  })
}

/**
 * Hook to delete a partner integration
 */
export function useDeletePartnerIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/partner/integrations/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to delete integration")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-integrations"] })
    },
  })
}

/**
 * Hook to set an integration as default
 */
export function useSetDefaultIntegration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/partner/integrations/${id}/set-default`, {
        method: "POST",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to set as default")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-integrations"] })
    },
  })
}

// =============================================================================
// HOOKS - Workspace Integration Assignments
// =============================================================================

/**
 * Hook to get workspace integration assignments
 */
export function useWorkspaceIntegrationAssignments(workspaceId: string | null) {
  return useQuery<{
    workspace: { id: string; name: string; slug: string }
    assignments: WorkspaceIntegrationAssignment[]
    available_integrations: AvailableIntegration[]
  } | null>({
    queryKey: ["workspace-integration-assignments", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null
      const res = await fetch(`/api/partner/workspaces/${workspaceId}/integrations`)
      if (res.status === 404) {
        return null
      }
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch assignments")
      }
      const json = await res.json()
      return json.data || null
    },
    enabled: !!workspaceId,
  })
}

/**
 * Hook to assign an integration to a workspace
 */
export function useAssignWorkspaceIntegration(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { provider: string; partner_integration_id: string }) => {
      const res = await fetch(`/api/partner/workspaces/${workspaceId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to assign integration")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-integration-assignments", workspaceId] })
      queryClient.invalidateQueries({ queryKey: ["partner-integrations"] })
    },
  })
}

/**
 * Hook to remove an integration assignment from a workspace
 */
export function useRemoveWorkspaceIntegration(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/partner/workspaces/${workspaceId}/integrations/${provider}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to remove assignment")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-integration-assignments", workspaceId] })
      queryClient.invalidateQueries({ queryKey: ["partner-integrations"] })
    },
  })
}


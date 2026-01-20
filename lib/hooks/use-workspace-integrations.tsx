"use client"

/**
 * @deprecated This module is deprecated. Use org-level integration hooks instead.
 * 
 * Migration guide:
 * - usePartnerIntegrations() - List org-level integrations
 * - useWorkspaceIntegrationAssignments() - Get workspace assignments
 * - useAssignWorkspaceIntegration() - Assign org integration to workspace
 * 
 * Import from: '@/lib/hooks/use-partner-integrations'
 * 
 * Sunset date: 2026-06-01
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type {
  CreateWorkspaceIntegrationInput,
  UpdateWorkspaceIntegrationInput,
} from "@/types/database.types"

// Log deprecation warning once per session
let hasWarnedDeprecation = false
function warnDeprecation(hookName: string): void {
  if (process.env.NODE_ENV === "development" && !hasWarnedDeprecation) {
    console.warn(
      `[DEPRECATED] ${hookName} is deprecated. ` +
      `Use hooks from '@/lib/hooks/use-partner-integrations' instead. ` +
      `Workspace-level integrations will be removed after 2026-06-01.`
    )
    hasWarnedDeprecation = true
  }
}

// Safe integration type for listing (without actual keys)
export interface WorkspaceIntegrationSafe {
  id: string
  workspace_id: string
  provider: string
  name: string
  has_public_key: boolean
  additional_keys_count: number
  is_active: boolean
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

// Detailed integration type for single fetch (with key availability info)
export interface WorkspaceIntegrationDetails {
  id: string
  workspace_id: string
  provider: string
  name: string
  has_default_secret_key: boolean
  has_default_public_key: boolean
  additional_keys: Array<{
    id: string
    name: string
    has_secret_key: boolean
    has_public_key: boolean
  }>
  is_active: boolean
  config: Record<string, unknown>
  created_at: string
  updated_at: string
  additional_keys_count: number
}

/**
 * @deprecated Use usePartnerIntegrations and useWorkspaceIntegrationAssignments instead.
 */
export function useWorkspaceIntegrations() {
  warnDeprecation("useWorkspaceIntegrations")
  
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceIntegrationSafe[]>({
    queryKey: ["workspace-integrations", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/integrations`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch integrations")
      }
      const json = await res.json()
      return json.data?.data || []
    },
    enabled: !!workspaceSlug,
  })
}

/**
 * @deprecated Use org-level integration hooks instead.
 */
export function useWorkspaceIntegration(provider: string) {
  warnDeprecation("useWorkspaceIntegration")
  
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceIntegrationDetails | null>({
    queryKey: ["workspace-integration", workspaceSlug, provider],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/integrations/${provider}`)
      if (res.status === 404) {
        return null
      }
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch integration")
      }
      const json = await res.json()
      const data = json.data
      return {
        ...data,
        additional_keys_count: data.additional_keys?.length || 0,
      }
    },
    enabled: !!workspaceSlug && !!provider,
  })
}

/**
 * @deprecated Use org-level integration hooks instead.
 * Hook to get integration details for a specific provider (for agent form)
 */
export function useProviderIntegration(provider: string) {
  warnDeprecation("useProviderIntegration")
  
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceIntegrationDetails | null>({
    queryKey: ["workspace-integration", workspaceSlug, provider],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/integrations/${provider}`)
      if (res.status === 404) {
        return null
      }
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch integration")
      }
      const json = await res.json()
      const data = json.data
      return {
        ...data,
        additional_keys_count: data.additional_keys?.length || 0,
      }
    },
    enabled: !!workspaceSlug && !!provider,
    staleTime: 30000,
  })
}

/**
 * @deprecated Use org-level integration hooks instead.
 * Hook to get all integrations with details (for agent form dropdown)
 */
export function useAllIntegrationsWithDetails() {
  warnDeprecation("useAllIntegrationsWithDetails")
  
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceIntegrationDetails[]>({
    queryKey: ["workspace-integrations-details", workspaceSlug],
    queryFn: async () => {
      // First get list of integrations
      const listRes = await fetch(`/api/w/${workspaceSlug}/integrations`)
      if (!listRes.ok) {
        return []
      }
      const listJson = await listRes.json()
      const integrations = listJson.data?.data || []

      // Then fetch details for each
      const details = await Promise.all(
        integrations.map(async (integration: WorkspaceIntegrationSafe) => {
          const detailRes = await fetch(
            `/api/w/${workspaceSlug}/integrations/${integration.provider}`
          )
          if (!detailRes.ok) {
            return null
          }
          const detailJson = await detailRes.json()
          const data = detailJson.data
          return {
            ...data,
            additional_keys_count: data.additional_keys?.length || 0,
          }
        })
      )

      return details.filter(Boolean) as WorkspaceIntegrationDetails[]
    },
    enabled: !!workspaceSlug,
    staleTime: 30000,
  })
}

/**
 * @deprecated Use useCreatePartnerIntegration from '@/lib/hooks/use-partner-integrations' instead.
 */
export function useCreateWorkspaceIntegration() {
  warnDeprecation("useCreateWorkspaceIntegration")
  
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateWorkspaceIntegrationInput) => {
      const res = await fetch(`/api/w/${workspaceSlug}/integrations`, {
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
      queryClient.invalidateQueries({ queryKey: ["workspace-integrations", workspaceSlug] })
      queryClient.invalidateQueries({
        queryKey: ["workspace-integrations-details", workspaceSlug],
      })
    },
  })
}

/**
 * @deprecated Use useUpdatePartnerIntegration from '@/lib/hooks/use-partner-integrations' instead.
 */
export function useUpdateWorkspaceIntegration(provider: string) {
  warnDeprecation("useUpdateWorkspaceIntegration")
  
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UpdateWorkspaceIntegrationInput) => {
      const res = await fetch(`/api/w/${workspaceSlug}/integrations/${provider}`, {
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
      queryClient.invalidateQueries({ queryKey: ["workspace-integrations", workspaceSlug] })
      queryClient.invalidateQueries({
        queryKey: ["workspace-integration", workspaceSlug, provider],
      })
      queryClient.invalidateQueries({
        queryKey: ["workspace-integrations-details", workspaceSlug],
      })
    },
  })
}

/**
 * @deprecated Use useDeletePartnerIntegration from '@/lib/hooks/use-partner-integrations' instead.
 */
export function useDeleteWorkspaceIntegration() {
  warnDeprecation("useDeleteWorkspaceIntegration")
  
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/w/${workspaceSlug}/integrations/${provider}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to disconnect integration")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-integrations", workspaceSlug] })
      queryClient.invalidateQueries({
        queryKey: ["workspace-integrations-details", workspaceSlug],
      })
    },
  })
}
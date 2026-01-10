"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"

export interface WorkspaceAssignedIntegration {
  provider: string
  integration_id: string
  integration_name: string
  is_default: boolean
  has_secret_key: boolean
  has_public_key: boolean
}

/**
 * Hook to get the workspace's assigned integration for a specific provider
 * This fetches from the new org-level integration assignment system
 */
export function useWorkspaceAssignedIntegration(provider: string) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceAssignedIntegration | null>({
    queryKey: ["workspace-assigned-integration", workspaceSlug, provider],
    queryFn: async () => {
      // Fetch from the workspace-level endpoint that returns assigned integration
      const res = await fetch(`/api/w/${workspaceSlug}/assigned-integration/${provider}`)
      if (res.status === 404) {
        return null
      }
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch assigned integration")
      }
      const json = await res.json()
      return json.data || null
    },
    enabled: !!workspaceSlug && !!provider,
    staleTime: 30000,
  })
}

/**
 * Hook to get all assigned integrations for the workspace
 */
export function useWorkspaceAssignedIntegrations() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceAssignedIntegration[]>({
    queryKey: ["workspace-assigned-integrations", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/assigned-integrations`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch assigned integrations")
      }
      const json = await res.json()
      return json.data?.integrations || []
    },
    enabled: !!workspaceSlug,
    staleTime: 30000,
  })
}


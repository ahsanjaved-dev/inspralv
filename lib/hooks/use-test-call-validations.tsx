"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { AIAgent } from "@/types/database.types"

interface TestCallValidation {
  canCall: boolean
  reason?: string
  solution?: string
  isLoading: boolean
}

interface AssignedIntegrationData {
  provider: string
  integration_id: string
  integration_name: string
  is_default: boolean
  has_secret_key: boolean
  has_public_key: boolean
}

export function useTestCallValidation(agent: AIAgent): TestCallValidation {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  // NEW: Fetch from org-level assigned integration endpoint
  const { data: assignedIntegration, isLoading } = useQuery<AssignedIntegrationData | null>({
    queryKey: ["workspace-assigned-integration", workspaceSlug, agent.provider],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/assigned-integration/${agent.provider}`)
      if (res.status === 404) return null
      if (!res.ok) return null
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug && !!agent.provider,
    staleTime: 30000,
  })

  // Still loading integration data
  if (isLoading) {
    return { canCall: false, isLoading: true }
  }

  // No integration assigned
  if (!assignedIntegration) {
    return {
      canCall: false,
      reason: `No ${agent.provider.toUpperCase()} integration`,
      solution: `Contact your org admin to assign a ${agent.provider.toUpperCase()} key to this workspace.`,
      isLoading: false,
    }
  }

  // No external agent ID
  if (!agent.external_agent_id) {
    return {
      canCall: false,
      reason: "Agent not synced",
      solution: "Save the agent to sync with the provider.",
      isLoading: false,
    }
  }

  // Check for required keys based on provider
  if (agent.provider === "vapi") {
    // VAPI needs public key for test calls
    if (!assignedIntegration.has_public_key) {
      return {
        canCall: false,
        reason: "No public API key",
        solution: "Contact your org admin to add a public key to the integration.",
        isLoading: false,
      }
    }
  }

  if (agent.provider === "retell") {
    // Retell needs secret key
    if (!assignedIntegration.has_secret_key) {
      return {
        canCall: false,
        reason: "No secret API key",
        solution: "Contact your org admin to add a secret key to the integration.",
        isLoading: false,
      }
    }
  }

  return { canCall: true, isLoading: false }
}
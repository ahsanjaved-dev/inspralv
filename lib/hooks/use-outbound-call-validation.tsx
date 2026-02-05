"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { AIAgent } from "@/types/database.types"

export interface OutboundCallValidation {
  canCall: boolean
  reason?: string
  solution?: string
  isLoading: boolean
}

interface IntegrationConfigData {
  provider: string
  integration_id: string
  integration_name: string
  is_default: boolean
  has_secret_key: boolean
  has_public_key: boolean
  has_shared_outbound_phone?: boolean
  shared_outbound_phone_number?: string
}

/**
 * Validates whether an outbound call can be made for the given agent.
 * Checks:
 * 1. Agent is synced with provider
 * 2. Integration has secret API key
 * 3. Phone number is configured (agent-level OR shared outbound at workspace level)
 */
export function useOutboundCallValidation(agent: AIAgent): OutboundCallValidation {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  // Fetch integration config which includes shared outbound phone number info
  const { data: integrationConfig, isLoading } = useQuery<IntegrationConfigData | null>({
    queryKey: ["workspace-outbound-config", workspaceSlug, agent.provider],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/outbound-config/${agent.provider}`)
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

  // Check if provider supports outbound calls
  if (agent.provider !== "vapi" && agent.provider !== "retell") {
    return {
      canCall: false,
      reason: "Outbound not supported",
      solution: "Only VAPI and Retell agents can make outbound calls.",
      isLoading: false,
    }
  }

  // No integration configured
  if (!integrationConfig) {
    return {
      canCall: false,
      reason: `No ${agent.provider.toUpperCase()} integration`,
      solution: `Contact your org admin to assign a ${agent.provider.toUpperCase()} key to this workspace.`,
      isLoading: false,
    }
  }

  // No secret API key
  if (!integrationConfig.has_secret_key) {
    return {
      canCall: false,
      reason: "No secret API key",
      solution: "Contact your org admin to add a secret key to the integration.",
      isLoading: false,
    }
  }

  // No external agent ID (not synced)
  if (!agent.external_agent_id) {
    return {
      canCall: false,
      reason: "Agent not synced",
      solution: "Save the agent to sync with the provider first.",
      isLoading: false,
    }
  }

  // Check for phone number configuration at AGENT level
  // For outbound agents, we require an agent-level phone number to be assigned
  // The shared outbound number at workspace level should NOT be used as automatic fallback
  // because users expect explicit phone number selection for outbound calls
  const hasAgentPhone = !!(
    agent.assigned_phone_number_id ||
    agent.external_phone_number ||
    (agent.config as any)?.telephony?.vapi_phone_number_id
  )

  if (!hasAgentPhone) {
    return {
      canCall: false,
      reason: "No phone number configured",
      solution: "Assign a phone number to this agent in the agent configuration.",
      isLoading: false,
    }
  }

  // All checks passed
  return { canCall: true, isLoading: false }
}


"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { AIAgent, IntegrationApiKeys, AgentApiKeyConfig } from "@/types/database.types"

interface TestCallValidation {
  canCall: boolean
  reason?: string
  solution?: string
  isLoading: boolean
}

interface IntegrationData {
  provider: string
  api_keys: IntegrationApiKeys
  is_active: boolean
}

export function useTestCallValidation(agent: AIAgent): TestCallValidation {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  const { data: integration, isLoading } = useQuery<IntegrationData | null>({
    queryKey: ["workspace-integration-keys", workspaceSlug, agent.provider],
    queryFn: async () => {
      // This endpoint returns safe data with has_* flags
      const res = await fetch(`/api/w/${workspaceSlug}/integrations/${agent.provider}`)
      if (res.status === 404) return null
      if (!res.ok) return null
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug && !!agent.provider,
    staleTime: 30000,
  })

  // Check if synthflow (not supported)
  if (agent.provider === "synthflow") {
    return {
      canCall: false,
      reason: "Not supported",
      solution: "Synthflow doesn't support browser test calls.",
      isLoading: false,
    }
  }

  // Still loading integration data
  if (isLoading) {
    return { canCall: false, isLoading: true }
  }

  // No integration found
  if (!integration) {
    return {
      canCall: false,
      reason: `No ${agent.provider.toUpperCase()} integration`,
      solution: `Connect ${agent.provider.toUpperCase()} in the Integrations page.`,
      isLoading: false,
    }
  }

  // Integration not active
  if (!integration.is_active) {
    return {
      canCall: false,
      reason: "Integration is inactive",
      solution: "Activate the integration in settings.",
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

  // Check for required keys based on provider and agent config
  const apiKeyConfig = agent.config?.api_key_config

  if (agent.provider === "vapi") {
    // VAPI needs public key
    const hasPublicKey = checkHasPublicKey(integration, apiKeyConfig)
    if (!hasPublicKey) {
      return {
        canCall: false,
        reason: "No public API key",
        solution: "Add a public key in integration settings.",
        isLoading: false,
      }
    }
  }

  if (agent.provider === "retell") {
    // Retell needs secret key
    const hasSecretKey = checkHasSecretKey(integration, apiKeyConfig)
    if (!hasSecretKey) {
      return {
        canCall: false,
        reason: "No secret API key",
        solution: "Add a secret key in integration settings.",
        isLoading: false,
      }
    }
  }

  return { canCall: true, isLoading: false }
}

function checkHasPublicKey(integration: any, config?: AgentApiKeyConfig): boolean {
  if (!config?.public_key || config.public_key.type === "none") {
    // Check if default public key exists
    return !!integration.has_default_public_key
  }
  if (config.public_key.type === "default") {
    return !!integration.has_default_public_key
  }
  if (config.public_key.type === "additional" && config.public_key.additional_key_id) {
    const additionalKey = integration.additional_keys?.find(
      (k: any) => k.id === config.public_key?.additional_key_id
    )
    return !!additionalKey?.has_public_key
  }
  return false
}

function checkHasSecretKey(integration: any, config?: AgentApiKeyConfig): boolean {
  if (!config?.secret_key || config.secret_key.type === "none") {
    // Check if default secret key exists
    return !!integration.has_default_secret_key
  }
  if (config.secret_key.type === "default") {
    return !!integration.has_default_secret_key
  }
  if (config.secret_key.type === "additional" && config.secret_key.additional_key_id) {
    const additionalKey = integration.additional_keys?.find(
      (k: any) => k.id === config.secret_key?.additional_key_id
    )
    return !!additionalKey?.has_secret_key
  }
  return false
}
"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { api } from "@/lib/api/fetcher"
import type { AIAgent, AgentCustomVariableDefinition } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

interface AddAgentCustomVariableInput {
  name: string
  description: string
  default_value: string
  is_required: boolean
  category: "agent" | "contact" | "business" | "custom"
}

interface UpdateAgentCustomVariableInput extends AddAgentCustomVariableInput {
  id: string
}

interface AgentConfig {
  system_prompt?: string
  first_message?: string
  voice_id?: string
  custom_variables?: AgentCustomVariableDefinition[]
  [key: string]: unknown
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract custom variables from agent config
 */
export function getAgentCustomVariables(agent: AIAgent | null | undefined): AgentCustomVariableDefinition[] {
  if (!agent) return []
  const config = agent.config as AgentConfig | null
  return config?.custom_variables || []
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to add a new custom variable to an agent
 */
export function useAddAgentCustomVariable(agentId: string) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variable: AddAgentCustomVariableInput) => {
      // First, get the current agent to access existing config
      const currentAgent = await api.get<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`)
      const currentConfig = (currentAgent.config as AgentConfig) || {}
      const existingVariables = currentConfig.custom_variables || []

      // Check for duplicate name
      const isDuplicate = existingVariables.some(
        (v) => v.name.toLowerCase() === variable.name.toLowerCase()
      )
      if (isDuplicate) {
        throw new Error(`A variable named "${variable.name}" already exists for this agent`)
      }

      // Create new variable with generated ID and timestamp
      const newVariable: AgentCustomVariableDefinition = {
        ...variable,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      }

      // Update agent config with new variable
      const updatedConfig = {
        ...currentConfig,
        custom_variables: [...existingVariables, newVariable],
      }

      return api.patch<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`, {
        config: updatedConfig,
      })
    },
    onSuccess: () => {
      // Invalidate agent queries to refetch
      queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, agentId] })
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    },
  })
}

/**
 * Hook to update an existing custom variable on an agent
 */
export function useUpdateAgentCustomVariable(agentId: string) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...variable }: UpdateAgentCustomVariableInput) => {
      // First, get the current agent to access existing config
      const currentAgent = await api.get<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`)
      const currentConfig = (currentAgent.config as AgentConfig) || {}
      const existingVariables = currentConfig.custom_variables || []

      // Find the variable to update
      const varIndex = existingVariables.findIndex((v) => v.id === id)
      if (varIndex === -1) {
        throw new Error("Variable not found")
      }

      const existingVar = existingVariables[varIndex]!

      // Check for duplicate name (excluding current variable)
      const isDuplicateName = existingVariables.some(
        (v, i) => i !== varIndex && v.name.toLowerCase() === variable.name.toLowerCase()
      )
      if (isDuplicateName) {
        throw new Error(`A variable named "${variable.name}" already exists for this agent`)
      }

      // Update the variable
      const updatedVariables = [...existingVariables]
      updatedVariables[varIndex] = {
        ...existingVar,
        ...variable,
        id, // Keep original ID
        created_at: existingVar.created_at, // Keep original timestamp
      }

      // Update agent config
      const updatedConfig = {
        ...currentConfig,
        custom_variables: updatedVariables,
      }

      return api.patch<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`, {
        config: updatedConfig,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, agentId] })
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    },
  })
}

/**
 * Hook to delete a custom variable from an agent
 */
export function useDeleteAgentCustomVariable(agentId: string) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variableId: string) => {
      // First, get the current agent to access existing config
      const currentAgent = await api.get<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`)
      const currentConfig = (currentAgent.config as AgentConfig) || {}
      const existingVariables = currentConfig.custom_variables || []

      // Find the variable to delete
      const varToDelete = existingVariables.find((v) => v.id === variableId)
      if (!varToDelete) {
        throw new Error("Variable not found")
      }

      // Remove the variable
      const updatedVariables = existingVariables.filter((v) => v.id !== variableId)

      // Update agent config
      const updatedConfig = {
        ...currentConfig,
        custom_variables: updatedVariables,
      }

      return api.patch<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`, {
        config: updatedConfig,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, agentId] })
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    },
  })
}

/**
 * Hook to bulk update all custom variables for an agent
 * Useful for reordering or batch operations
 */
export function useBulkUpdateAgentCustomVariables(agentId: string) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: AgentCustomVariableDefinition[]) => {
      // First, get the current agent to access existing config
      const currentAgent = await api.get<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`)
      const currentConfig = (currentAgent.config as AgentConfig) || {}

      // Update agent config with new variables array
      const updatedConfig = {
        ...currentConfig,
        custom_variables: variables,
      }

      return api.patch<AIAgent>(`/api/w/${workspaceSlug}/agents/${agentId}`, {
        config: updatedConfig,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, agentId] })
      queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    },
  })
}


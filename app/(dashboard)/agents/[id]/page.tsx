"use client"

import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentForm } from "@/components/agents/agent-form"
import { useAgent, useUpdateAgent } from "@/lib/hooks/use-agents"
import type { CreateAgentInput } from "@/types/api.types"
import Link from "next/link"

export default function EditAgentPage() {
  const router = useRouter()
  const params = useParams()
  const agentId = params.id as string

  const { data: agent, isLoading, error } = useAgent(agentId)
  const updateMutation = useUpdateAgent()

  const handleSubmit = async (data: CreateAgentInput) => {
    try {
      await updateMutation.mutateAsync({ id: agentId, data })
      router.push("/agents")
    } catch (error) {
      console.error("Failed to update agent:", error)
    }
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="mt-2 text-muted-foreground">Loading agent...</p>
        </div>
      </div>
    )
  }

  // Error State
  if (error || !agent) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full w-fit mx-auto">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-2xl font-bold mt-4">Agent not found</h2>
        <p className="text-muted-foreground mt-2">
          The agent you're looking for doesn't exist or you don't have access to it.
        </p>
        <Button asChild className="mt-6">
          <Link href="/agents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agents
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/agents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Agent</h1>
          <p className="text-muted-foreground mt-1">Update configuration for {agent.name}</p>
        </div>
      </div>

      {/* Error Display */}
      {updateMutation.error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <p className="font-medium">Failed to update agent</p>
          <p className="text-sm mt-1">{updateMutation.error.message}</p>
        </div>
      )}

      {/* Form */}
      <AgentForm
        initialData={agent}
        onSubmit={handleSubmit}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  )
}

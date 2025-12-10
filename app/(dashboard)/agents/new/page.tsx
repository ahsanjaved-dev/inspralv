"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentForm } from "@/components/agents/agent-form"
import { useCreateAgent } from "@/lib/hooks/use-agents"
import type { CreateAgentInput } from "@/types/api.types"
import Link from "next/link"

export default function NewAgentPage() {
  const router = useRouter()
  const createMutation = useCreateAgent()

  const handleSubmit = async (data: CreateAgentInput) => {
    try {
      await createMutation.mutateAsync(data)
      router.push("/agents")
    } catch (error) {
      // Error is handled by the mutation
      console.error("Failed to create agent:", error)
    }
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
          <h1 className="text-3xl font-bold">Create Agent</h1>
          <p className="text-muted-foreground mt-1">Configure a new AI voice agent</p>
        </div>
      </div>

      {/* Error Display */}
      {createMutation.error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <p className="font-medium">Failed to create agent</p>
          <p className="text-sm mt-1">{createMutation.error.message}</p>
        </div>
      )}

      {/* Form */}
      <AgentForm onSubmit={handleSubmit} isSubmitting={createMutation.isPending} />
    </div>
  )
}

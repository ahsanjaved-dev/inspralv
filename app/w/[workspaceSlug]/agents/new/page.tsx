"use client"

import { useRouter, useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AgentWizard } from "@/components/workspace/agents/agent-wizard"
import { useCreateWorkspaceAgent } from "@/lib/hooks/use-workspace-agents"
import type { CreateWorkspaceAgentInput } from "@/types/api.types"
import Link from "next/link"
import { toast } from "sonner"

export default function NewWorkspaceAgentPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  const createMutation = useCreateWorkspaceAgent()

  const handleSubmit = async (data: CreateWorkspaceAgentInput) => {
    try {
      await createMutation.mutateAsync(data)
      toast.success("Agent created successfully!")
      router.push(`/w/${workspaceSlug}/agents`)
    } catch (error: unknown) {
      console.error("[NewWorkspaceAgentPage] Create agent error:", error)
      toast.error("Failed to create agent. Please try again.")
    }
  }

  const handleCancel = () => {
    router.push(`/w/${workspaceSlug}/agents`)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/w/${workspaceSlug}/agents`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Agent</h1>
          <p className="text-muted-foreground mt-1">
            Configure a new AI voice agent for your workspace
          </p>
        </div>
      </div>

      {createMutation.error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <p className="font-medium">Failed to create agent</p>
          <p className="text-sm mt-1">Please try again. If the problem continues, contact support.</p>
        </div>
      )}

      <AgentWizard
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        onCancel={handleCancel}
      />
    </div>
  )
}

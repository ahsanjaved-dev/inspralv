"use client"

import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AgentWizard } from "@/components/workspace/agents/agent-wizard"
import { useCreateWorkspaceAgent } from "@/lib/hooks/use-workspace-agents"
import { useCanCreateAgent } from "@/lib/hooks/use-workspace-limits"
import type { CreateWorkspaceAgentInput } from "@/types/api.types"
import Link from "next/link"
import { toast } from "sonner"

export default function NewWorkspaceAgentPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  const createMutation = useCreateWorkspaceAgent()
  const { canCreate, usageText, limitReachedMessage, isLoading: isLoadingLimits } = useCanCreateAgent()

  const handleSubmit = async (data: CreateWorkspaceAgentInput) => {
    try {
      await createMutation.mutateAsync(data)
      
      // Check if outbound agent without phone number
      const isOutboundWithoutPhone = data.agent_direction === "outbound" && !data.assigned_phone_number_id
      
      if (isOutboundWithoutPhone) {
        toast.success("Agent created successfully!", {
          description: "Note: Configure a phone number to enable the 'Call Me' feature.",
          duration: 5000,
        })
      } else {
        toast.success("Agent created successfully!")
      }
      
      router.push(`/w/${workspaceSlug}/agents`)
    } catch (error: unknown) {
      console.error("[NewWorkspaceAgentPage] Create agent error:", error)
      
      // Extract specific error message from API response
      let errorMessage = "Failed to create agent. Please try again."
      if (error && typeof error === "object") {
        const err = error as { message?: string; error?: string }
        if (err.message) {
          errorMessage = err.message
        } else if (err.error) {
          errorMessage = err.error
        }
      }
      
      toast.error(errorMessage)
    }
  }

  const handleCancel = () => {
    router.push(`/w/${workspaceSlug}/agents`)
  }

  // Show loading state while checking limits
  if (isLoadingLimits) {
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
              Checking workspace limits...
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Show limit reached message if user cannot create more agents
  if (!canCreate) {
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

        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-full">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-amber-800 dark:text-amber-200">
                  Agent Limit Reached
                </CardTitle>
                <CardDescription className="text-amber-700 dark:text-amber-300">
                  {usageText}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-amber-800 dark:text-amber-200">
              {limitReachedMessage || "You have reached your agent limit. Please upgrade your plan to create more agents."}
            </p>
            <div className="flex gap-3">
              <Button asChild variant="outline">
                <Link href={`/w/${workspaceSlug}/agents`}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Agents
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/w/${workspaceSlug}/settings/billing`}>
                  Upgrade Plan
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">
              Configure a new AI voice agent for your workspace
            </p>
            {usageText && (
              <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                {usageText}
              </span>
            )}
          </div>
        </div>
      </div>

      {createMutation.error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <p className="font-medium">Failed to create agent</p>
          <p className="text-sm mt-1">
            {(() => {
              const err = createMutation.error as { message?: string; error?: string }
              if (err?.message) return err.message
              if (err?.error) return err.error
              return "Please check your inputs and try again. If the problem continues, contact support."
            })()}
          </p>
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

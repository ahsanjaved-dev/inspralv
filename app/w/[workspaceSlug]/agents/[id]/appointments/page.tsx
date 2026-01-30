"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AppointmentsList } from "@/components/workspace/agents/appointments-list"
import { useWorkspaceAgent } from "@/lib/hooks/use-workspace-agents"

export default function AgentAppointmentsPage() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const agentId = params.id as string

  const { data: agent, isLoading, error } = useWorkspaceAgent(agentId)

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
          <Link href={`/w/${workspaceSlug}/agents`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agents
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/w/${workspaceSlug}/agents`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Appointments</h1>
          <p className="text-muted-foreground mt-1">
            View and manage appointments for <span className="font-medium text-foreground">{agent.name}</span>
          </p>
        </div>
      </div>

      {/* Appointments List */}
      <AppointmentsList
        workspaceSlug={workspaceSlug}
        agentId={agentId}
      />
    </div>
  )
}


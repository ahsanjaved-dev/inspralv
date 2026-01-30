"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2, AlertCircle, Settings, Calendar, CalendarCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkspaceAgentForm } from "@/components/workspace/agents/workspace-agent-form"
import { AppointmentsList } from "@/components/workspace/agents/appointments-list"
import { CalendarConfig } from "@/components/workspace/agents/calendar-config"
import { useWorkspaceAgent, useUpdateWorkspaceAgent } from "@/lib/hooks/use-workspace-agents"
import type { CreateWorkspaceAgentInput } from "@/types/api.types"
import Link from "next/link"
import { toast } from "sonner"

export default function EditWorkspaceAgentPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const agentId = params.id as string

  const { data: agent, isLoading, error } = useWorkspaceAgent(agentId)
  const updateMutation = useUpdateWorkspaceAgent()

  const handleSubmit = async (data: CreateWorkspaceAgentInput) => {
    try {
      await updateMutation.mutateAsync({ id: agentId, data })
      toast.success("Agent updated successfully!")
      router.push(`/w/${workspaceSlug}/agents`)
    } catch (error: any) {
      console.error("[EditWorkspaceAgentPage] Update agent error:", error)
      toast.error("Failed to update agent. Please try again.")
    }
  }

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
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/w/${workspaceSlug}/agents`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{agent.name}</h1>
          <p className="text-muted-foreground mt-1">Manage agent settings and view appointments</p>
        </div>
      </div>

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarCog className="h-4 w-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="appointments" className="gap-2">
            <Calendar className="h-4 w-4" />
            Appointments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          {updateMutation.error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-200 dark:border-red-800">
              <p className="font-medium">Failed to update agent</p>
              <p className="text-sm mt-1">Please try again. If the problem continues, contact support.</p>
            </div>
          )}

          <WorkspaceAgentForm
            initialData={agent}
            onSubmit={handleSubmit}
            isSubmitting={updateMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarConfig
            workspaceSlug={workspaceSlug}
            agentId={agentId}
          />
        </TabsContent>

        <TabsContent value="appointments">
          <AppointmentsList
            workspaceSlug={workspaceSlug}
            agentId={agentId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

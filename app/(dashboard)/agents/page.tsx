"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AgentCard } from "@/components/agents/agent-card"
import { DeleteAgentDialog } from "@/components/agents/delete-agent-dialog"
import { useAgents, useDeleteAgent, useUpdateAgent } from "@/lib/hooks/use-agents"
import { Plus, Search, Bot, Loader2, Building2 } from "lucide-react"
import type { AIAgent, Department } from "@/types/database.types"

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState<string>("all")
  const [departmentFilter, setDepartmentFilter] = useState<string>("all")
  const [deleteAgent, setDeleteAgent] = useState<AIAgent | null>(null)

  // Fetch departments for filter
  const { data: departmentsData } = useQuery({
    queryKey: ["departments-for-filter"],
    queryFn: async () => {
      const res = await fetch("/api/departments")
      if (!res.ok) throw new Error("Failed to fetch departments")
      const json = await res.json()
      return json.data.data as Department[]
    },
  })

  const { data, isLoading, error } = useAgents({
    provider: providerFilter !== "all" ? providerFilter : undefined,
    department_id: departmentFilter !== "all" ? departmentFilter : undefined,
  })

  const deleteMutation = useDeleteAgent()
  const updateMutation = useUpdateAgent()

  const filteredAgents = data?.data?.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDelete = (agent: AIAgent) => {
    setDeleteAgent(agent)
  }

  const confirmDelete = async () => {
    if (!deleteAgent) return
    try {
      await deleteMutation.mutateAsync(deleteAgent.id)
      setDeleteAgent(null)
    } catch (error) {
      console.error("Failed to delete agent:", error)
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { is_active: isActive } })
    } catch (error) {
      console.error("Failed to toggle agent status:", error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground mt-1">Create and manage your AI voice agents</p>
        </div>
        <Button asChild>
          <Link href="/agents/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Department Filter */}
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departmentsData?.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Provider Filter */}
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            <SelectItem value="vapi">Vapi</SelectItem>
            <SelectItem value="retell">Retell AI</SelectItem>
            <SelectItem value="synthflow">Synthflow</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ... rest of the component stays the same ... */}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-center py-12 border rounded-lg bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">Failed to load agents. Please try again.</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && filteredAgents?.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No agents yet</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            {searchQuery
              ? "No agents match your search. Try a different query."
              : "Get started by creating your first AI voice agent."}
          </p>
          {!searchQuery && (
            <Button asChild className="mt-4">
              <Link href="/agents/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Agent
              </Link>
            </Button>
          )}
        </div>
      )}

      {filteredAgents && filteredAgents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {filteredAgents?.length} of {data.total} agents
        </div>
      )}

      <DeleteAgentDialog
        open={!!deleteAgent}
        onOpenChange={(open) => !open && setDeleteAgent(null)}
        onConfirm={confirmDelete}
        isDeleting={deleteMutation.isPending}
        agentName={deleteAgent?.name}
      />
    </div>
  )
}

"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WorkspaceAgentCard } from "@/components/workspace/agents/workspace-agent-card"
import { DeleteAgentDialog } from "@/components/agents/delete-agent-dialog"
import {
  useWorkspaceAgents,
  useDeleteWorkspaceAgent,
  useUpdateWorkspaceAgent,
} from "@/lib/hooks/use-workspace-agents"
import { Plus, Search, Bot, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import type { AIAgent } from "@/types/database.types"

const PAGE_SIZE = 9 // Show 9 agents per page (3x3 grid)

export default function WorkspaceAgentsPage() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  const [searchQuery, setSearchQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [directionFilter, setDirectionFilter] = useState<string>("all")
  const [deleteAgent, setDeleteAgent] = useState<AIAgent | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  // Fetch ALL agents with a large page size to enable client-side pagination
  const { data, isLoading, error } = useWorkspaceAgents({
    provider: providerFilter !== "all" ? providerFilter : undefined,
    isActive: statusFilter === "all" ? undefined : statusFilter === "active",
    pageSize: 1000, // Fetch all agents at once for client-side pagination
  })

  const deleteMutation = useDeleteWorkspaceAgent()
  const updateMutation = useUpdateWorkspaceAgent()

  // Filter agents based on search and direction
  const filteredAgents = useMemo(() => {
    return data?.data?.filter((agent) => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesDirection = directionFilter === "all" || agent.agent_direction === directionFilter
      return matchesSearch && matchesDirection
    }) || []
  }, [data?.data, searchQuery, directionFilter])

  // Calculate pagination
  const totalFilteredAgents = filteredAgents.length
  const totalPages = Math.ceil(totalFilteredAgents / PAGE_SIZE)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const paginatedAgents = filteredAgents.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setCurrentPage(1)
  }

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground mt-1">Create and manage your AI voice agents</p>
        </div>
        <Button asChild>
          <Link href={`/w/${workspaceSlug}/agents/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>

        {/* Provider Filter */}
        <Select value={providerFilter} onValueChange={handleFilterChange(setProviderFilter)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            <SelectItem value="vapi">Vapi</SelectItem>
            <SelectItem value="retell">Retell AI</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {/* Direction Filter */}
        <Select value={directionFilter} onValueChange={handleFilterChange(setDirectionFilter)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="All Directions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pagination Controls - Top right beneath filters */}
      {!isLoading && !error && totalFilteredAgents > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, totalFilteredAgents)} of {totalFilteredAgents} agents
          </p>
          
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-12 border rounded-lg bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">Failed to load agents. Please try again.</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredAgents.length === 0 && (
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
              <Link href={`/w/${workspaceSlug}/agents/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create Agent
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* Agents Grid */}
      {paginatedAgents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedAgents.map((agent) => (
            <WorkspaceAgentCard
              key={agent.id}
              agent={agent}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* Delete Dialog */}
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

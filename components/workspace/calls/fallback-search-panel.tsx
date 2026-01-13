"use client"

import { useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  RotateCcw,
  Zap,
  Sparkles,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================================
// TYPES
// ============================================================================

interface FallbackSearchPanelProps {
  agents: Array<{ id: string; name: string }>
  onFiltersChange: (filters: FallbackFilters) => void
  totalResults: number
  currentPage: number
  totalPages: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  isLoading?: boolean
  className?: string
  showAlgoliaBanner?: boolean
  onConfigureAlgolia?: () => void
}

export interface FallbackFilters {
  search: string
  status: string
  direction: string
  agentId: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FallbackSearchPanel({
  agents,
  onFiltersChange,
  totalResults,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
  className,
  showAlgoliaBanner = true,
  onConfigureAlgolia,
}: FallbackSearchPanelProps) {
  // Filter state
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [direction, setDirection] = useState("all")
  const [agentId, setAgentId] = useState("all")
  const [showFilters, setShowFilters] = useState(false)

  // Notify parent of filter changes
  const updateFilters = useCallback((newFilters: Partial<FallbackFilters>) => {
    const filters: FallbackFilters = {
      search: newFilters.search ?? search,
      status: newFilters.status ?? status,
      direction: newFilters.direction ?? direction,
      agentId: newFilters.agentId ?? agentId,
    }
    onFiltersChange(filters)
  }, [search, status, direction, agentId, onFiltersChange])

  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search })
    onPageChange(1)
  }

  // Handle filter changes
  const handleStatusChange = (value: string) => {
    setStatus(value)
    updateFilters({ status: value })
    onPageChange(1)
  }

  const handleDirectionChange = (value: string) => {
    setDirection(value)
    updateFilters({ direction: value })
    onPageChange(1)
  }

  const handleAgentChange = (value: string) => {
    setAgentId(value)
    updateFilters({ agentId: value })
    onPageChange(1)
  }

  // Clear all filters
  const handleClearFilters = () => {
    setSearch("")
    setStatus("all")
    setDirection("all")
    setAgentId("all")
    onFiltersChange({
      search: "",
      status: "all",
      direction: "all",
      agentId: "all",
    })
    onPageChange(1)
  }

  // Count active filters
  const activeFilterCount = [
    search !== "",
    status !== "all",
    direction !== "all",
    agentId !== "all",
  ].filter(Boolean).length

  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-6 space-y-4">
        {/* Algolia Upgrade Banner */}
        {showAlgoliaBanner && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <Sparkles className="h-4 w-4" />
                Upgrade to Instant Search
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get autocomplete, real-time suggestions, and lightning-fast search results
              </p>
            </div>
            {onConfigureAlgolia && (
              <Button
                variant="default"
                size="sm"
                onClick={onConfigureAlgolia}
                className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Settings className="h-4 w-4 mr-1" />
                Configure
              </Button>
            )}
          </div>
        )}

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by phone number or caller name..."
              className="pl-10 pr-10 h-11"
            />
            {search && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => {
                  setSearch("")
                  updateFilters({ search: "" })
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          {activeFilterCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="gap-1 text-muted-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Clear all
            </Button>
          )}

          {/* Active filter badges */}
          {search && (
            <Badge variant="secondary" className="gap-1">
              Search: {search.length > 15 ? `${search.slice(0, 15)}...` : search}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setSearch("")
                  updateFilters({ search: "" })
                }}
              />
            </Badge>
          )}
          {status !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Status: {status.replace("_", " ")}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleStatusChange("all")}
              />
            </Badge>
          )}
          {direction !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {direction === "web" ? "Web Calls" : `Direction: ${direction}`}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleDirectionChange("all")}
              />
            </Badge>
          )}
          {agentId !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Agent: {agents.find((a) => a.id === agentId)?.name || "Unknown"}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleAgentChange("all")}
              />
            </Badge>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Direction</Label>
              <Select value={direction} onValueChange={handleDirectionChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="web">Web Calls</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Agent</Label>
              <Select value={agentId} onValueChange={handleAgentChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Per Page</Label>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => onPageSizeChange(parseInt(value))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Results Summary & Pagination */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t">
          <div className="text-sm">
            <span className="font-semibold">{totalResults.toLocaleString()}</span>{" "}
            <span className="text-muted-foreground">results found</span>
            <span className="text-muted-foreground ml-2">
              • Page {currentPage} of {totalPages}
            </span>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

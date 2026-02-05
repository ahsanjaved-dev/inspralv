"use client"

import { useState, useCallback, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
  RotateCcw,
  CalendarIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format, startOfDay, endOfDay } from "date-fns"

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
  startDate?: Date
  endDate?: Date
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
  // Filter state - default to today's date
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [direction, setDirection] = useState("all")
  const [agentId, setAgentId] = useState("all")
  const [startDate, setStartDate] = useState<Date | undefined>(() => startOfDay(new Date()))
  const [endDate, setEndDate] = useState<Date | undefined>(() => endOfDay(new Date()))
  // Filters are always visible now

  // Notify parent of initial filters on mount
  useEffect(() => {
    onFiltersChange({
      search: "",
      status: "all",
      direction: "all",
      agentId: "all",
      startDate: startOfDay(new Date()),
      endDate: endOfDay(new Date()),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of filter changes
  const updateFilters = useCallback((newFilters: Partial<FallbackFilters>) => {
    const filters: FallbackFilters = {
      search: newFilters.search ?? search,
      status: newFilters.status ?? status,
      direction: newFilters.direction ?? direction,
      agentId: newFilters.agentId ?? agentId,
      startDate: newFilters.startDate !== undefined ? newFilters.startDate : startDate,
      endDate: newFilters.endDate !== undefined ? newFilters.endDate : endDate,
    }
    onFiltersChange(filters)
  }, [search, status, direction, agentId, startDate, endDate, onFiltersChange])

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

  // Handle date changes
  const handleStartDateChange = (date: Date | undefined) => {
    const newStartDate = date ? startOfDay(date) : undefined
    setStartDate(newStartDate)
    updateFilters({ startDate: newStartDate })
    onPageChange(1)
  }

  const handleEndDateChange = (date: Date | undefined) => {
    const newEndDate = date ? endOfDay(date) : undefined
    setEndDate(newEndDate)
    updateFilters({ endDate: newEndDate })
    onPageChange(1)
  }

  // Clear all filters (reset to today)
  const handleClearFilters = () => {
    const today = new Date()
    const todayStart = startOfDay(today)
    const todayEnd = endOfDay(today)
    setSearch("")
    setStatus("all")
    setDirection("all")
    setAgentId("all")
    setStartDate(todayStart)
    setEndDate(todayEnd)
    onFiltersChange({
      search: "",
      status: "all",
      direction: "all",
      agentId: "all",
      startDate: todayStart,
      endDate: todayEnd,
    })
    onPageChange(1)
  }

  // Count active filters
  const activeFilterCount = [
    search !== "",
    status !== "all",
    direction !== "all",
    agentId !== "all",
    startDate !== undefined,
    endDate !== undefined,
  ].filter(Boolean).length

  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-6 space-y-4">
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

        {/* Active Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
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

          {/* Active filter badges with remove popover */}
          {search && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  Search: {search.length > 15 ? `${search.slice(0, 15)}...` : search}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setSearch("")
                    updateFilters({ search: "" })
                  }}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {status !== "all" && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  Status: {status.replace("_", " ")}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleStatusChange("all")}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {direction !== "all" && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  {direction === "web" ? "Web Calls" : `Direction: ${direction}`}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDirectionChange("all")}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {agentId !== "all" && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  Agent: {agents.find((a) => a.id === agentId)?.name || "Unknown"}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleAgentChange("all")}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {startDate && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  From: {format(startDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "Today" : format(startDate, "MMM d")}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleStartDateChange(undefined)}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {endDate && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  To: {format(endDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "Today" : format(endDate, "MMM d")}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleEndDateChange(undefined)}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Filters - Always visible */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 bg-muted/30 rounded-lg border">
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
              <Label className="text-xs">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={handleStartDateChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={handleEndDateChange}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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

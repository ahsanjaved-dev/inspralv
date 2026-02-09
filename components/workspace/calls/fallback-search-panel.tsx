"use client"

import { useState, useCallback, useEffect } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
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
  // URL state for filter persistence
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  // Parse initial values from URL
  const [search, setSearch] = useState(() => searchParams.get("q") || "")
  const [status, setStatus] = useState(() => searchParams.get("status") || "all")
  const [direction, setDirection] = useState(() => searchParams.get("direction") || "all")
  const [agentId, setAgentId] = useState(() => searchParams.get("agentId") || "all")
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const dateStr = searchParams.get("startDate")
    return dateStr ? startOfDay(new Date(dateStr)) : undefined
  })
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const dateStr = searchParams.get("endDate")
    return dateStr ? endOfDay(new Date(dateStr)) : undefined
  })
  
  // Update URL when filters change
  const updateUrlParams = useCallback((newFilters: FallbackFilters) => {
    const params = new URLSearchParams()
    
    if (newFilters.status !== "all") params.set("status", newFilters.status)
    if (newFilters.direction !== "all") params.set("direction", newFilters.direction)
    if (newFilters.agentId !== "all") params.set("agentId", newFilters.agentId)
    if (newFilters.startDate) params.set("startDate", newFilters.startDate.toISOString().split('T')[0]!)
    if (newFilters.endDate) params.set("endDate", newFilters.endDate.toISOString().split('T')[0]!)
    if (newFilters.search) params.set("q", newFilters.search)
    
    const queryString = params.toString()
    router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false })
  }, [pathname, router])

  // Notify parent of initial filters on mount (from URL)
  useEffect(() => {
    const initialFilters = {
      search: searchParams.get("q") || "",
      status: searchParams.get("status") || "all",
      direction: searchParams.get("direction") || "all",
      agentId: searchParams.get("agentId") || "all",
      startDate: searchParams.get("startDate") ? startOfDay(new Date(searchParams.get("startDate")!)) : undefined,
      endDate: searchParams.get("endDate") ? endOfDay(new Date(searchParams.get("endDate")!)) : undefined,
    }
    onFiltersChange(initialFilters)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of filter changes and update URL
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
    updateUrlParams(filters)
  }, [search, status, direction, agentId, startDate, endDate, onFiltersChange, updateUrlParams])

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
    setSearch("")
    setStatus("all")
    setDirection("all")
    setAgentId("all")
    setStartDate(undefined)
    setEndDate(undefined)
    const clearedFilters = {
      search: "",
      status: "all",
      direction: "all",
      agentId: "all",
      startDate: undefined,
      endDate: undefined,
    }
    onFiltersChange(clearedFilters)
    onPageChange(1)
    // Clear URL params
    router.replace(pathname, { scroll: false })
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

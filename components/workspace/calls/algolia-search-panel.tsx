"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Search,
  Loader2,
  User,
  Phone,
  Bot,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarIcon,
  RotateCcw,
  MessageSquare,
  FileText,
} from "lucide-react"
import { useAlgoliaSearch, type SearchParams } from "@/lib/hooks/use-algolia-search"
import { cn } from "@/lib/utils"
import { format, startOfDay, endOfDay } from "date-fns"
import type { AlgoliaSuggestion, AlgoliaSearchResults, AlgoliaCallHit } from "@/lib/algolia/types"

// ============================================================================
// TYPES
// ============================================================================

interface AlgoliaSearchPanelProps {
  agents: Array<{ id: string; name: string }>
  onResultsChange: (results: AlgoliaCallHit[], totalHits: number, isSearching: boolean, searchFailed?: boolean, isBackgroundRefresh?: boolean) => void
  onViewCallDetail?: (conversationId: string) => void // Navigate to call detail
  className?: string
  /** Change this value to trigger a refresh of search results (e.g., when a new call completes) */
  refreshTrigger?: number
}

interface AlgoliaFilters {
  status: string
  direction: string
  agentId: string
  startDate: Date | undefined
  endDate: Date | undefined
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AlgoliaSearchPanel({
  agents,
  onResultsChange,
  onViewCallDetail,
  className,
  refreshTrigger,
}: AlgoliaSearchPanelProps) {
  // URL state for filter persistence
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  // Parse initial filters from URL params
  const getInitialFilters = useCallback((): AlgoliaFilters => {
    const status = searchParams.get("status") || "all"
    const direction = searchParams.get("direction") || "all"
    const agentId = searchParams.get("agentId") || "all"
    const startDateStr = searchParams.get("startDate")
    const endDateStr = searchParams.get("endDate")
    
    return {
      status,
      direction,
      agentId,
      startDate: startDateStr ? startOfDay(new Date(startDateStr)) : undefined,
      endDate: endDateStr ? endOfDay(new Date(endDateStr)) : undefined,
    }
  }, [searchParams])
  
  // Search state
  const [query, setQuery] = useState(() => searchParams.get("q") || "")
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get("q") || "")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get("page")
    return page ? parseInt(page, 10) : 0
  })
  const [hitsPerPage, setHitsPerPage] = useState(20)
  
  // Filter state - NO default dates, read from URL
  const [filters, setFilters] = useState<AlgoliaFilters>(getInitialFilters)
  
  // Update URL when filters change
  const updateUrlParams = useCallback((newFilters: AlgoliaFilters, newQuery?: string, newPage?: number) => {
    const params = new URLSearchParams()
    
    if (newFilters.status !== "all") params.set("status", newFilters.status)
    if (newFilters.direction !== "all") params.set("direction", newFilters.direction)
    if (newFilters.agentId !== "all") params.set("agentId", newFilters.agentId)
    if (newFilters.startDate) params.set("startDate", newFilters.startDate.toISOString().split('T')[0]!)
    if (newFilters.endDate) params.set("endDate", newFilters.endDate.toISOString().split('T')[0]!)
    if (newQuery) params.set("q", newQuery)
    if (newPage && newPage > 0) params.set("page", newPage.toString())
    
    const queryString = params.toString()
    router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false })
  }, [pathname, router])
  
  // Filters are always visible now
  
  // Refs
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const onResultsChangeRef = useRef(onResultsChange)
  onResultsChangeRef.current = onResultsChange

  // Algolia hook
  const {
    isConfigured,
    isLoadingConfig,
    search,
    searchResults,
    isSearching,
    getAutocomplete,
    autocompleteResults,
    isLoadingAutocomplete,
    clearSearch,
  } = useAlgoliaSearch()

  // Local loading state (more reliable than isSearching which can have race conditions)
  const [isLoading, setIsLoading] = useState(false)

  // Debounce query for autocomplete only (not for search)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (query.trim().length > 1 && isConfigured) {
        getAutocomplete(query)
        setShowSuggestions(true)
      } else {
        setShowSuggestions(false)
      }
    }, 200)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query, isConfigured, getAutocomplete])

  // Track if this is the first search (initial load)
  const isInitialSearchRef = useRef(true)
  
  // Perform search function
  // isBackgroundRefresh: true for auto-refresh/visibility changes, false for user actions
  const performSearch = useCallback(async (searchQuery: string, isBackgroundRefresh: boolean = false) => {
    if (!isConfigured) return

    setIsLoading(true)
    
    // Only notify parent that search is starting (to show skeleton) for:
    // 1. Initial page load
    // 2. User-initiated filter changes (not background refreshes)
    const shouldShowSkeleton = isInitialSearchRef.current || !isBackgroundRefresh
    if (shouldShowSkeleton) {
      onResultsChangeRef.current([], 0, true, false, false)
    }

    const searchFilters: SearchParams["filters"] = {}
    
    if (filters.status !== "all") {
      searchFilters.status = filters.status
    }
    if (filters.direction !== "all") {
      if (filters.direction === "web") {
        searchFilters.callType = "web"
      } else {
        searchFilters.direction = filters.direction
        // When filtering for outbound, exclude web calls (they're stored as direction=outbound)
        if (filters.direction === "outbound") {
          searchFilters.excludeWebCalls = true
        }
      }
    }
    if (filters.agentId !== "all") {
      searchFilters.agentId = filters.agentId
    }
    if (filters.startDate) {
      searchFilters.startDate = filters.startDate
    }
    if (filters.endDate) {
      searchFilters.endDate = filters.endDate
    }

    try {
      const results = await search({
        query: searchQuery,
        page: currentPage,
        hitsPerPage,
        filters: searchFilters,
      })

      if (results) {
        // Search succeeded - pass false for searchFailed, include isBackgroundRefresh flag
        onResultsChangeRef.current(results.hits, results.nbHits, false, false, isBackgroundRefresh)
      } else {
        // Search returned null - treat as failure
        onResultsChangeRef.current([], 0, false, true, isBackgroundRefresh)
      }
    } catch (error) {
      console.error("[Algolia] Search error:", error)
      // Search failed - pass true for searchFailed
      onResultsChangeRef.current([], 0, false, true, isBackgroundRefresh)
    } finally {
      setIsLoading(false)
      // After first search completes, mark initial search as done
      if (isInitialSearchRef.current) {
        isInitialSearchRef.current = false
      }
    }
  }, [isConfigured, currentPage, hitsPerPage, filters, search])

  // Track the previous refreshTrigger to detect auto-refresh vs filter changes
  const prevRefreshTriggerRef = useRef<number | undefined>(undefined)
  // Track if this is the very first effect run (initial load)
  const isFirstEffectRunRef = useRef(true)
  
  // Trigger initial search and on filter/pagination changes
  // Also triggers when refreshTrigger changes (e.g., when a new call completes via realtime)
  useEffect(() => {
    if (isConfigured) {
      // Determine if this is a background refresh (auto-refresh or visibility change)
      // vs a user-initiated action (filter change, page change, etc.)
      // First effect run is NEVER a background refresh (it's initial load)
      let isBackgroundRefresh = false
      if (isFirstEffectRunRef.current) {
        isFirstEffectRunRef.current = false
        isBackgroundRefresh = false // Initial load - show skeleton
      } else if (prevRefreshTriggerRef.current !== undefined && prevRefreshTriggerRef.current !== refreshTrigger) {
        isBackgroundRefresh = true // refreshTrigger changed - background refresh
      }
      prevRefreshTriggerRef.current = refreshTrigger
      
      performSearch(debouncedQuery, isBackgroundRefresh)
    }
    // Only trigger on filter/pagination changes, not on performSearch reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, debouncedQuery, currentPage, hitsPerPage, filters.status, filters.direction, filters.agentId, filters.startDate, filters.endDate, refreshTrigger])

  // Handle search submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setShowSuggestions(false)
    setCurrentPage(0)
    setDebouncedQuery(query)
    performSearch(query, false) // User action, not background refresh
  }

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: AlgoliaSuggestion) => {
    setShowSuggestions(false)
    
    // If suggestion has objectID, navigate directly to call detail
    if (suggestion.objectID && onViewCallDetail) {
      onViewCallDetail(suggestion.objectID)
      return
    }
    
    // Otherwise perform search with the suggestion text
    setQuery(suggestion.text)
    setDebouncedQuery(suggestion.text)
    setCurrentPage(0)
    performSearch(suggestion.text, false) // User action, not background refresh
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || autocompleteResults.length === 0) {
      if (e.key === "Enter") {
        handleSubmit(e)
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedSuggestionIndex((prev) =>
          prev < autocompleteResults.length - 1 ? prev + 1 : prev
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case "Enter":
        e.preventDefault()
        if (selectedSuggestionIndex >= 0 && autocompleteResults[selectedSuggestionIndex]) {
          handleSuggestionSelect(autocompleteResults[selectedSuggestionIndex])
        } else {
          handleSubmit(e)
        }
        break
      case "Escape":
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  // Sync filters to URL when they change
  useEffect(() => {
    updateUrlParams(filters, debouncedQuery, currentPage)
  }, [filters, debouncedQuery, currentPage, updateUrlParams])
  
  // Clear all filters
  const handleClearFilters = () => {
    const clearedFilters = {
      status: "all",
      direction: "all",
      agentId: "all",
      startDate: undefined,
      endDate: undefined,
    }
    setFilters(clearedFilters)
    setQuery("")
    setDebouncedQuery("")
    setCurrentPage(0)
    // Clear URL params
    router.replace(pathname, { scroll: false })
  }

  // Get suggestion icon
  const getSuggestionIcon = (type: AlgoliaSuggestion["type"]) => {
    switch (type) {
      case "caller":
        return <User className="h-4 w-4 text-blue-500" />
      case "phone":
        return <Phone className="h-4 w-4 text-green-500" />
      case "agent":
        return <Bot className="h-4 w-4 text-purple-500" />
      case "transcript":
        return <MessageSquare className="h-4 w-4 text-orange-500" />
      case "summary":
        return <FileText className="h-4 w-4 text-cyan-500" />
      default:
        return <Search className="h-4 w-4 text-gray-500" />
    }
  }

  // Count active filters
  const activeFilterCount = [
    filters.status !== "all",
    filters.direction !== "all",
    filters.agentId !== "all",
    filters.startDate !== undefined,
    filters.endDate !== undefined,
  ].filter(Boolean).length

  // Pagination helpers
  const totalPages = searchResults?.nbPages || 0
  const canGoPrev = currentPage > 0
  const canGoNext = currentPage < totalPages - 1

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = []
    const maxVisible = 5
    
    if (totalPages <= maxVisible) {
      for (let i = 0; i < totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(0)
      
      if (currentPage > 2) {
        pages.push("ellipsis")
      }
      
      for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages - 2, currentPage + 1); i++) {
        if (!pages.includes(i)) {
          pages.push(i)
        }
      }
      
      if (currentPage < totalPages - 3) {
        pages.push("ellipsis")
      }
      
      if (!pages.includes(totalPages - 1)) {
        pages.push(totalPages - 1)
      }
    }
    
    return pages
  }

  if (isLoadingConfig) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground">Loading search...</span>
        </CardContent>
      </Card>
    )
  }

  if (!isConfigured) {
    return null
  }

  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-6 space-y-4">
        {/* Search Input with Autocomplete */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => query.length > 1 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search calls by caller, phone, transcript..."
              className="pl-10 pr-20 h-11"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {(isLoading || isLoadingAutocomplete) && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {query && !isLoading && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setQuery("")
                    setDebouncedQuery("")
                    inputRef.current?.focus()
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Autocomplete Suggestions */}
          {showSuggestions && autocompleteResults.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg overflow-hidden"
            >
              <div className="px-3 py-2 border-b bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground">Suggestions</span>
              </div>
              {autocompleteResults.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.text}-${index}`}
                  type="button"
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors",
                    index === selectedSuggestionIndex && "bg-muted/50"
                  )}
                  onClick={() => handleSuggestionSelect(suggestion)}
                >
                  <div className="mt-0.5">
                    {getSuggestionIcon(suggestion.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {suggestion.highlight ? (
                      // For transcript/summary matches, show the highlighted snippet
                      <>
                        <p 
                          className="text-sm text-muted-foreground line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: suggestion.highlight }}
                        />
                        <p className="text-xs text-primary/70 mt-0.5">
                          Found in {suggestion.matchedField}
                        </p>
                      </>
                    ) : (
                      // For direct field matches (caller, agent, phone)
                      <>
                        <p className="text-sm font-medium truncate">{suggestion.text}</p>
                        <p className="text-xs text-muted-foreground">
                          {suggestion.matchedField}
                        </p>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
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
          {filters.status !== "all" && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  Status: {filters.status}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setFilters((f) => ({ ...f, status: "all" }))}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {filters.direction !== "all" && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  {filters.direction === "web" ? "Web Calls" : `Direction: ${filters.direction}`}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setFilters((f) => ({ ...f, direction: "all" }))}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {filters.agentId !== "all" && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  Agent: {agents.find((a) => a.id === filters.agentId)?.name || "Unknown"}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setFilters((f) => ({ ...f, agentId: "all" }))}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {filters.startDate && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  From: {format(filters.startDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "Today" : format(filters.startDate, "MMM d")}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setFilters((f) => ({ ...f, startDate: undefined }))}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
          {filters.endDate && (
            <Popover>
              <PopoverTrigger asChild>
                <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20 transition-colors">
                  To: {format(filters.endDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "Today" : format(filters.endDate, "MMM d")}
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setFilters((f) => ({ ...f, endDate: undefined }))}
                >
                  Remove filter
                </Button>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Filters - Always visible */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-muted/30 rounded-lg border">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) => {
                  setFilters((f) => ({ ...f, status: value }))
                  setCurrentPage(0)
                }}
              >
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
              <Select
                value={filters.direction}
                onValueChange={(value) => {
                  setFilters((f) => ({ ...f, direction: value }))
                  setCurrentPage(0)
                }}
              >
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
              <Select
                value={filters.agentId}
                onValueChange={(value) => {
                  setFilters((f) => ({ ...f, agentId: value }))
                  setCurrentPage(0)
                }}
              >
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
                      !filters.startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.startDate ? format(filters.startDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.startDate}
                    onSelect={(date) => {
                      // Set to start of day (00:00:00)
                      if (date) {
                        const startOfDay = new Date(date)
                        startOfDay.setHours(0, 0, 0, 0)
                        setFilters((f) => ({ ...f, startDate: startOfDay }))
                      } else {
                        setFilters((f) => ({ ...f, startDate: undefined }))
                      }
                      setCurrentPage(0)
                    }}
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
                      !filters.endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.endDate ? format(filters.endDate, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.endDate}
                    onSelect={(date) => {
                      // Set to end of day (23:59:59.999)
                      if (date) {
                        const endOfDay = new Date(date)
                        endOfDay.setHours(23, 59, 59, 999)
                        setFilters((f) => ({ ...f, endDate: endOfDay }))
                      } else {
                        setFilters((f) => ({ ...f, endDate: undefined }))
                      }
                      setCurrentPage(0)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

        {/* Results Summary & Pagination */}
        {(searchResults || isLoading) && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t">
            <div className="flex items-center gap-4">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Searching...</span>
                </div>
              ) : searchResults ? (
                <div className="text-sm">
                  <span className="font-semibold">
                    {searchResults.nbHits.toLocaleString()}
                  </span>{" "}
                  <span className="text-muted-foreground">results found</span>
                  {searchResults.processingTimeMS && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({searchResults.processingTimeMS}ms)
                    </span>
                  )}
                </div>
              ) : null}
              
              <Select
                value={hitsPerPage.toString()}
                onValueChange={(value) => {
                  setHitsPerPage(parseInt(value))
                  setCurrentPage(0)
                }}
              >
                <SelectTrigger className="h-8 w-[110px]">
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(0)}
                  disabled={!canGoPrev}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage((p) => p - 1)}
                  disabled={!canGoPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {getPageNumbers().map((pageNum, idx) =>
                    pageNum === "ellipsis" ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum + 1}
                      </Button>
                    )
                  )}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!canGoNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(totalPages - 1)}
                  disabled={!canGoNext}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

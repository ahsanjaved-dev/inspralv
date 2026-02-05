"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlgoliaSearchPanel } from "@/components/workspace/calls/algolia-search-panel"
import { FallbackSearchPanel, type FallbackFilters } from "@/components/workspace/calls/fallback-search-panel"
import { useWorkspaceCalls } from "@/lib/hooks/use-workspace-calls"
import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"
import { useIsAlgoliaConfigured } from "@/lib/hooks/use-algolia-search"
import { useWorkspaceCallsRealtime } from "@/lib/hooks/use-realtime-call-status"
import { useWorkspaceSettings } from "@/lib/hooks/use-workspace-settings"
import { exportCallsToPDF, exportCallsToCSV } from "@/lib/utils/export-calls-pdf"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Phone,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  Download,
  DollarSign,
  Activity,
  FileText,
  Monitor,
  FileJson,
  ExternalLink,
  Mic,
} from "lucide-react"
import { formatDistanceToNow, format, startOfDay, endOfDay } from "date-fns"
import type { ConversationWithAgent, Conversation } from "@/types/database.types"
import type { AlgoliaCallHit } from "@/lib/algolia/types"

// ============================================================================
// STATUS COLORS
// ============================================================================

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  initiated: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  no_answer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  busy: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  canceled: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

// Skeleton component for table rows
function TableRowSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-10 w-32" /></TableCell>
      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
    </TableRow>
  )
}

export default function CallsPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params?.workspaceSlug as string
  
  // Algolia state
  const [algoliaResults, setAlgoliaResults] = useState<AlgoliaCallHit[]>([])
  const [algoliaTotal, setAlgoliaTotal] = useState(0)
  const [algoliaHasSearched, setAlgoliaHasSearched] = useState(false) // Track if initial search completed
  const [algoliaSearchFailed, setAlgoliaSearchFailed] = useState(false) // Track if search failed
  const [algoliaIsSearching, setAlgoliaIsSearching] = useState(false) // Track if currently searching
  
  // Fallback/DB state - default to today's date
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [dbFilters, setDbFilters] = useState<FallbackFilters>(() => {
    const today = new Date()
    return {
      search: "",
      status: "all",
      direction: "all",
      agentId: "all",
      startDate: startOfDay(today),
      endDate: endOfDay(today),
    }
  })
  
  // Track if filters are being changed (for showing skeleton)
  const [isFilterChanging, setIsFilterChanging] = useState(false)
  
  // Shared state
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<"pdf" | "csv">("pdf")
  
  // Real-time call status updates
  const [realtimeCallStatuses, setRealtimeCallStatuses] = useState<Map<string, string>>(new Map())
  
  // Refresh trigger for Algolia - increment this to force a refresh
  const [algoliaRefreshTrigger, setAlgoliaRefreshTrigger] = useState(0)

  // Check if Algolia is configured (must be before the auto-refresh useEffect)
  const { isConfigured: algoliaConfigured, isLoading: algoliaLoading } = useIsAlgoliaConfigured()

  // Auto-refresh interval for Algolia (in case realtime doesn't work)
  // This ensures new calls appear even without Supabase Realtime
  useEffect(() => {
    if (!algoliaConfigured || algoliaLoading) return
    
    // Only refresh when page is visible to avoid unnecessary API calls
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[Calls] Page became visible, refreshing Algolia")
        setAlgoliaRefreshTrigger((prev) => prev + 1)
      }
    }
    
    // Refresh every 15 seconds when page is visible
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        console.log("[Calls] Auto-refreshing Algolia results")
        setAlgoliaRefreshTrigger((prev) => prev + 1)
      }
    }, 15000) // 15 seconds
    
    document.addEventListener("visibilitychange", handleVisibilityChange)
    
    return () => {
      clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [algoliaConfigured, algoliaLoading])
  
  // Fetch workspace settings to get workspace ID for realtime subscription
  const { data: workspaceData } = useWorkspaceSettings()
  const workspaceId = workspaceData?.id || ""
  
  // Fetch calls from DB - ONLY when Algolia is NOT configured
  // DO NOT use DB as fallback for empty Algolia results (this was causing the bug)
  const { data, isLoading, error, isFetching } = useWorkspaceCalls({
    page,
    pageSize,
    status: dbFilters.status !== "all" ? dbFilters.status : undefined,
    direction:
      dbFilters.direction !== "all" && dbFilters.direction !== "web" ? dbFilters.direction : undefined,
    callType: dbFilters.direction === "web" ? "web" : undefined,
    agentId: dbFilters.agentId !== "all" ? dbFilters.agentId : undefined,
    search: dbFilters.search || undefined,
    startDate: dbFilters.startDate?.toISOString(),
    endDate: dbFilters.endDate?.toISOString(),
    // Only enable DB fetch when Algolia is NOT configured
    enabled: !algoliaLoading && !algoliaConfigured,
  })
  
  // Subscribe to real-time call status updates for this workspace
  const { recentEvents, isConnected: realtimeConnected } = useWorkspaceCallsRealtime(
    workspaceId,
    {
      onNewCall: (conversation) => {
        console.log("[Calls] New call received:", conversation.id)
        // Trigger refetch of calls list
        toast.info("New call started", {
          description: `${conversation.caller_name || "Unknown"} - ${conversation.phone_number || "Web Call"}`,
        })
      },
      onCallComplete: (conversation) => {
        console.log("[Calls] Call completed:", conversation.id)
        // Update local status
        setRealtimeCallStatuses((prev) => {
          const newMap = new Map(prev)
          newMap.set(conversation.id as string, conversation.status as string)
          return newMap
        })
        // Trigger Algolia refresh after a short delay to allow indexing to complete
        // The webhook indexes to Algolia, then Supabase realtime fires - add small buffer
        setTimeout(() => {
          console.log("[Calls] Triggering Algolia refresh after call completion")
          setAlgoliaRefreshTrigger((prev) => prev + 1)
        }, 1500) // 1.5 second delay to ensure Algolia indexing is complete
      },
    }
  )
  
  // Update realtime statuses when events come in
  useEffect(() => {
    if (recentEvents.length > 0) {
      let hasNewCompletedCall = false
      setRealtimeCallStatuses((prev) => {
        const newMap = new Map(prev)
        recentEvents.forEach((event) => {
          // Check if this is a newly completed call (status changed to completed)
          const previousStatus = prev.get(event.conversationId)
          if (event.status === "completed" && previousStatus !== "completed") {
            hasNewCompletedCall = true
          }
          newMap.set(event.conversationId, event.status)
        })
        return newMap
      })
      
      // Refresh Algolia if we detected new completed calls
      // This catches cases where onCallComplete callback might not fire
      if (hasNewCompletedCall && algoliaConfigured) {
        setTimeout(() => {
          console.log("[Calls] Triggering Algolia refresh from recentEvents")
          setAlgoliaRefreshTrigger((prev) => prev + 1)
        }, 2000) // Slightly longer delay for bulk updates
      }
    }
  }, [recentEvents, algoliaConfigured])

  const getCallTypeLabel = (call: ConversationWithAgent | AlgoliaCallHit): "web" | "inbound" | "outbound" => {
    if ("call_type" in call && call.call_type) {
      if (call.call_type.toLowerCase().includes("web")) return "web"
    }
    if ("metadata" in call) {
      const meta = call.metadata as Record<string, unknown> | null
      const callType = typeof meta?.call_type === "string" ? meta.call_type : ""
      if (callType.toLowerCase().includes("web")) return "web"
    }
    const direction = "direction" in call ? call.direction : "outbound"
    return direction === "inbound" ? "inbound" : "outbound"
  }

  // Fetch agents for filter
  const { data: agentsData } = useWorkspaceAgents({})
  const agents = agentsData?.data || []

  const dbCalls = data?.data || []
  const totalPages = data?.totalPages || 1

  // Handle Algolia results
  const handleAlgoliaResults = useCallback((results: AlgoliaCallHit[], totalHits: number, isSearching: boolean, searchFailed?: boolean, isBackgroundRefresh?: boolean) => {
    // For background refreshes, don't show loading state - just silently update when done
    if (isBackgroundRefresh && isSearching) {
      // Background refresh started - don't show skeleton, just wait for results
      return
    }
    
    setAlgoliaIsSearching(isSearching)
    
    // Track search completion and failure status
    if (!isSearching) {
      // Update results when search completes
      setAlgoliaResults(results)
      setAlgoliaTotal(totalHits)
      setAlgoliaHasSearched(true)
      setAlgoliaSearchFailed(searchFailed ?? false)
      setIsFilterChanging(false) // Clear filter changing state
      
      // Log for debugging
      if (searchFailed) {
        console.log("[Calls] Algolia search failed")
      } else if (results.length === 0 && totalHits === 0) {
        console.log("[Calls] Algolia returned 0 results for current filters - this is expected, showing empty state")
      }
    } else {
      // When user-initiated search starts, mark as filter changing to show skeleton
      // (background refreshes won't reach here due to early return above)
      setIsFilterChanging(true)
    }
  }, [])

  // Handle DB filter changes
  const handleDbFiltersChange = useCallback((filters: FallbackFilters) => {
    setDbFilters(filters)
  }, [])

  // Navigate to org integrations
  const handleConfigureAlgolia = useCallback(() => {
    router.push("/org/integrations")
  }, [router])

  // Handle view call detail - navigate to detail page
  const handleViewCallDetail = useCallback((conversationId: string) => {
    router.push(`/w/${workspaceSlug}/calls/${conversationId}`)
  }, [router, workspaceSlug])
  
  // Helper to get current status (with realtime override)
  const getCallStatus = useCallback((call: ConversationWithAgent) => {
    return realtimeCallStatuses.get(call.id) || call.status
  }, [realtimeCallStatuses])

  // Convert Algolia hits to ConversationWithAgent format for display
  const convertAlgoliaToConversation = (hits: AlgoliaCallHit[]): ConversationWithAgent[] => {
    // Helper to check if timestamp is valid (not 0 or Unix epoch)
    const isValidTimestamp = (ts: number | null | undefined): boolean => {
      if (!ts || ts <= 0) return false
      const date = new Date(ts)
      return date.getFullYear() > 2020
    }

    return hits.map((hit) => {
      const result: ConversationWithAgent = {
        id: hit.conversation_id || hit.objectID,
        external_id: hit.external_id || null,
        workspace_id: hit.workspace_id || null,
        agent_id: hit.agent_id || null,
        phone_number: hit.phone_number || null,
        caller_name: hit.caller_name || null,
        status: (hit.status || "completed") as ConversationWithAgent["status"],
        direction: (hit.direction || "inbound") as ConversationWithAgent["direction"],
        sentiment: hit.sentiment || null,
        duration_seconds: hit.duration_seconds || 0,
        total_cost: hit.total_cost || 0,
        started_at: isValidTimestamp(hit.started_at_timestamp) 
          ? new Date(hit.started_at_timestamp!).toISOString() 
          : null,
        ended_at: null,
        created_at: isValidTimestamp(hit.created_at_timestamp)
          ? new Date(hit.created_at_timestamp).toISOString()
          : new Date().toISOString(),
        transcript: hit.transcript || null,
        summary: hit.summary || null,
        recording_url: hit.recording_url || null,
        metadata: hit.call_type ? { call_type: hit.call_type } : {},
        // Missing required fields with defaults
        cost_breakdown: {},
        customer_rating: null,
        deleted_at: null,
        error_code: null,
        error_message: null,
        follow_up_notes: null,
        followed_up_at: null,
        followed_up_by: null,
        quality_score: null,
        requires_follow_up: false,
        transcript_search: null,
        agent: {
          id: hit.agent_id || "",
          name: hit.agent_name || "Unknown",
          provider: (hit.provider || "vapi") as "vapi" | "retell",
          voice_provider: null,
          model_provider: null,
          transcriber_provider: null,
        },
      }
      return result
    })
  }

  // Export handler
  const handleExportCalls = useCallback(async () => {
    try {
      const callsToExport = algoliaConfigured ? convertAlgoliaToConversation(algoliaResults) : dbCalls
      
      if (callsToExport.length === 0) {
        toast.error("No calls to export on this page")
        return
      }

      setIsExporting(true)

      if (exportFormat === "pdf") {
        await exportCallsToPDF({
          calls: callsToExport,
          fileName: `call-logs-${format(new Date(), "yyyy-MM-dd")}.pdf`,
        })
        toast.success(`Exported ${callsToExport.length} calls to PDF`)
      } else {
        exportCallsToCSV({
          calls: callsToExport,
          fileName: `call-logs-${format(new Date(), "yyyy-MM-dd")}.csv`,
        })
        toast.success(`Exported ${callsToExport.length} calls to CSV`)
      }
    } catch (error) {
      console.error("Export error:", error)
      toast.error(error instanceof Error ? error.message : "Failed to export calls")
    } finally {
      setIsExporting(false)
    }
  }, [algoliaConfigured, algoliaResults, dbCalls, exportFormat])

  // Format duration
  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds || seconds <= 0) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Format duration for display (e.g., "2m 30s")
  const formatDurationDisplay = (seconds: number | null | undefined) => {
    if (!seconds || seconds <= 0) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Check if a date is valid and reasonable (not Unix epoch or too old)
  const isValidDate = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false
    try {
      const date = new Date(dateStr)
      // Check if valid date and year is after 2020 (reasonable for our app)
      return !isNaN(date.getTime()) && date.getFullYear() > 2020
    } catch {
      return false
    }
  }

  // Get the best available timestamp for display
  const getDisplayTimestamp = (call: ConversationWithAgent): Date | null => {
    // Try started_at first, then created_at
    if (isValidDate(call.started_at)) {
      return new Date(call.started_at!)
    }
    if (isValidDate(call.created_at)) {
      return new Date(call.created_at!)
    }
    return null
  }

  // Determine which data source to use:
  // 1. Algolia is configured → ALWAYS use Algolia results (even if empty - that means filters match nothing)
  // 2. Algolia is NOT configured → use DB
  // NOTE: We no longer fallback to DB when Algolia returns empty - empty means the filter has no matches
  const useAlgoliaData = algoliaConfigured && !algoliaSearchFailed
  
  const currentCalls = useAlgoliaData ? convertAlgoliaToConversation(algoliaResults) : dbCalls
  const currentTotal = useAlgoliaData ? algoliaTotal : (data?.total || 0)
  
  // Show skeleton loading when:
  // 1. Initial load (no data yet)
  // 2. Filter is changing (user applied new filter)
  const isCurrentLoading = algoliaConfigured 
    ? (!algoliaHasSearched || isFilterChanging || algoliaIsSearching) 
    : (isLoading || isFetching)
  
  // Calculate filtered stats from current data
  const filteredStats = useMemo(() => {
    const calls = currentCalls
    const total = calls.length
    const completed = calls.filter(c => c.status === "completed").length
    const failed = calls.filter(c => c.status === "failed").length
    const totalDuration = calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0)
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0
    
    return {
      total: currentTotal, // Use the total from search results (includes pagination)
      completed,
      failed,
      avgDurationSeconds: avgDuration,
    }
  }, [currentCalls, currentTotal])
  
  // Debug logging
  useEffect(() => {
    if (algoliaConfigured && algoliaHasSearched) {
      console.log("[Calls] Data source:", {
        algoliaConfigured,
        algoliaHasSearched,
        algoliaSearchFailed,
        algoliaResultsCount: algoliaResults.length,
        dbCallsCount: dbCalls.length,
        useAlgoliaData,
        currentCallsCount: currentCalls.length,
        isFilterChanging,
      })
    }
  }, [algoliaConfigured, algoliaHasSearched, algoliaSearchFailed, algoliaResults.length, dbCalls.length, useAlgoliaData, currentCalls.length, isFilterChanging])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Call Logs</h1>
          <p className="text-muted-foreground mt-1">
            View and analyze all calls handled by your voice agents.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as "pdf" | "csv")}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  PDF
                </div>
              </SelectItem>
              <SelectItem value="csv">
                <div className="flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  CSV
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExportCalls} disabled={isExporting || currentCalls.length === 0}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export Calls
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards - Shows stats for filtered data */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Total Calls</p>
              <p className="stat-value">
                {isCurrentLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  filteredStats.total
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Completed</p>
              <p className="stat-value">
                {isCurrentLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  filteredStats.completed
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Failed</p>
              <p className="stat-value">
                {isCurrentLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  filteredStats.failed
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Avg Duration</p>
              <p className="stat-value">
                {isCurrentLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  formatDurationDisplay(filteredStats.avgDurationSeconds)
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Search Panel - Automatically switches based on Algolia configuration */}
      {algoliaLoading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
            <span className="text-muted-foreground">Loading search...</span>
          </CardContent>
        </Card>
      ) : algoliaConfigured ? (
        <>
          <AlgoliaSearchPanel
            agents={agents}
            onResultsChange={handleAlgoliaResults}
            onViewCallDetail={handleViewCallDetail}
            refreshTrigger={algoliaRefreshTrigger}
          />
          {/* Show error only when Algolia search actually failed (not when filters return empty) */}
          {algoliaSearchFailed && !isCurrentLoading && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm">
              <Activity className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-yellow-800 dark:text-yellow-200">
                Search service unavailable. Please try again later.
              </span>
            </div>
          )}
        </>
      ) : (
        <FallbackSearchPanel
          agents={agents}
          onFiltersChange={handleDbFiltersChange}
          totalResults={data?.total || 0}
          currentPage={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          isLoading={isLoading}
          showAlgoliaBanner={true}
          onConfigureAlgolia={handleConfigureAlgolia}
        />
      )}

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Call History
              </CardTitle>
              <CardDescription>
                {currentTotal || 0} total calls
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isCurrentLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-20">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </TableBody>
            </Table>
          ) : currentCalls.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">No calls found</h3>
              <p className="text-muted-foreground mt-1">
                Try searching with different terms or adjusting filters
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-20">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentCalls.map((call) => {
                  const currentStatus = getCallStatus(call)
                  const isLive = currentStatus === "in_progress" || currentStatus === "ringing"
                  
                  return (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleViewCallDetail(call.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isLive ? (
                          <div className="relative">
                            <Phone className="h-4 w-4 text-blue-500" />
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                          </div>
                        ) : (
                          <Phone className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">
                            {call.caller_name || (getCallTypeLabel(call) === "web" ? "Web Caller" : (call.phone_number ? "Caller" : "Unknown"))}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {call.phone_number || (getCallTypeLabel(call) === "web" ? "Browser" : "No number")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                        <span>{call.agent?.name || "Unknown"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const type = getCallTypeLabel(call)
                        if (type === "web") {
                          return (
                            <div className="flex items-center gap-1 text-purple-600">
                              <Monitor className="h-4 w-4" />
                              <span>Web Call</span>
                            </div>
                          )
                        }
                        if (type === "inbound") {
                          return (
                            <div className="flex items-center gap-1 text-green-600">
                              <ArrowDownLeft className="h-4 w-4" />
                              <span>Inbound</span>
                            </div>
                          )
                        }
                        return (
                          <div className="flex items-center gap-1 text-blue-600">
                            <ArrowUpRight className="h-4 w-4" />
                            <span>Outbound</span>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[currentStatus] || statusColors.completed} ${isLive ? 'animate-pulse' : ''}`}>
                        {isLive && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {currentStatus.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{formatDuration(call.duration_seconds)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="h-4 w-4" />
                        <span>${Number(call.total_cost || 0).toFixed(2)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(() => {
                        const timestamp = getDisplayTimestamp(call)
                        if (timestamp) {
                          return formatDistanceToNow(timestamp, { addSuffix: true })
                        }
                        return "N/A"
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {call.recording_url && (
                          <span title="Has recording">
                            <Mic className="h-4 w-4 text-green-600" />
                          </span>
                        )}
                        {call.transcript && (
                          <span title="Has transcript">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </span>
                        )}
                        {call.summary && (
                          <span title="Has summary">
                            <Activity className="h-4 w-4 text-purple-600" />
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewCallDetail(call.id)
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

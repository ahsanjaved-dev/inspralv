"use client"

/**
 * Call Detail Page
 * 
 * Dynamic page for viewing individual call details including:
 * - Call metadata (duration, cost, status, sentiment)
 * - Recording with audio player
 * - Transcript with timestamps and speaker identification
 * - Real-time status updates via Supabase Realtime
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { TranscriptPlayer, type TranscriptMessage } from "@/components/workspace/calls/transcript-player"
import { useCallStatusRealtime } from "@/lib/hooks/use-realtime-call-status"
import {
  ArrowLeft,
  Phone,
  Clock,
  Bot,
  DollarSign,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Monitor,
  ThumbsUp,
  ThumbsDown,
  Minus,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import type { ConversationWithAgent } from "@/types/database.types"

// =============================================================================
// STATUS COLORS
// =============================================================================

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  completed: {
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: <CheckCircle className="h-4 w-4" />,
    label: "Completed",
  },
  in_progress: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: "In Progress",
  },
  ringing: {
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: <Phone className="h-4 w-4 animate-pulse" />,
    label: "Ringing",
  },
  initiated: {
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: <Phone className="h-4 w-4" />,
    label: "Initiated",
  },
  failed: {
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: <AlertCircle className="h-4 w-4" />,
    label: "Failed",
  },
  no_answer: {
    color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    icon: <Phone className="h-4 w-4" />,
    label: "No Answer",
  },
  busy: {
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    icon: <Phone className="h-4 w-4" />,
    label: "Busy",
  },
  canceled: {
    color: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
    icon: <AlertCircle className="h-4 w-4" />,
    label: "Canceled",
  },
}

const sentimentConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  positive: {
    icon: <ThumbsUp className="h-4 w-4" />,
    label: "Positive",
    color: "text-green-600",
  },
  neutral: {
    icon: <Minus className="h-4 w-4" />,
    label: "Neutral",
    color: "text-gray-500",
  },
  negative: {
    icon: <ThumbsDown className="h-4 w-4" />,
    label: "Negative",
    color: "text-red-600",
  },
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "0m 0s"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

// Check if a date is valid and reasonable (not Unix epoch or too old)
function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  try {
    const date = new Date(dateStr)
    // Check if valid date and year is after 2020 (reasonable for our app)
    return !isNaN(date.getTime()) && date.getFullYear() > 2020
  } catch {
    return false
  }
}

// Safe format date with fallback
function safeFormatDate(dateStr: string | null | undefined, formatStr: string): string {
  if (!isValidDate(dateStr)) return "N/A"
  return format(new Date(dateStr!), formatStr)
}

// Safe format distance with fallback  
function safeFormatDistance(dateStr: string | null | undefined): string {
  if (!isValidDate(dateStr)) return "N/A"
  return formatDistanceToNow(new Date(dateStr!), { addSuffix: true })
}

function getCallTypeInfo(call: ConversationWithAgent) {
  const metadata = call.metadata as Record<string, unknown> | null
  const callType = (metadata?.call_type as string)?.toLowerCase() || ""

  if (callType.includes("web")) {
    return {
      type: "web",
      label: "Web Call",
      icon: <Monitor className="h-5 w-5" />,
      color: "text-purple-600",
    }
  }
  if (call.direction === "inbound") {
    return {
      type: "inbound",
      label: "Inbound Call",
      icon: <ArrowDownLeft className="h-5 w-5" />,
      color: "text-green-600",
    }
  }
  return {
    type: "outbound",
    label: "Outbound Call",
    icon: <ArrowUpRight className="h-5 w-5" />,
    color: "text-blue-600",
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CallDetailPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceSlug = params?.workspaceSlug as string
  const callId = params?.callId as string

  const [call, setCall] = useState<ConversationWithAgent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Navigation state for prev/next calls
  const [adjacentCalls, setAdjacentCalls] = useState<{ prev: string | null; next: string | null }>({
    prev: null,
    next: null,
  })

  // Subscribe to real-time updates for this call
  const { status: realtimeStatus, conversation: realtimeData, isConnected } = useCallStatusRealtime(
    callId,
    {
      onStatusChange: (newStatus) => {
        console.log(`[CallDetail] Status changed to: ${newStatus}`)
      },
      onComplete: () => {
        // Refresh call data when completed
        fetchCallData()
      },
    }
  )

  // Fetch call data
  const fetchCallData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/w/${workspaceSlug}/calls/${callId}`)

      if (!response.ok) {
        if (response.status === 404) {
          setError("Call not found")
        } else {
          setError("Failed to load call details")
        }
        return
      }

      const result = await response.json()
      console.log("[CallDetail] Call data fetched, setting call and fetching adjacent calls")
      setCall(result.data)
      
      // Fetch adjacent calls for navigation
      console.log("[CallDetail] About to call fetchAdjacentCalls")
      fetchAdjacentCalls()
    } catch (err) {
      console.error("[CallDetail] Error fetching call:", err)
      setError("Failed to load call details")
    } finally {
      setIsLoading(false)
    }
  }
  
  // Fetch adjacent calls (prev/next) for navigation
  const fetchAdjacentCalls = async () => {
    console.log("[CallDetail] fetchAdjacentCalls STARTED", { workspaceSlug, callId })
    try {
      // Fetch a page of calls to find the current call's position
      const url = `/api/w/${workspaceSlug}/calls?pageSize=100`
      console.log("[CallDetail] Fetching from URL:", url)
      const response = await fetch(url)
      if (!response.ok) {
        console.error("[CallDetail] Failed to fetch calls list:", response.status)
        return
      }
      
      const result = await response.json()
      console.log("[CallDetail] Raw API result:", JSON.stringify(result, null, 2).slice(0, 500))
      
      // API returns { data: { data: [...], total, ... } } - handle both shapes
      let calls: ConversationWithAgent[] = []
      if (result.data?.data && Array.isArray(result.data.data)) {
        calls = result.data.data
      } else if (Array.isArray(result.data)) {
        calls = result.data
      } else if (result.data && typeof result.data === 'object') {
        // Maybe it's the object with data property
        const innerData = (result.data as any).data
        if (Array.isArray(innerData)) {
          calls = innerData
        }
      }
      
      console.log("[CallDetail] Parsed calls array length:", calls.length)
      console.log("[CallDetail] Looking for callId:", callId)
      
      if (calls.length === 0) {
        console.log("[CallDetail] No calls found in response")
        return
      }
      
      // Log first few call IDs to debug
      console.log("[CallDetail] First 5 call IDs:", calls.slice(0, 5).map(c => c.id))
      
      // Find current call index
      const currentIndex = calls.findIndex(c => c.id === callId)
      console.log("[CallDetail] Current call index:", currentIndex)
      
      if (currentIndex === -1) {
        console.log("[CallDetail] Current call not found in list. All IDs:", calls.map(c => c.id))
        return
      }
      
      // Get adjacent call IDs (calls are sorted by created_at desc, so "prev" is newer, "next" is older)
      const prevCall = currentIndex > 0 ? calls[currentIndex - 1] : null
      const nextCall = currentIndex < calls.length - 1 ? calls[currentIndex + 1] : null
      
      console.log("[CallDetail] Setting adjacent calls:", { prev: prevCall?.id, next: nextCall?.id })
      
      setAdjacentCalls({
        prev: prevCall?.id || null,
        next: nextCall?.id || null,
      })
    } catch (err) {
      console.error("[CallDetail] Error fetching adjacent calls:", err)
    }
  }
  
  // Navigate to previous call
  const handlePreviousCall = () => {
    if (adjacentCalls.prev) {
      router.push(`/w/${workspaceSlug}/calls/${adjacentCalls.prev}`)
    }
  }
  
  // Navigate to next call
  const handleNextCall = () => {
    if (adjacentCalls.next) {
      router.push(`/w/${workspaceSlug}/calls/${adjacentCalls.next}`)
    }
  }

  useEffect(() => {
    if (callId && workspaceSlug) {
      fetchCallData()
    }
  }, [callId, workspaceSlug])
  
  // Debug: log adjacent calls state changes
  useEffect(() => {
    console.log("[CallDetail] adjacentCalls state updated:", adjacentCalls)
  }, [adjacentCalls])

  // Merge realtime updates with fetched data
  const currentStatus = realtimeStatus || call?.status
  const currentCall = call
    ? {
        ...call,
        status: currentStatus || call.status,
        ...(realtimeData || {}),
      }
    : null

  // Extract transcript messages from metadata
  const transcriptMessages: TranscriptMessage[] = currentCall?.metadata
    ? ((currentCall.metadata as Record<string, unknown>)?.transcript_messages as TranscriptMessage[]) || []
    : []

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    )
  }

  // Error state
  if (error || !currentCall) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <AlertCircle className="h-16 w-16 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-medium">{error || "Call not found"}</h2>
        <p className="text-muted-foreground">
          The call you're looking for doesn't exist or you don't have access to it.
        </p>
        <Button onClick={() => router.push(`/w/${workspaceSlug}/calls`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Call Logs
        </Button>
      </div>
    )
  }

  const statusInfo = statusConfig[currentCall.status] || statusConfig.completed
  const sentimentInfo = sentimentConfig[currentCall.sentiment || "neutral"]
  const callTypeInfo = getCallTypeInfo(currentCall)
  const metadata = currentCall.metadata as Record<string, unknown> | null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/w/${workspaceSlug}/calls`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className={callTypeInfo.color}>{callTypeInfo.icon}</div>
            <div>
              <h1 className="text-2xl font-bold">
                {currentCall.caller_name || (callTypeInfo.type === "web" ? "Web Caller" : (currentCall.phone_number || "Unknown Caller"))}
              </h1>
              <p className="text-muted-foreground">
                {currentCall.phone_number 
                  ? `${currentCall.phone_number} • ` 
                  : (callTypeInfo.type === "web" ? "Browser Call • " : "")}
                {isValidDate(currentCall.started_at) ? safeFormatDate(currentCall.started_at, "PPp") : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Status badge */}
          <Badge className={`${statusInfo?.color ?? "bg-gray-100 text-gray-800"} flex items-center gap-1`}>
            {statusInfo?.icon}
            {statusInfo?.label ?? currentCall.status}
          </Badge>

          {/* Refresh button */}
          <Button variant="outline" size="sm" onClick={fetchCallData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Duration */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatDuration(currentCall.duration_seconds)}</p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">${(currentCall.total_cost || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                <Bot className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold truncate max-w-[120px]">
                  {currentCall.agent?.name || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">Agent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call Type */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-muted flex items-center justify-center ${callTypeInfo.color}`}>
                {callTypeInfo.icon}
              </div>
              <div>
                <p className="text-lg font-bold">{callTypeInfo.label}</p>
                <p className="text-xs text-muted-foreground">Type</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-muted flex items-center justify-center ${sentimentInfo?.color ?? "text-gray-500"}`}>
                {sentimentInfo?.icon ?? <Minus className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-lg font-bold capitalize">{sentimentInfo?.label ?? "Unknown"}</p>
                <p className="text-xs text-muted-foreground">Sentiment</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      {currentCall.summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Call Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{currentCall.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Transcript Player */}
      <TranscriptPlayer
        recordingUrl={currentCall.recording_url}
        transcript={currentCall.transcript}
        transcriptMessages={transcriptMessages}
        onPreviousCall={handlePreviousCall}
        onNextCall={handleNextCall}
        hasPreviousCall={!!adjacentCalls.prev}
        hasNextCall={!!adjacentCalls.next}
      />

      {/* Additional Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Call Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Call ID</span>
                <span className="font-mono text-sm">{currentCall?.id?.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">External ID</span>
                <span className="font-mono text-sm">{currentCall?.external_id?.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <Badge variant="outline">{currentCall.agent?.provider || "Unknown"}</Badge>
              </div>
              {typeof metadata?.ended_reason === 'string' && metadata.ended_reason && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End Reason</span>
                  <span className="capitalize">{metadata.ended_reason.replace(/-/g, " ")}</span>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Started</span>
                <span>{safeFormatDate(currentCall.started_at, "PPp")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ended</span>
                <span>{safeFormatDate(currentCall.ended_at, "PPp")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{safeFormatDistance(currentCall?.created_at)}</span>
              </div>
              {currentCall.agent?.model_provider && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LLM Provider</span>
                  <span className="capitalize">{currentCall.agent.model_provider}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cost breakdown if available */}
          {currentCall.cost_breakdown && Object.keys(currentCall.cost_breakdown).length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <h4 className="text-sm font-medium mb-3">Cost Breakdown</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(currentCall.cost_breakdown as Record<string, number>)
                    .filter(([key, value]) => typeof value === "number" && key !== "total")
                    .map(([key, value]) => (
                      <div key={key} className="bg-muted rounded-lg p-3 text-center">
                        <p className="text-lg font-semibold">${value.toFixed(3)}</p>
                        <p className="text-xs text-muted-foreground capitalize">{key}</p>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}

          {/* Follow-up if required */}
          {currentCall.requires_follow_up && (
            <>
              <Separator className="my-4" />
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Follow-up Required
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  {currentCall.follow_up_notes || "No notes provided."}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


/**
 * Real-time Campaign Status Hook
 * 
 * Subscribes to Supabase Realtime for live campaign recipient status updates.
 * When webhooks update the call_recipients table, this hook receives
 * the changes in real-time and updates the UI accordingly.
 * 
 * Usage:
 * ```tsx
 * const { isConnected, recentUpdates, stats } = useRealtimeCampaignRecipients({
 *   campaignId: "abc123",
 *   workspaceId: "def456",
 *   onRecipientUpdate: (recipient) => console.log("Updated:", recipient),
 * })
 * ```
 */

import { useEffect, useState, useCallback, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"

// =============================================================================
// TYPES
// =============================================================================

export type RecipientCallStatus = "pending" | "queued" | "calling" | "completed" | "failed" | "skipped"
export type RecipientCallOutcome = "answered" | "no_answer" | "busy" | "voicemail" | "invalid_number" | "declined" | "error" | null

export interface CampaignRecipient {
  id: string
  campaign_id: string
  workspace_id: string
  phone_number: string
  first_name?: string | null
  last_name?: string | null
  call_status: RecipientCallStatus
  call_outcome?: RecipientCallOutcome
  call_duration_seconds?: number | null
  attempts: number
  last_attempt_at?: string | null
  external_call_id?: string | null
  error_message?: string | null
  updated_at?: string
}

export interface CampaignStatsUpdate {
  total: number
  pending: number
  calling: number
  completed: number
  failed: number
  successful: number
}

export interface UseRealtimeCampaignParams {
  /** The campaign ID to subscribe to */
  campaignId: string
  /** The workspace ID for filtering */
  workspaceId?: string
  /** Callback when a recipient's status changes */
  onRecipientUpdate?: (recipient: CampaignRecipient) => void
  /** Callback when a call completes successfully */
  onCallComplete?: (recipient: CampaignRecipient) => void
  /** Callback when a call fails */
  onCallFailed?: (recipient: CampaignRecipient) => void
  /** Callback when stats are updated */
  onStatsUpdate?: (stats: CampaignStatsUpdate) => void
}

export interface RecipientUpdateEvent {
  recipientId: string
  phoneNumber: string
  previousStatus: RecipientCallStatus | null
  newStatus: RecipientCallStatus
  outcome?: RecipientCallOutcome
  eventType: "INSERT" | "UPDATE"
  timestamp: Date
  data: CampaignRecipient
}

export interface RealtimeCampaignResult {
  /** Whether we're connected to the realtime channel */
  isConnected: boolean
  /** Any error that occurred */
  error: Error | null
  /** Recent recipient updates (last 50) */
  recentUpdates: RecipientUpdateEvent[]
  /** Current campaign stats (live) */
  stats: CampaignStatsUpdate
  /** Map of recipient ID to current status (for quick lookups) */
  recipientStatuses: Map<string, RecipientCallStatus>
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// =============================================================================
// HOOK
// =============================================================================

export function useRealtimeCampaignRecipients(params: UseRealtimeCampaignParams): RealtimeCampaignResult {
  const {
    campaignId,
    workspaceId,
    onRecipientUpdate,
    onCallComplete,
    onCallFailed,
    onStatsUpdate,
  } = params

  const queryClient = useQueryClient()
  const routeParams = useParams()
  const workspaceSlug = routeParams?.workspaceSlug as string

  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [recentUpdates, setRecentUpdates] = useState<RecipientUpdateEvent[]>([])
  const [recipientStatuses, setRecipientStatuses] = useState<Map<string, RecipientCallStatus>>(new Map())
  const [stats, setStats] = useState<CampaignStatsUpdate>({
    total: 0,
    pending: 0,
    calling: 0,
    completed: 0,
    failed: 0,
    successful: 0,
  })

  // Track previous statuses for change detection
  const previousStatusesRef = useRef<Map<string, RecipientCallStatus>>(new Map())

  // Handle incoming realtime updates
  const handlePayload = useCallback((payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE"
    new: Record<string, unknown>
    old: Record<string, unknown>
  }) => {
    const newData = payload.new as CampaignRecipient
    const oldData = payload.old as Partial<CampaignRecipient>
    const newStatus = newData.call_status as RecipientCallStatus
    const previousStatus = previousStatusesRef.current.get(newData.id) || (oldData.call_status as RecipientCallStatus | undefined) || null

    console.log("[RealtimeCampaign] Received update:", {
      eventType: payload.eventType,
      recipientId: newData.id,
      previousStatus,
      newStatus,
      outcome: newData.call_outcome,
    })

    // Update status map
    setRecipientStatuses(prev => {
      const newMap = new Map(prev)
      newMap.set(newData.id, newStatus)
      return newMap
    })

    // Update ref for next comparison
    previousStatusesRef.current.set(newData.id, newStatus)

    // Create event for recent updates list
    const event: RecipientUpdateEvent = {
      recipientId: newData.id,
      phoneNumber: newData.phone_number,
      previousStatus,
      newStatus,
      outcome: newData.call_outcome,
      eventType: payload.eventType as "INSERT" | "UPDATE",
      timestamp: new Date(),
      data: newData,
    }

    // Add to recent updates (keep last 50)
    setRecentUpdates(prev => [event, ...prev].slice(0, 50))

    // Update stats based on status change
    if (previousStatus !== newStatus) {
      setStats(prev => {
        const newStats = { ...prev }

        // Decrement previous status count (if it existed)
        if (previousStatus === "pending") newStats.pending = Math.max(0, newStats.pending - 1)
        else if (previousStatus === "calling" || previousStatus === "queued") newStats.calling = Math.max(0, newStats.calling - 1)
        else if (previousStatus === "completed") newStats.completed = Math.max(0, newStats.completed - 1)
        else if (previousStatus === "failed" || previousStatus === "skipped") newStats.failed = Math.max(0, newStats.failed - 1)

        // Increment new status count
        if (newStatus === "pending") newStats.pending++
        else if (newStatus === "calling" || newStatus === "queued") newStats.calling++
        else if (newStatus === "completed") {
          newStats.completed++
          if (newData.call_outcome === "answered") {
            newStats.successful++
          }
        }
        else if (newStatus === "failed" || newStatus === "skipped") newStats.failed++

        // Notify stats update callback
        if (onStatsUpdate) {
          onStatsUpdate(newStats)
        }

        return newStats
      })
    }

    // Trigger callbacks
    if (onRecipientUpdate) {
      onRecipientUpdate(newData)
    }

    if (newStatus === "completed" && newData.call_outcome === "answered" && onCallComplete) {
      onCallComplete(newData)
    }

    if ((newStatus === "failed" || newStatus === "skipped") && onCallFailed) {
      onCallFailed(newData)
    }

    // Invalidate React Query cache for recipients
    queryClient.invalidateQueries({
      queryKey: ["campaign-recipients", workspaceSlug, campaignId],
    })

    // Invalidate campaign data too (for updated counts)
    queryClient.invalidateQueries({
      queryKey: ["campaign", workspaceSlug, campaignId],
    })
  }, [campaignId, workspaceSlug, queryClient, onRecipientUpdate, onCallComplete, onCallFailed, onStatsUpdate])

  // Set up Supabase Realtime subscription
  useEffect(() => {
    if (!campaignId) {
      return
    }

    const supabase = getSupabaseBrowserClient()
    let channel: RealtimeChannel

    // Filter for this specific campaign
    const filter = `campaign_id=eq.${campaignId}`
    const channelName = `campaign-recipients-${campaignId}`

    console.log(`[RealtimeCampaign] Subscribing to channel: ${channelName}`)

    // Subscribe to call_recipients table changes
    channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "call_recipients",
          filter: filter,
        },
        handlePayload
      )
      .subscribe((status) => {
        console.log(`[RealtimeCampaign] Subscription status: ${status}`)
        setIsConnected(status === "SUBSCRIBED")
        
        if (status === "CHANNEL_ERROR") {
          setError(new Error("Failed to subscribe to campaign realtime channel"))
        }
      })

    // Cleanup on unmount
    return () => {
      console.log(`[RealtimeCampaign] Unsubscribing from channel: ${channelName}`)
      supabase.removeChannel(channel)
    }
  }, [campaignId, handlePayload])

  return {
    isConnected,
    error,
    recentUpdates,
    stats,
    recipientStatuses,
  }
}

// =============================================================================
// HELPER: Subscribe to campaign status changes (campaign record itself)
// =============================================================================

export interface UseCampaignStatusParams {
  campaignId: string
  onStatusChange?: (newStatus: string, oldStatus: string | null) => void
}

export interface CampaignStatusResult {
  status: string | null
  isConnected: boolean
  error: Error | null
}

export function useRealtimeCampaignStatus(params: UseCampaignStatusParams): CampaignStatusResult {
  const { campaignId, onStatusChange } = params

  const queryClient = useQueryClient()
  const routeParams = useParams()
  const workspaceSlug = routeParams?.workspaceSlug as string

  const [status, setStatus] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const previousStatusRef = useRef<string | null>(null)

  const handlePayload = useCallback((payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE"
    new: Record<string, unknown>
    old: Record<string, unknown>
  }) => {
    const newStatus = payload.new.status as string
    const oldStatus = previousStatusRef.current

    console.log("[RealtimeCampaignStatus] Campaign status changed:", {
      campaignId,
      oldStatus,
      newStatus,
    })

    setStatus(newStatus)
    previousStatusRef.current = newStatus

    if (oldStatus !== newStatus && onStatusChange) {
      onStatusChange(newStatus, oldStatus)
    }

    // Invalidate campaign query
    queryClient.invalidateQueries({
      queryKey: ["campaign", workspaceSlug, campaignId],
    })
    queryClient.invalidateQueries({
      queryKey: ["campaigns", workspaceSlug],
    })
  }, [campaignId, workspaceSlug, queryClient, onStatusChange])

  useEffect(() => {
    if (!campaignId) return

    const supabase = getSupabaseBrowserClient()
    let channel: RealtimeChannel

    const filter = `id=eq.${campaignId}`
    const channelName = `campaign-status-${campaignId}`

    console.log(`[RealtimeCampaignStatus] Subscribing to channel: ${channelName}`)

    channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_campaigns",
          filter: filter,
        },
        handlePayload
      )
      .subscribe((status) => {
        console.log(`[RealtimeCampaignStatus] Subscription status: ${status}`)
        setIsConnected(status === "SUBSCRIBED")
        
        if (status === "CHANNEL_ERROR") {
          setError(new Error("Failed to subscribe to campaign status channel"))
        }
      })

    return () => {
      console.log(`[RealtimeCampaignStatus] Unsubscribing from channel: ${channelName}`)
      supabase.removeChannel(channel)
    }
  }, [campaignId, handlePayload])

  return {
    status,
    isConnected,
    error,
  }
}

// =============================================================================
// HELPER: Subscribe to ALL campaigns for a workspace (list page)
// =============================================================================

export interface UseCampaignListRealtimeParams {
  workspaceId?: string
  onCampaignUpdate?: (campaignId: string, status: string) => void
}

export interface CampaignListRealtimeResult {
  isConnected: boolean
  error: Error | null
  updatedCampaigns: Map<string, { status: string; updatedAt: Date }>
}

/**
 * Hook for real-time campaign list updates
 * Subscribes to all campaign changes for a workspace
 * Useful for the campaign list page to see live status updates
 */
export function useRealtimeCampaignList(params: UseCampaignListRealtimeParams): CampaignListRealtimeResult {
  const { workspaceId, onCampaignUpdate } = params

  const queryClient = useQueryClient()
  const routeParams = useParams()
  const workspaceSlug = routeParams?.workspaceSlug as string

  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [updatedCampaigns, setUpdatedCampaigns] = useState<Map<string, { status: string; updatedAt: Date }>>(new Map())

  const handlePayload = useCallback((payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE"
    new: Record<string, unknown>
    old: Record<string, unknown>
  }) => {
    const campaignId = payload.new.id as string
    const newStatus = payload.new.status as string

    console.log("[RealtimeCampaignList] Campaign update:", {
      campaignId,
      eventType: payload.eventType,
      newStatus,
    })

    // Track the updated campaign
    setUpdatedCampaigns(prev => {
      const newMap = new Map(prev)
      newMap.set(campaignId, { status: newStatus, updatedAt: new Date() })
      return newMap
    })

    // Notify callback
    if (onCampaignUpdate) {
      onCampaignUpdate(campaignId, newStatus)
    }

    // Invalidate campaigns query to refetch with new data
    queryClient.invalidateQueries({
      queryKey: ["campaigns", workspaceSlug],
    })

    // Also invalidate specific campaign query if it exists
    queryClient.invalidateQueries({
      queryKey: ["campaign", workspaceSlug, campaignId],
    })
  }, [workspaceSlug, queryClient, onCampaignUpdate])

  useEffect(() => {
    if (!workspaceId) return

    const supabase = getSupabaseBrowserClient()
    let channel: RealtimeChannel

    const filter = `workspace_id=eq.${workspaceId}`
    const channelName = `campaigns-list-${workspaceId}`

    console.log(`[RealtimeCampaignList] Subscribing to channel: ${channelName}`)

    channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "call_campaigns",
          filter: filter,
        },
        handlePayload
      )
      .subscribe((status) => {
        console.log(`[RealtimeCampaignList] Subscription status: ${status}`)
        setIsConnected(status === "SUBSCRIBED")
        
        if (status === "CHANNEL_ERROR") {
          setError(new Error("Failed to subscribe to campaigns list channel"))
        }
      })

    return () => {
      console.log(`[RealtimeCampaignList] Unsubscribing from channel: ${channelName}`)
      supabase.removeChannel(channel)
    }
  }, [workspaceId, handlePayload])

  return {
    isConnected,
    error,
    updatedCampaigns,
  }
}


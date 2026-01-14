/**
 * Real-time Call Status Hook
 * 
 * Subscribes to Supabase Realtime for live call status updates.
 * When webhooks update the conversation table, this hook receives
 * the changes in real-time and updates the UI accordingly.
 * 
 * Usage:
 * ```tsx
 * const { status, isLive, conversation, error } = useRealtimeCallStatus({
 *   conversationId: "abc123",
 *   workspaceId: "def456",
 * })
 * 
 * // Show call status
 * {status === "in_progress" && <Badge>🔴 Live Call</Badge>}
 * {status === "completed" && <Badge>✅ Completed</Badge>}
 * {status === "failed" && <Badge>❌ Failed</Badge>}
 * ```
 */

import { useEffect, useState, useCallback } from "react"
import { createBrowserClient } from "@supabase/ssr"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { Conversation } from "@/types/database.types"

// Define CallStatus locally since it's a database enum
export type CallStatus = "initiated" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer" | "busy" | "canceled"

// =============================================================================
// TYPES
// =============================================================================

export interface UseRealtimeCallStatusParams {
  /** The conversation ID to subscribe to */
  conversationId?: string
  /** The workspace ID for filtering (optional but recommended) */
  workspaceId?: string
  /** Whether to subscribe to all calls in the workspace (default: false) */
  subscribeToAll?: boolean
  /** Callback when call status changes */
  onStatusChange?: (status: CallStatus, conversation: Partial<Conversation>) => void
  /** Callback when call completes */
  onCallComplete?: (conversation: Partial<Conversation>) => void
  /** Callback when call fails */
  onCallFailed?: (conversation: Partial<Conversation>, error?: string) => void
}

export interface RealtimeCallStatusResult {
  /** Current call status */
  status: CallStatus | null
  /** Whether the call is currently live/in-progress */
  isLive: boolean
  /** The full conversation data (partial, updated in real-time) */
  conversation: Partial<Conversation> | null
  /** Whether we're connected to the realtime channel */
  isConnected: boolean
  /** Any error that occurred */
  error: Error | null
  /** Recent call events (for subscribeToAll mode) */
  recentEvents: RealtimeCallEvent[]
}

export interface RealtimeCallEvent {
  conversationId: string
  status: CallStatus
  eventType: "INSERT" | "UPDATE"
  timestamp: Date
  data: Partial<Conversation>
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

export function useRealtimeCallStatus(params: UseRealtimeCallStatusParams): RealtimeCallStatusResult {
  const {
    conversationId,
    workspaceId,
    subscribeToAll = false,
    onStatusChange,
    onCallComplete,
    onCallFailed,
  } = params

  const [status, setStatus] = useState<CallStatus | null>(null)
  const [conversation, setConversation] = useState<Partial<Conversation> | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [recentEvents, setRecentEvents] = useState<RealtimeCallEvent[]>([])

  // Handle incoming realtime updates
  const handlePayload = useCallback((payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE"
    new: Record<string, unknown>
    old: Record<string, unknown>
  }) => {
    const newData = payload.new as Partial<Conversation>
    const newStatus = newData.status as CallStatus

    console.log("[RealtimeCallStatus] Received update:", {
      eventType: payload.eventType,
      conversationId: newData.id,
      status: newStatus,
    })

    // Update state
    setStatus(newStatus)
    setConversation(newData)

    // Add to recent events (for subscribeToAll mode)
    if (subscribeToAll) {
      const event: RealtimeCallEvent = {
        conversationId: newData.id as string,
        status: newStatus,
        eventType: payload.eventType as "INSERT" | "UPDATE",
        timestamp: new Date(),
        data: newData,
      }
      setRecentEvents(prev => [event, ...prev].slice(0, 50)) // Keep last 50 events
    }

    // Trigger callbacks
    if (onStatusChange) {
      onStatusChange(newStatus, newData)
    }

    if (newStatus === "completed" && onCallComplete) {
      onCallComplete(newData)
    }

    if (newStatus === "failed" && onCallFailed) {
      onCallFailed(newData, newData.error_message as string | undefined)
    }
  }, [subscribeToAll, onStatusChange, onCallComplete, onCallFailed])

  // Set up Supabase Realtime subscription
  useEffect(() => {
    // Need either conversationId or workspaceId to subscribe
    if (!conversationId && !workspaceId) {
      return
    }

    const supabase = getSupabaseBrowserClient()
    let channel: RealtimeChannel

    // Build filter based on params
    let filter: string | undefined
    if (conversationId) {
      filter = `id=eq.${conversationId}`
    } else if (workspaceId && subscribeToAll) {
      filter = `workspace_id=eq.${workspaceId}`
    }

    // Create channel name
    const channelName = conversationId
      ? `call-status-${conversationId}`
      : `workspace-calls-${workspaceId}`

    console.log(`[RealtimeCallStatus] Subscribing to channel: ${channelName}`)

    // Subscribe to conversations table changes
    channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "conversations",
          filter: filter,
        },
        handlePayload
      )
      .subscribe((status) => {
        console.log(`[RealtimeCallStatus] Subscription status: ${status}`)
        setIsConnected(status === "SUBSCRIBED")
        
        if (status === "CHANNEL_ERROR") {
          setError(new Error("Failed to subscribe to realtime channel"))
        }
      })

    // Cleanup on unmount
    return () => {
      console.log(`[RealtimeCallStatus] Unsubscribing from channel: ${channelName}`)
      supabase.removeChannel(channel)
    }
  }, [conversationId, workspaceId, subscribeToAll, handlePayload])

  // Compute isLive based on status
  const isLive = status === "in_progress" || status === "ringing" || status === "initiated"

  return {
    status,
    isLive,
    conversation,
    isConnected,
    error,
    recentEvents,
  }
}

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Subscribe to all calls in a workspace
 * Useful for dashboard or call center views
 */
export function useWorkspaceCallsRealtime(workspaceId: string, callbacks?: {
  onNewCall?: (conversation: Partial<Conversation>) => void
  onCallComplete?: (conversation: Partial<Conversation>) => void
}) {
  return useRealtimeCallStatus({
    workspaceId,
    subscribeToAll: true,
    onStatusChange: (status, conversation) => {
      if (status === "initiated" || status === "ringing") {
        callbacks?.onNewCall?.(conversation)
      }
    },
    onCallComplete: callbacks?.onCallComplete,
  })
}

/**
 * Subscribe to a specific call's status
 * Useful for call detail view or active call monitoring
 */
export function useCallStatusRealtime(conversationId: string, callbacks?: {
  onStatusChange?: (status: CallStatus) => void
  onComplete?: () => void
  onFailed?: (error?: string) => void
}) {
  return useRealtimeCallStatus({
    conversationId,
    onStatusChange: (status) => {
      callbacks?.onStatusChange?.(status)
    },
    onCallComplete: () => {
      callbacks?.onComplete?.()
    },
    onCallFailed: (_, error) => {
      callbacks?.onFailed?.(error)
    },
  })
}


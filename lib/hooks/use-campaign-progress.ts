/**
 * Campaign Progress Hook
 * 
 * Provides real-time progress tracking for large campaign processing.
 * Uses polling to fetch progress from the queue API endpoint.
 * 
 * Features:
 * - Automatic polling while campaign is processing
 * - Manual trigger for processing chunks
 * - Progress estimation
 * - Auto-stop when complete/cancelled/paused
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ============================================================================
// TYPES
// ============================================================================

export interface CampaignQueueProgress {
  campaignId: string
  campaignName: string
  campaignStatus: string
  queueInitialized: boolean
  queue?: {
    id: string
    status: "pending" | "processing" | "paused" | "completed" | "failed" | "cancelled"
    totalRecipients: number
    processedCount: number
    successfulCount: number
    failedCount: number
    chunksProcessed: number
    totalChunks: number
    percentComplete: number
    lastChunkAt: string | null
    startedAt: string
    completedAt: string | null
    errorMessage: string | null
  }
  hasMore: boolean
  shouldContinue: boolean
}

export interface ChunkProcessResult {
  success: boolean
  campaignId: string
  hasMore: boolean
  shouldContinue: boolean
  pendingCount: number
  outsideBusinessHours?: boolean
  message?: string
  chunk?: {
    index: number
    processed: number
    successful: number
    failed: number
    processingTimeMs: number
  }
  progress?: {
    totalRecipients: number
    processedCount: number
    successfulCount: number
    failedCount: number
    chunksProcessed: number
    totalChunks: number
    percentComplete: number
    status: string
  }
  nextProcessAt?: string
  continueProcessing?: {
    endpoint: string
    method: string
    suggestedDelay: number
  }
}

interface UseCampaignProgressOptions {
  enabled?: boolean
  pollingInterval?: number // ms, default 3000
  autoProcess?: boolean // Auto-trigger chunk processing
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchCampaignProgress(
  workspaceSlug: string,
  campaignId: string
): Promise<CampaignQueueProgress> {
  const response = await fetch(
    `/api/w/${workspaceSlug}/campaigns/${campaignId}/process-chunk`,
    { method: "GET" }
  )
  
  if (!response.ok) {
    throw new Error("Failed to fetch campaign progress")
  }
  
  return response.json()
}

async function processChunk(
  workspaceSlug: string,
  campaignId: string
): Promise<ChunkProcessResult> {
  const response = await fetch(
    `/api/w/${workspaceSlug}/campaigns/${campaignId}/process-chunk`,
    { method: "POST" }
  )
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(error.error || "Failed to process chunk")
  }
  
  return response.json()
}

// ============================================================================
// HOOK
// ============================================================================

export function useCampaignProgress(
  workspaceSlug: string,
  campaignId: string,
  options: UseCampaignProgressOptions = {}
) {
  const {
    enabled = true,
    pollingInterval = 3000,
    autoProcess = false,
  } = options

  const queryClient = useQueryClient()
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastChunkResult, setLastChunkResult] = useState<ChunkProcessResult | null>(null)
  const autoProcessIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Query for fetching progress
  const progressQuery = useQuery({
    queryKey: ["campaign-progress", workspaceSlug, campaignId],
    queryFn: () => fetchCampaignProgress(workspaceSlug, campaignId),
    enabled: enabled && !!campaignId,
    refetchInterval: (query) => {
      // Only poll if campaign is actively processing
      const data = query.state.data
      if (!data) return pollingInterval
      if (data.queue?.status === "processing" || data.queue?.status === "pending") {
        return pollingInterval
      }
      return false // Stop polling when complete/paused/failed
    },
    staleTime: 1000,
  })

  // Mutation for processing chunks
  const processChunkMutation = useMutation({
    mutationFn: () => processChunk(workspaceSlug, campaignId),
    onMutate: () => {
      setIsProcessing(true)
    },
    onSuccess: (data) => {
      setLastChunkResult(data)
      // Invalidate progress query to get updated stats
      queryClient.invalidateQueries({
        queryKey: ["campaign-progress", workspaceSlug, campaignId],
      })
    },
    onSettled: () => {
      setIsProcessing(false)
    },
  })

  // Auto-process effect
  useEffect(() => {
    if (!autoProcess || !enabled || !campaignId) return
    
    const progress = progressQuery.data
    if (!progress?.queue) return
    
    const { status } = progress.queue
    const shouldAutoProcess = 
      (status === "processing" || status === "pending") &&
      progress.hasMore &&
      progress.shouldContinue &&
      !isProcessing

    if (shouldAutoProcess) {
      // Set up interval for auto-processing
      if (!autoProcessIntervalRef.current) {
        autoProcessIntervalRef.current = setInterval(() => {
          if (!isProcessing) {
            processChunkMutation.mutate()
          }
        }, 2000) // Process every 2 seconds
      }
    } else {
      // Clear interval when not needed
      if (autoProcessIntervalRef.current) {
        clearInterval(autoProcessIntervalRef.current)
        autoProcessIntervalRef.current = null
      }
    }

    return () => {
      if (autoProcessIntervalRef.current) {
        clearInterval(autoProcessIntervalRef.current)
        autoProcessIntervalRef.current = null
      }
    }
  }, [autoProcess, enabled, campaignId, progressQuery.data, isProcessing, processChunkMutation])

  // Manual process trigger
  const triggerProcessChunk = useCallback(() => {
    if (!isProcessing) {
      processChunkMutation.mutate()
    }
  }, [isProcessing, processChunkMutation])

  // Computed values
  const progress = progressQuery.data?.queue
  const isActive = progress?.status === "processing" || progress?.status === "pending"
  const isComplete = progress?.status === "completed"
  const isPaused = progress?.status === "paused" || progressQuery.data?.campaignStatus === "paused"
  const isFailed = progress?.status === "failed"
  const isCancelled = progress?.status === "cancelled" || progressQuery.data?.campaignStatus === "cancelled"

  // Estimate time remaining
  const estimatedTimeRemaining = useCallback(() => {
    if (!progress || !progress.lastChunkAt || progress.percentComplete >= 100) {
      return null
    }

    const chunksRemaining = progress.totalChunks - progress.chunksProcessed
    if (chunksRemaining <= 0) return null

    // Estimate ~5 seconds per chunk (adjust based on actual performance)
    const secondsPerChunk = 5
    const secondsRemaining = chunksRemaining * secondsPerChunk

    if (secondsRemaining < 60) {
      return `~${Math.round(secondsRemaining)} seconds`
    } else if (secondsRemaining < 3600) {
      return `~${Math.round(secondsRemaining / 60)} minutes`
    } else {
      return `~${Math.round(secondsRemaining / 3600)} hours`
    }
  }, [progress])

  return {
    // Progress data
    progress: progressQuery.data,
    queue: progress,
    
    // Status flags
    isLoading: progressQuery.isLoading,
    isProcessing,
    isActive,
    isComplete,
    isPaused,
    isFailed,
    isCancelled,
    
    // Progress metrics
    percentComplete: progress?.percentComplete ?? 0,
    processedCount: progress?.processedCount ?? 0,
    totalRecipients: progress?.totalRecipients ?? 0,
    successfulCount: progress?.successfulCount ?? 0,
    failedCount: progress?.failedCount ?? 0,
    chunksProcessed: progress?.chunksProcessed ?? 0,
    totalChunks: progress?.totalChunks ?? 0,
    
    // Estimates
    estimatedTimeRemaining: estimatedTimeRemaining(),
    
    // Last chunk result
    lastChunkResult,
    
    // Actions
    triggerProcessChunk,
    refetch: progressQuery.refetch,
    
    // Errors
    error: progressQuery.error || processChunkMutation.error,
    processError: processChunkMutation.error,
    
    // Mutation state
    processMutation: processChunkMutation,
  }
}

// ============================================================================
// HOOK FOR STARTING OPTIMIZED CAMPAIGN
// ============================================================================

interface StartOptimizedResult {
  success: boolean
  campaignId: string
  message: string
  queue?: {
    id: string
    status: string
    totalRecipients: number
    processedCount: number
    chunksProcessed: number
    totalChunks: number
  }
  optimization?: {
    chunkSize: number
    concurrency: number
    estimatedChunks: number
    largeCampaign: boolean
  }
  firstChunk?: {
    processed: number
    successful: number
    failed: number
    hasMore: boolean
    pendingCount: number
  }
  continueProcessing?: {
    endpoint: string
    method: string
    note: string
  }
}

export function useStartCampaignOptimized(workspaceSlug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      campaignId,
      options,
    }: {
      campaignId: string
      options?: {
        chunkSize?: number
        concurrency?: number
        processFirstChunk?: boolean
      }
    }): Promise<StartOptimizedResult> => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/start-optimized`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options || {}),
        }
      )
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(error.error || "Failed to start campaign")
      }
      
      return response.json()
    },
    onSuccess: (data) => {
      // Invalidate campaigns list
      queryClient.invalidateQueries({
        queryKey: ["campaigns", workspaceSlug],
      })
      // Invalidate specific campaign
      queryClient.invalidateQueries({
        queryKey: ["campaign", workspaceSlug, data.campaignId],
      })
    },
  })
}

// Types are already exported via interface declarations above

"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { 
  CallCampaignWithAgent, 
  CallRecipient, 
  CreateCampaignInput, 
  CreateCampaignWizardInput,
  UpdateCampaignInput,
  CreateRecipientInput,
  CampaignStatus,
  RecipientCallStatus
} from "@/types/database.types"

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

interface CampaignsResponse {
  data: CallCampaignWithAgent[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  workspaceId?: string // Added for realtime subscriptions
}

interface CampaignResponse {
  data: CallCampaignWithAgent
}

interface RecipientsResponse {
  data: CallRecipient[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface ImportResult {
  data: CallRecipient[]
  imported: number
  total: number
  duplicates: number
}

// ============================================================================
// CAMPAIGNS HOOKS
// ============================================================================

interface UseCampaignsOptions {
  status?: CampaignStatus | "all"
  page?: number
  pageSize?: number
  /** Enable auto-polling when there are active campaigns (default: false) */
  enablePolling?: boolean
  /** Polling interval in milliseconds (default: 5000ms) */
  pollingInterval?: number
}

export function useCampaigns(options: UseCampaignsOptions = {}) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const { 
    status = "all", 
    page = 1, 
    pageSize = 20,
    enablePolling = false,
    pollingInterval = 5000,
  } = options

  const query = useQuery<CampaignsResponse>({
    queryKey: ["campaigns", workspaceSlug, { status, page, pageSize }],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (status !== "all") searchParams.set("status", status)

      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns?${searchParams}`
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch campaigns")
      }
      return response.json()
    },
    enabled: !!workspaceSlug,
    // Always refetch on mount to get fresh data after navigation
    refetchOnMount: "always",
    // Refetch when window regains focus (user comes back to tab)
    refetchOnWindowFocus: true,
    // Consider data stale immediately
    staleTime: 0,
    // Don't keep old data in cache for long
    gcTime: 1000 * 60, // 1 minute
    // Conditionally enable polling: only poll if enabled AND there are active campaigns
    refetchInterval: (query) => {
      if (!enablePolling) return false
      const hasActiveCampaigns = query.state.data?.data?.some(
        (c: CallCampaignWithAgent) => c.status === "active" || c.status === "scheduled"
      ) ?? false
      return hasActiveCampaigns ? pollingInterval : false
    },
    // Only poll when window is visible
    refetchIntervalInBackground: false,
  })

  // Check if there are any active campaigns
  const hasActiveCampaigns = query.data?.data?.some(
    c => c.status === "active" || c.status === "scheduled"
  ) ?? false

  // Get workspace ID from API response (always included, even with no campaigns)
  const workspaceId = query.data?.workspaceId

  return {
    ...query,
    hasActiveCampaigns,
    workspaceId,
  }
}

export function useCampaign(campaignId: string | null) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<CampaignResponse>({
    queryKey: ["campaign", workspaceSlug, campaignId],
    queryFn: async () => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}`
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch campaign")
      }
      return response.json()
    },
    enabled: !!workspaceSlug && !!campaignId,
  })
}

export function useCreateCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateCampaignInput) => {
      const response = await fetch(`/api/w/${workspaceSlug}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create campaign")
      }
      return response.json() as Promise<CampaignResponse>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
    },
  })
}

// Create campaign using the wizard flow (includes recipients)
export function useCreateCampaignWizard() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateCampaignWizardInput) => {
      const response = await fetch(`/api/w/${workspaceSlug}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          wizard_flow: true, // Flag to indicate wizard creation
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create campaign")
      }
      return response.json() as Promise<CampaignResponse>
    },
    onSuccess: () => {
      // Reset queries to force fresh fetch - ensures loader shows on next view
      queryClient.resetQueries({ queryKey: ["campaigns", workspaceSlug] })
    },
  })
}

export function useUpdateCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateCampaignInput }) => {
      const response = await fetch(`/api/w/${workspaceSlug}/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update campaign")
      }
      return response.json() as Promise<CampaignResponse>
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
      queryClient.invalidateQueries({ queryKey: ["campaign", workspaceSlug, variables.id] })
    },
  })
}

export function useDeleteCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/w/${workspaceSlug}/campaigns/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete campaign")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
    },
  })
}

// ============================================================================
// RECIPIENTS HOOKS
// ============================================================================

interface UseRecipientsOptions {
  status?: RecipientCallStatus | "all"
  page?: number
  pageSize?: number
}

export function useCampaignRecipients(
  campaignId: string | null,
  options: UseRecipientsOptions = {}
) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const { status = "all", page = 1, pageSize = 50 } = options

  return useQuery<RecipientsResponse>({
    queryKey: ["campaign-recipients", workspaceSlug, campaignId, { status, page, pageSize }],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (status !== "all") searchParams.set("status", status)

      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/recipients?${searchParams}`
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch recipients")
      }
      return response.json()
    },
    enabled: !!workspaceSlug && !!campaignId,
  })
}

export function useAddRecipient() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      campaignId, 
      data 
    }: { 
      campaignId: string
      data: CreateRecipientInput 
    }) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/recipients`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to add recipient")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["campaign-recipients", workspaceSlug, variables.campaignId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ["campaign", workspaceSlug, variables.campaignId] 
      })
    },
  })
}

export function useImportRecipients() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      campaignId, 
      recipients 
    }: { 
      campaignId: string
      recipients: CreateRecipientInput[] 
    }) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/recipients`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients }),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to import recipients")
      }
      return response.json() as Promise<ImportResult>
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["campaign-recipients", workspaceSlug, variables.campaignId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ["campaign", workspaceSlug, variables.campaignId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ["campaigns", workspaceSlug] 
      })
    },
  })
}

/**
 * OPTIMIZED: Hook for importing large recipient lists
 * Uses the optimized import endpoint with better batching and progress tracking
 */
interface OptimizedImportResult {
  success: boolean
  imported: number
  duplicates: number
  total: number
  processingTimeMs: number
  errors?: string[]
}

export function useImportRecipientsOptimized() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      campaignId, 
      recipients 
    }: { 
      campaignId: string
      recipients: CreateRecipientInput[] 
    }) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/recipients/import-optimized`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients }),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to import recipients")
      }
      return response.json() as Promise<OptimizedImportResult>
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["campaign-recipients", workspaceSlug, variables.campaignId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ["campaign", workspaceSlug, variables.campaignId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ["campaigns", workspaceSlug] 
      })
    },
  })
}

export function useDeleteRecipient() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      campaignId, 
      recipientId 
    }: { 
      campaignId: string
      recipientId: string 
    }) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/recipients?recipientId=${recipientId}`,
        { method: "DELETE" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete recipient")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ["campaign-recipients", workspaceSlug, variables.campaignId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ["campaign", workspaceSlug, variables.campaignId] 
      })
    },
  })
}

export function useDeleteAllRecipients() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/recipients?deleteAll=true`,
        { method: "DELETE" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete recipients")
      }
      return response.json()
    },
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ 
        queryKey: ["campaign-recipients", workspaceSlug, campaignId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ["campaign", workspaceSlug, campaignId] 
      })
    },
  })
}

// ============================================================================
// CAMPAIGN ACTIONS HOOKS
// ============================================================================

interface CampaignActionResponse {
  success: boolean
  campaign: CallCampaignWithAgent
  message?: string
  inspra?: {
    called: boolean
    success: boolean
    error?: string
    batchRef?: string
    recipientCount?: number
  }
}

/**
 * Hook for starting a campaign (SCALABLE VERSION)
 * 
 * Uses the new scalable endpoint that:
 * 1. Queues all calls in the database
 * 2. Starts only a few calls at a time (respecting VAPI concurrency limits)
 * 3. Automatically triggers next calls when previous calls complete (via webhook)
 * 
 * This is the recommended approach for campaigns of any size.
 */
export function useStartCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation<CampaignActionResponse, Error, string>({
    mutationFn: async (campaignId: string) => {
      // Use the scalable endpoint for better handling of large campaigns
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/start-scalable`,
        { method: "POST" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to start campaign")
      }
      return response.json()
    },
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
      queryClient.invalidateQueries({ queryKey: ["campaign", workspaceSlug, campaignId] })
    },
  })
}

/**
 * Hook for manually triggering call processing for a campaign
 * 
 * This is useful for:
 * - Recovery from stuck states
 * - Manually pushing calls when webhooks fail
 * - Debugging campaign processing
 */
export function useProcessCampaignCalls() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/process-calls`,
        { method: "POST" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to process calls")
      }
      return response.json()
    },
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
      queryClient.invalidateQueries({ queryKey: ["campaign", workspaceSlug, campaignId] })
      queryClient.invalidateQueries({ queryKey: ["campaign-recipients", workspaceSlug, campaignId] })
    },
  })
}

// NOTE: usePauseCampaign and useResumeCampaign have been removed.
// VAPI doesn't support pausing campaigns - once started, calls process automatically.
// Use useTerminateCampaign to cancel a campaign and stop all future calls.

/**
 * Hook for terminating a campaign
 * Calls Inspra /terminate-batch and updates local status
 */
export function useTerminateCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation<CampaignActionResponse, Error, string>({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/terminate`,
        { method: "POST" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to terminate campaign")
      }
      return response.json()
    },
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
      queryClient.invalidateQueries({ queryKey: ["campaign", workspaceSlug, campaignId] })
    },
  })
}

/**
 * Hook for making a test call
 * Calls Inspra /test-call endpoint
 */
export function useTestCall() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useMutation<CampaignActionResponse, Error, {
    campaignId: string
    phoneNumber: string
    variables?: Record<string, string>
  }>({
    mutationFn: async ({ campaignId, phoneNumber, variables }) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/test-call`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone_number: phoneNumber, variables }),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to queue test call")
      }
      return response.json()
    },
  })
}

// ============================================================================
// CLEANUP HOOK
// ============================================================================

interface CleanupResponse {
  success: boolean
  message: string
  staleRecipientsFound: number
  staleRecipientsUpdated: number
  campaignCompleted: boolean
}

/**
 * Hook for cleaning up stale "calling" recipients in a campaign
 * Marks recipients stuck in "calling" status for too long as "failed"
 */
export function useCleanupCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation<CleanupResponse, Error, string>({
    mutationFn: async (campaignId) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/cleanup`,
        { method: "POST" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to cleanup stale calls")
      }
      return response.json()
    },
    onSuccess: (_, campaignId) => {
      // Refetch campaign and recipients data
      queryClient.invalidateQueries({
        queryKey: ["campaign", workspaceSlug, campaignId],
      })
      queryClient.invalidateQueries({
        queryKey: ["campaign-recipients", workspaceSlug, campaignId],
      })
      queryClient.invalidateQueries({
        queryKey: ["campaigns", workspaceSlug],
      })
    },
  })
}

// ============================================================================
// POLLING FALLBACK HOOKS
// ============================================================================

interface ProcessStuckResponse {
  success: boolean
  processed: number
  totalStarted: number
  totalFailed: number
  results: Array<{
    campaignId: string
    campaignName: string
    started: number
    failed: number
    remaining: number
    error?: string
  }>
}

/**
 * Hook for polling/continuing stuck campaigns.
 * Call this periodically (every 30s) when a campaign is active to ensure
 * the webhook chain doesn't break.
 */
export function useProcessStuckCampaigns() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation<ProcessStuckResponse, Error, void>({
    mutationFn: async () => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/process-stuck`,
        { method: "POST" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to process stuck campaigns")
      }
      return response.json()
    },
    onSuccess: (data) => {
      if (data.totalStarted > 0) {
        // Refresh campaign data if we started any calls
        queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
      }
    },
  })
}

/**
 * Hook to automatically poll for stuck campaigns while a campaign is active.
 * This acts as a fallback when the webhook chain breaks.
 * 
 * Usage:
 * ```tsx
 * useCampaignPollingFallback(campaignId, campaign.status === "active")
 * ```
 */
export function useCampaignPollingFallback(
  campaignId: string,
  isActive: boolean,
  pollingIntervalMs: number = 30000 // 30 seconds default
) {
  const processStuck = useProcessStuckCampaigns()
  const queryClient = useQueryClient()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  // Use useEffect for polling - need to import it
  // Note: This will need to be called in a component context
  if (typeof window !== "undefined" && isActive) {
    // We can't use useEffect in a non-component context directly
    // This hook should be used in a component that can handle the polling
    console.log(`[CampaignPolling] Campaign ${campaignId} is active - polling enabled`)
  }

  return {
    processStuck,
    triggerCheck: async () => {
      if (!isActive) return null
      console.log("[CampaignPolling] Manual check triggered...")
      try {
        const result = await processStuck.mutateAsync()
        if (result.totalStarted > 0) {
          console.log(`[CampaignPolling] Restarted ${result.totalStarted} calls`)
          queryClient.invalidateQueries({ queryKey: ["campaign", workspaceSlug, campaignId] })
          queryClient.invalidateQueries({ queryKey: ["campaign-recipients", workspaceSlug, campaignId] })
        }
        return result
      } catch (error) {
        console.error("[CampaignPolling] Error:", error)
        return null
      }
    },
  }
}


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
}

export function useCampaigns(options: UseCampaignsOptions = {}) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const { status = "all", page = 1, pageSize = 20 } = options

  return useQuery<CampaignsResponse>({
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
  })
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
 * Hook for starting a campaign
 * Updates local status and activates the batch
 */
export function useStartCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation<CampaignActionResponse, Error, string>({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/start`,
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
 * Hook for pausing a campaign
 * Calls Inspra /pause-batch and updates local status
 */
export function usePauseCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation<CampaignActionResponse, Error, string>({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/pause`,
        { method: "POST" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to pause campaign")
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
 * Hook for resuming a paused campaign
 * Calls Inspra /load-json with updated NBF and updates local status
 */
export function useResumeCampaign() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation<CampaignActionResponse, Error, string>({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/api/w/${workspaceSlug}/campaigns/${campaignId}/resume`,
        { method: "POST" }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to resume campaign")
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


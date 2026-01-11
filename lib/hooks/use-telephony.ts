import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type {
  SipTrunk,
  PhoneNumber,
  CreateSipTrunkInput,
  UpdateSipTrunkInput,
  CreatePhoneNumberInput,
  UpdatePhoneNumberInput,
} from "@/types/database.types"

// =============================================================================
// SIP TRUNKS
// =============================================================================

interface SipTrunkWithRelations extends SipTrunk {
  // Add any relations if needed
}

interface PhoneNumberWithRelations extends PhoneNumber {
  sipTrunk?: {
    id: string
    name: string
    sipServer: string
    sipPort?: number
  } | null
  assignedAgent?: {
    id: string
    name: string
    provider?: string
  } | null
  assignedWorkspace?: {
    id: string
    name: string
    slug: string
  } | null
}

/**
 * Hook to fetch all SIP trunks for the partner
 */
export function useSipTrunks() {
  return useQuery<SipTrunkWithRelations[]>({
    queryKey: ["sip-trunks"],
    queryFn: async () => {
      const response = await fetch("/api/partner/telephony/sip-trunks")
      if (!response.ok) {
        throw new Error("Failed to fetch SIP trunks")
      }
      const json = await response.json()
      return json.data
    },
  })
}

/**
 * Hook to fetch a single SIP trunk
 */
export function useSipTrunk(id: string | null) {
  return useQuery<SipTrunkWithRelations>({
    queryKey: ["sip-trunks", id],
    queryFn: async () => {
      if (!id) throw new Error("No SIP trunk ID provided")
      const response = await fetch(`/api/partner/telephony/sip-trunks/${id}`)
      if (!response.ok) {
        throw new Error("Failed to fetch SIP trunk")
      }
      const json = await response.json()
      return json.data
    },
    enabled: !!id,
  })
}

/**
 * Hook to create a SIP trunk
 */
export function useCreateSipTrunk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateSipTrunkInput) => {
      const response = await fetch("/api/partner/telephony/sip-trunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create SIP trunk")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sip-trunks"] })
      toast.success("SIP trunk created successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to update a SIP trunk
 */
export function useUpdateSipTrunk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateSipTrunkInput }) => {
      const response = await fetch(`/api/partner/telephony/sip-trunks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update SIP trunk")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sip-trunks"] })
      queryClient.invalidateQueries({ queryKey: ["sip-trunks", variables.id] })
      toast.success("SIP trunk updated successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to delete a SIP trunk
 */
export function useDeleteSipTrunk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/partner/telephony/sip-trunks/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete SIP trunk")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sip-trunks"] })
      toast.success("SIP trunk deleted successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// =============================================================================
// PHONE NUMBERS
// =============================================================================

interface PhoneNumberFilters {
  status?: string
  workspace_id?: string
  agent_id?: string
  provider?: string
}

/**
 * Hook to fetch all phone numbers for the partner
 */
export function usePhoneNumbers(filters?: PhoneNumberFilters) {
  const queryParams = new URLSearchParams()
  if (filters?.status) queryParams.set("status", filters.status)
  if (filters?.workspace_id) queryParams.set("workspace_id", filters.workspace_id)
  if (filters?.agent_id) queryParams.set("agent_id", filters.agent_id)
  if (filters?.provider) queryParams.set("provider", filters.provider)

  const queryString = queryParams.toString()

  return useQuery<PhoneNumberWithRelations[]>({
    queryKey: ["phone-numbers", filters],
    queryFn: async () => {
      const url = `/api/partner/telephony/phone-numbers${queryString ? `?${queryString}` : ""}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error("Failed to fetch phone numbers")
      }
      const json = await response.json()
      return json.data
    },
  })
}

/**
 * Hook to fetch available phone numbers for agent assignment
 * Returns all phone numbers so UI can indicate which are synced
 */
export function useAvailablePhoneNumbers() {
  return usePhoneNumbers()
}

/**
 * Hook to fetch a single phone number
 */
export function usePhoneNumber(id: string | null) {
  return useQuery<PhoneNumberWithRelations>({
    queryKey: ["phone-numbers", id],
    queryFn: async () => {
      if (!id) throw new Error("No phone number ID provided")
      const response = await fetch(`/api/partner/telephony/phone-numbers/${id}`)
      if (!response.ok) {
        throw new Error("Failed to fetch phone number")
      }
      const json = await response.json()
      return json.data
    },
    enabled: !!id,
  })
}

/**
 * Hook to create a phone number
 */
export function useCreatePhoneNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreatePhoneNumberInput) => {
      const response = await fetch("/api/partner/telephony/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create phone number")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phone-numbers"] })
      toast.success("Phone number added successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to update a phone number
 */
export function useUpdatePhoneNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePhoneNumberInput }) => {
      const response = await fetch(`/api/partner/telephony/phone-numbers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update phone number")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["phone-numbers"] })
      queryClient.invalidateQueries({ queryKey: ["phone-numbers", variables.id] })
      queryClient.invalidateQueries({ queryKey: ["agents"] }) // Refresh agents if assignment changed
      toast.success("Phone number updated successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to assign a phone number to an agent
 */
export function useAssignPhoneNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ phoneNumberId, agentId }: { phoneNumberId: string; agentId: string | null }) => {
      const response = await fetch(`/api/partner/telephony/phone-numbers/${phoneNumberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_agent_id: agentId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to assign phone number")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phone-numbers"] })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      toast.success("Phone number assignment updated")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to delete a phone number
 */
export function useDeletePhoneNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/partner/telephony/phone-numbers/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to delete phone number")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phone-numbers"] })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      toast.success("Phone number deleted successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// =============================================================================
// SIP TRUNK SYNC HOOKS
// =============================================================================

/**
 * Hook to sync a SIP trunk to Vapi
 */
export function useSyncSipTrunk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/partner/telephony/sip-trunks/${id}/sync`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to sync SIP trunk")
      }
      return response.json()
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["sip-trunks"] })
      queryClient.invalidateQueries({ queryKey: ["sip-trunks", id] })
      toast.success("SIP trunk synced to Vapi successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to unsync a SIP trunk from Vapi
 */
export function useUnsyncSipTrunk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/partner/telephony/sip-trunks/${id}/sync`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to unsync SIP trunk")
      }
      return response.json()
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["sip-trunks"] })
      queryClient.invalidateQueries({ queryKey: ["sip-trunks", id] })
      toast.success("SIP trunk unsynced from Vapi")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// =============================================================================
// PHONE NUMBER SYNC HOOKS
// =============================================================================

/**
 * Hook to sync a phone number to Vapi
 */
export function useSyncPhoneNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/partner/telephony/phone-numbers/${id}/sync`, {
        method: "POST",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to sync phone number")
      }
      return response.json()
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["phone-numbers"] })
      queryClient.invalidateQueries({ queryKey: ["phone-numbers", id] })
      toast.success("Phone number synced to Vapi successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to unsync a phone number from Vapi
 */
export function useUnsyncPhoneNumber() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/partner/telephony/phone-numbers/${id}/sync`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to unsync phone number")
      }
      return response.json()
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["phone-numbers"] })
      queryClient.invalidateQueries({ queryKey: ["phone-numbers", id] })
      toast.success("Phone number unsynced from Vapi")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * Hook to assign a phone number to an agent via Vapi
 */
export function useAssignPhoneNumberToAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ phoneNumberId, agentId }: { phoneNumberId: string; agentId: string | null }) => {
      const response = await fetch(`/api/partner/telephony/phone-numbers/${phoneNumberId}/sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to assign phone number")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["phone-numbers"] })
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      toast.success("Phone number assignment updated")
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}



"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export interface PartnerTeamMember {
  id: string
  role: "owner" | "admin" | "member"
  joined_at: string
  user_id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  status: string
}

export interface PartnerInvitation {
  id: string
  email: string
  role: "owner" | "admin" | "member"
  message: string | null
  status: string
  expires_at: string
  created_at: string
  inviter: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
  }
}

/**
 * Hook to fetch partner team members
 */
export function usePartnerTeam() {
  return useQuery<PartnerTeamMember[]>({
    queryKey: ["partner-team"],
    queryFn: async () => {
      const res = await fetch("/api/partner/team")
      if (!res.ok) {
        throw new Error("Failed to fetch team members")
      }
      const result = await res.json()
      return result.data
    },
  })
}

/**
 * Hook to fetch partner invitations
 */
export function usePartnerInvitations() {
  return useQuery<PartnerInvitation[]>({
    queryKey: ["partner-invitations"],
    queryFn: async () => {
      const res = await fetch("/api/partner/invitations")
      if (!res.ok) {
        throw new Error("Failed to fetch invitations")
      }
      const result = await res.json()
      return result.data
    },
  })
}

/**
 * Hook to invite a team member
 */
export function useInvitePartnerMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { email: string; role: string; message?: string }) => {
      const res = await fetch("/api/partner/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || "Failed to send invitation")
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-invitations"] })
    },
  })
}

/**
 * Hook to cancel an invitation
 */
export function useCancelPartnerInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await fetch(`/api/partner/invitations/${invitationId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || "Failed to cancel invitation")
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-invitations"] })
    },
  })
}

/**
 * Hook to resend an invitation
 */
export function useResendPartnerInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await fetch(`/api/partner/invitations/${invitationId}`, {
        method: "POST",
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || "Failed to resend invitation")
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-invitations"] })
    },
  })
}

/**
 * Hook to update a team member's role
 */
export function useUpdatePartnerMemberRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const res = await fetch(`/api/partner/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || "Failed to update role")
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-team"] })
    },
  })
}

/**
 * Hook to remove a team member
 */
export function useRemovePartnerMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/partner/team/${memberId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const result = await res.json()
        throw new Error(result.error || "Failed to remove member")
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-team"] })
    },
  })
}


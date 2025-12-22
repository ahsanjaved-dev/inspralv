"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { WorkspaceInvitation, CreateWorkspaceInvitationInput } from "@/types/database.types"

interface WorkspaceMember {
  id: string
  user_id: string
  role: string
  joined_at: string
  user?: {
    email: string
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  }
}

export function useWorkspaceMembers() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceMember[]>({
    queryKey: ["workspace-members", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/members`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch members")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
  })
}

export function useWorkspaceInvitations() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<WorkspaceInvitation[]>({
    queryKey: ["workspace-invitations", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/invitations`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch invitations")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
  })
}

export function useCreateWorkspaceInvitation() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateWorkspaceInvitationInput) => {
      const res = await fetch(`/api/w/${workspaceSlug}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to send invitation")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspaceSlug] })
    },
  })
}

export function useCancelWorkspaceInvitation() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await fetch(`/api/w/${workspaceSlug}/invitations/${invitationId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to cancel invitation")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspaceSlug] })
    },
  })
}

/**
 * Hook to update a workspace member's role
 */
export function useUpdateWorkspaceMemberRole() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const res = await fetch(`/api/w/${workspaceSlug}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update role")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceSlug] })
    },
  })
}

/**
 * Hook to remove a workspace member
 */
export function useRemoveWorkspaceMember() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/w/${workspaceSlug}/members/${memberId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to remove member")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceSlug] })
    },
  })
}
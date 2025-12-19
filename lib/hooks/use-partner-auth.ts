"use client"

import { useQuery } from "@tanstack/react-query"
import type { AccessibleWorkspace, PartnerAuthUser } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface PartnerAuthResponse {
  user: PartnerAuthUser
  partner: ResolvedPartner
  workspaces: AccessibleWorkspace[]
  summary: {
    workspace_count: number
    roles: string[]
  }
}

/**
 * Client-side hook to fetch the current partner auth context
 */
export function usePartnerAuth() {
  return useQuery<PartnerAuthResponse>({
    queryKey: ["partner-auth-context"],
    queryFn: async () => {
      const res = await fetch("/api/auth/context")
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Not authenticated")
        }
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch auth context")
      }
      const json = await res.json()
      return json.data
    },
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
    retry: 1,
  })
}

/**
 * Get the user's display name
 */
export function getUserDisplayName(user: PartnerAuthUser | undefined): string {
  if (!user) return "User"
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`
  }
  if (user.first_name) return user.first_name
  return user.email.split("@")[0]
}

/**
 * Get user initials for avatar fallback
 */
export function getUserInitials(user: PartnerAuthUser | undefined): string {
  if (!user) return "?"
  if (user.first_name && user.last_name) {
    return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
  }
  if (user.first_name) return user.first_name[0].toUpperCase()
  return user.email[0].toUpperCase()
}

/**
 * Check if user has a specific role in any workspace
 */
export function hasAnyWorkspaceRole(
  workspaces: AccessibleWorkspace[] | undefined,
  roles: string[]
): boolean {
  if (!workspaces) return false
  return workspaces.some((w) => roles.includes(w.role))
}

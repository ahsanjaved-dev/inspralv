"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { usePartnerAuth } from "./use-partner-auth"
import { type PartnerRole, type WorkspaceRole } from "@/lib/rbac/permissions"
import type { DashboardStats } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export type DashboardDateFilter = "today" | "7d" | "30d" | "all" | "manual"

export interface DashboardFilterOptions {
  filter: DashboardDateFilter
  startDate?: Date
  endDate?: Date
}

export interface WorkspaceDashboardStats extends DashboardStats {
  // Workspace-specific stats
  total_agents: number
  total_conversations: number
  total_minutes: number
  total_cost: number
  conversations_this_month: number
  minutes_this_month: number
  cost_this_month: number
  // Date range info
  filter?: DashboardDateFilter
  dateRange?: {
    start: string | null
    end: string | null
  }
}

export interface PartnerDashboardStats {
  // Partner-wide (organization) stats - only for admins/owners
  total_workspaces: number
  total_agents_all_workspaces: number
  total_calls_today: number
}

export interface DashboardData {
  // Workspace-level stats (always available for workspace members)
  workspace: WorkspaceDashboardStats | null
  
  // Partner-level stats (only for partner admins/owners)
  partner: PartnerDashboardStats | null
  
  // Role information for conditional rendering
  roles: {
    workspaceRole: WorkspaceRole | null
    partnerRole: PartnerRole | null
    canViewPartnerStats: boolean
    canViewWorkspaceStats: boolean
    isWorkspaceAdmin: boolean
    isPartnerAdmin: boolean
  }
  
  // Loading states
  isLoading: boolean
  isLoadingWorkspace: boolean
  isLoadingPartner: boolean
  
  // Error states
  error: Error | null
  workspaceError: Error | null
  partnerError: Error | null
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useDashboardData(filterOptions?: DashboardFilterOptions): DashboardData {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  
  // Default to "today" filter if not provided
  const filter = filterOptions?.filter ?? "today"
  const startDate = filterOptions?.startDate
  const endDate = filterOptions?.endDate
  
  // Get auth context to determine roles
  const { data: authData, isLoading: isAuthLoading } = usePartnerAuth()
  
  // Find current workspace and role
  const currentWorkspace = authData?.workspaces.find((w) => w.slug === workspaceSlug)
  const workspaceRole = (currentWorkspace?.role as WorkspaceRole) || null
  const partnerRole = getPartnerRole(authData)
  
  // Determine permissions - all workspace members can view workspace stats
  // Partner members can view org stats only if they are admin/owner
  const canViewWorkspaceStats = workspaceRole !== null
  const canViewPartnerStats = partnerRole === "owner" || partnerRole === "admin"
  
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin"
  const isPartnerAdmin = partnerRole === "owner" || partnerRole === "admin"
  
  // Build query string for stats API
  const buildStatsUrl = () => {
    const params = new URLSearchParams()
    params.set("filter", filter)
    if (filter === "manual" && startDate) {
      params.set("startDate", startDate.toISOString())
    }
    if (filter === "manual" && endDate) {
      params.set("endDate", endDate.toISOString())
    }
    return `/api/w/${workspaceSlug}/dashboard/stats?${params.toString()}`
  }
  
  // Fetch workspace stats - enabled when we have a workspace slug and auth is loaded
  // The API will handle permission checking
  const {
    data: workspaceStats,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useQuery<WorkspaceDashboardStats>({
    queryKey: ["workspace-dashboard-stats", workspaceSlug, filter, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      const res = await fetch(buildStatsUrl())
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch workspace stats")
      }
      const json = await res.json()
      return json.data
    },
    // Enable as soon as we have a workspaceSlug - API will verify permissions
    enabled: !!workspaceSlug,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  })
  
  // Fetch partner stats (only for partner admins/owners)
  // The API will return 403 for non-admins, which we handle gracefully
  const {
    data: partnerStats,
    isLoading: isLoadingPartner,
    error: partnerError,
  } = useQuery<PartnerDashboardStats>({
    queryKey: ["partner-dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/partner/dashboard/stats")
      if (!res.ok) {
        if (res.status === 403) {
          // User doesn't have permission - this is expected for non-admins
          return null
        }
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch partner stats")
      }
      const json = await res.json()
      return json.data
    },
    // Only fetch partner stats if auth is loaded and user is partner admin/owner
    enabled: !isAuthLoading && canViewPartnerStats,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  })
  
  return {
    workspace: workspaceStats ?? null,
    partner: canViewPartnerStats ? (partnerStats ?? null) : null,
    roles: {
      workspaceRole,
      partnerRole,
      canViewPartnerStats,
      canViewWorkspaceStats,
      isWorkspaceAdmin,
      isPartnerAdmin,
    },
    isLoading: isAuthLoading || isLoadingWorkspace || (canViewPartnerStats && isLoadingPartner),
    isLoadingWorkspace,
    isLoadingPartner: canViewPartnerStats ? isLoadingPartner : false,
    error: workspaceError || partnerError || null,
    workspaceError: workspaceError || null,
    partnerError: canViewPartnerStats ? (partnerError || null) : null,
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract partner role from auth response
 * IMPORTANT: partnerRole is the user's role in the partner organization,
 * NOT their workspace role. summary.roles contains workspace roles.
 */
function getPartnerRole(authData: any): PartnerRole | null {
  if (!authData) return null
  
  // Check for direct partnerRole field (this is the correct field)
  if (authData.partnerRole) {
    const role = authData.partnerRole
    if (role === "owner" || role === "admin" || role === "member") {
      return role as PartnerRole
    }
  }
  
  // Fallback: Check partnerMembership.role
  if (authData.partnerMembership?.role) {
    const role = authData.partnerMembership.role
    if (role === "owner" || role === "admin" || role === "member") {
      return role as PartnerRole
    }
  }
  
  return null
}

/**
 * Hook to prefetch dashboard data
 */
export function usePrefetchDashboardData() {
  const queryClient = useQueryClient()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  
  return {
    prefetchWorkspaceStats: async () => {
      await queryClient.prefetchQuery({
        queryKey: ["workspace-dashboard-stats", workspaceSlug],
        queryFn: async () => {
          const res = await fetch(`/api/w/${workspaceSlug}/dashboard/stats`)
          if (!res.ok) throw new Error("Failed to prefetch")
          return (await res.json()).data
        },
      })
    },
    prefetchPartnerStats: async () => {
      await queryClient.prefetchQuery({
        queryKey: ["partner-dashboard-stats"],
        queryFn: async () => {
          const res = await fetch("/api/partner/dashboard/stats")
          if (!res.ok) throw new Error("Failed to prefetch")
          return (await res.json()).data
        },
      })
    },
  }
}


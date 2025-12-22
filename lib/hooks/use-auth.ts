"use client"

import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useCallback, useMemo } from "react"
import type { PartnerAuthContext } from "@/lib/api/auth"

export function useAuth() {
  const router = useRouter()

  const supabase = useMemo(() => createClient(), [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }, [supabase, router])

  return { logout, supabase }
}

/**
 * Hook to fetch the current user's authentication context
 * This includes partner membership, workspaces, and user details
 */
export function useAuthContext() {
  return useQuery<PartnerAuthContext | null>({
    queryKey: ["auth-context"],
    queryFn: async () => {
      const res = await fetch("/api/auth/context")
      if (!res.ok) {
        if (res.status === 401) {
          return null
        }
        throw new Error("Failed to fetch auth context")
      }
      const result = await res.json()
      return result.data
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  })
}

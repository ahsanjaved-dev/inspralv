"use client"

import { useQuery } from "@tanstack/react-query"
import type { ResolvedPartner } from "@/lib/api/partner"

interface PartnerResponse {
  hostname: string
  partner: ResolvedPartner
}

/**
 * Client-side hook to fetch the current partner
 * Useful for components that need partner info on the client
 */
export function usePartner() {
  return useQuery<PartnerResponse>({
    queryKey: ["partner"],
    queryFn: async () => {
      const res = await fetch("/api/partner")
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch partner")
      }
      const json = await res.json()
      return json.data
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  })
}

/**
 * Get partner display name with fallback
 */
export function getDisplayName(partner: ResolvedPartner | undefined): string {
  if (!partner) return "Loading..."
  return partner.branding?.company_name || partner.name
}

/**
 * Get partner primary color with fallback
 */
export function getPrimaryColor(partner: ResolvedPartner | undefined): string {
  if (!partner) return "#7c3aed"
  return partner.branding?.primary_color || "#7c3aed"
}

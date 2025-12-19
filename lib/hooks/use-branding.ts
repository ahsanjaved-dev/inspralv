"use client"

import { useBranding } from "@/context/branding-context"

/**
 * Hook to access partner branding in client components
 * Provides typed access to branding properties with fallbacks
 */
export function usePartnerBranding() {
  const context = useBranding()

  const branding = context.branding
  const partner = context.partner

  return {
    // Company info
    companyName: branding.company_name || partner?.name || "AI Voice Platform",

    // Colors
    primaryColor: branding.primary_color || "#7c3aed",
    secondaryColor: branding.secondary_color || "#6b7280",

    // Assets
    logoUrl: branding.logo_url || null,
    faviconUrl: branding.favicon_url || null,

    // Full objects
    branding,
    partner,

    // Helpers
    getInitial: () => {
      const name = branding.company_name || partner?.name || "A"
      return name[0].toUpperCase()
    },
  }
}

"use client"

import { createContext, useContext, useEffect } from "react"
import type { PartnerBranding } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface BrandingContextValue {
  branding: PartnerBranding
  partner: ResolvedPartner
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

export function useBranding() {
  const context = useContext(BrandingContext)
  if (!context) throw new Error("useBranding must be used within BrandingProvider")
  return context
}

interface BrandingProviderProps {
  partner: ResolvedPartner
  children: React.ReactNode
}

export function BrandingProvider({ partner, children }: BrandingProviderProps) {
  const branding = partner.branding

  useEffect(() => {
    const root = document.documentElement

    if (branding.primary_color) {
      root.style.setProperty("--brand-primary", branding.primary_color)
      root.style.setProperty("--brand-primary-hover", adjustColor(branding.primary_color, -10))
    }
    if (branding.secondary_color) {
      root.style.setProperty("--brand-secondary", branding.secondary_color)
    }

    if (branding.company_name) {
      document.title = `${branding.company_name} | AI Voice Platform`
    }

    if (branding.favicon_url) {
      const existingLink = document.querySelector("link[rel='icon']") as HTMLLinkElement
      if (existingLink) {
        existingLink.href = branding.favicon_url
      } else {
        const link = document.createElement("link")
        link.rel = "icon"
        link.href = branding.favicon_url
        document.head.appendChild(link)
      }
    }

    return () => {
      root.style.removeProperty("--brand-primary")
      root.style.removeProperty("--brand-primary-hover")
      root.style.removeProperty("--brand-secondary")
    }
  }, [branding])

  return (
    <BrandingContext.Provider value={{ branding, partner }}>{children}</BrandingContext.Provider>
  )
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amt))
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt))
  const B = Math.max(0, Math.min(255, (num & 0xff) + amt))
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`
}

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

/**
 * Convert HEX color to HSL string for CSS variables
 */
function hexToHsl(hex: string): string {
  // Remove # if present
  hex = hex.replace(/^#/, "")

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function BrandingProvider({ partner, children }: BrandingProviderProps) {
  const branding = partner.branding

  useEffect(() => {
    const root = document.documentElement

    // Set brand-specific CSS variables on :root (legacy support)
    if (branding.primary_color) {
      root.style.setProperty("--brand-primary", branding.primary_color)
      root.style.setProperty("--brand-primary-hover", adjustColor(branding.primary_color, -10))
    }

    if (branding.secondary_color) {
      root.style.setProperty("--brand-secondary", branding.secondary_color)
    }

    // Find and update the workspace-theme element directly
    // This is necessary because .workspace-theme has its own CSS variable definitions
    // that would otherwise override the :root values
    const workspaceTheme = document.querySelector(".workspace-theme") as HTMLElement | null

    if (workspaceTheme) {
      if (branding.primary_color) {
        const primaryHsl = hexToHsl(branding.primary_color)
        workspaceTheme.style.setProperty("--primary", `hsl(${primaryHsl})`)
        workspaceTheme.style.setProperty("--sidebar-primary", `hsl(${primaryHsl})`)
        workspaceTheme.style.setProperty("--ring", `hsl(${primaryHsl})`)
      }

      if (branding.secondary_color) {
        const secondaryHsl = hexToHsl(branding.secondary_color)
        workspaceTheme.style.setProperty("--secondary", `hsl(${secondaryHsl})`)
      }
    }

    // Also set on :root for components outside workspace-theme
    if (branding.primary_color) {
      const primaryHsl = hexToHsl(branding.primary_color)
      root.style.setProperty("--primary", `hsl(${primaryHsl})`)
      root.style.setProperty("--sidebar-primary", `hsl(${primaryHsl})`)
      root.style.setProperty("--ring", `hsl(${primaryHsl})`)
    }

    if (branding.secondary_color) {
      const secondaryHsl = hexToHsl(branding.secondary_color)
      root.style.setProperty("--secondary", `hsl(${secondaryHsl})`)
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
      // Clean up brand-specific variables
      root.style.removeProperty("--brand-primary")
      root.style.removeProperty("--brand-primary-hover")
      root.style.removeProperty("--brand-secondary")
      
      // Clean up workspace-theme overrides
      const wsTheme = document.querySelector(".workspace-theme") as HTMLElement | null
      if (wsTheme) {
        wsTheme.style.removeProperty("--primary")
        wsTheme.style.removeProperty("--sidebar-primary")
        wsTheme.style.removeProperty("--ring")
        wsTheme.style.removeProperty("--secondary")
      }
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

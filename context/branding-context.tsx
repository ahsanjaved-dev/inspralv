"use client"

import { createContext, useContext, useEffect } from "react"
import type { Organization, OrganizationBranding } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

// Support both Organization (legacy) and Partner (new)
type BrandingSource = Organization | ResolvedPartner

interface BrandingContextValue {
  branding: OrganizationBranding
  source: BrandingSource
  // For backward compatibility
  organization?: Organization
  partner?: ResolvedPartner
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

export function useBranding() {
  const context = useContext(BrandingContext)
  if (!context) throw new Error("useBranding must be used within BrandingProvider")
  return context
}

// Legacy props (for backward compatibility)
interface LegacyBrandingProviderProps {
  organization: Organization
  children: React.ReactNode
}

// New props (for partner-based branding)
interface PartnerBrandingProviderProps {
  partner: ResolvedPartner
  children: React.ReactNode
}

type BrandingProviderProps = LegacyBrandingProviderProps | PartnerBrandingProviderProps

function isPartnerProps(props: BrandingProviderProps): props is PartnerBrandingProviderProps {
  return "partner" in props
}

export function BrandingProvider(props: BrandingProviderProps) {
  const { children } = props

  // Determine branding source
  const source: BrandingSource = isPartnerProps(props) ? props.partner : props.organization
  const branding = isPartnerProps(props)
    ? props.partner.branding
    : props.organization.branding || {}

  // Apply CSS custom properties for branding colors
  useEffect(() => {
    const root = document.documentElement

    if (branding.primary_color) {
      root.style.setProperty("--brand-primary", branding.primary_color)
      root.style.setProperty("--brand-primary-hover", adjustColor(branding.primary_color, -10))
    }
    if (branding.secondary_color) {
      root.style.setProperty("--brand-secondary", branding.secondary_color)
    }

    // Update document title for partner branding
    if (branding.company_name) {
      document.title = `${branding.company_name} | AI Voice Platform`
    }

    // Update favicon if provided
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

  const contextValue: BrandingContextValue = {
    branding,
    source,
    organization: isPartnerProps(props) ? undefined : props.organization,
    partner: isPartnerProps(props) ? props.partner : undefined,
  }

  return <BrandingContext.Provider value={contextValue}>{children}</BrandingContext.Provider>
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amt))
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt))
  const B = Math.max(0, Math.min(255, (num & 0xff) + amt))
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`
}

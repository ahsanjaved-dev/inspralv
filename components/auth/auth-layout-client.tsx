"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { Mic } from "lucide-react"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
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

export function AuthLayoutClient({ partner, children }: Props) {
  const branding = partner.branding
  const companyName = branding.company_name || partner.name

  // Compute CSS custom properties from partner branding inline (SSR-safe)
  const brandingStyles = useMemo(() => {
    const styles: Record<string, string> = {}

    if (branding.primary_color) {
      const primaryHsl = hexToHsl(branding.primary_color)
      styles["--primary"] = `hsl(${primaryHsl})`
      styles["--sidebar-primary"] = `hsl(${primaryHsl})`
      styles["--ring"] = `hsl(${primaryHsl})`
      styles["--brand-primary"] = branding.primary_color
    }

    if (branding.secondary_color) {
      const secondaryHsl = hexToHsl(branding.secondary_color)
      styles["--secondary"] = `hsl(${secondaryHsl})`
      styles["--brand-secondary"] = branding.secondary_color
    }

    return styles
  }, [branding])

  // Apply additional document-level changes (title, favicon) on client
  useEffect(() => {
    // Update title
    document.title = `${companyName} | AI Voice Platform`

    // Update favicon
    if (branding.favicon_url) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement
      if (!link) {
        link = document.createElement("link")
        link.rel = "icon"
        document.head.appendChild(link)
      }
      link.href = branding.favicon_url
    }
  }, [branding.favicon_url, companyName])

  return (
    <div 
      className="min-h-screen flex flex-col bg-background text-foreground"
      style={brandingStyles as React.CSSProperties}
    >
      {/* Background Pattern */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[100px] opacity-50" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-primary/5 rounded-full blur-[80px] opacity-50" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-4 flex justify-end">
        <ThemeToggle />
      </header>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Partner Logo/Name */}
        {/* Only link to home for platform partner, partner domains have no marketing site */}
        {partner.is_platform_partner ? (
          <Link href="/" className="flex flex-col items-center mb-8">
            {branding.logo_url ? (
              <img 
                src={branding.logo_url} 
                alt={companyName} 
                className="h-12 mb-4" 
              />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
                <Mic className="h-7 w-7 text-primary-foreground" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{companyName}</h1>
            <p className="text-muted-foreground text-sm mt-1">AI Voice Platform</p>
          </Link>
        ) : (
          <div className="flex flex-col items-center mb-8">
            {branding.logo_url ? (
              <img 
                src={branding.logo_url} 
                alt={companyName} 
                className="h-12 mb-4" 
              />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
                <Mic className="h-7 w-7 text-primary-foreground" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{companyName}</h1>
            <p className="text-muted-foreground text-sm mt-1">AI Voice Platform</p>
          </div>
        )}

        {/* Form Container */}
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative py-6 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} {companyName}. All rights reserved.</p>
      </footer>
    </div>
  )
}

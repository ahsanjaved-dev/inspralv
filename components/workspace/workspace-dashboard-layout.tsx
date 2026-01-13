"use client"

import { useState, useEffect, useMemo } from "react"
import { WorkspaceSidebar } from "./workspace-sidebar"
import { WorkspaceHeader } from "./workspace-header"
import { WorkspaceMobileSidebar } from "./workspace-mobile-sidebar"
import { PaywallBanner } from "./paywall-banner"
import { BrandingProvider } from "@/context/branding-context"
import { cn } from "@/lib/utils"
import type { PartnerAuthUser, AccessibleWorkspace, PartnerMemberRole } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  user: PartnerAuthUser
  partner: ResolvedPartner
  currentWorkspace: AccessibleWorkspace
  workspaces: AccessibleWorkspace[]
  partnerRole?: PartnerMemberRole | null
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

export function WorkspaceDashboardLayout({
  user,
  partner,
  currentWorkspace,
  workspaces,
  partnerRole,
  children,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Load saved collapsed state on mount
  useEffect(() => {
    const saved = localStorage.getItem("workspace-sidebar-collapsed")
    if (saved === "true") {
      setIsCollapsed(true)
    }
  }, [])

  const toggleDesktopSidebar = () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    localStorage.setItem("workspace-sidebar-collapsed", String(newCollapsed))
  }

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen)
  }

  // Compute CSS custom properties from partner branding
  // These are applied directly to the workspace-theme container to override theme defaults
  const brandingStyles = useMemo(() => {
    const styles: Record<string, string> = {}
    const branding = partner.branding

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
  }, [partner.branding])

  return (
    <BrandingProvider partner={partner}>
      <div 
        className={cn("workspace-theme flex h-screen overflow-hidden bg-background text-foreground")}
        style={brandingStyles as React.CSSProperties}
      >
        {/* Desktop Sidebar */}
        <WorkspaceSidebar
          partner={partner}
          currentWorkspace={currentWorkspace}
          workspaces={workspaces}
          isCollapsed={isCollapsed}
          partnerRole={partnerRole}
        />
        
        {/* Mobile Sidebar */}
        <WorkspaceMobileSidebar
          partner={partner}
          currentWorkspace={currentWorkspace}
          workspaces={workspaces}
          partnerRole={partnerRole}
          isOpen={isMobileOpen}
          onClose={() => setIsMobileOpen(false)}
        />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <WorkspaceHeader
            user={user}
            partner={partner}
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
            isCollapsed={isCollapsed}
            onToggleDesktopSidebar={toggleDesktopSidebar}
            onToggleMobileSidebar={toggleMobileSidebar}
            partnerRole={partnerRole}
          />
          <main className="flex-1 overflow-y-auto bg-muted/30 p-4 sm:p-6">
            <div className="max-w-[1400px] mx-auto space-y-6">
              <PaywallBanner workspaceSlug={currentWorkspace.slug} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </BrandingProvider>
  )
}

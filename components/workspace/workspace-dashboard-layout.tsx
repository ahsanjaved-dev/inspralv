"use client"

import { useState, useEffect } from "react"
import { WorkspaceSidebar } from "./workspace-sidebar"
import { WorkspaceHeader } from "./workspace-header"
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

export function WorkspaceDashboardLayout({
  user,
  partner,
  currentWorkspace,
  workspaces,
  partnerRole,
  children,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load saved collapsed state on mount
  useEffect(() => {
    const saved = localStorage.getItem("workspace-sidebar-collapsed")
    if (saved === "true") {
      setIsCollapsed(true)
    }
  }, [])

  const toggleSidebar = () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    localStorage.setItem("workspace-sidebar-collapsed", String(newCollapsed))
  }

  return (
    <BrandingProvider partner={partner}>
      <div className={cn("workspace-theme flex h-screen overflow-hidden bg-background text-foreground")}>
        <WorkspaceSidebar
          partner={partner}
          currentWorkspace={currentWorkspace}
          workspaces={workspaces}
          isCollapsed={isCollapsed}
          partnerRole={partnerRole}
          user={user}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <WorkspaceHeader
            user={user}
            partner={partner}
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
            isCollapsed={isCollapsed}
            onToggleSidebar={toggleSidebar}
          />
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
            <div className="max-w-[1400px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </BrandingProvider>
  )
}

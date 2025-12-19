"use client"

import { WorkspaceSidebar } from "./workspace-sidebar"
import { WorkspaceHeader } from "./workspace-header"
import { BrandingProvider } from "@/context/branding-context"
import type { PartnerAuthUser, AccessibleWorkspace } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  user: PartnerAuthUser
  partner: ResolvedPartner
  currentWorkspace: AccessibleWorkspace
  workspaces: AccessibleWorkspace[]
  children: React.ReactNode
}

export function WorkspaceDashboardLayout({
  user,
  partner,
  currentWorkspace,
  workspaces,
  children,
}: Props) {
  return (
    <BrandingProvider partner={partner}>
      <div className="flex h-screen overflow-hidden">
        <WorkspaceSidebar
          partner={partner}
          currentWorkspace={currentWorkspace}
          workspaces={workspaces}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <WorkspaceHeader
            user={user}
            partner={partner}
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
          />
          <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">{children}</main>
        </div>
      </div>
    </BrandingProvider>
  )
}

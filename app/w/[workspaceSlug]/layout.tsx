import { redirect, notFound } from "next/navigation"
import type { Metadata } from "next"
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"
import { getWorkspaceBySlug } from "@/lib/api/auth"
import { WorkspaceDashboardLayout } from "@/components/workspace/workspace-dashboard-layout"
import { getPartnerFromHost } from "@/lib/api/partner"

interface Props {
  children: React.ReactNode
  params: Promise<{ workspaceSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspaceSlug } = await params

  try {
    const partner = await getPartnerFromHost()
    const companyName = partner.branding.company_name || partner.name

    return {
      title: `${companyName} | Dashboard`,
      description: `${companyName} - AI Voice Platform`,
      icons: partner.branding.favicon_url ? [{ url: partner.branding.favicon_url }] : undefined,
    }
  } catch {
    return { title: "Dashboard" }
  }
}

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspaceSlug } = await params
  const auth = await getPartnerAuthCached()

  // Not authenticated - redirect to login
  if (!auth) {
    redirect("/login")
  }

  // Check workspace access
  const workspace = getWorkspaceBySlug(auth, workspaceSlug)

  if (!workspace) {
    // User doesn't have access to this workspace
    console.log(
      `[WorkspaceLayout] User ${auth.user.email} has no access to workspace: ${workspaceSlug}`
    )
    notFound()
  }

  return (
    <WorkspaceDashboardLayout
      user={auth.user}
      partner={auth.partner}
      currentWorkspace={workspace}
      workspaces={auth.workspaces}
      partnerRole={auth.partnerRole}
    >
      {children}
    </WorkspaceDashboardLayout>
  )
}

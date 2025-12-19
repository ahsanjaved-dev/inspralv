import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"
import { getPartnerFromHost } from "@/lib/api/partner"
import { WorkspaceSelector } from "@/components/workspace/workspace-selector"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export async function generateMetadata(): Promise<Metadata> {
  try {
    const partner = await getPartnerFromHost()
    const companyName = partner.branding.company_name || partner.name
    return {
      title: `Select Workspace | ${companyName}`,
      icons: partner.branding.favicon_url ? [{ url: partner.branding.favicon_url }] : undefined,
    }
  } catch {
    return { title: "Select Workspace" }
  }
}

export default async function SelectWorkspacePage() {
  const auth = await getPartnerAuthCached()

  // Not authenticated - redirect to login
  if (!auth) {
    redirect("/login")
  }

  // Auto-redirect if only one workspace
  if (auth.workspaces.length === 1) {
    redirect(`/w/${auth.workspaces[0].slug}/dashboard`)
  }

  const branding = auth.partner.branding
  const companyName = branding.company_name || auth.partner.name
  const primaryColor = branding.primary_color || "#7c3aed"

  // No workspaces - show message
  if (auth.workspaces.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center p-8 max-w-md">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={companyName} className="h-12 mx-auto mb-6" />
          ) : (
            <div
              className="h-16 w-16 mx-auto mb-6 rounded-2xl flex items-center justify-center text-white font-bold text-2xl"
              style={{ backgroundColor: primaryColor }}
            >
              {companyName[0]}
            </div>
          )}
          <h1 className="text-2xl font-bold mb-2">No Workspaces Available</h1>
          <p className="text-muted-foreground mb-6">
            You don't have access to any workspaces yet. Contact your administrator to get invited
            to a workspace.
          </p>
          <p className="text-sm text-muted-foreground">
            Logged in as: <span className="font-medium">{auth.user.email}</span>
          </p>
        </div>
      </div>
    )
  }

  // Multiple workspaces - show selector
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `linear-gradient(135deg, ${primaryColor}10 0%, transparent 50%)`,
      }}
    >
      <WorkspaceSelector workspaces={auth.workspaces} partner={auth.partner} user={auth.user} />
    </div>
  )
}

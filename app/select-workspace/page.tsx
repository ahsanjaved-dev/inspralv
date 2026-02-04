import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"
import { getPartnerFromHost } from "@/lib/api/partner"
import { WorkspaceSelector } from "@/components/workspace/workspace-selector"
import { Button } from "@/components/ui/button"
import { Mail, LogOut } from "lucide-react"

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
  const firstWorkspace = auth.workspaces[0]
  if (auth.workspaces.length === 1 && firstWorkspace) {
    redirect(`/w/${firstWorkspace.slug}/dashboard`)
  }

  const branding = auth.partner.branding
  const companyName = branding.company_name || auth.partner.name
  const primaryColor = branding.primary_color || "#7c3aed"

  // Check if user is a partner admin
  const isPartnerAdmin = auth.partnerRole === "owner" || auth.partnerRole === "admin"
  const isPartnerMember = auth.partnerRole !== null

  // No workspaces - show appropriate message based on role
  if (auth.workspaces.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        {/* Subtle grid pattern background */}
        <div 
          className="fixed inset-0 opacity-[0.02] dark:opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        
        {/* Gradient orbs */}
        <div 
          className="fixed top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: primaryColor }}
        />
        <div 
          className="fixed bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: primaryColor }}
        />

        <div className="relative w-full max-w-md">
          <div className="bg-card rounded-3xl border border-border/50 shadow-2xl shadow-black/5 p-8">
            {/* Header */}
            <div className="text-center mb-8">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt={companyName} className="h-10 mx-auto mb-6" />
              ) : (
                <div
                  className="h-16 w-16 mx-auto mb-6 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  {companyName[0]}
                </div>
              )}

              {isPartnerAdmin ? (
                <>
                  <h1 className="text-2xl font-bold tracking-tight mb-2">No Workspaces Available</h1>
                  <p className="text-muted-foreground">
                    Workspaces are provisioned based on your subscription plan. Please check your billing or contact support.
                  </p>
                </>
              ) : isPartnerMember ? (
                <>
                  <h1 className="text-2xl font-bold tracking-tight mb-2">No Workspaces Yet</h1>
                  <p className="text-muted-foreground">
                    You're a member of {companyName}, but you haven't been added to any workspaces yet.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold tracking-tight mb-2">Access Required</h1>
                  <p className="text-muted-foreground">You need to be invited to access {companyName}.</p>
                </>
              )}
            </div>

            {/* Content */}
            <div className="space-y-4">
              {isPartnerMember ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/50 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                        <Mail className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100">
                          {isPartnerAdmin ? "Subscription Required" : "Waiting for invitation"}
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          {isPartnerAdmin 
                            ? "Your workspace will be created when your subscription is activated." 
                            : "Ask your workspace administrator to invite you. You'll receive an email when added."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  Contact your administrator to request access.
                </p>
              )}

              {/* User Info & Logout */}
              <div className="pt-6 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Signed in as <span className="font-medium text-foreground">{auth.user.email}</span>
                  </div>
                  <form action="/api/auth/signout" method="POST">
                    <Button 
                      type="submit" 
                      variant="ghost" 
                      size="sm" 
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <LogOut className="h-4 w-4 mr-1.5" />
                      Sign out
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Multiple workspaces - show selector
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Subtle grid pattern background */}
      <div 
        className="fixed inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Gradient orbs */}
      <div 
        className="fixed top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
        style={{ backgroundColor: primaryColor }}
      />
      <div 
        className="fixed bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
        style={{ backgroundColor: primaryColor }}
      />

      <div className="relative z-10">
        <WorkspaceSelector
          workspaces={auth.workspaces}
          partner={auth.partner}
          user={auth.user}
        />
      </div>
    </div>
  )
}

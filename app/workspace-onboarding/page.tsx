import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"
import { getPartnerFromHost } from "@/lib/api/partner"
import { Button } from "@/components/ui/button"
import { Building2, ArrowLeft, CreditCard } from "lucide-react"
import Link from "next/link"

export async function generateMetadata(): Promise<Metadata> {
  try {
    const partner = await getPartnerFromHost()
    const companyName = partner.branding.company_name || partner.name
    return {
      title: `Workspaces | ${companyName}`,
      icons: partner.branding.favicon_url ? [{ url: partner.branding.favicon_url }] : undefined,
    }
  } catch {
    return { title: "Workspaces" }
  }
}

/**
 * Workspace Onboarding Page
 * 
 * This page is deprecated - workspaces are now created automatically based on subscription plans.
 * - Free/Pro plans: One workspace is created when the user subscribes
 * - Agency/White-label plans: Default workspace + client workspaces based on plan limits
 * 
 * This page now redirects users to the appropriate location.
 */
export default async function WorkspaceOnboardingPage() {
  const auth = await getPartnerAuthCached()

  // Not authenticated - redirect to login
  if (!auth) {
    redirect("/login")
  }

  // If user has workspaces, redirect to select-workspace
  if (auth.workspaces.length > 0) {
    redirect("/select-workspace")
  }

  const branding = auth.partner.branding
  const primaryColor = branding.primary_color || "#7c3aed"
  const companyName = branding.company_name || auth.partner.name

  // Show message that workspaces are created via subscription
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Subtle background */}
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
            
            <div className="w-14 h-14 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
              <Building2 className="h-7 w-7 text-blue-600" />
            </div>
            
            <h1 className="text-2xl font-bold tracking-tight mb-2">Workspace Setup</h1>
            <p className="text-muted-foreground">
              Workspaces are automatically created based on your subscription plan.
            </p>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/50 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Subscription-Based Workspaces
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Your workspace will be created automatically when you subscribe to a plan. 
                    Agency plans include multiple workspaces for your clients.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" className="w-full">
                <Link href="/select-workspace">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Workspaces
                </Link>
              </Button>
            </div>

            {/* User Info & Logout */}
            <div className="pt-6 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Signed in as <span className="font-medium text-foreground">{auth.user.email}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

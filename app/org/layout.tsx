import { redirect, notFound } from "next/navigation"
import type { Metadata } from "next"
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"
import { getPartnerFromHost } from "@/lib/api/partner"
import { OrgDashboardLayout } from "@/components/org/org-dashboard-layout"

interface Props {
  children: React.ReactNode
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const partner = await getPartnerFromHost()
    const companyName = partner.branding.company_name || partner.name

    return {
      title: `${companyName} | Organization`,
      description: `${companyName} - Organization Management`,
      icons: partner.branding.favicon_url ? [{ url: partner.branding.favicon_url }] : undefined,
    }
  } catch {
    return { title: "Organization" }
  }
}

export default async function OrgLayout({ children }: Props) {
  const auth = await getPartnerAuthCached()

  // Not authenticated - redirect to login
  if (!auth) {
    redirect("/login")
  }

  // Not a partner member - can't access org pages
  if (!auth.partnerRole) {
    redirect("/select-workspace")
  }

  // Only admins and owners can access org pages
  if (auth.partnerRole !== "owner" && auth.partnerRole !== "admin") {
    redirect("/select-workspace")
  }

  return (
    <OrgDashboardLayout
      user={auth.user}
      partner={auth.partner}
      partnerRole={auth.partnerRole}
      workspaces={auth.workspaces}
    >
      {children}
    </OrgDashboardLayout>
  )
}


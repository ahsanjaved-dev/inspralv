import { getPartnerFromHost } from "@/lib/api/partner"
import { AuthLayoutClient } from "@/components/auth/auth-layout-client"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Get partner based on hostname for branding
  const partner = await getPartnerFromHost()

  return <AuthLayoutClient partner={partner}>{children}</AuthLayoutClient>
}

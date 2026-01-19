import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getPartnerFromHost } from "@/lib/api/partner"
import { Home, ArrowLeft, LogIn } from "lucide-react"

export default async function NotFound() {
  const partner = await getPartnerFromHost()
  const isPlatformPartner = partner.is_platform_partner
  const companyName = partner.branding.company_name || partner.name

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-background to-muted/30 px-6">
      <div className="text-center max-w-md">
        {/* Logo/Brand */}
        {partner.branding.logo_url ? (
          <img
            src={partner.branding.logo_url}
            alt={companyName}
            className="h-12 mx-auto mb-8 object-contain"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-8">
            <span className="text-2xl font-bold text-primary">{companyName[0]}</span>
          </div>
        )}

        {/* 404 */}
        <div className="mb-6">
          <span className="text-8xl font-bold text-muted-foreground/20">404</span>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-bold mb-3">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          {isPlatformPartner
            ? "The page you're looking for doesn't exist or has been moved."
            : "This page is not available. Please sign in to access your dashboard."}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isPlatformPartner ? (
            <>
              <Button asChild variant="outline">
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Link>
              </Button>
              <Button asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link href="/login">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In to {companyName}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

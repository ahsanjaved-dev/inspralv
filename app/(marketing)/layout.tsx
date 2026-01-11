import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Mic } from "lucide-react"
import { getPartnerFromHost } from "@/lib/api/partner"
import { ThemeToggle } from "@/components/ui/theme-toggle"

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const partner = await getPartnerFromHost()
  
  // Marketing pages are only available on platform partner domain
  // White-label partners should not see marketing content
  if (!partner.is_platform_partner) {
    redirect("/login")
  }

  const branding = partner.branding
  const companyName = branding.company_name || partner.name

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={companyName} className="h-8" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                  <Mic className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-xl tracking-tight">{companyName}</span>
              </div>
            )}
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/#use-cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Use Cases
            </Link>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/pricing">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t py-12 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-2 mb-4">
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt={companyName} className="h-8" />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                      <Mic className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-xl">{companyName}</span>
                  </div>
                )}
              </Link>
              <p className="text-sm text-muted-foreground max-w-sm">
                AI Voice Integration Platform. Build intelligent voice agents that automate conversations and deliver exceptional customer experiences.
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="/request-partner" className="hover:text-foreground transition-colors">White-Label</Link></li>
              </ul>
            </div>

            {/* Account */}
            <div>
              <h3 className="font-semibold mb-4">Account</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link></li>
                <li><Link href="/pricing" className="hover:text-foreground transition-colors">Get Started</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {companyName}. All rights reserved.
            </p>
            <ThemeToggle showLabel />
          </div>
        </div>
      </footer>
    </div>
  )
}

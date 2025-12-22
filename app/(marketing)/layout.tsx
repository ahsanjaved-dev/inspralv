import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Building2 } from "lucide-react"
import { getPartnerFromHost } from "@/lib/api/partner"

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const partner = await getPartnerFromHost()
  const branding = partner.branding
  const companyName = branding.company_name || partner.name
  const primaryColor = branding.primary_color || "#7c3aed"

  return (
    <div className="min-h-screen flex flex-col">
      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt={companyName} className="h-8" />
                ) : (
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {companyName[0]}
                  </div>
                )}
                <span className="font-bold text-lg">{companyName}</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-md">
                AI Voice Integration Platform. Create intelligent voice agents, automate
                conversations, and deliver exceptional customer experiences.
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="font-semibold mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/request-partner" className="hover:text-foreground transition-colors">
                    White-Label
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="font-semibold mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/login" className="hover:text-foreground transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="hover:text-foreground transition-colors">
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>
              © {new Date().getFullYear()} {companyName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuthContext } from "@/lib/hooks/use-auth"
import { Building2, Shield, Settings, CreditCard, ArrowRight, Globe, ExternalLink, CheckCircle2, Clock } from "lucide-react"

// Platform domain from environment
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "genius365.app"

export default function OrgSettingsPage() {
  const { data: authContext } = useAuthContext()

  const partner = authContext?.partner
  const partnerRole = authContext?.partnerMembership?.role

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization settings and preferences
        </p>
      </div>

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Details
          </CardTitle>
          <CardDescription>Basic information about your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Organization Name</p>
              <p className="font-medium">{partner?.name || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your Role</p>
              <Badge variant="outline" className="mt-1 capitalize">
                <Shield className="h-3 w-3 mr-1" />
                {partnerRole || "—"}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Slug</p>
              <p className="font-medium font-mono text-sm">{partner?.slug || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Plan</p>
              <Badge variant="secondary" className="capitalize">
                {partner?.plan_tier || "—"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding Preview */}
      {partner?.branding && (
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>Your organization's branding settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {partner.branding.logo_url ? (
                <img 
                  src={partner.branding.logo_url} 
                  alt="Logo" 
                  className="h-16 object-contain"
                />
              ) : (
                <div 
                  className="w-16 h-16 rounded-lg flex items-center justify-center text-white font-bold text-2xl"
                  style={{ backgroundColor: partner.branding.primary_color || "#7c3aed" }}
                >
                  {partner.branding.company_name?.[0] || partner.name[0]}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Primary Color:</span>
                  <div 
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: partner.branding.primary_color || "#7c3aed" }}
                  />
                  <span className="font-mono text-sm">{partner.branding.primary_color || "#7c3aed"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Secondary Color:</span>
                  <div 
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: partner.branding.secondary_color || "#64748b" }}
                  />
                  <span className="font-mono text-sm">{partner.branding.secondary_color || "#64748b"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing & Subscription
          </CardTitle>
          <CardDescription>
            Manage your subscription, view invoices, and update payment methods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/org/billing">
              Go to Billing
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Domain Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Domain Settings
          </CardTitle>
          <CardDescription>
            Manage your platform URL and custom domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Platform Subdomain */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium">Platform URL</p>
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            </div>
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
              <code className="font-mono text-sm">{partner?.slug}.{PLATFORM_DOMAIN}</code>
              <Button variant="ghost" size="sm" className="h-7" asChild>
                <a href={`https://${partner?.slug}.${PLATFORM_DOMAIN}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This is your primary platform URL that is always available.
            </p>
          </div>

          {/* Custom Domain Section */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium">Custom Domain</p>
                <p className="text-xs text-muted-foreground">
                  Connect your own domain for a fully branded experience
                </p>
              </div>
              {partner?.features?.custom_domain ? (
                <Badge variant="outline">
                  <Clock className="h-3 w-3 mr-1" />
                  Coming Soon
                </Badge>
              ) : (
                <Badge variant="secondary">Enterprise</Badge>
              )}
            </div>
            
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Custom domain setup will be available soon. This feature allows you to use your own domain 
                (e.g., <code className="text-xs bg-muted px-1 rounded">app.yourcompany.com</code>) 
                instead of the platform subdomain.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Example setup:</p>
                  <p className="text-sm font-mono mt-1">
                    app.yourcompany.com → CNAME → {partner?.slug}.{PLATFORM_DOMAIN}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coming Soon */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <Settings className="h-5 w-5" />
            More Settings Coming Soon
          </CardTitle>
          <CardDescription>
            Additional organization settings will be available in future updates:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>Custom branding editor</li>
            <li>Security settings (SSO, 2FA requirements)</li>
            <li>API access configuration</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuthContext } from "@/lib/hooks/use-auth"
import { Building2, Shield, Settings, CreditCard, ArrowRight } from "lucide-react"

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
            <li>Domain management</li>
            <li>Security settings (SSO, 2FA requirements)</li>
            <li>API access configuration</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSuperAdminPartners } from "@/lib/hooks/use-super-admin-partners"
import { useWhiteLabelVariants } from "@/lib/hooks/use-white-label-variants"
import { Search, Briefcase, Loader2, Building2, Users, CheckCircle, Eye, FileText } from "lucide-react"
import Link from "next/link"

export default function SuperAdminPartnersPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [planFilter, setPlanFilter] = useState("all")

  const { data, isLoading, error } = useSuperAdminPartners({
    search: searchQuery || undefined,
    plan_tier: planFilter,
  })

  // Fetch actual plan variants for filter dropdown
  const { data: variants } = useWhiteLabelVariants(false)

  const partners = data?.data || []
  const totalAgencies = data?.total || 0

  // Calculate stats
  const totalWorkspaces = partners.reduce((sum, p) => sum + (p.workspace_count || 0), 0)

  // Helper to get plan display name from variant ID or plan_tier
  const getPlanDisplayName = (variantId: string | null | undefined, planTier: string | null | undefined) => {
    // First try to find by variant ID (preferred)
    if (variantId) {
      const variant = variants?.find((v) => v.id === variantId)
      if (variant) return variant.name
    }
    // Fallback to plan_tier matching
    if (planTier && planTier !== "partner") {
      const variant = variants?.find(
        (v) => v.slug.toLowerCase() === planTier.toLowerCase() || 
               v.name.toLowerCase() === planTier.toLowerCase()
      )
      if (variant) return variant.name
    }
    return "No Plan"
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agencies</h1>
          <p className="text-muted-foreground mt-1">
            View and manage white-label agencies provisioned from partner requests.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/super-admin/partner-requests">
            <FileText className="mr-2 h-4 w-4" />
            Partner Requests
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Agencies</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">{totalAgencies}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Workspaces</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">{totalWorkspaces}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agencies by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-full md:w-48 bg-background border-input text-foreground">
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {variants?.map((variant) => (
                  <SelectItem key={variant.id} value={variant.slug}>
                    {variant.name}
                  </SelectItem>
                ))}
                {/* Fallback if no variants loaded */}
                {!variants?.length && (
                  <>
                    <SelectItem value="Partner">Partner</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Agencies Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-foreground">
              Agency Directory
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {partners.length} {partners.length === 1 ? "agency" : "agencies"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-6">
              <p className="text-destructive text-center">Failed to load agencies. Please try again.</p>
            </div>
          ) : partners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-primary/10 rounded-full mb-4">
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No agencies yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-2">
                {searchQuery
                  ? "No agencies match your search. Try a different query."
                  : "Agencies are created when partner requests are approved and provisioned."}
              </p>
              {!searchQuery && (
                <Button
                  className="mt-6"
                  variant="outline"
                  asChild
                >
                  <Link href="/super-admin/partner-requests">
                    <FileText className="mr-2 h-4 w-4" />
                    View Partner Requests
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Agency</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Plan</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Workspaces</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border"></th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr key={partner.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary">
                              {partner.name.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <Link href={`/super-admin/partners/${partner.id}`} className="text-primary hover:underline font-medium">
                              {partner.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {partner.slug}
                              {partner.is_platform_partner && (
                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                                  Platform
                                </Badge>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="font-medium">
                          {getPlanDisplayName(partner.white_label_variant_id, partner.plan_tier)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-foreground font-medium">{partner.workspace_count || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="sm" asChild className="text-primary hover:text-primary">
                          <Link href={`/super-admin/partners/${partner.id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

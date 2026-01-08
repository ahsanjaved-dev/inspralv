"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSuperAdminPartners } from "@/lib/hooks/use-super-admin-partners"
import { Search, Building2, Loader2 } from "lucide-react"
import Link from "next/link"

export default function SuperAdminBillingPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [planFilter, setPlanFilter] = useState("all")

  const { data, isLoading, error } = useSuperAdminPartners({
    search: searchQuery || undefined,
    plan_tier: planFilter,
  })

  const partners = data?.data || []
  const totalPartners = data?.total || 0

  return (
    <div className="space-y-6">
      {/* Page Header - Genius style */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Track each agency plan and usage rollups.
          </p>
        </div>
      </div>

      {/* Stats - Minimal: Only Total Organizations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Organizations</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">{totalPartners}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters - Genius style */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orgs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-full md:w-44 bg-background border-input text-foreground">
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="agency">Agency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Agencies Table - Genius style */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-foreground">Agencies</CardTitle>
            <span className="text-xs text-muted-foreground">Organization billing overview</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-6">
              <p className="text-destructive text-center">Failed to load organizations. Please try again.</p>
            </div>
          ) : partners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-primary/10 rounded-full mb-4">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No organizations yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-2">
                {searchQuery
                  ? "No organizations match your search."
                  : "Organizations will appear here once created."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Organization</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Plan</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Workspaces</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Agents</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr key={partner.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <Link href={`/super-admin/partners/${partner.id}`} className="text-primary hover:underline font-medium">
                          {partner.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {partner.slug}
                          {partner.is_platform_partner && " • Platform Partner"}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-foreground capitalize">{partner.plan_tier}</td>
                      <td className="py-3 px-4 text-foreground">{partner.workspace_count || 0}</td>
                      <td className="py-3 px-4 text-foreground">{partner.agent_count || 0}</td>
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


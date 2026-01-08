"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PartnerCard } from "@/components/super-admin/partner-card"
import { CreatePartnerDialog } from "@/components/super-admin/create-partner-dialog"
import { useSuperAdminPartners } from "@/lib/hooks/use-super-admin-partners"
import { Plus, Search, Briefcase, Loader2 } from "lucide-react"

export default function SuperAdminPartnersPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [planFilter, setPlanFilter] = useState("all")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { data, isLoading, error } = useSuperAdminPartners({
    search: searchQuery || undefined,
    plan_tier: planFilter,
  })

  const partners = data?.data || []

  return (
    <div className="space-y-6">
      {/* Page Header - Genius style */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agencies</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage agencies (organizations) requesting white label.
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Agency
        </Button>
      </div>

      {/* Filters - Genius style */}
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
              <SelectTrigger className="w-full md:w-40 bg-background border-input text-foreground">
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

      {/* Partners Table - Genius style */}
      <Card className="bg-card border-border">
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
                  : "Create your first white-label partner to get started."}
              </p>
              {!searchQuery && (
                <Button
                  className="mt-6 bg-primary hover:bg-primary/90"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Partner
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Partner</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Plan</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Workspaces</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border"></th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr key={partner.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <a href={`/super-admin/partners/${partner.id}`} className="text-primary hover:underline font-medium">
                          {partner.name}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {partner.slug}
                          {partner.is_platform_partner && " • Platform Partner"}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          active
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground capitalize">{partner.plan_tier}</td>
                      <td className="py-3 px-4 text-foreground">{partner.workspace_count || 0}</td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/super-admin/partners/${partner.id}`}>View</a>
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

      {/* Create Dialog */}
      <CreatePartnerDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  )
}

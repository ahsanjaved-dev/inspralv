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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Partners</h1>
          <p className="text-slate-400 mt-1">
            Manage white-label partners and their configurations
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-violet-500 hover:bg-violet-600"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Partner
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">{data?.total || 0}</div>
            <p className="text-sm text-slate-400">Total Partners</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">
              {partners.filter((p) => p.plan_tier === "enterprise").length}
            </div>
            <p className="text-sm text-slate-400">Enterprise</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">
              {partners.filter((p) => p.plan_tier === "pro").length}
            </div>
            <p className="text-sm text-slate-400">Pro</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">
              {partners.filter((p) => p.is_platform_partner).length}
            </div>
            <p className="text-sm text-slate-400">Platform Partner</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search partners..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-slate-900 border-slate-600 text-white">
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="pt-6">
            <p className="text-red-400 text-center">Failed to load partners. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !error && partners.length === 0 && (
        <Card className="bg-slate-800 border-slate-700 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-violet-500/10 rounded-full mb-4">
              <Briefcase className="h-8 w-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">No partners yet</h3>
            <p className="text-slate-400 text-center max-w-sm mt-2">
              {searchQuery
                ? "No partners match your search. Try a different query."
                : "Create your first white-label partner to get started."}
            </p>
            {!searchQuery && (
              <Button
                className="mt-6 bg-violet-500 hover:bg-violet-600"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Partner
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Partners Grid */}
      {!isLoading && !error && partners.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((partner) => (
            <PartnerCard key={partner.id} partner={partner} />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreatePartnerDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  )
}

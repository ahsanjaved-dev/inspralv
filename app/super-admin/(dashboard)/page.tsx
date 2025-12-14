// app/(super-admin)/super-admin/page.tsx
"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { OrganizationCard } from "@/components/super-admin/organization-card"
import { CreateOrganizationDialog } from "@/components/super-admin/create-organization-dialog"
import {
  Plus,
  Search,
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  Loader2,
  Clock,
} from "lucide-react"
import { api } from "@/lib/api/fetcher"
import type { Organization, PaginatedResponse } from "@/types/database.types"

interface OrganizationFilters {
  page?: number
  pageSize?: number
  search?: string
  plan_tier?: string
  status?: string
}

function useOrganizations(filters: OrganizationFilters) {
  const params = new URLSearchParams()
  if (filters.page) params.set("page", filters.page.toString())
  if (filters.pageSize) params.set("pageSize", filters.pageSize.toString())
  if (filters.search) params.set("search", filters.search)
  if (filters.plan_tier && filters.plan_tier !== "all") params.set("plan_tier", filters.plan_tier)
  if (filters.status && filters.status !== "all") params.set("status", filters.status)

  const query = params.toString()

  return useQuery({
    queryKey: ["super-admin-organizations", filters],
    queryFn: () =>
      api.get<PaginatedResponse<Organization>>(
        `/api/super-admin/organizations${query ? `?${query}` : ""}`
      ),
  })
}

export default function SuperAdminDashboard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [planFilter, setPlanFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const { data, isLoading, error } = useOrganizations({
    search: searchQuery || undefined,
    plan_tier: planFilter,
    status: statusFilter,
  })

  const organizations = data?.data || []

  const stats = {
    total: data?.total || 0,
    active: organizations.filter((org) => org.status === "active").length,
    pending: organizations.filter((org) => org.status === "pending_activation").length,
    trialing: organizations.filter((org) => org.subscription_status === "trialing").length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Organizations</h1>
          <p className="text-slate-400 mt-1">Manage all organizations on the platform</p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-violet-500 hover:bg-violet-600"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Total Organizations
            </CardTitle>
            <Building2 className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Active</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.active}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Pending Activation</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Trialing</CardTitle>
            <Users className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.trialing}</div>
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
                placeholder="Search organizations..."
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
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-slate-900 border-slate-600 text-white">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending_activation">Pending Activation</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Organizations List */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      )}

      {error && (
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="pt-6">
            <p className="text-red-400 text-center">
              Failed to load organizations. Please try again.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && organizations.length === 0 && (
        <Card className="bg-slate-800 border-slate-700 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-violet-500/10 rounded-full mb-4">
              <Building2 className="h-8 w-8 text-violet-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">No organizations yet</h3>
            <p className="text-slate-400 text-center max-w-sm mt-2">
              {searchQuery
                ? "No organizations match your search. Try a different query."
                : "Create your first organization to get started."}
            </p>
            {!searchQuery && (
              <Button
                className="mt-6 bg-violet-500 hover:bg-violet-600"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Organization
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && organizations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map((organization) => (
            <OrganizationCard key={organization.id} organization={organization} />
          ))}
        </div>
      )}

      {/* Create Organization Dialog */}
      <CreateOrganizationDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  )
}

"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSuperAdminPartners } from "@/lib/hooks/use-super-admin-partners"
import { usePartnerRequests } from "@/lib/hooks/use-partner-requests"
import {
  Briefcase,
  TrendingUp,
  ArrowRight,
  Loader2,
  LayoutGrid,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-500/10 text-yellow-500", icon: Clock },
  approved: { label: "Approved", color: "bg-green-500/10 text-green-500", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-500", icon: XCircle },
  provisioning: { label: "Provisioning", color: "bg-blue-500/10 text-blue-500", icon: Loader2 },
}

export default function SuperAdminDashboard() {
  const { data: partnersData, isLoading: partnersLoading } = useSuperAdminPartners({})
  const { data: pendingRequestsData, isLoading: requestsLoading } = usePartnerRequests({
    status: "pending",
    pageSize: 5,
  })
  const { data: allRequestsData } = usePartnerRequests({ pageSize: 5 })

  const partners = partnersData?.data || []
  const totalPartners = partnersData?.total || 0
  const pendingCount = pendingRequestsData?.total || 0
  const recentRequests = allRequestsData?.data || []

  // Calculate totals from partner data
  const totalWorkspaces = partners.reduce((sum, p) => sum + (p.workspace_count || 0), 0)

  const isLoading = partnersLoading || requestsLoading

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Super Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Organization rollups across agencies and workspaces.
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && (
            <Button
              asChild
              variant="outline"
              className="border-yellow-500/50 text-yellow-600 hover:bg-yellow-50"
            >
              <Link href="/super-admin/partner-requests?status=pending">
                <Clock className="mr-2 h-4 w-4" />
                {pendingCount} Pending Request{pendingCount !== 1 ? "s" : ""}
              </Link>
            </Button>
          )}
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link href="/super-admin/partners">
              <Briefcase className="mr-2 h-4 w-4" />
              Manage Agencies
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid - Now 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Requests - NEW */}
        <Card
          className={`bg-card border-border ${pendingCount > 0 ? "ring-2 ring-yellow-500/20" : ""}`}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Requests</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    {pendingCount}
                  </p>
                )}
              </div>
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  pendingCount > 0 ? "bg-yellow-500/10" : "bg-muted"
                }`}
              >
                <FileText
                  className={`w-6 h-6 ${pendingCount > 0 ? "text-yellow-500" : "text-muted-foreground"}`}
                />
              </div>
            </div>
            {pendingCount > 0 && (
              <Link
                href="/super-admin/partner-requests?status=pending"
                className="text-xs text-yellow-600 hover:underline mt-2 inline-block"
              >
                Review now →
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Agencies</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    {totalPartners}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-primary" />
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
                  <p className="text-3xl font-bold tracking-tight text-foreground">
                    {totalWorkspaces}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <LayoutGrid className="w-6 h-6 text-accent-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Platform Partner</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">Inspralv</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-chart-1/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-chart-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Partners Table */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground">Agencies</CardTitle>
              <Link href="/super-admin/partners" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {partnersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : partners.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No agencies yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50">
                        Partner
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50">
                        Workspaces
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50">
                        Agents
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50">
                        Plan
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.slice(0, 5).map((partner) => (
                      <tr
                        key={partner.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <Link
                            href={`/super-admin/partners/${partner.id}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {partner.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{partner.slug}</p>
                        </td>
                        <td className="py-3 px-4 text-foreground">
                          {partner.workspace_count || 0}
                        </td>
                        <td className="py-3 px-4 text-foreground">{partner.agent_count || 0}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground capitalize">
                            {partner.plan_tier}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recent Partner Requests - NEW */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground">
                  Recent Requests
                </CardTitle>
                <Link
                  href="/super-admin/partner-requests"
                  className="text-sm text-primary hover:underline"
                >
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {requestsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : recentRequests.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">No requests yet</p>
              ) : (
                <div className="space-y-3">
                  {recentRequests.slice(0, 4).map((request) => {
                    const status =
                      statusConfig[request.status as keyof typeof statusConfig] ||
                      statusConfig.pending
                    const StatusIcon = status.icon
                    return (
                      <Link
                        key={request.id}
                        href={`/super-admin/partner-requests/${request.id}`}
                        className="block p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-foreground truncate">
                              {request.company_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {request.contact_email}
                            </p>
                          </div>
                          <Badge variant="outline" className={`${status.color} shrink-0 text-xs`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(
                            new Date(request.requested_at || request.created_at),
                            {
                              addSuffix: true,
                            }
                          )}
                        </p>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">
                Quick Actions
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Common platform management tasks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Review Requests - NEW (highlighted if pending) */}
              {pendingCount > 0 ? (
                <Button
                  asChild
                  className="w-full justify-between bg-yellow-500 hover:bg-yellow-600 text-white"
                >
                  <Link href="/super-admin/partner-requests?status=pending">
                    <span className="flex items-center">
                      <Clock className="mr-2 h-4 w-4" />
                      Review Requests
                      <Badge className="ml-2 bg-white/20 text-white">{pendingCount}</Badge>
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-between border-border text-foreground hover:bg-muted"
                >
                  <Link href="/super-admin/partner-requests">
                    <span className="flex items-center">
                      <FileText className="mr-2 h-4 w-4" />
                      Partner Requests
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}

              <Button asChild className="w-full justify-between bg-primary hover:bg-primary/90">
                <Link href="/super-admin/partners">
                  Manage Agencies
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-between border-border text-foreground hover:bg-muted"
              >
                <Link href="/super-admin/billing">
                  View Billing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

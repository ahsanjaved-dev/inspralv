"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
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
import { usePartnerRequests } from "@/lib/hooks/use-partner-requests"
import { Search, FileText, Loader2, Eye, CheckCircle, XCircle, Clock, Globe } from "lucide-react"

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "genius365.app"
import { formatDistanceToNow } from "date-fns"

const statusConfig = {
  pending: {
    label: "Pending",
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle,
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: XCircle,
  },
  provisioning: {
    label: "Provisioning",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Loader2,
  },
}

export default function PartnerRequestsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = usePartnerRequests({
    search: searchQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize: 10,
  })

  const requests = data?.data || []
  const totalPages = data?.totalPages || 1
  const total = data?.total || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Partner Requests</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage white-label partnership requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-foreground">
            {total} Total Requests
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by company name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                className="pl-10 bg-background border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-full md:w-44 bg-background border-input text-foreground">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="provisioning">Provisioning</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-6">
              <p className="text-destructive text-center">
                Failed to load requests. Please try again.
              </p>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-primary/10 rounded-full mb-4">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No partner requests</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-2">
                {searchQuery || statusFilter !== "all"
                  ? "No requests match your filters. Try adjusting your search."
                  : "When partners submit requests, they will appear here."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">
                        Company
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">
                        Contact
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">
                        Domain
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">
                        Requested
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request) => {
                      const status =
                        statusConfig[request.status as keyof typeof statusConfig] ||
                        statusConfig.pending
                      const StatusIcon = status.icon

                      return (
                        <tr
                          key={request.id}
                          className="border-b border-border hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <Link
                              href={`/super-admin/partner-requests/${request.id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {request.company_name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{request.selected_plan}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-foreground">{request.contact_name}</p>
                            <p className="text-xs text-muted-foreground">{request.contact_email}</p>
                          </td>
                          <td className="py-3 px-4">
                            {request.desired_subdomain ? (
                              <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">
                                {request.desired_subdomain}.{PLATFORM_DOMAIN}
                              </code>
                            ) : request.custom_domain ? (
                              <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">
                                {request.custom_domain}
                              </code>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className={status.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status.label}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(request.requested_at || request.created_at),
                              {
                                addSuffix: true,
                              }
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/super-admin/partner-requests/${request.id}`}>
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

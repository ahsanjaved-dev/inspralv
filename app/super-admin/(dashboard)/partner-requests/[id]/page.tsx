"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { usePartnerRequest } from "@/lib/hooks/use-partner-requests"
import { ApprovePartnerDialog } from "@/components/super-admin/approve-partner-dialog"
import { RejectPartnerDialog } from "@/components/super-admin/reject-partner-dialog"
import { EditPartnerRequestDialog } from "@/components/super-admin/edit-partner-request-dialog"
import { DeletePartnerRequestDialog } from "@/components/super-admin/delete-partner-request-dialog"
import type { PartnerBranding } from "@/types/database.types"
import {
  ArrowLeft,
  Loader2,
  Building2,
  Mail,
  Phone,
  Globe,
  Palette,
  FileText,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Pencil,
  Trash2,
  Package,
  DollarSign,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"

// Platform domain from environment
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "genius365.app"

const statusConfig = {
  pending: {
    label: "Pending Review",
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

export default function PartnerRequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const requestId = params.id as string

  const { data: request, isLoading, error, refetch } = usePartnerRequest(requestId)

  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !request) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive">Partner request not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/super-admin/partner-requests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Requests
          </Link>
        </Button>
      </div>
    )
  }

  const status = statusConfig[request.status as keyof typeof statusConfig] || statusConfig.pending
  const StatusIcon = status.icon
  const branding = (request.branding_data || {}) as PartnerBranding
  const isPending = request.status === "pending"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/super-admin/partner-requests">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {request.company_name}
            </h1>
            <p className="text-muted-foreground mt-1">
              Partner Request • Submitted{" "}
              {formatDistanceToNow(new Date(request.requested_at || request.created_at), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={status.color}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {status.label}
          </Badge>
          <div className="flex gap-2">
            {/* Edit button - always available */}
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {/* Delete button - always available */}
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            {/* Approve/Reject - only for pending */}
            {isPending && (
              <>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => setApproveDialogOpen(true)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company & Contact */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Company & Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Company Name</p>
                  <p className="font-medium">{request.company_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contact Person</p>
                  <p className="font-medium">{request.contact_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a
                    href={`mailto:${request.contact_email}`}
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    <Mail className="h-3 w-3" />
                    {request.contact_email}
                  </a>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {request.phone || "Not provided"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Business Details */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Business Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Business Description</p>
                <p className="mt-1 text-foreground">{request.business_description}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Use Case</p>
                <p className="mt-1 text-foreground">{request.use_case}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Expected Users</p>
                  <p className="font-medium flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {request.expected_users || "Not specified"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Selected Plan</p>
                  {request.assignedVariant ? (
                    <div className="space-y-1">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                        <Package className="h-3 w-3 mr-1" />
                        {request.assignedVariant.name}
                      </Badge>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {request.assignedVariant.monthlyPriceCents === 0
                          ? "Free"
                          : `$${(request.assignedVariant.monthlyPriceCents / 100).toFixed(0)}/mo`}
                        {" • "}
                        {request.assignedVariant.maxWorkspaces === -1
                          ? "Unlimited workspaces"
                          : `${request.assignedVariant.maxWorkspaces} workspaces`}
                      </p>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      No plan selected
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Domain & Technical */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Platform Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Platform Subdomain</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-primary/10 text-primary px-3 py-1.5 rounded font-mono">
                    {request.desired_subdomain}.{PLATFORM_DOMAIN}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This will be the partner's primary access URL after approval.
                </p>
              </div>
              {request.custom_domain && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Custom Domain (optional)</p>
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {request.custom_domain}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rejection Reason (if rejected) */}
          {request.status === "rejected" && request.rejection_reason && (
            <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-red-800 dark:text-red-200 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Rejection Reason
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-700 dark:text-red-300">{request.rejection_reason}</p>
                {request.reviewed_at && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                    Rejected on {format(new Date(request.reviewed_at), "PPP 'at' p")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Branding Preview */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Branding Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo */}
              {branding.logo_url ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Logo</p>
                  <div className="border rounded-lg p-4 bg-muted/50 flex items-center justify-center">
                    <img
                      src={branding.logo_url}
                      alt="Company logo"
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Logo</p>
                  <div className="border rounded-lg p-4 bg-muted/50 text-center text-sm text-muted-foreground">
                    No logo provided
                  </div>
                </div>
              )}

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Primary Color</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: branding.primary_color || "#7c3aed" }}
                    />
                    <code className="text-xs">{branding.primary_color || "#7c3aed"}</code>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Secondary Color</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: branding.secondary_color || "#64748b" }}
                    />
                    <code className="text-xs">{branding.secondary_color || "#64748b"}</code>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Request Timeline */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div>
                    <p className="text-sm font-medium">Request Submitted</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(request.requested_at || request.created_at), "PPP 'at' p")}
                    </p>
                  </div>
                </div>
                {request.reviewed_at && (
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-2 h-2 rounded-full mt-2 ${
                        request.status === "approved" || request.status === "provisioning"
                          ? "bg-green-500"
                          : request.status === "rejected"
                            ? "bg-red-500"
                            : "bg-muted"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {request.status === "rejected" ? "Rejected" : "Approved"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(request.reviewed_at), "PPP 'at' p")}
                      </p>
                    </div>
                  </div>
                )}
                {request.provisioned_partner_id && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
                    <div>
                      <p className="text-sm font-medium">Partner Provisioned</p>
                      <Link
                        href={`/super-admin/partners/${request.provisioned_partner_id}`}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        View Partner
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <ApprovePartnerDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        request={request}
        onSuccess={() => refetch()}
      />
      <RejectPartnerDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        request={request}
        onSuccess={() => refetch()}
      />
      <EditPartnerRequestDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        request={request}
        onSuccess={() => refetch()}
      />
      <DeletePartnerRequestDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        request={request}
      />
    </div>
  )
}

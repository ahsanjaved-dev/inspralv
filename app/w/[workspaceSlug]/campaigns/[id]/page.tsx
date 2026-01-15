"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  CampaignStatusBadge,
  CallStatusBadge,
  CallOutcomeBadge,
} from "@/components/workspace/campaigns/campaign-status-badge"
import { ImportRecipientsDialog } from "@/components/workspace/campaigns/import-recipients-dialog"
import { AddRecipientDialog } from "@/components/workspace/campaigns/add-recipient-dialog"
import {
  useCampaign,
  useCampaignRecipients,
  useUpdateCampaign,
  useDeleteRecipient,
  usePauseCampaign,
  useResumeCampaign,
  useStartCampaign,
} from "@/lib/hooks/use-campaigns"
import {
  useRealtimeCampaignRecipients,
  useRealtimeCampaignStatus,
  type RecipientCallStatus as RealtimeRecipientStatus,
} from "@/lib/hooks/use-realtime-campaign"
import {
  ArrowLeft,
  Loader2,
  Bot,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Pause,
  Upload,
  Plus,
  Trash2,
  Phone,
  MoreVertical,
  RefreshCw,
  Calendar,
  Radio,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import type {
  CallRecipient,
  RecipientCallStatus,
  BusinessHoursConfig,
} from "@/types/database.types"

const statusFilterOptions = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "queued", label: "Queued" },
  { value: "calling", label: "Calling" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
]

const pageSizeOptions = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
]

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const campaignId = params.id as string

  const [statusFilter, setStatusFilter] = useState<RecipientCallStatus | "all">("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CallRecipient | null>(null)

  const {
    data: campaignData,
    isLoading: campaignLoading,
    refetch: refetchCampaign,
  } = useCampaign(campaignId)
  const {
    data: recipientsData,
    isLoading: recipientsLoading,
    refetch: refetchRecipients,
  } = useCampaignRecipients(campaignId, { status: statusFilter, page, pageSize })
  const updateMutation = useUpdateCampaign()
  const deleteRecipientMutation = useDeleteRecipient()
  const pauseMutation = usePauseCampaign()
  const resumeMutation = useResumeCampaign()
  const startMutation = useStartCampaign()

  const campaign = campaignData?.data
  const recipients = recipientsData?.data || []
  const totalRecipients = recipientsData?.total || 0
  const totalPages = recipientsData?.totalPages || 1

  // Real-time updates for campaign recipients
  const {
    isConnected: realtimeConnected,
    recipientStatuses: realtimeStatuses,
    recentUpdates,
  } = useRealtimeCampaignRecipients({
    campaignId,
    workspaceId: campaign?.workspace_id,
    onCallComplete: useCallback((recipient) => {
      toast.success(`Call completed: ${recipient.phone_number}`, {
        description: recipient.call_outcome === "answered" ? "Answered" : recipient.call_outcome || "Completed",
      })
    }, []),
    onCallFailed: useCallback((recipient) => {
      toast.error(`Call failed: ${recipient.phone_number}`, {
        description: recipient.error_message || "Call could not be completed",
      })
    }, []),
  })

  // Real-time campaign status updates
  const { status: realtimeCampaignStatus } = useRealtimeCampaignStatus({
    campaignId,
    onStatusChange: useCallback((newStatus, oldStatus) => {
      if (newStatus === "completed") {
        toast.success("Campaign completed!", {
          description: "All calls have been processed.",
        })
      } else if (newStatus === "paused" && oldStatus === "active") {
        toast.info("Campaign paused")
      }
      refetchCampaign()
    }, [refetchCampaign]),
  })

  // Get real-time status for a recipient (fallback to API status)
  const getRecipientStatus = useCallback((recipient: CallRecipient): RecipientCallStatus => {
    return (realtimeStatuses.get(recipient.id) as RecipientCallStatus) || recipient.call_status
  }, [realtimeStatuses])

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = []
    const showPages = 5 // Number of page buttons to show

    if (totalPages <= showPages) {
      // Show all pages if total is less than showPages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(1)

      // Calculate range around current page
      let start = Math.max(2, page - 1)
      let end = Math.min(totalPages - 1, page + 1)

      // Adjust if at the beginning
      if (page <= 3) {
        end = Math.min(4, totalPages - 1)
      }

      // Adjust if at the end
      if (page >= totalPages - 2) {
        start = Math.max(2, totalPages - 3)
      }

      // Add ellipsis after first page if needed
      if (start > 2) {
        pages.push(-1) // -1 represents ellipsis
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      // Add ellipsis before last page if needed
      if (end < totalPages - 1) {
        pages.push(-2) // -2 represents ellipsis
      }

      // Always show last page
      pages.push(totalPages)
    }

    return pages
  }

  if (campaignLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Campaign not found</h2>
        <Button variant="link" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  const progress =
    campaign.total_recipients > 0
      ? Math.round((campaign.completed_calls / campaign.total_recipients) * 100)
      : 0

  // Ready campaigns can be started with "Start Now"
  const canStart = campaign.status === "ready" && campaign.total_recipients > 0
  // Paused campaigns can be resumed
  const canResume = campaign.status === "paused" && campaign.total_recipients > 0
  // Active campaigns can be paused
  const canPause = campaign.status === "active"
  // Scheduled campaigns are waiting for their scheduled time (auto-start)
  const isScheduled = campaign.status === "scheduled"
  // Ready campaigns are waiting for user to click "Start Now"
  const isReady = campaign.status === "ready"
  // Editable means recipients can be added/removed (only incomplete drafts)
  const isEditable = campaign.status === "draft"

  const handlePause = async () => {
    try {
      await pauseMutation.mutateAsync(campaignId)
      toast.success("Campaign paused")
      refetchCampaign()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to pause campaign")
    }
  }

  const handleResume = async () => {
    try {
      await resumeMutation.mutateAsync(campaignId)
      toast.success("Campaign resumed")
      refetchCampaign()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resume campaign")
    }
  }

  const handleStart = async () => {
    try {
      await startMutation.mutateAsync(campaignId)
      toast.success("Campaign started! Calls are now being processed.")
      refetchCampaign()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start campaign")
    }
  }

  const handleDeleteRecipient = async () => {
    if (!deleteTarget) return
    try {
      await deleteRecipientMutation.mutateAsync({
        campaignId,
        recipientId: deleteTarget.id,
      })
      toast.success("Recipient removed")
      setDeleteTarget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete recipient")
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—"
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    // Scroll to top of table when page changes
    document
      .querySelector("[data-recipients-table]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handlePageSizeChange = (newPageSize: string) => {
    setPageSize(Number(newPageSize))
    setPage(1) // Reset to first page when changing page size
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/w/${workspaceSlug}/campaigns`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            {campaign.agent && (
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Bot className="h-4 w-4" />
                <span>{campaign.agent.name}</span>
                <span className="text-xs">({campaign.agent.provider})</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              refetchCampaign()
              refetchRecipients()
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {/* Start Now button for ready campaigns */}
          {canStart && (
            <Button 
              onClick={handleStart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Now
            </Button>
          )}
          {canPause && (
            <Button 
              variant="outline" 
              onClick={handlePause}
              disabled={pauseMutation.isPending}
            >
              {pauseMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Pause className="h-4 w-4 mr-2" />
              )}
              Pause
            </Button>
          )}
          {canResume && (
            <Button 
              onClick={handleResume}
              disabled={resumeMutation.isPending}
            >
              {resumeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Resume Campaign
            </Button>
          )}
          {/* Badge for ready campaigns waiting to start */}
          {isReady && !startMutation.isPending && (
            <Badge variant="outline" className="px-3 py-1">
              <Clock className="h-3 w-3 mr-1" />
              Ready to start
            </Badge>
          )}
          {/* Badge for scheduled campaigns showing start time */}
          {isScheduled && (
            <Badge variant="outline" className="px-3 py-1">
              <Clock className="h-3 w-3 mr-1" />
              Starts {campaign.scheduled_start_at 
                ? new Date(campaign.scheduled_start_at).toLocaleString() 
                : "at scheduled time"}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{campaign.total_recipients}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{campaign.pending_calls}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{campaign.successful_calls}</p>
                <p className="text-xs text-muted-foreground">Answered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{campaign.failed_calls}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-2xl font-bold">{progress}%</p>
              <p className="text-xs text-muted-foreground">Progress</p>
              <Progress value={progress} className="h-2 mt-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule & Settings Row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Schedule Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Start</span>
              <div>
                {campaign.schedule_type === "immediate" ? (
                  <Badge>Immediate</Badge>
                ) : (
                  <span className="text-sm font-medium">
                    {campaign.scheduled_start_at
                      ? new Date(campaign.scheduled_start_at).toLocaleString()
                      : "Not set"}
                  </span>
                )}
              </div>
            </div>

            {/* Enhanced Business Hours Display */}
            {campaign.business_hours_config &&
            (campaign.business_hours_config as BusinessHoursConfig).enabled ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Business Hours</span>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Timezone</span>
                  <span className="text-sm">
                    {(campaign.business_hours_config as BusinessHoursConfig).timezone}
                  </span>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Active Days:</p>
                  <div className="flex gap-1">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, idx) => {
                      const dayKey = [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                      ][idx]
                      const schedule = (campaign.business_hours_config as BusinessHoursConfig)
                        ?.schedule
                      const slots = schedule?.[dayKey as keyof typeof schedule] || []
                      const isActive = slots.length > 0

                      return (
                        <div
                          key={day}
                          className={`text-xs px-2 py-1 rounded ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                          title={
                            isActive ? slots.map((s) => `${s.start}-${s.end}`).join(", ") : "Off"
                          }
                        >
                          {day}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : campaign.business_hours_only ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Business Hours</span>
                  <span className="text-sm">
                    {campaign.business_hours_start} - {campaign.business_hours_end}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Timezone</span>
                  <span className="text-sm">{campaign.timezone}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Business Hours</span>
                <span className="text-sm text-muted-foreground">24/7</span>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Recipients Table */}
      <Card data-recipients-table>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Recipients
                {/* Real-time connection indicator */}
                {realtimeConnected ? (
                  <span className="flex items-center gap-1 text-xs font-normal text-green-600">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                    Connecting...
                  </span>
                )}
              </CardTitle>
              <CardDescription>{totalRecipients} phone numbers</CardDescription>
            </div>
            {isEditable && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
                <Button onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter and Page Size Controls */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as RecipientCallStatus | "all")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {statusFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {recipientsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recipients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-lg">
              <Users className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="font-semibold">No recipients yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-1">
                {statusFilter !== "all"
                  ? "No recipients match this filter."
                  : "Import a CSV file or add recipients manually to get started."}
              </p>
              {isEditable && statusFilter === "all" && (
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={() => setAddOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Manually
                  </Button>
                  <Button onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map((recipient) => (
                      <TableRow key={recipient.id}>
                        <TableCell className="font-mono">{recipient.phone_number}</TableCell>
                        <TableCell>
                          {recipient.first_name || recipient.last_name ? (
                            `${recipient.first_name || ""} ${recipient.last_name || ""}`.trim()
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <CallStatusBadge status={recipient.call_status} />
                        </TableCell>
                        <TableCell>
                          <CallOutcomeBadge outcome={recipient.call_outcome} />
                        </TableCell>
                        <TableCell>{formatDuration(recipient.call_duration_seconds)}</TableCell>
                        <TableCell>{recipient.attempts}</TableCell>
                        <TableCell>
                          {isEditable && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setDeleteTarget(recipient)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Enhanced Pagination with shadcn */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to{" "}
                    {Math.min(page * pageSize, totalRecipients)} of {totalRecipients} recipients
                  </p>

                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => page > 1 && handlePageChange(page - 1)}
                          className={
                            page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                          }
                        />
                      </PaginationItem>

                      {getPageNumbers().map((pageNum, idx) => {
                        if (pageNum === -1 || pageNum === -2) {
                          return (
                            <PaginationItem key={`ellipsis-${idx}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )
                        }

                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => handlePageChange(pageNum)}
                              isActive={page === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      })}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => page < totalPages && handlePageChange(page + 1)}
                          className={
                            page === totalPages
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ImportRecipientsDialog
        campaignId={campaignId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <AddRecipientDialog campaignId={campaignId} open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {deleteTarget?.phone_number} from this campaign?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecipient}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteRecipientMutation.isPending}
            >
              {deleteRecipientMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { format } from "date-fns"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import { CampaignAnalytics } from "@/components/workspace/campaigns/campaign-analytics"
import { CampaignLiveDashboard } from "@/components/workspace/campaigns/campaign-live-dashboard"
import { CampaignProgressRing } from "@/components/workspace/campaigns/campaign-progress-ring"
import { CampaignStatsGrid } from "@/components/workspace/campaigns/campaign-stats-card"
import {
  useCampaign,
  useCampaignRecipients,
  useDeleteRecipient,
  useTerminateCampaign,
  useStartCampaign,
  useCleanupCampaign,
  useProcessStuckCampaigns,
} from "@/lib/hooks/use-campaigns"
import {
  ArrowLeft,
  Loader2,
  Bot,
  Users,
  Clock,
  Play,
  XCircle,
  Upload,
  Plus,
  Trash2,
  Phone,
  MoreVertical,
  RefreshCw,
  Calendar,
  CalendarIcon,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type {
  CallRecipient,
  RecipientCallStatus,
  BusinessHoursConfig,
} from "@/types/database.types"

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
function getTodayDateString(): string {
  const today = new Date()
  return formatDateToLocal(today)
}

/**
 * Format a Date object to YYYY-MM-DD in local timezone
 * This avoids timezone issues with toISOString() which converts to UTC
 */
function formatDateToLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const statusFilterOptions = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "queued", label: "Queued" },
  { value: "calling", label: "Calling" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
]

const pageSizeOptions = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "30", label: "30" },
  { value: "50", label: "50" },
]

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const campaignId = params.id as string

  const [statusFilter, setStatusFilter] = useState<RecipientCallStatus | "all">("all")
  const [dateFilter, setDateFilter] = useState<string | null>(getTodayDateString()) // Default to today
  const [datePickerOpen, setDatePickerOpen] = useState(false) // Control popover
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10) // Default 10
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CallRecipient | null>(null)

  // Parse date filter for calendar component (use noon to avoid timezone edge cases)
  const selectedDate = dateFilter ? new Date(dateFilter + "T12:00:00") : undefined

  const {
    data: campaignData,
    isLoading: campaignLoading,
    refetch: refetchCampaign,
  } = useCampaign(campaignId, { enablePolling: true, pollingInterval: 5000 })
  
  // Determine if campaign is active for polling
  const isCampaignActive = campaignData?.data?.status === "active"
  
  const {
    data: recipientsData,
    isLoading: recipientsLoading,
    refetch: refetchRecipients,
  } = useCampaignRecipients(campaignId, { 
    status: statusFilter, 
    date: dateFilter,
    page, 
    pageSize,
    enablePolling: true,
    pollingInterval: 5000,
    campaignActive: isCampaignActive,
  })
  const deleteRecipientMutation = useDeleteRecipient()
  const terminateMutation = useTerminateCampaign()
  const startMutation = useStartCampaign()
  const cleanupMutation = useCleanupCampaign()
  const processStuckMutation = useProcessStuckCampaigns()

  const campaign = campaignData?.data
  
  // =========================================================================
  // POLLING FALLBACK: Continue stuck campaigns every 30 seconds
  // This ensures campaigns don't get stuck if webhook chain breaks
  // =========================================================================
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  useEffect(() => {
    const isActive = campaign?.status === "active"
    const hasPendingCalls = (campaign?.pending_calls || 0) > 0
    
    // Only poll if campaign is active and has pending calls
    if (isActive && hasPendingCalls) {
      console.log("[CampaignDetail] Starting polling fallback for stuck campaigns...")
      
      pollingIntervalRef.current = setInterval(async () => {
        console.log("[CampaignDetail] Polling - checking for stuck campaigns...")
        try {
          const result = await processStuckMutation.mutateAsync()
          if (result.totalStarted > 0) {
            console.log(`[CampaignDetail] Polling restarted ${result.totalStarted} calls!`)
            // Refresh data when calls are restarted
            refetchCampaign()
            refetchRecipients()
          }
        } catch (error) {
          console.error("[CampaignDetail] Polling error:", error)
        }
      }, 30000) // Poll every 30 seconds
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      }
    }
    
    // Cleanup if not active
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [campaign?.status, campaign?.pending_calls])
  const recipients = recipientsData?.data || []
  const totalRecipients = recipientsData?.total || 0
  const totalPages = recipientsData?.totalPages || 1

  // useCallback must be called before any early returns to follow React hooks rules
  const handleRefresh = useCallback(() => {
    refetchCampaign()
    refetchRecipients()
  }, [refetchCampaign, refetchRecipients])

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = []
    const showPages = 5

    if (totalPages <= showPages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)
      let start = Math.max(2, page - 1)
      let end = Math.min(totalPages - 1, page + 1)

      if (page <= 3) {
        end = Math.min(4, totalPages - 1)
      }
      if (page >= totalPages - 2) {
        start = Math.max(2, totalPages - 3)
      }

      if (start > 2) pages.push(-1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push(-2)
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

  const processedCalls = campaign.completed_calls || 0
  const progress = campaign.total_recipients > 0
    ? Math.round((processedCalls / campaign.total_recipients) * 100)
    : 0

  const canStart = campaign.status === "ready" && campaign.total_recipients > 0
  const canCancel = campaign.status === "active"
  const isScheduled = campaign.status === "scheduled"
  const isReady = campaign.status === "ready"
  const isEditable = campaign.status === "draft"

  const handleCancel = async () => {
    try {
      await terminateMutation.mutateAsync(campaignId)
      toast.success("Campaign cancelled - all remaining calls stopped")
      refetchCampaign()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel campaign")
    }
  }

  const handleStart = async () => {
    const toastId = toast.loading("Starting campaign...", {
      description: `${campaign?.total_recipients || 0} recipients will be called`
    })
    
    try {
      const result = await startMutation.mutateAsync(campaignId)
      toast.success(result.message || "Campaign started!", {
        id: toastId,
        description: "Calls are being processed in the background",
        duration: 4000,
      })
      refetchCampaign()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start campaign", {
        id: toastId,
      })
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
    document
      .querySelector("[data-recipients-table]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const handlePageSizeChange = (newPageSize: string) => {
    setPageSize(Number(newPageSize))
    setPage(1)
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
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {campaign.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const result = await cleanupMutation.mutateAsync(campaignId)
                  if (result.staleRecipientsUpdated > 0) {
                    toast.success(`Cleaned up ${result.staleRecipientsUpdated} stale call(s)`)
                  } else {
                    toast.info("No stale calls found")
                  }
                  if (result.campaignCompleted) {
                    toast.success("Campaign completed!")
                  }
                  handleRefresh()
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to sync")
                }
              }}
              disabled={cleanupMutation.isPending}
              title="Sync stale calls"
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync
            </Button>
          )}
          {canStart && (
            <Button onClick={handleStart} disabled={startMutation.isPending}>
              {startMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Now
            </Button>
          )}
          {canCancel && (
            <Button 
              variant="outline" 
              onClick={handleCancel} 
              disabled={terminateMutation.isPending}
              className="border-orange-500 text-orange-600 hover:bg-orange-50"
            >
              {terminateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Cancel Campaign
            </Button>
          )}
          {isReady && !startMutation.isPending && (
            <Badge variant="outline" className="px-3 py-1">
              <Clock className="h-3 w-3 mr-1" />
              Ready to start
            </Badge>
          )}
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

      {/* Live Dashboard for Active Campaigns */}
      {campaign.status === "active" && (
        <CampaignLiveDashboard
          campaignId={campaign.id}
          campaignName={campaign.name}
          status="active"
          totalRecipients={campaign.total_recipients}
          pendingCalls={campaign.pending_calls}
          completedCalls={processedCalls}
          successfulCalls={campaign.successful_calls || 0}
          failedCalls={campaign.failed_calls || 0}
          onCancel={handleCancel}
          onRefresh={handleRefresh}
          isCancelling={terminateMutation.isPending}
        />
      )}

      {/* Stats Grid */}
      <CampaignStatsGrid
        totalRecipients={campaign.total_recipients}
        pendingCalls={campaign.pending_calls}
        completedCalls={processedCalls}
        successfulCalls={campaign.successful_calls || 0}
        failedCalls={campaign.failed_calls || 0}
      />

      {/* Progress Card */}
      {campaign.total_recipients > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <CampaignProgressRing
                value={progress}
                size={140}
                strokeWidth={12}
                isActive={campaign.status === "active"}
                showPercentage={true}
                showCount={true}
                total={campaign.total_recipients}
                processed={processedCalls}
                variant={campaign.status === "active" ? "success" : "default"}
              />
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Campaign Progress</h3>
                  <p className="text-sm text-muted-foreground">
                    {processedCalls.toLocaleString()} of {campaign.total_recipients.toLocaleString()} recipients processed
                  </p>
                </div>
                <Progress value={progress} className="h-3" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analytics for completed/cancelled campaigns */}
      {(campaign.status === "completed" || campaign.status === "cancelled") && processedCalls > 0 && (
        <CampaignAnalytics
          data={{
            total: campaign.total_recipients,
            completed: processedCalls,
            successful: campaign.successful_calls || 0,
            failed: campaign.failed_calls || 0,
            pending: campaign.pending_calls || 0,
            successRate: processedCalls > 0 
              ? Math.round(((campaign.successful_calls || 0) / processedCalls) * 100) 
              : 0,
            avgDurationSeconds: undefined,
          }}
        />
      )}

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
                      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
                    ][idx]
                    const schedule = (campaign.business_hours_config as BusinessHoursConfig)?.schedule
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
                      >
                        {day}
                      </div>
                    )
                  })}
                </div>
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

      {/* Recipients Table */}
      <Card data-recipients-table>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Recipients
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
          {/* Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Filter */}
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[180px] justify-start text-left font-normal",
                      !dateFilter && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? format(selectedDate!, "PPP") : "All dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        // Use local date formatting to avoid timezone issues
                        setDateFilter(formatDateToLocal(date))
                        setPage(1)
                        setDatePickerOpen(false) // Close popover after selection
                      }
                    }}
                    initialFocus
                  />
                  {dateFilter && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setDateFilter(null)
                          setPage(1)
                          setDatePickerOpen(false)
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear date filter
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Status Filter */}
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
            </div>

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

              {/* Pagination */}
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
                          className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
                          className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
      <ImportRecipientsDialog campaignId={campaignId} open={importOpen} onOpenChange={setImportOpen} />
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

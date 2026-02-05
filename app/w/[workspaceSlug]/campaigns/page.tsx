"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
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
import { CampaignCard } from "@/components/workspace/campaigns/campaign-card"
import { WizardDraftCard } from "@/components/workspace/campaigns/wizard-draft-card"
import { CampaignActionOverlay } from "@/components/workspace/campaigns/campaign-action-overlay"
import { CampaignHeroStats } from "@/components/workspace/campaigns/campaign-hero-stats"
import { CampaignEmptyState } from "@/components/workspace/campaigns/campaign-empty-state"
import { DataPagination } from "@/components/shared/data-pagination"
import { 
  useCampaigns, 
  useDeleteCampaign,
  useStartCampaign,
  useTerminateCampaign,
} from "@/lib/hooks/use-campaigns"
import { useRealtimeCampaignList } from "@/lib/hooks/use-realtime-campaign"
import {
  Phone,
  Plus,
  Loader2,
  RefreshCw,
  Filter,
  Search,
  CalendarIcon,
  X,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CallCampaignWithAgent, CampaignStatus } from "@/types/database.types"

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

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "scheduled", label: "Scheduled" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

export default function CampaignsPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceSlug = params.workspaceSlug as string

  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all")
  const [dateFilter, setDateFilter] = useState<string | null>(getTodayDateString()) // Default to today
  const [datePickerOpen, setDatePickerOpen] = useState(false) // Control popover
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10) // Default 10
  const [deleteTarget, setDeleteTarget] = useState<CallCampaignWithAgent | null>(null)
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [startingCampaignId, setStartingCampaignId] = useState<string | null>(null)
  const [cancellingCampaignId, setCancellingCampaignId] = useState<string | null>(null)
  
  // Track current action for overlay
  const [actionOverlay, setActionOverlay] = useState<{
    action: "start" | "terminate" | null
    campaign: CallCampaignWithAgent | null
  }>({ action: null, campaign: null })

  const handleNewCampaign = () => {
    setIsCreatingCampaign(true)
    router.push(`/w/${workspaceSlug}/campaigns/new`)
  }

  // Parse date filter for calendar component (use noon to avoid timezone edge cases)
  const selectedDate = dateFilter ? new Date(dateFilter + "T12:00:00") : undefined

  // Fetch campaigns - this also returns workspaceId for realtime subscription
  const { data, isLoading, refetch, hasActiveCampaigns, workspaceId } = useCampaigns({ 
    status: statusFilter, 
    date: dateFilter,
    page,
    pageSize,
    // Enable auto-polling every 5 seconds when there are active campaigns
    enablePolling: true,
    pollingInterval: 5000,
  })
  const deleteMutation = useDeleteCampaign()
  const startMutation = useStartCampaign()
  const terminateMutation = useTerminateCampaign()

  // Real-time updates for campaign status changes
  // Uses workspaceId from campaigns API response
  const { isConnected: realtimeConnected } = useRealtimeCampaignList({
    workspaceId: workspaceId,
    onCampaignUpdate: (campaignId, status) => {
      // Show toast for important status changes
      if (status === "active") {
        toast.info("Campaign is now active", { description: "Calls are being processed" })
      } else if (status === "completed") {
        toast.success("Campaign completed")
      } else if (status === "cancelled") {
        toast.info("Campaign cancelled")
      }
    },
  })

  const campaigns = data?.data || []
  const totalCampaigns = data?.total || 0
  const totalPages = data?.totalPages || 1

  // Calculate stats (only scalable aggregate counts)
  const activeCampaigns = campaigns.filter(c => c.status === "active").length

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  
  // Filter campaigns by search
  const filteredCampaigns = campaigns.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.agent?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleStart = async (campaign: CallCampaignWithAgent) => {
    // Check both total_recipients and pending_calls - campaign might have recipients
    // but stats could be stale. The API will do a final check.
    const hasRecipients = campaign.total_recipients > 0 || (campaign.pending_calls ?? 0) > 0
    
    if (!hasRecipients) {
      // Show warning but still try to start - API will validate
      console.log("[Campaigns] Campaign appears to have no recipients, attempting start anyway:", campaign.id)
    }
    
    setStartingCampaignId(campaign.id)
    
    // Show immediate feedback toast - don't block with overlay
    const toastId = toast.loading("Starting campaign...", {
      description: hasRecipients 
        ? `${campaign.total_recipients} recipients will be called`
        : "Checking recipients..."
    })
    
    try {
      const result = await startMutation.mutateAsync(campaign.id)
      // Update toast to success
      toast.success(result.message || "Campaign started!", {
        id: toastId,
        description: "Calls are being processed in the background. Status will update in real-time.",
        duration: 4000,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start campaign"
      toast.error(errorMessage, { id: toastId })
      
      // If the error is about recipients, suggest adding them
      if (errorMessage.toLowerCase().includes("recipient")) {
        toast.info("Go to campaign details to add recipients", {
          action: {
            label: "View",
            onClick: () => router.push(`/w/${workspaceSlug}/campaigns/${campaign.id}`)
          }
        })
      }
    } finally {
      setStartingCampaignId(null)
    }
  }

  const handleCancel = async (campaign: CallCampaignWithAgent) => {
    setCancellingCampaignId(campaign.id)
    setActionOverlay({ action: "terminate", campaign })
    
    try {
      const result = await terminateMutation.mutateAsync(campaign.id)
      toast.success(result.message || "Campaign cancelled - all remaining calls stopped")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel campaign")
    } finally {
      setCancellingCampaignId(null)
      setActionOverlay({ action: null, campaign: null })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const wasActive = deleteTarget.status === "active"
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success(wasActive ? "Campaign cancelled and deleted" : "Campaign deleted")
      setDeleteTarget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete campaign")
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Campaigns</h1>
            {/* Real-time connection indicator */}
            {realtimeConnected && (
              <Badge variant="outline" className="text-green-600 border-green-600/50">
                <span className="h-2 w-2 rounded-full bg-green-500 mr-1.5" />
                Live
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Create and manage outbound calling campaigns for your AI agents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            onClick={handleNewCampaign} 
            disabled={isCreatingCampaign || isLoading}
            className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/20"
          >
            {isCreatingCampaign ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                New Campaign
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Draft Recovery Card - shows if user has unsaved wizard progress */}
      <WizardDraftCard />

      {/* Hero Stats Cards - Only showing scalable aggregate stats */}
      <CampaignHeroStats
        totalCampaigns={totalCampaigns}
        activeCampaigns={activeCampaigns}
        isLoading={isLoading}
      />

      {/* Filters and Pagination */}
      <Card className="border-border/50">
        <CardContent className="pt-6 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            {/* Date filter */}
            <div className="flex items-center gap-2">
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !dateFilter && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? format(selectedDate!, "PPP") : "All dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
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
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => {
                    setDateFilter(getTodayDateString())
                    setPage(1)
                  }}
                  title="Reset to today"
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            {/* Status filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select 
                value={statusFilter} 
                onValueChange={(v) => { 
                  setStatusFilter(v as CampaignStatus | "all")
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Quick stats badge */}
            {!isLoading && campaigns.length > 0 && (
              <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground ml-auto">
                {searchQuery ? (
                  <>
                    <span>
                      {filteredCampaigns.length} match{filteredCampaigns.length !== 1 ? 'es' : ''} on this page
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
                      Clear search
                    </Button>
                  </>
                ) : (
                  <span>
                    {totalCampaigns} campaign{totalCampaigns !== 1 ? 's' : ''}
                    {dateFilter ? ` on ${format(selectedDate!, "MMM d, yyyy")}` : ' total'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Pagination - at top for better UX */}
          {totalCampaigns > 0 && !isLoading && (
            <div className="border-t border-border/50 mt-4 pt-2">
              <DataPagination
                page={page}
                totalPages={totalPages}
                totalItems={totalCampaigns}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 20, 30, 50]}
                isLoading={isLoading}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaigns List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Skeleton className="h-12 w-12 rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Skeleton className="h-7 w-20 rounded-full" />
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <CampaignEmptyState 
          onCreateCampaign={handleNewCampaign} 
          isCreating={isCreatingCampaign}
          title={
            dateFilter || statusFilter !== "all" 
              ? "No campaigns match your filters" 
              : undefined
          }
          description={
            dateFilter || statusFilter !== "all" 
              ? `Try adjusting your ${dateFilter ? 'date' : ''}${dateFilter && statusFilter !== 'all' ? ' or ' : ''}${statusFilter !== 'all' ? 'status' : ''} filter to see more campaigns.` 
              : undefined
          }
        />
      ) : filteredCampaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-8 w-8 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No results found</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              No campaigns match "{searchQuery}". Try a different search term.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setSearchQuery("")}>
              Clear search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onStart={handleStart}
              onCancel={handleCancel}
              onDelete={setDeleteTarget}
              isStarting={startingCampaignId === campaign.id}
              isCancelling={cancellingCampaignId === campaign.id}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"?
              {deleteTarget?.status === "active" && (
                <span className="block mt-2 text-orange-600 dark:text-orange-400 font-medium">
                  This campaign is currently active. All remaining calls will be stopped immediately.
                </span>
              )}
              <span className="block mt-2">
                This will permanently remove all recipients and call data. This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {deleteTarget?.status === "active" 
                    ? "Cancelling..." 
                    : "Deleting..."}
                </>
              ) : (
                deleteTarget?.status === "active"
                  ? "Cancel & Delete"
                  : "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Campaign Action Overlay */}
      <CampaignActionOverlay
        open={!!actionOverlay.action}
        action={actionOverlay.action}
        campaignName={actionOverlay.campaign?.name}
        recipientCount={actionOverlay.campaign?.total_recipients}
      />
    </div>
  )
}


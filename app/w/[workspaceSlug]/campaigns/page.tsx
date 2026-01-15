"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { 
  useCampaigns, 
  useDeleteCampaign,
  useStartCampaign,
  usePauseCampaign,
  useResumeCampaign,
} from "@/lib/hooks/use-campaigns"
import { useRealtimeCampaignList } from "@/lib/hooks/use-realtime-campaign"
import {
  Phone,
  Plus,
  Loader2,
  RefreshCw,
  Users,
  CheckCircle2,
  PhoneCall,
  Radio,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import type { CallCampaignWithAgent, CampaignStatus } from "@/types/database.types"

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "scheduled", label: "Scheduled" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

export default function CampaignsPage() {
  const params = useParams()
  const router = useRouter()
  const workspaceSlug = params.workspaceSlug as string

  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all")
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<CallCampaignWithAgent | null>(null)
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [startingCampaignId, setStartingCampaignId] = useState<string | null>(null)
  const [pausingCampaignId, setPausingCampaignId] = useState<string | null>(null)
  const [resumingCampaignId, setResumingCampaignId] = useState<string | null>(null)
  
  // Track current action for overlay
  const [actionOverlay, setActionOverlay] = useState<{
    action: "start" | "pause" | "resume" | "terminate" | null
    campaign: CallCampaignWithAgent | null
  }>({ action: null, campaign: null })

  const handleNewCampaign = () => {
    setIsCreatingCampaign(true)
    router.push(`/w/${workspaceSlug}/campaigns/new`)
  }

  // Fetch campaigns - this also returns workspaceId for realtime subscription
  const { data, isLoading, refetch, hasActiveCampaigns, workspaceId } = useCampaigns({ 
    status: statusFilter, 
    page,
    // Enable auto-polling every 5 seconds when there are active campaigns
    enablePolling: true,
    pollingInterval: 5000,
  })
  const deleteMutation = useDeleteCampaign()
  const startMutation = useStartCampaign()
  const pauseMutation = usePauseCampaign()
  const resumeMutation = useResumeCampaign()

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
      } else if (status === "paused") {
        toast.info("Campaign paused")
      }
    },
  })

  const campaigns = data?.data || []
  const totalCampaigns = data?.total || 0

  // Calculate stats
  const activeCampaigns = campaigns.filter(c => c.status === "active").length
  const draftCampaigns = campaigns.filter(c => c.status === "draft").length
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.total_recipients, 0)
  const completedCalls = campaigns.reduce((sum, c) => sum + c.completed_calls, 0)

  const handleStart = async (campaign: CallCampaignWithAgent) => {
    if (campaign.total_recipients === 0) {
      toast.error("Add recipients before starting the campaign")
      return
    }
    
    setStartingCampaignId(campaign.id)
    // Show overlay for campaigns with many recipients
    if (campaign.total_recipients > 10) {
      setActionOverlay({ action: "start", campaign })
    }
    
    try {
      const result = await startMutation.mutateAsync(campaign.id)
      toast.success(result.message || "Campaign started successfully")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start campaign")
    } finally {
      setStartingCampaignId(null)
      setActionOverlay({ action: null, campaign: null })
    }
  }

  const handlePause = async (campaign: CallCampaignWithAgent) => {
    setPausingCampaignId(campaign.id)
    setActionOverlay({ action: "pause", campaign })
    
    try {
      const result = await pauseMutation.mutateAsync(campaign.id)
      toast.success(result.message || "Campaign paused")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to pause campaign")
    } finally {
      setPausingCampaignId(null)
      setActionOverlay({ action: null, campaign: null })
    }
  }

  const handleResume = async (campaign: CallCampaignWithAgent) => {
    setResumingCampaignId(campaign.id)
    setActionOverlay({ action: "resume", campaign })
    
    try {
      const result = await resumeMutation.mutateAsync(campaign.id)
      toast.success(result.message || "Campaign resumed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resume campaign")
    } finally {
      setResumingCampaignId(null)
      setActionOverlay({ action: null, campaign: null })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const wasActive = deleteTarget.status === "active" || deleteTarget.status === "paused"
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success(wasActive ? "Campaign terminated and deleted" : "Campaign deleted")
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
            {realtimeConnected ? (
              <Badge variant="outline" className="text-green-600 border-green-600/50">
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </Badge>
            ) : workspaceId ? (
              <Badge variant="outline" className="text-muted-foreground">
                <Radio className="h-3 w-3 mr-1.5 animate-pulse" />
                Connecting...
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1">
            Create and manage outbound calling campaigns for your AI agents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleNewCampaign} disabled={isCreatingCampaign || isLoading}>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span className="text-2xl font-bold">{totalCampaigns}</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-green-600" />
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span className="text-2xl font-bold text-green-600">{activeCampaigns}</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Recipients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span className="text-2xl font-bold">{totalRecipients}</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-purple-600" />
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <span className="text-2xl font-bold">{completedCalls}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Select 
              value={statusFilter} 
              onValueChange={(v) => { 
                setStatusFilter(v as CampaignStatus | "all")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
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
                      <Skeleton className="h-10 w-10 rounded-lg" />
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
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 bg-primary/10 rounded-full mb-4">
              <Phone className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No campaigns yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              {statusFilter !== "all"
                ? "No campaigns match your filter. Try adjusting your selection."
                : "Create your first calling campaign to start reaching your leads with AI-powered outbound calls."}
            </p>
            {statusFilter === "all" && (
              <Button className="mt-6" onClick={handleNewCampaign} disabled={isCreatingCampaign}>
                {isCreatingCampaign ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Campaign
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onDelete={setDeleteTarget}
              isStarting={startingCampaignId === campaign.id}
              isPausing={pausingCampaignId === campaign.id}
              isResuming={resumingCampaignId === campaign.id}
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
              {(deleteTarget?.status === "active" || deleteTarget?.status === "paused") && (
                <span className="block mt-2 text-orange-600 dark:text-orange-400 font-medium">
                  This campaign is currently {deleteTarget?.status}. All pending calls will be stopped immediately.
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
                  {(deleteTarget?.status === "active" || deleteTarget?.status === "paused") 
                    ? "Terminating..." 
                    : "Deleting..."}
                </>
              ) : (
                (deleteTarget?.status === "active" || deleteTarget?.status === "paused")
                  ? "Terminate & Delete"
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


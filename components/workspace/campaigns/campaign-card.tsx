"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Phone,
  MoreVertical,
  Play,
  Trash2,
  Eye,
  Bot,
  Users,
  CheckCircle2,
  XCircle,
  Edit,
  Loader2,
  Clock,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { CallCampaignWithAgent, CampaignStatus } from "@/types/database.types"

interface CampaignCardProps {
  campaign: CallCampaignWithAgent
  onStart?: (campaign: CallCampaignWithAgent) => void
  onCancel?: (campaign: CallCampaignWithAgent) => void
  onDelete?: (campaign: CallCampaignWithAgent) => void
  isStarting?: boolean
  isCancelling?: boolean
}

const statusConfig: Record<CampaignStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: {
    label: "Draft",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    icon: null,
  },
  ready: {
    label: "Ready",
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    icon: <Play className="h-3 w-3 mr-1" />,
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    icon: <Clock className="h-3 w-3 mr-1" />,
  },
  active: {
    label: "Active",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: <span className="relative flex h-2 w-2 mr-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>,
  },
  paused: {
    label: "Paused",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: null,
  },
  completed: {
    label: "Completed",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: <XCircle className="h-3 w-3 mr-1" />,
  },
}

export function CampaignCard({ 
  campaign, 
  onStart, 
  onCancel,
  onDelete,
  isStarting = false,
  isCancelling = false,
}: CampaignCardProps) {
  const params = useParams()
  const router = useRouter()
  const workspaceSlug = params.workspaceSlug as string
  const [isNavigating, setIsNavigating] = useState(false)

  const handleContinue = () => {
    setIsNavigating(true)
    router.push(`/w/${workspaceSlug}/campaigns/new?draft=${campaign.id}`)
  }

  // Progress is based on all processed calls (completed + failed)
  // completed_calls now includes both successful and failed calls from the API
  const processedCalls = campaign.completed_calls || 0
  const progress = campaign.total_recipients > 0
    ? Math.round((processedCalls / campaign.total_recipients) * 100)
    : 0

  const statusInfo = statusConfig[campaign.status]
  
  // Determine available actions based on status
  const isDraft = campaign.status === "draft"
  const isReady = campaign.status === "ready"
  const isScheduled = campaign.status === "scheduled"
  const isActive = campaign.status === "active"
  
  // Ready campaigns can be started (user clicks "Start Now")
  const canStart = isReady
  // Active campaigns can be cancelled (stops all future calls)
  const canCancel = isActive
  // Delete is always available - the API will terminate active campaigns automatically
  const canDelete = true
  // Only incomplete drafts can be edited via wizard
  const canEdit = isDraft && !campaign.wizard_completed

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left side - Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <Link
                  href={canEdit ? `/w/${workspaceSlug}/campaigns/new?draft=${campaign.id}` : `/w/${workspaceSlug}/campaigns/${campaign.id}`}
                  className="font-semibold text-foreground hover:text-primary transition-colors truncate block"
                >
                  {campaign.name}
                </Link>
                {campaign.agent && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Bot className="h-3 w-3" />
                    <span className="truncate">{campaign.agent.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{campaign.total_recipients} recipients</span>
              </div>
              {/* Show call stats for campaigns that have started or completed */}
              {(isActive || campaign.status === "completed" || campaign.status === "cancelled") && (
                <>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{campaign.successful_calls} answered</span>
                  </div>
                  {campaign.failed_calls > 0 && (
                    <div className="flex items-center gap-1">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span>{campaign.failed_calls} failed</span>
                    </div>
                  )}
                </>
              )}
              {/* Show scheduled time for scheduled campaigns */}
              {isScheduled && campaign.scheduled_start_at && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <span>Starts {new Date(campaign.scheduled_start_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {/* Progress bar - show for campaigns that have started */}
            {campaign.total_recipients > 0 && (isActive || campaign.status === "completed" || campaign.status === "cancelled") && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{processedCalls} / {campaign.total_recipients} processed</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>

          {/* Right side - Status & Actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge className={`flex items-center ${statusInfo.color}`}>
              {statusInfo.icon}
              {statusInfo.label}
            </Badge>

            <div className="flex items-center gap-1">
              {/* Quick action for incomplete drafts - Continue editing */}
              {canEdit && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleContinue}
                  disabled={isNavigating}
                >
                  {isNavigating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Edit className="h-4 w-4 mr-1" />
                      Continue
                    </>
                  )}
                </Button>
              )}

              {/* Start Now button for ready campaigns */}
              {canStart && onStart && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => onStart(campaign)}
                  disabled={isStarting}
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Start Now
                    </>
                  )}
                </Button>
              )}

              {/* View button for non-actionable campaigns */}
              {!canEdit && !canStart && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/w/${workspaceSlug}/campaigns/${campaign.id}`}>
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Link>
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Start option for ready campaigns (also in main button) */}
                  {canStart && onStart && (
                    <DropdownMenuItem 
                      onClick={() => onStart(campaign)}
                      disabled={isStarting}
                    >
                      {isStarting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {isStarting ? "Starting..." : "Start Now"}
                    </DropdownMenuItem>
                  )}
                  {/* Cancel option for active campaigns */}
                  {canCancel && onCancel && (
                    <DropdownMenuItem 
                      onClick={() => onCancel(campaign)}
                      disabled={isCancelling}
                      className="text-orange-600 focus:text-orange-600"
                    >
                      {isCancelling ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      {isCancelling ? "Cancelling..." : "Cancel Campaign"}
                    </DropdownMenuItem>
                  )}
                  {/* View details - always available */}
                  <DropdownMenuItem asChild>
                    <Link href={`/w/${workspaceSlug}/campaigns/${campaign.id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {/* Delete is always available */}
                  {canDelete && onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(campaign)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


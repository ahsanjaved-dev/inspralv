"use client"

/**
 * Campaign Card Component (OPTIMIZED)
 * 
 * Lightweight campaign card without heavy animations
 * Uses CSS transitions for smooth hover effects
 */

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
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
import { cn } from "@/lib/utils"
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
  Calendar,
  TrendingUp,
  StopCircle,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { CallCampaignWithAgent, CampaignStatus } from "@/types/database.types"

interface CampaignCardEnhancedProps {
  campaign: CallCampaignWithAgent
  onStart?: (campaign: CallCampaignWithAgent) => void
  onCancel?: (campaign: CallCampaignWithAgent) => void
  onDelete?: (campaign: CallCampaignWithAgent) => void
  isStarting?: boolean
  isCancelling?: boolean
}

// Status configuration
const statusConfig: Record<
  CampaignStatus,
  {
    label: string
    className: string
    icon: React.ReactNode
  }
> = {
  draft: {
    label: "Draft",
    className: "bg-slate-500 text-white",
    icon: <Edit className="h-3 w-3" />,
  },
  ready: {
    label: "Ready",
    className: "bg-cyan-500 text-white",
    icon: <Play className="h-3 w-3" />,
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-purple-500 text-white",
    icon: <Calendar className="h-3 w-3" />,
  },
  active: {
    label: "Active",
    className: "bg-emerald-500 text-white",
    icon: <span className="h-2 w-2 rounded-full bg-white" />,
  },
  paused: {
    label: "Paused",
    className: "bg-amber-500 text-white",
    icon: <StopCircle className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    className: "bg-blue-500 text-white",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-500 text-white",
    icon: <XCircle className="h-3 w-3" />,
  },
}

export function CampaignCardEnhanced({
  campaign,
  onStart,
  onCancel,
  onDelete,
  isStarting = false,
  isCancelling = false,
}: CampaignCardEnhancedProps) {
  const params = useParams()
  const router = useRouter()
  const workspaceSlug = params.workspaceSlug as string
  const [isNavigating, setIsNavigating] = useState(false)

  const handleContinue = () => {
    setIsNavigating(true)
    router.push(`/w/${workspaceSlug}/campaigns/new?draft=${campaign.id}`)
  }

  // Progress calculation
  const processedCalls = campaign.completed_calls ?? 0
  const successfulCalls = campaign.successful_calls ?? 0
  const failedCalls = campaign.failed_calls ?? 0
  const progress = campaign.total_recipients > 0
    ? Math.round((processedCalls / campaign.total_recipients) * 100)
    : 0
  const successRate = processedCalls > 0 ? Math.round((successfulCalls / processedCalls) * 100) : 0

  const statusInfo = statusConfig[campaign.status]

  // Status-based actions
  const isDraft = campaign.status === "draft"
  const isReady = campaign.status === "ready"
  const isActive = campaign.status === "active"
  const isCompleted = campaign.status === "completed"

  const canStart = isReady
  const canCancel = isActive
  const canEdit = isDraft && !campaign.wizard_completed

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-shadow duration-200",
        "hover:shadow-md border-border/50",
        isActive && "ring-1 ring-emerald-500/50"
      )}
    >
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Left side - Info */}
          <div className="flex-1 min-w-0">
            {/* Header with icon and name */}
            <div className="flex items-center gap-3 mb-3">
              <div className={cn("p-2.5 rounded-xl shadow-sm", statusInfo.className)}>
                <Phone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={
                    canEdit
                      ? `/w/${workspaceSlug}/campaigns/new?draft=${campaign.id}`
                      : `/w/${workspaceSlug}/campaigns/${campaign.id}`
                  }
                  className="font-semibold text-foreground hover:text-primary transition-colors truncate block text-lg"
                >
                  {campaign.name}
                </Link>
                {campaign.agent && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                    <Bot className="h-3.5 w-3.5" />
                    <span className="truncate">{campaign.agent.name}</span>
                    <span className="text-xs opacity-60">• {campaign.agent.provider}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="font-medium">{campaign.total_recipients.toLocaleString()}</span>
              </div>

              {(isActive || isCompleted) && (
                <>
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-medium tabular-nums">{successfulCalls}</span>
                  </div>

                  {failedCalls > 0 && (
                    <div className="flex items-center gap-1.5 text-red-500">
                      <XCircle className="h-4 w-4" />
                      <span className="font-medium tabular-nums">{failedCalls}</span>
                    </div>
                  )}

                  {processedCalls > 0 && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono",
                        successRate >= 70 ? "border-emerald-500/50 text-emerald-600"
                          : successRate >= 40 ? "border-amber-500/50 text-amber-600"
                          : "border-red-500/50 text-red-600"
                      )}
                    >
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {successRate}%
                    </Badge>
                  )}
                </>
              )}

              {campaign.status === "scheduled" && campaign.scheduled_start_at && (
                <div className="flex items-center gap-1.5 text-purple-600">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">
                    Starts {new Date(campaign.scheduled_start_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {campaign.total_recipients > 0 && (isActive || isCompleted) && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>
                    {processedCalls.toLocaleString()} / {campaign.total_recipients.toLocaleString()} processed
                  </span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>

          {/* Right side - Status & Actions */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            {/* Status badge */}
            <Badge className={cn("flex items-center gap-1.5 px-3 py-1", statusInfo.className)}>
              {statusInfo.icon}
              {statusInfo.label}
            </Badge>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={handleContinue} disabled={isNavigating}>
                  {isNavigating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Continue
                    </>
                  )}
                </Button>
              )}

              {canStart && onStart && (
                <Button
                  size="sm"
                  onClick={() => onStart(campaign)}
                  disabled={isStarting}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {isStarting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1.5" />
                      Start Now
                    </>
                  )}
                </Button>
              )}

              {canCancel && onCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCancel(campaign)}
                  disabled={isCancelling}
                  className="border-orange-500 text-orange-600 hover:bg-orange-50"
                >
                  {isCancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Cancel
                    </>
                  )}
                </Button>
              )}

              {!canEdit && !canStart && !canCancel && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/w/${workspaceSlug}/campaigns/${campaign.id}`}>
                    <Eye className="h-4 w-4 mr-1.5" />
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
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href={`/w/${workspaceSlug}/campaigns/${campaign.id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {onDelete && (
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
      </div>
    </Card>
  )
}

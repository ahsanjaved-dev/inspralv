"use client"

/**
 * Enhanced Campaign Card Component
 * 
 * A modern, animated campaign card with:
 * - Live progress indicators
 * - Animated status transitions
 * - Real-time stat updates
 * - Hover interactions
 * - Gradient backgrounds by status
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  Phone,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Eye,
  Bot,
  Users,
  CheckCircle2,
  XCircle,
  Edit,
  Loader2,
  Clock,
  Zap,
  TrendingUp,
  PhoneCall,
  Calendar,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { CallCampaignWithAgent, CampaignStatus } from "@/types/database.types"

interface CampaignCardEnhancedProps {
  campaign: CallCampaignWithAgent
  onStart?: (campaign: CallCampaignWithAgent) => void
  onPause?: (campaign: CallCampaignWithAgent) => void
  onResume?: (campaign: CallCampaignWithAgent) => void
  onDelete?: (campaign: CallCampaignWithAgent) => void
  isStarting?: boolean
  isPausing?: boolean
  isResuming?: boolean
  /** Live stats from real-time updates */
  liveStats?: {
    completed?: number
    successful?: number
    failed?: number
    callsPerMinute?: number
  }
}

// Status configuration with gradients
const statusConfig: Record<
  CampaignStatus,
  {
    label: string
    gradient: string
    bgGradient: string
    icon: React.ReactNode
    pulse?: boolean
  }
> = {
  draft: {
    label: "Draft",
    gradient: "from-slate-500 to-slate-600",
    bgGradient: "from-slate-500/5 to-slate-600/5",
    icon: <Edit className="h-3 w-3" />,
  },
  ready: {
    label: "Ready",
    gradient: "from-cyan-500 to-blue-500",
    bgGradient: "from-cyan-500/5 to-blue-500/5",
    icon: <Play className="h-3 w-3" />,
  },
  scheduled: {
    label: "Scheduled",
    gradient: "from-purple-500 to-pink-500",
    bgGradient: "from-purple-500/5 to-pink-500/5",
    icon: <Calendar className="h-3 w-3" />,
  },
  active: {
    label: "Active",
    gradient: "from-emerald-500 to-green-500",
    bgGradient: "from-emerald-500/10 to-green-500/10",
    icon: (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
      </span>
    ),
    pulse: true,
  },
  paused: {
    label: "Paused",
    gradient: "from-amber-500 to-orange-500",
    bgGradient: "from-amber-500/5 to-orange-500/5",
    icon: <Pause className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    gradient: "from-blue-500 to-indigo-500",
    bgGradient: "from-blue-500/5 to-indigo-500/5",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelled",
    gradient: "from-red-500 to-rose-500",
    bgGradient: "from-red-500/5 to-rose-500/5",
    icon: <XCircle className="h-3 w-3" />,
  },
}

export function CampaignCardEnhanced({
  campaign,
  onStart,
  onPause,
  onResume,
  onDelete,
  isStarting = false,
  isPausing = false,
  isResuming = false,
  liveStats,
}: CampaignCardEnhancedProps) {
  const params = useParams()
  const router = useRouter()
  const workspaceSlug = params.workspaceSlug as string
  const [isNavigating, setIsNavigating] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleContinue = () => {
    setIsNavigating(true)
    router.push(`/w/${workspaceSlug}/campaigns/new?draft=${campaign.id}`)
  }

  // Progress calculation
  const processedCalls = liveStats?.completed ?? campaign.completed_calls ?? 0
  const successfulCalls = liveStats?.successful ?? campaign.successful_calls ?? 0
  const failedCalls = liveStats?.failed ?? campaign.failed_calls ?? 0
  const progress =
    campaign.total_recipients > 0
      ? Math.round((processedCalls / campaign.total_recipients) * 100)
      : 0
  const successRate = processedCalls > 0 ? Math.round((successfulCalls / processedCalls) * 100) : 0

  const statusInfo = statusConfig[campaign.status]

  // Status-based actions
  const isDraft = campaign.status === "draft"
  const isReady = campaign.status === "ready"
  const isActive = campaign.status === "active"
  const isPaused = campaign.status === "paused"
  const isCompleted = campaign.status === "completed"

  const canStart = isReady
  const canResume = isPaused
  const canPause = isActive
  const canEdit = isDraft && !campaign.wizard_completed

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          "hover:shadow-lg hover:shadow-primary/5 border-border/50",
          isActive && "ring-1 ring-emerald-500/50"
        )}
      >
        {/* Gradient background based on status */}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br opacity-50 transition-opacity duration-300",
            statusInfo.bgGradient,
            isHovered && "opacity-100"
          )}
        />

        {/* Active campaign animated border */}
        {isActive && (
          <div className="absolute inset-0 overflow-hidden rounded-lg">
            <motion.div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.1), transparent)",
              }}
              animate={{
                x: ["-100%", "100%"],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>
        )}

        <div className="relative p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Left side - Info */}
            <div className="flex-1 min-w-0">
              {/* Header with icon and name */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={cn(
                    "p-2.5 rounded-xl bg-gradient-to-br shadow-sm",
                    statusInfo.gradient,
                    "text-white"
                  )}
                >
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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span className="font-medium">{campaign.total_recipients.toLocaleString()}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Total recipients</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {(isActive || isPaused || isCompleted) && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                            <motion.span
                              key={successfulCalls}
                              initial={{ scale: 1.2 }}
                              animate={{ scale: 1 }}
                              className="font-medium tabular-nums"
                            >
                              {successfulCalls}
                            </motion.span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Answered calls</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {failedCalls > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 text-red-500">
                              <XCircle className="h-4 w-4" />
                              <span className="font-medium tabular-nums">{failedCalls}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Failed calls</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {/* Success rate badge */}
                    {processedCalls > 0 && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono",
                          successRate >= 70
                            ? "border-emerald-500/50 text-emerald-600"
                            : successRate >= 40
                            ? "border-amber-500/50 text-amber-600"
                            : "border-red-500/50 text-red-600"
                        )}
                      >
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {successRate}%
                      </Badge>
                    )}
                  </>
                )}

                {/* Live calls per minute indicator */}
                {isActive && liveStats?.callsPerMinute && liveStats.callsPerMinute > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 text-purple-600">
                          <Zap className="h-4 w-4" />
                          <span className="font-medium tabular-nums">
                            {liveStats.callsPerMinute}/min
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Current processing speed</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Scheduled time */}
                {campaign.status === "scheduled" && campaign.scheduled_start_at && (
                  <div className="flex items-center gap-1.5 text-purple-600">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs">
                      Starts {new Date(campaign.scheduled_start_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress bar for active/paused/completed campaigns */}
              {campaign.total_recipients > 0 && (isActive || isPaused || isCompleted) && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>
                      {processedCalls.toLocaleString()} / {campaign.total_recipients.toLocaleString()}{" "}
                      processed
                    </span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
                    <motion.div
                      className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r", statusInfo.gradient)}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                    {isActive && (
                      <motion.div
                        className="absolute inset-y-0 w-full"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                        }}
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right side - Status & Actions */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              {/* Status badge */}
              <Badge
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 text-white bg-gradient-to-r shadow-sm",
                  statusInfo.gradient
                )}
              >
                {statusInfo.icon}
                {statusInfo.label}
              </Badge>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {/* Quick action for incomplete drafts */}
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

                {/* Start Now button for ready campaigns */}
                {canStart && onStart && (
                  <Button
                    size="sm"
                    onClick={() => onStart(campaign)}
                    disabled={isStarting}
                    className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-sm"
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

                {/* Resume button for paused campaigns */}
                {canResume && onResume && (
                  <Button
                    size="sm"
                    onClick={() => onResume(campaign)}
                    disabled={isResuming}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
                  >
                    {isResuming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1.5" />
                        Resume
                      </>
                    )}
                  </Button>
                )}

                {/* Pause button for active campaigns */}
                {canPause && onPause && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPause(campaign)}
                    disabled={isPausing}
                  >
                    {isPausing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Pause className="h-4 w-4 mr-1.5" />
                        Pause
                      </>
                    )}
                  </Button>
                )}

                {/* View button */}
                {!canEdit && !canStart && !canResume && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/w/${workspaceSlug}/campaigns/${campaign.id}`}>
                      <Eye className="h-4 w-4 mr-1.5" />
                      View
                    </Link>
                  </Button>
                )}

                {/* More actions dropdown */}
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

              {/* Timestamp */}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}


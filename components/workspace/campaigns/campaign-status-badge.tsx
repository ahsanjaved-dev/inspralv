"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, StopCircle, FileEdit, Rocket, CalendarClock } from "lucide-react"
import type { CampaignStatus, RecipientCallStatus, RecipientCallOutcome } from "@/types/database.types"

// Campaign Status Badge
const campaignStatusConfig: Record<CampaignStatus, { label: string; color: string; icon?: React.ReactNode }> = {
  draft: {
    label: "Draft",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    icon: <FileEdit className="h-3 w-3 mr-1" />,
  },
  ready: {
    label: "Ready",
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    icon: <Rocket className="h-3 w-3 mr-1" />,
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    icon: <CalendarClock className="h-3 w-3 mr-1" />,
  },
  active: {
    label: "Active",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: <span className="relative flex h-2 w-2 mr-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>,
  },
  paused: {
    label: "Paused",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: <StopCircle className="h-3 w-3 mr-1" />,
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

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const config = campaignStatusConfig[status]
  return (
    <Badge className={`flex items-center ${config.color}`}>
      {config.icon}
      {config.label}
    </Badge>
  )
}

// Recipient Call Status Badge
const callStatusConfig: Record<RecipientCallStatus, { label: string; color: string }> = {
  pending: {
    label: "Pending",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  queued: {
    label: "Queued",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  calling: {
    label: "Calling",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  failed: {
    label: "Failed",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  skipped: {
    label: "Skipped",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  },
}

// Fallback for unknown/legacy statuses (e.g., "in_progress" from older data)
const unknownStatusConfig = {
  label: "Unknown",
  color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
}

export function CallStatusBadge({ status }: { status: RecipientCallStatus | string | null }) {
  // Handle null/undefined status
  if (!status) {
    return (
      <Badge className={unknownStatusConfig.color}>
        —
      </Badge>
    )
  }
  
  // Get config, fallback to unknown if status not recognized
  const config = callStatusConfig[status as RecipientCallStatus] || {
    label: status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), // Format unknown status nicely
    color: unknownStatusConfig.color,
  }
  
  return (
    <Badge className={config.color}>
      {config.label}
    </Badge>
  )
}

// Call Outcome Badge
const callOutcomeConfig: Record<RecipientCallOutcome, { label: string; color: string }> = {
  answered: {
    label: "Answered",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  no_answer: {
    label: "No Answer",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  busy: {
    label: "Busy",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  },
  voicemail: {
    label: "Voicemail",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  invalid_number: {
    label: "Invalid",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  declined: {
    label: "Declined",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  error: {
    label: "Error",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
}

export function CallOutcomeBadge({ outcome }: { outcome: RecipientCallOutcome | null }) {
  if (!outcome) return <span className="text-muted-foreground">—</span>
  const config = callOutcomeConfig[outcome]
  return (
    <Badge variant="outline" className={config.color}>
      {config.label}
    </Badge>
  )
}


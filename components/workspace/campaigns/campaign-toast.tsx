"use client"

/**
 * Campaign Toast Notifications
 * 
 * Enhanced toast notifications for campaign events with:
 * - Rich content with icons and progress
 * - Action buttons
 * - Auto-dismiss with progress indicator
 * - Sound notifications (optional)
 */

import { toast, ExternalToast } from "sonner"
import { 
  CheckCircle2, 
  XCircle, 
  Play, 
  Pause, 
  Phone, 
  PhoneCall,
  PhoneOff,
  Users,
  Zap,
  AlertTriangle,
  Clock,
  TrendingUp,
} from "lucide-react"

type ToastType = "success" | "error" | "info" | "warning"

interface CampaignToastOptions extends ExternalToast {
  showProgress?: boolean
  progress?: number
  total?: number
  actionLabel?: string
  onAction?: () => void
}

// Base toast styling
const getToastIcon = (type: ToastType) => {
  switch (type) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />
    case "error":
      return <XCircle className="h-5 w-5 text-red-500" />
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-amber-500" />
    default:
      return <Phone className="h-5 w-5 text-blue-500" />
  }
}

// Campaign started toast
export function toastCampaignStarted(
  campaignName: string,
  recipientCount: number,
  options?: CampaignToastOptions
) {
  return toast.success(
    <div className="flex items-start gap-3">
      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
        <Play className="h-5 w-5 text-emerald-600" />
      </div>
      <div>
        <p className="font-semibold">Campaign Started</p>
        <p className="text-sm text-muted-foreground">{campaignName}</p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <Users className="h-3 w-3" />
          {recipientCount.toLocaleString()} recipients
        </p>
      </div>
    </div>,
    {
      duration: 5000,
      ...options,
    }
  )
}

// Campaign completed toast
export function toastCampaignCompleted(
  campaignName: string,
  stats: { successful: number; failed: number; total: number },
  options?: CampaignToastOptions
) {
  const successRate = stats.total > 0 
    ? Math.round((stats.successful / stats.total) * 100) 
    : 0

  return toast.success(
    <div className="flex items-start gap-3">
      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
        <CheckCircle2 className="h-5 w-5 text-blue-600" />
      </div>
      <div className="flex-1">
        <p className="font-semibold">Campaign Completed</p>
        <p className="text-sm text-muted-foreground">{campaignName}</p>
        <div className="flex items-center gap-3 mt-2 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            {stats.successful} answered
          </span>
          {stats.failed > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="h-3 w-3" />
              {stats.failed} failed
            </span>
          )}
          <span className="flex items-center gap-1 text-blue-600">
            <TrendingUp className="h-3 w-3" />
            {successRate}%
          </span>
        </div>
      </div>
    </div>,
    {
      duration: 8000,
      ...options,
    }
  )
}

// Campaign paused toast
export function toastCampaignPaused(
  campaignName: string,
  pendingCalls: number,
  options?: CampaignToastOptions
) {
  return toast.info(
    <div className="flex items-start gap-3">
      <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
        <Pause className="h-5 w-5 text-amber-600" />
      </div>
      <div>
        <p className="font-semibold">Campaign Paused</p>
        <p className="text-sm text-muted-foreground">{campaignName}</p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {pendingCalls.toLocaleString()} calls remaining
        </p>
      </div>
    </div>,
    {
      duration: 4000,
      ...options,
    }
  )
}

// Call completed toast
export function toastCallCompleted(
  recipientPhone: string,
  outcome: "answered" | "no_answer" | "failed" | "voicemail",
  duration?: number,
  options?: CampaignToastOptions
) {
  const config = {
    answered: { 
      icon: CheckCircle2, 
      color: "text-emerald-600", 
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      label: "Call Answered"
    },
    no_answer: { 
      icon: PhoneOff, 
      color: "text-amber-600", 
      bg: "bg-amber-100 dark:bg-amber-900/30",
      label: "No Answer"
    },
    failed: { 
      icon: XCircle, 
      color: "text-red-600", 
      bg: "bg-red-100 dark:bg-red-900/30",
      label: "Call Failed"
    },
    voicemail: { 
      icon: Phone, 
      color: "text-blue-600", 
      bg: "bg-blue-100 dark:bg-blue-900/30",
      label: "Voicemail"
    },
  }[outcome]

  const Icon = config.icon
  
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const toastFn = outcome === "answered" ? toast.success : outcome === "failed" ? toast.error : toast.info

  return toastFn(
    <div className="flex items-center gap-3">
      <div className={`p-1.5 ${config.bg} rounded-lg`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>
      <div className="flex-1">
        <p className="font-medium text-sm">{config.label}</p>
        <p className="text-xs text-muted-foreground">{recipientPhone}</p>
      </div>
      {duration !== undefined && outcome === "answered" && (
        <span className="text-xs font-mono text-muted-foreground">
          {formatDuration(duration)}
        </span>
      )}
    </div>,
    {
      duration: 3000,
      ...options,
    }
  )
}

// Campaign progress toast
export function toastCampaignProgress(
  campaignName: string,
  progress: number,
  callsPerMinute?: number,
  options?: CampaignToastOptions
) {
  return toast.info(
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Zap className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <p className="font-semibold">{progress}% Complete</p>
          <p className="text-sm text-muted-foreground">{campaignName}</p>
        </div>
      </div>
      {callsPerMinute !== undefined && callsPerMinute > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <PhoneCall className="h-3 w-3" />
          Processing at {callsPerMinute} calls/minute
        </p>
      )}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>,
    {
      duration: 4000,
      ...options,
    }
  )
}

// Error toast
export function toastCampaignError(
  message: string,
  details?: string,
  options?: CampaignToastOptions
) {
  return toast.error(
    <div className="flex items-start gap-3">
      <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
        <XCircle className="h-5 w-5 text-red-600" />
      </div>
      <div>
        <p className="font-semibold">{message}</p>
        {details && (
          <p className="text-sm text-muted-foreground mt-1">{details}</p>
        )}
      </div>
    </div>,
    {
      duration: 6000,
      ...options,
    }
  )
}

// Bulk action toast with progress
export function toastBulkProgress(
  action: string,
  current: number,
  total: number,
  options?: CampaignToastOptions
) {
  const progress = Math.round((current / total) * 100)
  
  return toast.loading(
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-medium">{action}</p>
        <span className="text-sm text-muted-foreground">
          {current}/{total}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>,
    {
      ...options,
    }
  )
}

// Export a helper to dismiss bulk progress toast
export function dismissBulkProgress(toastId: string | number) {
  toast.dismiss(toastId)
}


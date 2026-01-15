"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Play, Pause, XCircle, RotateCcw } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type CampaignAction = "start" | "pause" | "resume" | "terminate"

interface CampaignActionOverlayProps {
  open: boolean
  action: CampaignAction | null
  campaignName?: string
  recipientCount?: number
  progress?: number // 0-100, used for starting campaigns
}

const actionConfig: Record<CampaignAction, {
  title: string
  description: string
  icon: React.ReactNode
  progressDescription?: string
}> = {
  start: {
    title: "Starting Campaign",
    description: "Your campaign is being started. This may take a moment for campaigns with many recipients.",
    icon: <Play className="h-6 w-6" />,
    progressDescription: "Queueing calls...",
  },
  pause: {
    title: "Pausing Campaign",
    description: "Pausing active calls. Calls in progress will complete normally.",
    icon: <Pause className="h-6 w-6" />,
  },
  resume: {
    title: "Resuming Campaign",
    description: "Resuming campaign. Remaining calls will start being processed.",
    icon: <RotateCcw className="h-6 w-6" />,
  },
  terminate: {
    title: "Terminating Campaign",
    description: "Stopping all pending calls. This action cannot be undone.",
    icon: <XCircle className="h-6 w-6" />,
  },
}

export function CampaignActionOverlay({
  open,
  action,
  campaignName,
  recipientCount,
  progress,
}: CampaignActionOverlayProps) {
  if (!action) return null

  const config = actionConfig[action]

  return (
    <Dialog open={open}>
      <DialogContent 
        className="sm:max-w-md [&>button]:hidden" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {config.icon}
            </div>
            {config.title}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {campaignName && (
              <span className="block font-medium text-foreground mb-2">
                &quot;{campaignName}&quot;
              </span>
            )}
            {config.description}
            {recipientCount && action === "start" && recipientCount > 100 && (
              <span className="block mt-2 text-amber-600 dark:text-amber-400">
                Processing {recipientCount.toLocaleString()} recipients...
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {/* Animated loading indicator */}
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {config.progressDescription || "Please wait..."}
            </span>
          </div>
          
          {/* Progress bar for start action with progress tracking */}
          {action === "start" && typeof progress === "number" && (
            <div className="mt-4 space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {progress}% complete
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Do not close this page or navigate away
        </p>
      </DialogContent>
    </Dialog>
  )
}


"use client"

/**
 * Campaign Live Dashboard Component (OPTIMIZED)
 * 
 * Lightweight dashboard for active campaigns:
 * - Progress visualization (no heavy animations)
 * - Key metrics display
 * - NO live activity feed (removed for performance)
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Timer,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { CampaignProgressRing } from "./campaign-progress-ring"

interface DashboardProps {
  campaignId: string
  campaignName: string
  status: "active" | "completed"
  totalRecipients: number
  pendingCalls: number
  completedCalls: number
  successfulCalls: number
  failedCalls: number
  callsPerMinute?: number
  estimatedCompletion?: string
  onCancel?: () => void
  onRefresh?: () => void
  isCancelling?: boolean
  className?: string
}

export function CampaignLiveDashboard({
  campaignName,
  status,
  totalRecipients,
  pendingCalls,
  completedCalls,
  successfulCalls,
  failedCalls,
  callsPerMinute = 0,
  estimatedCompletion,
  onCancel,
  onRefresh,
  isCancelling,
  className,
}: DashboardProps) {
  // Calculate metrics
  const progress = totalRecipients > 0 ? Math.round((completedCalls / totalRecipients) * 100) : 0
  const successRate = completedCalls > 0 ? Math.round((successfulCalls / completedCalls) * 100) : 0
  const isActive = status === "active"

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Header */}
      <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 to-purple-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-2 rounded-lg",
                isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
              )}
            >
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Campaign Progress
                {isActive && (
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{campaignName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Action buttons */}
            {isActive && onCancel && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onCancel} 
                disabled={isCancelling}
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
              >
                {isCancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Cancel
              </Button>
            )}
            {onRefresh && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Left: Progress Ring */}
          <div className="flex flex-col items-center gap-4">
            <CampaignProgressRing
              value={progress}
              size={160}
              strokeWidth={14}
              isActive={isActive}
              showPercentage={true}
              showCount={true}
              total={totalRecipients}
              processed={completedCalls}
              variant={isActive ? "success" : "default"}
            />
          </div>

          {/* Right: Stats Grid */}
          <div className="flex-1 grid grid-cols-2 gap-4 w-full">
            <div className="text-center p-4 bg-emerald-500/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">
                {successfulCalls.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Answered</p>
            </div>
            
            <div className="text-center p-4 bg-red-500/10 rounded-lg">
              <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-red-600 tabular-nums">
                {failedCalls.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            
            <div className="text-center p-4 bg-amber-500/10 rounded-lg">
              <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-600 tabular-nums">
                {pendingCalls.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            
            <div className="text-center p-4 bg-blue-500/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-blue-600 tabular-nums">
                {successRate}%
              </p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </div>
        </div>

        {/* Bottom: Additional metrics */}
        {(callsPerMinute > 0 || estimatedCompletion) && (
          <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t">
            {callsPerMinute > 0 && (
              <div className="flex items-center gap-2 text-purple-600">
                <Activity className="h-4 w-4" />
                <span className="font-medium">{callsPerMinute} calls/min</span>
              </div>
            )}
            {estimatedCompletion && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="h-4 w-4" />
                <span className="text-sm">{estimatedCompletion}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

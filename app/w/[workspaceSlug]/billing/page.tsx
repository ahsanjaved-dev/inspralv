"use client"

import { useParams, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, DollarSign, TrendingUp } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { WorkspaceCreditsCard } from "@/components/workspace/billing/workspace-credits-card"
import { useWorkspaceCredits } from "@/lib/hooks/use-workspace-credits"
import { toast } from "sonner"

export default function BillingPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const workspaceSlug = params.workspaceSlug as string
  
  const { data, refetch } = useWorkspaceCredits(workspaceSlug)
  const credits = data?.credits

  // Handle success callback from payment redirect
  useEffect(() => {
    const topupStatus = searchParams.get("topup")
    if (topupStatus === "success") {
      toast.success("Credits added successfully!")
      refetch()
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [searchParams, refetch])

  // Get per-minute rate for display
  const perMinuteRate = credits?.perMinuteRateCents 
    ? (credits.perMinuteRateCents / 100).toFixed(2) 
    : "0.20"

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your credits and view usage.</p>
        </div>
      </div>

      {/* Credits Card */}
      <WorkspaceCreditsCard 
        workspaceSlug={workspaceSlug}
        stripeConnectAccountId={data?.stripeConnectAccountId || undefined}
      />

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Estimated Minutes</p>
              <p className="stat-value">{credits?.estimatedMinutesRemaining || 0}</p>
              <p className="text-xs text-muted-foreground mt-1">at current balance</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary" />
            </div>
          </div>
          <Progress 
            value={credits?.estimatedMinutesRemaining ? Math.min(100, credits.estimatedMinutesRemaining) : 0} 
            className="mt-3" 
          />
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Current Balance</p>
              <p className="stat-value">${credits?.balanceDollars?.toFixed(2) || "0.00"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {credits?.isBillingExempt ? "Uses org credits" : "Prepaid credits"}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Per-Minute Rate</p>
              <p className="stat-value">${perMinuteRate}</p>
              <p className="text-xs text-muted-foreground mt-1">Set by organization</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>How Billing Works</CardTitle>
          <CardDescription>Understanding your workspace billing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">1</span>
            </div>
            <p>
              <strong className="text-foreground">Prepaid Credits:</strong> Add credits to your workspace balance. 
              Credits are deducted as you use voice AI minutes.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">2</span>
            </div>
            <p>
              <strong className="text-foreground">Per-Minute Billing:</strong> Each minute of voice AI usage 
              is charged at ${perMinuteRate}/minute. Partial minutes are rounded up.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">3</span>
            </div>
            <p>
              <strong className="text-foreground">Low Balance Alerts:</strong> You'll be notified when your 
              balance drops below the threshold so you can top up before running out.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

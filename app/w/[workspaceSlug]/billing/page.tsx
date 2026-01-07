"use client"

import { useParams, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Clock, DollarSign, TrendingUp, Package, Check, AlertCircle, ArrowUpRight, ArrowDownRight, Building2 } from "lucide-react"
import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import { WorkspaceCreditsCard } from "@/components/workspace/billing/workspace-credits-card"
import { useWorkspaceCredits } from "@/lib/hooks/use-workspace-credits"
import { 
  useWorkspaceSubscription, 
  useSubscriptionPlans, 
  useSubscribeToPlan, 
  useCancelSubscription,
  usePlanChangePreview,
  useChangePlan,
  type PlanChangePreview,
} from "@/lib/hooks/use-workspace-subscription"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function BillingPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const workspaceSlug = params.workspaceSlug as string
  
  const { data, refetch } = useWorkspaceCredits(workspaceSlug)
  const { data: subscriptionData, refetch: refetchSubscription } = useWorkspaceSubscription(workspaceSlug)
  const { data: plansData } = useSubscriptionPlans(workspaceSlug)
  const subscribeMutation = useSubscribeToPlan(workspaceSlug)
  const cancelMutation = useCancelSubscription(workspaceSlug)
  const previewMutation = usePlanChangePreview(workspaceSlug)
  const changePlanMutation = useChangePlan(workspaceSlug)
  
  const credits = data?.credits
  const subscription = subscriptionData?.subscription
  const hasSubscription = subscriptionData?.hasSubscription
  const plans = plansData?.plans || []
  
  // Change plan dialog state
  const [changePlanOpen, setChangePlanOpen] = useState(false)
  const [selectedNewPlan, setSelectedNewPlan] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PlanChangePreview | null>(null)

  // Handle success callbacks from payment redirects
  useEffect(() => {
    const topupStatus = searchParams.get("topup")
    const subscriptionStatus = searchParams.get("subscription")
    
    if (topupStatus === "success") {
      toast.success("Credits added successfully!")
      refetch()
      window.history.replaceState({}, "", window.location.pathname)
    }
    
    if (subscriptionStatus === "success") {
      toast.success("Subscription activated!")
      refetchSubscription()
      window.history.replaceState({}, "", window.location.pathname)
    }
    
    if (subscriptionStatus === "canceled") {
      toast.info("Subscription checkout was canceled")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [searchParams, refetch, refetchSubscription])

  // Get per-minute rate for display
  const perMinuteRate = credits?.perMinuteRateCents 
    ? (credits.perMinuteRateCents / 100).toFixed(2) 
    : "0.20"

  const handleSubscribe = async (planId: string) => {
    try {
      await subscribeMutation.mutateAsync(planId)
    } catch (err) {
      toast.error("Failed to subscribe", { description: (err as Error).message })
    }
  }

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your subscription? You'll continue to have access until the end of your billing period.")) {
      return
    }
    try {
      await cancelMutation.mutateAsync()
      toast.success("Subscription will be canceled at period end")
    } catch (err) {
      toast.error("Failed to cancel", { description: (err as Error).message })
    }
  }

  const handlePreviewPlanChange = async (planId: string) => {
    setSelectedNewPlan(planId)
    setPreviewData(null)
    setChangePlanOpen(true)
    
    try {
      const preview = await previewMutation.mutateAsync(planId)
      setPreviewData(preview)
    } catch (err) {
      toast.error("Failed to preview plan change", { description: (err as Error).message })
      setChangePlanOpen(false)
    }
  }

  const handleConfirmPlanChange = async () => {
    if (!selectedNewPlan) return
    
    try {
      const result = await changePlanMutation.mutateAsync({ newPlanId: selectedNewPlan, immediate: true })
      toast.success(result.message)
      setChangePlanOpen(false)
      setPreviewData(null)
      setSelectedNewPlan(null)
    } catch (err) {
      toast.error("Failed to change plan", { description: (err as Error).message })
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your subscription, credits, and usage.</p>
        </div>
      </div>

      {/* Current Subscription */}
      {hasSubscription && subscription && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle>Current Plan: {subscription.plan.name}</CardTitle>
              </div>
              <Badge variant={subscription.status === "active" ? "default" : "destructive"}>
                {subscription.status}
              </Badge>
            </div>
            {subscription.plan.description && (
              <CardDescription>{subscription.plan.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Usage Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Minutes Used This Period</span>
                <span className="font-medium">
                  {subscription.usage.usedMinutes} / {subscription.usage.includedMinutes} min
                </span>
              </div>
              <Progress 
                value={(subscription.usage.usedMinutes / subscription.usage.includedMinutes) * 100} 
                className={cn(
                  "h-2",
                  subscription.usage.usedMinutes > subscription.usage.includedMinutes && "bg-orange-200"
                )}
              />
              {subscription.usage.overageMinutes > 0 && (
                <p className="text-sm text-orange-600">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  {subscription.usage.overageMinutes} overage minutes (${(subscription.usage.overageChargesCents / 100).toFixed(2)} charged)
                </p>
              )}
            </div>

            {/* Period info */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Current period: {subscription.currentPeriodStart && new Date(subscription.currentPeriodStart).toLocaleDateString()} - {subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
              {subscription.cancelAtPeriodEnd ? (
                <Badge variant="outline" className="text-orange-600 border-orange-600">
                  Cancels at period end
                </Badge>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleCancelSubscription} disabled={cancelMutation.isPending}>
                  Cancel Subscription
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Plans */}
      {plans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{hasSubscription ? "Change Plan" : "Choose a Plan"}</CardTitle>
            <CardDescription>
              {hasSubscription 
                ? "Upgrade or downgrade your subscription with prorated billing"
                : "Select a subscription plan to get started"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const isCurrentPlan = subscription?.plan.id === plan.id
                const isUpgrade = subscription && plan.monthlyPriceCents > subscription.plan.monthlyPriceCents
                const isDowngrade = subscription && plan.monthlyPriceCents < subscription.plan.monthlyPriceCents
                
                return (
                  <Card 
                    key={plan.id}
                    className={cn(
                      "relative transition-all hover:shadow-md",
                      isCurrentPlan && "ring-2 ring-primary"
                    )}
                  >
                    {/* Upgrade/Downgrade Badge */}
                    {hasSubscription && !isCurrentPlan && (
                      <div className="absolute -top-2 -right-2">
                        {isUpgrade ? (
                          <Badge className="bg-green-600">
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                            Upgrade
                          </Badge>
                        ) : isDowngrade ? (
                          <Badge variant="secondary">
                            <ArrowDownRight className="h-3 w-3 mr-1" />
                            Downgrade
                          </Badge>
                        ) : null}
                      </div>
                    )}
                    
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        {isCurrentPlan && <Badge>Current</Badge>}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">
                          {plan.monthlyPriceCents === 0 ? "Free" : `$${plan.monthlyPriceDollars}`}
                        </span>
                        {plan.monthlyPriceCents > 0 && <span className="text-muted-foreground">/month</span>}
                      </div>
                      {plan.description && (
                        <CardDescription>{plan.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{plan.includedMinutes > 0 ? `${plan.includedMinutes} minutes included` : "No included minutes"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>${plan.overageRateDollars}/min overage</span>
                        </div>
                      </div>
                      
                      {plan.features.length > 0 && (
                        <ul className="space-y-1.5">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                              <Check className="h-4 w-4 text-green-600 shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      
                      {hasSubscription ? (
                        <Button 
                          className="w-full"
                          variant={isCurrentPlan ? "outline" : isUpgrade ? "default" : "secondary"}
                          disabled={isCurrentPlan || previewMutation.isPending}
                          onClick={() => handlePreviewPlanChange(plan.id)}
                        >
                          {isCurrentPlan 
                            ? "Current Plan" 
                            : previewMutation.isPending && selectedNewPlan === plan.id
                              ? "Loading..."
                              : isUpgrade 
                                ? "Upgrade" 
                                : "Downgrade"
                          }
                        </Button>
                      ) : (
                        <Button 
                          className="w-full"
                          disabled={subscribeMutation.isPending}
                          onClick={() => handleSubscribe(plan.id)}
                        >
                          {subscribeMutation.isPending ? "Processing..." : "Subscribe"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
              
              {/* White Label Request Card - Always show */}
              <Card className="relative transition-all hover:shadow-md border-dashed border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">White Label</CardTitle>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">Custom</span>
                  </div>
                  <CardDescription>
                    Build your own branded AI voice platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5">
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span>Custom branding & domain</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span>Unlimited workspaces</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span>Custom subscription plans</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span>Revenue sharing with Stripe Connect</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span>Dedicated support</span>
                    </li>
                  </ul>
                  
                  <Button 
                    className="w-full"
                    variant="outline"
                    asChild
                  >
                    <Link href="/request-partner">
                      Request White Label
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Change Confirmation Dialog */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent>
          {previewMutation.isPending ? (
            // Loading state
            <div className="py-8 text-center">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Calculating proration...</p>
            </div>
          ) : previewData ? (
            // Preview loaded
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {previewData.isUpgrade ? (
                    <>
                      <ArrowUpRight className="h-5 w-5 text-green-600" />
                      Upgrade to {previewData.newPlan.name}
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="h-5 w-5 text-orange-600" />
                      Downgrade to {previewData.newPlan.name}
                    </>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {previewData.message}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {/* Plan Comparison */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Current</p>
                    <p className="font-semibold">{previewData.currentPlan.name}</p>
                    <p className="text-sm">${(previewData.currentPlan.monthlyPriceCents / 100).toFixed(2)}/mo</p>
                  </div>
                  <div className="text-2xl text-muted-foreground">→</div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">New</p>
                    <p className="font-semibold">{previewData.newPlan.name}</p>
                    <p className="text-sm">${(previewData.newPlan.monthlyPriceCents / 100).toFixed(2)}/mo</p>
                  </div>
                </div>

                {/* Proration Info */}
                {previewData.immediateCharge && previewData.prorationAmountCents > 0 && (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <span className="text-sm">Amount due now</span>
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      ${(previewData.prorationAmountCents / 100).toFixed(2)}
                      {previewData.isEstimate && " (est.)"}
                    </span>
                  </div>
                )}

                {/* Credit for downgrade */}
                {!previewData.isUpgrade && previewData.priceDifferenceCents < 0 && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                    <span className="text-sm">Credit to your account</span>
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      ${(Math.abs(previewData.priceDifferenceCents) / 100).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Minutes Comparison */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Included minutes change</span>
                  <span className={cn(
                    "font-medium",
                    previewData.minutesDifference > 0 ? "text-green-600" : 
                    previewData.minutesDifference < 0 ? "text-orange-600" : ""
                  )}>
                    {previewData.minutesDifference > 0 ? "+" : ""}{previewData.minutesDifference} min
                  </span>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setChangePlanOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmPlanChange}
                  disabled={changePlanMutation.isPending}
                  className={previewData.isUpgrade ? "bg-green-600 hover:bg-green-700" : ""}
                >
                  {changePlanMutation.isPending 
                    ? "Processing..." 
                    : previewData.isUpgrade 
                      ? "Confirm Upgrade" 
                      : "Confirm Downgrade"
                  }
                </Button>
              </DialogFooter>
            </>
          ) : (
            // Error state
            <div className="py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
              <p className="text-muted-foreground">Failed to load preview</p>
              <Button variant="outline" className="mt-4" onClick={() => setChangePlanOpen(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

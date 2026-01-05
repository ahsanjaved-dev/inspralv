"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CreditCard,
  ExternalLink,
  Check,
  Loader2,
  Zap,
  Building2,
  ArrowRight,
  Link2,
  CheckCircle2,
  AlertCircle,
  XCircle
} from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  useBillingInfo,
  useCheckout,
  useCustomerPortal,
  useConnectStatus,
  useConnectOnboarding,
  useCredits
} from "@/lib/hooks/use-billing"
import { CreditsCard } from "@/components/billing/credits-card"
import { ChangePlanDialog } from "@/components/billing/change-plan-dialog"
import { toast } from "sonner"

export default function OrgBillingPage() {
  const searchParams = useSearchParams()
  const { data: billingInfo, isLoading, refetch } = useBillingInfo()
  const { data: connectStatus, isLoading: connectLoading, refetch: refetchConnect } = useConnectStatus()
  const checkout = useCheckout()
  const portal = useCustomerPortal()
  const connectOnboarding = useConnectOnboarding()

  const { refetch: refetchCredits } = useCredits()

  // Plan change dialog state
  const [changePlanDialog, setChangePlanDialog] = useState<{
    open: boolean
    plan: "starter" | "professional" | "enterprise" | null
    planName: string
    planPrice: number
  }>({
    open: false,
    plan: null,
    planName: "",
    planPrice: 0,
  })

  // Handle callback messages from URL params
  useEffect(() => {
    const checkoutStatus = searchParams.get("checkout")
    const connectStatusParam = searchParams.get("connect")
    const topupStatus = searchParams.get("topup")
    
    if (checkoutStatus === "success") {
      toast.success("Subscription activated successfully!")
      refetch()
    } else if (checkoutStatus === "cancelled") {
      toast.info("Checkout cancelled")
    }
    
    if (connectStatusParam === "complete") {
      toast.success("Stripe Connect setup completed!")
      refetchConnect()
    } else if (connectStatusParam === "refresh") {
      toast.info("Please complete your Stripe Connect setup")
      refetchConnect()
    }
    
    if (topupStatus === "success") {
      toast.success("Credits added successfully!")
      refetchCredits()
    }
  }, [searchParams, refetch, refetchConnect, refetchCredits])

  const handleCheckout = async (plan: "starter" | "professional" | "enterprise") => {
    try {
      const result = await checkout.mutateAsync(plan)
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout")
    }
  }

  const handlePlanSelection = (
    plan: "starter" | "professional" | "enterprise",
    planName: string,
    planPrice: number
  ) => {
    // If they have an active subscription, show change plan dialog
    if (hasActiveSubscription && subscription?.planTier !== plan) {
      setChangePlanDialog({
        open: true,
        plan,
        planName,
        planPrice,
      })
    } else if (!hasActiveSubscription) {
      // If no subscription, go directly to checkout
      handleCheckout(plan)
    }
  }

  const handleManageBilling = async () => {
    try {
      const result = await portal.mutateAsync()
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open billing portal")
    }
  }

  const handleConnectOnboarding = async () => {
    try {
      const result = await connectOnboarding.mutateAsync()
      if (result.onboardingUrl) {
        window.location.href = result.onboardingUrl
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start Connect onboarding")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const subscription = billingInfo?.subscription
  const hasActiveSubscription = subscription?.hasActiveSubscription

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription and billing settings
          </p>
        </div>
        {hasActiveSubscription && subscription?.hasStripeCustomer && (
          <Button onClick={handleManageBilling} disabled={portal.isPending}>
            {portal.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Manage Billing
          </Button>
        )}
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>Your organization's subscription</CardDescription>
            </div>
            <Badge 
              variant={subscription?.status === "active" ? "default" : "secondary"}
              className="capitalize"
            >
              {subscription?.status || "No subscription"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold">{subscription?.planName || "Free"}</span>
            {subscription?.planPrice && (
              <span className="text-xl text-muted-foreground">
                ${subscription.planPrice}/month
              </span>
            )}
          </div>

          {/* Plan Features */}
          {billingInfo?.features_list && (
            <div className="grid grid-cols-2 gap-2 mt-4">
              {billingInfo.features_list.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credits Card */}
      <CreditsCard />

      {/* Plan Selection - Always show for upgrades/changes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {hasActiveSubscription ? "Change Plan" : "Choose a Plan"}
          </CardTitle>
          <CardDescription>
            {hasActiveSubscription 
              ? "Upgrade or downgrade your subscription" 
              : "Select a plan to get started"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Starter Plan */}
            <div className={`relative border rounded-xl p-6 transition-all ${
              subscription?.planTier === "starter" 
                ? "border-primary bg-primary/5" 
                : "hover:border-primary/50"
            }`}>
              {subscription?.planTier === "starter" && (
                <Badge className="absolute -top-2 right-4">Current</Badge>
              )}
              <div className="mb-4">
                <h3 className="text-xl font-semibold">Starter</h3>
                <p className="text-3xl font-bold mt-2">
                  $79<span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
              </div>
              <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> 5 AI agents
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> 1,000 minutes/month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Email support
                </li>
              </ul>
              <Button
                className="w-full"
                variant={subscription?.planTier === "starter" ? "outline" : "default"}
                onClick={() => handlePlanSelection("starter", "Starter", 79)}
                disabled={checkout.isPending || subscription?.planTier === "starter"}
              >
                {checkout.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : subscription?.planTier === "starter" ? (
                  "Current Plan"
                ) : hasActiveSubscription ? (
                  "Change to Starter"
                ) : (
                  <>Select <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </div>

            {/* Professional Plan */}
            <div className={`relative border-2 rounded-xl p-6 transition-all ${
              subscription?.planTier === "professional" 
                ? "border-primary bg-primary/5" 
                : "border-primary hover:shadow-lg"
            }`}>
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                {subscription?.planTier === "professional" ? "Current" : "Most Popular"}
              </Badge>
              <div className="mb-4">
                <h3 className="text-xl font-semibold">Professional</h3>
                <p className="text-3xl font-bold mt-2">
                  $249<span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
              </div>
              <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> 25 AI agents
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> 5,000 minutes/month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Priority support
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Custom branding
                </li>
              </ul>
              <Button
                className="w-full"
                onClick={() => handlePlanSelection("professional", "Professional", 249)}
                disabled={checkout.isPending || subscription?.planTier === "professional"}
              >
                {checkout.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : subscription?.planTier === "professional" ? (
                  "Current Plan"
                ) : hasActiveSubscription ? (
                  "Change to Professional"
                ) : (
                  <>Select <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </div>

            {/* Enterprise Plan */}
            <div className={`relative border rounded-xl p-6 transition-all ${
              subscription?.planTier === "enterprise" 
                ? "border-primary bg-primary/5" 
                : "hover:border-primary/50"
            }`}>
              {subscription?.planTier === "enterprise" && (
                <Badge className="absolute -top-2 right-4">Current</Badge>
              )}
              <div className="mb-4">
                <h3 className="text-xl font-semibold">Enterprise</h3>
                <p className="text-3xl font-bold mt-2">Custom</p>
              </div>
              <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Unlimited agents
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Custom minute pools
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> 24/7 support
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" /> Dedicated infrastructure
                </li>
              </ul>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handlePlanSelection("enterprise", "Enterprise", 0)}
                disabled={checkout.isPending || subscription?.planTier === "enterprise"}
              >
                {checkout.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : subscription?.planTier === "enterprise" ? (
                  "Current Plan"
                ) : hasActiveSubscription ? (
                  "Change to Enterprise"
                ) : (
                  "Contact Sales"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      {hasActiveSubscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Method
            </CardTitle>
            <CardDescription>Manage your payment details</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Update your payment method, view invoices, and manage billing details through the Stripe Customer Portal.
            </p>
            <Button variant="outline" onClick={handleManageBilling} disabled={portal.isPending}>
              {portal.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              Open Billing Portal
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stripe Connect - For billing workspaces */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Stripe Connect
          </CardTitle>
          <CardDescription>
            Connect your Stripe account to receive payments from your workspaces
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : connectStatus?.connected ? (
            <div className="space-y-4">
              {/* Connected Status */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    Stripe Account Connected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Account ID: {connectStatus.accountId}
                  </p>
                </div>
              </div>

              {/* Account Status Indicators */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  {connectStatus.chargesEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm">
                    Charges {connectStatus.chargesEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {connectStatus.payoutsEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm">
                    Payouts {connectStatus.payoutsEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {connectStatus.onboardingComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                  )}
                  <span className="text-sm">
                    Onboarding {connectStatus.onboardingComplete ? "Complete" : "Incomplete"}
                  </span>
                </div>
                {connectStatus.country && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Country: {connectStatus.country}
                    </span>
                  </div>
                )}
              </div>

              {/* Continue Onboarding if incomplete */}
              {!connectStatus.onboardingComplete && (
                <div className="pt-2">
                  <Button 
                    onClick={handleConnectOnboarding}
                    disabled={connectOnboarding.isPending}
                  >
                    {connectOnboarding.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Complete Onboarding
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Connect your Stripe account to start accepting payments from your workspaces. 
                This allows you to bill your clients directly through the platform.
              </p>
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Link2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Stripe Express Account</p>
                  <p className="text-sm text-muted-foreground">
                    Quick setup with Stripe-hosted onboarding
                  </p>
                </div>
                <Button 
                  onClick={handleConnectOnboarding}
                  disabled={connectOnboarding.isPending}
                >
                  {connectOnboarding.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Connect with Stripe
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Change Dialog */}
      {changePlanDialog.plan && (
        <ChangePlanDialog
          open={changePlanDialog.open}
          onOpenChange={(open) =>
            setChangePlanDialog((prev) => ({ ...prev, open }))
          }
          currentPlan={subscription?.planTier || ""}
          newPlan={changePlanDialog.plan}
          planName={changePlanDialog.planName}
          planPrice={changePlanDialog.planPrice}
        />
      )}
    </div>
  )
}


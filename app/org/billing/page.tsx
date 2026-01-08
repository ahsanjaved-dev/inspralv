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
  XCircle,
  ShieldCheck
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
    plan: "pro" | "agency" | null
    planName: string
    planPrice: number | null
  }>({
    open: false,
    plan: null,
    planName: "",
    planPrice: null,
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

  // Variant-based checkout (for white-label partners)
  const handleVariantCheckout = async () => {
    try {
      // No plan param needed - uses assigned variant (pass undefined)
      const result = await checkout.mutateAsync(undefined)
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout")
    }
  }

  const handleCheckout = async (plan: "pro" | "agency") => {
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
    plan: "pro" | "agency",
    planName: string,
    planPrice: number | null
  ) => {
    const current = subscription?.planTier
    const isCurrent =
      plan === "pro"
        ? current === "pro" || current === "starter" || current === "professional"
        : current === "agency" || current === "enterprise"

    // If they have an active subscription, show change plan dialog
    if (hasActiveSubscription && !isCurrent) {
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
  const isBillingExempt = billingInfo?.partner?.isBillingExempt
  const whiteLabelVariant = billingInfo?.whiteLabelVariant

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
        {hasActiveSubscription && subscription?.hasStripeCustomer && !isBillingExempt && (
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

      {/* Billing Exempt Banner */}
      {isBillingExempt && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-700 dark:text-green-400">
                  Platform Partner - Billing Exempt
                </p>
                <p className="text-sm text-muted-foreground">
                  Your organization is exempt from platform billing fees.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>Your organization&apos;s subscription</CardDescription>
            </div>
            <Badge 
              variant={isBillingExempt ? "default" : subscription?.status === "active" ? "default" : "secondary"}
              className="capitalize"
            >
              {isBillingExempt ? "Exempt" : subscription?.status || "No subscription"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-bold">{subscription?.planName || "Free"}</span>
            {!isBillingExempt && subscription?.planPrice != null && subscription.planPrice > 0 && (
              <span className="text-xl text-muted-foreground">
                ${subscription.planPrice}/month
              </span>
            )}
            {isBillingExempt && (
              <span className="text-xl text-muted-foreground">
                (Platform Partner)
              </span>
            )}
          </div>

          {/* Show variant details if assigned */}
          {whiteLabelVariant && (
            <div className="mb-4 p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">Plan Details</p>
              <p className="text-sm text-muted-foreground">
                {whiteLabelVariant.description || `${whiteLabelVariant.name} plan`}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Workspace limit: {whiteLabelVariant.maxWorkspaces === -1 ? "Unlimited" : whiteLabelVariant.maxWorkspaces}
              </p>
            </div>
          )}

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

      {/* Plan Selection - Show variant checkout for white-label, or legacy plan selection */}
      {!isBillingExempt && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {hasActiveSubscription ? "Subscription" : whiteLabelVariant ? "Activate Subscription" : "Choose a Plan"}
            </CardTitle>
            <CardDescription>
              {hasActiveSubscription 
                ? "Manage your subscription" 
                : whiteLabelVariant 
                  ? `Complete checkout to activate your ${whiteLabelVariant.name} plan`
                  : "Select a plan to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* White-label variant checkout (assigned by super admin) */}
            {whiteLabelVariant && !hasActiveSubscription && (
              <div className="border-2 border-primary rounded-xl p-6 bg-primary/5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">{whiteLabelVariant.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {whiteLabelVariant.description || "Your assigned plan"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold">
                      ${(whiteLabelVariant.monthlyPriceCents / 100).toFixed(0)}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    {whiteLabelVariant.maxWorkspaces === -1 
                      ? "Unlimited workspaces" 
                      : `Up to ${whiteLabelVariant.maxWorkspaces} workspaces`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" /> White-label platform access
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" /> Stripe Connect for payments
                  </li>
                </ul>
                <Button
                  className="w-full"
                  onClick={handleVariantCheckout}
                  disabled={checkout.isPending}
                >
                  {checkout.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Complete Checkout
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Legacy plan selection (for partners without assigned variant) */}
            {!whiteLabelVariant && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Free Plan */}
                <div className={`relative border rounded-xl p-6 transition-all ${
                  !hasActiveSubscription || subscription?.planTier === "free"
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50"
                }`}>
                  {(!hasActiveSubscription || subscription?.planTier === "free") && (
                    <Badge className="absolute -top-2 right-4">Current</Badge>
                  )}
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold">Free</h3>
                    <p className="text-3xl font-bold mt-2">
                      $0<span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                  <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> Get started with the basics
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> Upgrade anytime
                    </li>
                  </ul>
                  <Button className="w-full" variant="outline" disabled>
                    Included
                  </Button>
                </div>

                {/* Pro Plan */}
                <div className={`relative border-2 rounded-xl p-6 transition-all ${
                  subscription?.planTier === "pro" || subscription?.planTier === "starter" || subscription?.planTier === "professional"
                    ? "border-primary bg-primary/5"
                    : "border-primary hover:shadow-lg"
                }`}>
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    {subscription?.planTier === "pro" || subscription?.planTier === "starter" || subscription?.planTier === "professional"
                      ? "Current"
                      : "Most Popular"}
                  </Badge>
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold">Pro</h3>
                    <p className="text-3xl font-bold mt-2">
                      $99<span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                  </div>
                  <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> More usage & higher limits
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> Priority support
                    </li>
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => handlePlanSelection("pro", "Pro", 99)}
                    disabled={
                      checkout.isPending ||
                      subscription?.planTier === "pro" ||
                      subscription?.planTier === "starter" ||
                      subscription?.planTier === "professional"
                    }
                  >
                    {checkout.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : subscription?.planTier === "pro" ||
                      subscription?.planTier === "starter" ||
                      subscription?.planTier === "professional" ? (
                      "Current Plan"
                    ) : hasActiveSubscription ? (
                      "Change to Pro"
                    ) : (
                      <>Select <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </div>

                {/* Agency Plan */}
                <div className={`relative border rounded-xl p-6 transition-all ${
                  subscription?.planTier === "agency" || subscription?.planTier === "enterprise"
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/50"
                }`}>
                  {(subscription?.planTier === "agency" || subscription?.planTier === "enterprise") && (
                    <Badge className="absolute -top-2 right-4">Current</Badge>
                  )}
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold">Agency</h3>
                    <p className="text-3xl font-bold mt-2">Custom</p>
                  </div>
                  <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> White-label & advanced controls
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> Dedicated support
                    </li>
                  </ul>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handlePlanSelection("agency", "Agency", null)}
                    disabled={checkout.isPending || subscription?.planTier === "agency" || subscription?.planTier === "enterprise"}
                  >
                    {checkout.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : subscription?.planTier === "agency" || subscription?.planTier === "enterprise" ? (
                      "Current Plan"
                    ) : hasActiveSubscription ? (
                      "Change to Agency"
                    ) : (
                      <>Select <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Active subscription with variant */}
            {whiteLabelVariant && hasActiveSubscription && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">Your subscription is active</p>
                  <p className="text-sm text-muted-foreground">
                    {whiteLabelVariant.name} - ${(whiteLabelVariant.monthlyPriceCents / 100).toFixed(0)}/month
                  </p>
                </div>
                <Button variant="outline" onClick={handleManageBilling} disabled={portal.isPending}>
                  {portal.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Manage
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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


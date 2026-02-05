"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CreditCard,
  ExternalLink,
  Check,
  Loader2,
  Building2,
  ArrowRight,
  Link2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ShieldCheck,
  Package,
  Info,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  FileText,
  Settings,
  DollarSign,
  BarChart3,
  Save,
  CircleDollarSign
} from "lucide-react"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  useBillingInfo,
  useCheckout,
  useCustomerPortal,
  useConnectStatus,
  useConnectOnboarding,
  useCredits,
  usePartnerPricing,
  useUpdatePartnerPricing
} from "@/lib/hooks/use-billing"
import { CreditsCard } from "@/components/billing/credits-card"
import { toast } from "sonner"

export default function OrgBillingPage() {
  const searchParams = useSearchParams()
  const { data: billingInfo, isLoading, refetch } = useBillingInfo()
  const { data: connectStatus, isLoading: connectLoading, refetch: refetchConnect } = useConnectStatus()
  const checkout = useCheckout()
  const portal = useCustomerPortal()
  const connectOnboarding = useConnectOnboarding()

  const { refetch: refetchCredits } = useCredits()
  
  // Pricing configuration
  const { data: pricingData, isLoading: pricingLoading } = usePartnerPricing()
  const updatePricing = useUpdatePartnerPricing()
  const [perMinuteRateInput, setPerMinuteRateInput] = useState<string>("")
  const [pricingError, setPricingError] = useState<string>("")
  
  // Initialize pricing input when data loads
  useEffect(() => {
    if (pricingData?.pricing) {
      setPerMinuteRateInput(pricingData.pricing.perMinuteRate.toFixed(2))
    }
  }, [pricingData])

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
      // No plan param needed - uses assigned variant
      const result = await checkout.mutateAsync(undefined)
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout")
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
  
  const handlePricingUpdate = async () => {
    setPricingError("")
    
    const rate = parseFloat(perMinuteRateInput)
    if (isNaN(rate)) {
      setPricingError("Please enter a valid number")
      return
    }
    
    if (rate < 0.01) {
      setPricingError("Minimum rate is $0.01 per minute")
      return
    }
    
    if (rate > 10.00) {
      setPricingError("Maximum rate is $10.00 per minute")
      return
    }
    
    try {
      await updatePricing.mutateAsync({ perMinuteRate: rate })
      toast.success("Per-minute rate updated successfully!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update pricing")
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
            Manage your organization billing and payment settings
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

      {/* ============================================================ */}
      {/* BILLING EXEMPT PARTNER (Platform Partner)                    */}
      {/* ============================================================ */}
      {isBillingExempt && (
        <>
          {/* Platform Partner Status Banner */}
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
                    Your organization is exempt from platform billing fees. All billing is managed through the main platform Stripe account.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Platform Billing Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Billing Model
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">Centralized</p>
                <p className="text-xs text-muted-foreground mt-1">Main Stripe Account</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Invoice Destination
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">Platform</p>
                <p className="text-xs text-muted-foreground mt-1">All invoices to main account</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Fee Structure
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">Exempt</p>
                <p className="text-xs text-muted-foreground mt-1">No platform fees</p>
              </CardContent>
            </Card>
          </div>

          {/* How Platform Billing Works */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                How Platform Billing Works
              </CardTitle>
              <CardDescription>
                As a platform partner, billing is handled through the main platform Stripe account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <p>
                  <strong className="text-foreground">Workspace Subscriptions:</strong> End users subscribe to plans at the workspace level. All subscription payments are processed through the main platform Stripe account.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <p>
                  <strong className="text-foreground">Centralized Invoicing:</strong> All billing invoices are consolidated in the main Stripe dashboard. No separate Stripe Connect accounts needed.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <p>
                  <strong className="text-foreground">Usage Tracking:</strong> Monitor workspace usage and billing metrics from the Subscription Plans section.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions for Platform Partner */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Billing Management
              </CardTitle>
              <CardDescription>
                Manage subscription plans and view billing activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link href="/org/plans" className="block">
                  <div className="flex items-center gap-4 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
                    <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-purple-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Subscription Plans</p>
                      <p className="text-sm text-muted-foreground">
                        Create and manage workspace plans
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-muted/30">
                  <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Stripe Dashboard</p>
                    <p className="text-sm text-muted-foreground">
                      View invoices in main Stripe account
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Configuration Card for Platform Partner */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5" />
                Pricing Configuration
              </CardTitle>
              <CardDescription>
                Set the per-minute rate for your workspaces. This rate is used for billing calculations and displayed in call logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pricingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Current Rate Display */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Per-Minute Rate</p>
                      <p className="text-2xl font-bold text-primary">
                        {pricingData?.pricing?.perMinuteRateFormatted || "$0.15"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Default Rate</p>
                      <p className="text-lg font-medium text-muted-foreground">
                        ${(pricingData?.pricing?.defaultRate || 0.15).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Rate Input */}
                  <div className="space-y-2">
                    <Label htmlFor="perMinuteRatePlatform">Per-Minute Rate (USD)</Label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          id="perMinuteRatePlatform"
                          type="text"
                          inputMode="decimal"
                          value={perMinuteRateInput}
                          onChange={(e) => {
                            const value = e.target.value
                            // Allow empty, or valid decimal numbers
                            if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
                              setPerMinuteRateInput(value)
                              setPricingError("")
                            }
                          }}
                          placeholder="0.15"
                          className="pl-7 font-mono"
                        />
                      </div>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        per minute
                      </span>
                    </div>
                    {pricingError && (
                      <p className="text-sm text-destructive">{pricingError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Rate must be between $0.01 and $10.00 per minute
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={handlePricingUpdate}
                      disabled={
                        updatePricing.isPending ||
                        perMinuteRateInput === "" ||
                        perMinuteRateInput === pricingData?.pricing?.perMinuteRate.toFixed(2)
                      }
                    >
                      {updatePricing.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {updatePricing.isPending ? "Saving..." : "Save Rate"}
                    </Button>
                  </div>

                  {/* Info Section */}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">How Pricing Works</p>
                      <ul className="space-y-1">
                        <li>• This rate applies uniformly to all workspaces under your organization</li>
                        <li>• Call costs shown in call logs and agent stats use this rate</li>
                        <li>• Credits are deducted based on call duration × this rate</li>
                        <li>• Provider costs (from VAPI/Retell) are hidden from your end users</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ============================================================ */}
      {/* AGENCY PARTNER (with assigned variant)                       */}
      {/* ============================================================ */}
      {!isBillingExempt && (
        <>
          {/* Current Plan Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Current Plan
                  </CardTitle>
                  <CardDescription>Your organization&apos;s assigned plan tier</CardDescription>
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
              {whiteLabelVariant ? (
                <>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-4xl font-bold">{whiteLabelVariant.name}</span>
                    {whiteLabelVariant.monthlyPriceCents > 0 && (
                      <span className="text-xl text-muted-foreground">
                        ${(whiteLabelVariant.monthlyPriceCents / 100).toFixed(0)}/month
                      </span>
                    )}
                  </div>

                  {/* Variant details */}
                  <div className="mb-4 p-3 rounded-lg bg-muted/50">
                    {whiteLabelVariant.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {whiteLabelVariant.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {whiteLabelVariant.maxWorkspaces === -1 
                            ? "Unlimited workspaces" 
                            : `${whiteLabelVariant.maxWorkspaces} workspaces included`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Plan features */}
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> White-label platform access
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> Custom branding & domain
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> Stripe Connect for workspace billing
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" /> Create custom plans for your workspaces
                    </li>
                  </ul>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                  </div>
                  <p className="font-medium">No Plan Assigned</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your organization does not have a plan tier assigned yet. Please contact the platform administrator.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subscription Activation Card - Only show if variant assigned but not subscribed */}
          {whiteLabelVariant && !hasActiveSubscription && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Activate Your Subscription
                </CardTitle>
                <CardDescription>
                  Complete checkout to activate your {whiteLabelVariant.name} plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-primary rounded-xl p-6 bg-background">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold">{whiteLabelVariant.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {whiteLabelVariant.description || "Your assigned agency plan"}
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
                      <Check className="h-4 w-4 text-green-500" /> Full white-label platform access
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
              </CardContent>
            </Card>
          )}

          {/* Active subscription management */}
          {whiteLabelVariant && hasActiveSubscription && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Subscription Management
                </CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}

          {/* Credits Card - For agency partners */}
          <CreditsCard />

          {/* Pricing Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5" />
                Pricing Configuration
              </CardTitle>
              <CardDescription>
                Set the per-minute rate for your workspaces. This rate is used for billing calculations and displayed in call logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pricingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Current Rate Display */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Per-Minute Rate</p>
                      <p className="text-2xl font-bold text-primary">
                        {pricingData?.pricing?.perMinuteRateFormatted || "$0.15"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Default Rate</p>
                      <p className="text-lg font-medium text-muted-foreground">
                        ${(pricingData?.pricing?.defaultRate || 0.15).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Rate Input */}
                  <div className="space-y-2">
                    <Label htmlFor="perMinuteRate">Per-Minute Rate (USD)</Label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          id="perMinuteRate"
                          type="text"
                          inputMode="decimal"
                          value={perMinuteRateInput}
                          onChange={(e) => {
                            const value = e.target.value
                            // Allow empty, or valid decimal numbers
                            if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
                              setPerMinuteRateInput(value)
                              setPricingError("")
                            }
                          }}
                          placeholder="0.15"
                          className="pl-7 font-mono"
                        />
                      </div>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        per minute
                      </span>
                    </div>
                    {pricingError && (
                      <p className="text-sm text-destructive">{pricingError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Rate must be between $0.01 and $10.00 per minute
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={handlePricingUpdate}
                      disabled={
                        updatePricing.isPending ||
                        perMinuteRateInput === "" ||
                        perMinuteRateInput === pricingData?.pricing?.perMinuteRate.toFixed(2)
                      }
                    >
                      {updatePricing.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      {updatePricing.isPending ? "Saving..." : "Save Rate"}
                    </Button>
                  </div>

                  {/* Info Section */}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">How Pricing Works</p>
                      <ul className="space-y-1">
                        <li>• This rate applies uniformly to all workspaces under your organization</li>
                        <li>• Call costs shown in call logs and agent stats use this rate</li>
                        <li>• Credits are deducted based on call duration × this rate</li>
                        <li>• Provider costs (from VAPI/Retell) are hidden from your end users</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ============================================================ */}
      {/* STRIPE CONNECT - Only for agency partners (not platform partner) */}
      {/* ============================================================ */}
      {!isBillingExempt && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Stripe Connect
            </CardTitle>
            <CardDescription>
              Connect your Stripe account to create paid subscription plans and receive workspace payments
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
                  Connect your Stripe account to create paid subscription plans. When workspaces subscribe, payments go directly to your connected Stripe account.
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
      )}

      {/* Info card for agencies about how billing works */}
      {!isBillingExempt && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Info className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">How Workspace Billing Works</h3>
                <p className="text-sm text-muted-foreground">
                  Create subscription plans in the &quot;Subscription Plans&quot; section. When workspaces subscribe 
                  to your paid plans, payments are processed through your connected Stripe account. 
                  A small platform fee is deducted from each transaction.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

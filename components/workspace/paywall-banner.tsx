"use client"

import Link from "next/link"
import { AlertTriangle, CreditCard, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWorkspacePaywall } from "@/lib/hooks/use-workspace-paywall"
import { cn } from "@/lib/utils"

interface PaywallBannerProps {
  workspaceSlug: string
  className?: string
}

/**
 * Banner shown when a workspace is paywalled (credits exhausted, no subscription)
 */
export function PaywallBanner({ workspaceSlug, className }: PaywallBannerProps) {
  const { isPaywalled, isLoading, isBillingExempt } = useWorkspacePaywall(workspaceSlug)

  // Don't show if loading, not paywalled, or billing exempt
  if (isLoading || !isPaywalled || isBillingExempt) {
    return null
  }

  return (
    <div
      className={cn(
        "bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10",
        "border border-amber-500/30 rounded-lg px-4 py-3",
        "flex items-center justify-between gap-4 flex-wrap",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-amber-500/20">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            Credits Exhausted
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Your workspace is in read-only mode. Upgrade or add credits to continue building.
          </p>
        </div>
      </div>
      <Button asChild variant="default" size="sm" className="shrink-0">
        <Link href={`/w/${workspaceSlug}/billing`}>
          <CreditCard className="h-4 w-4 mr-2" />
          Upgrade Now
          <ArrowRight className="h-4 w-4 ml-2" />
        </Link>
      </Button>
    </div>
  )
}

/**
 * Toast-style error handler for paywall errors
 */
export function getPaywallToastAction(workspaceSlug: string) {
  return {
    label: "Go to Billing",
    onClick: () => {
      window.location.href = `/w/${workspaceSlug}/billing`
    },
  }
}


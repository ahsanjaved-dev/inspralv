"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useChangePlan, usePlanChangePreview } from "@/lib/hooks/use-billing"
import { toast } from "sonner"
import { ArrowUp, ArrowDown, AlertCircle, Loader2, DollarSign, Calendar } from "lucide-react"

interface ChangePlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: string
  newPlan: "starter" | "professional" | "enterprise"
  planName: string
  planPrice: number
}

export function ChangePlanDialog({
  open,
  onOpenChange,
  currentPlan,
  newPlan,
  planName,
  planPrice,
}: ChangePlanDialogProps) {
  const [confirming, setConfirming] = useState(false)

  // Preview the plan change
  const { data: preview, isLoading: loadingPreview } = usePlanChangePreview(
    open ? newPlan : null
  )

  const changePlan = useChangePlan()

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const result = await changePlan.mutateAsync(newPlan)
      toast.success(result.message)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to change plan")
    } finally {
      setConfirming(false)
    }
  }

  const isUpgrade = preview?.isUpgrade ?? false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isUpgrade ? (
              <ArrowUp className="h-5 w-5 text-green-600" />
            ) : (
              <ArrowDown className="h-5 w-5 text-orange-600" />
            )}
            {isUpgrade ? "Upgrade" : "Downgrade"} to {planName}
          </DialogTitle>
          <DialogDescription>
            {isUpgrade
              ? "You're upgrading your subscription plan."
              : "You're downgrading your subscription plan."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Plan Change Summary */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <p className="font-medium capitalize">{currentPlan}</p>
            </div>
            <div className="text-muted-foreground">→</div>
            <div>
              <p className="text-sm text-muted-foreground">New Plan</p>
              <p className="font-medium">{planName}</p>
            </div>
          </div>

          {/* Pricing Info */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">New monthly price</span>
              <span className="font-semibold">${planPrice}/month</span>
            </div>
          </div>

          {/* Proration Details */}
          {loadingPreview ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Calculating proration...
              </span>
            </div>
          ) : preview ? (
            <>
              {/* Proration Amount */}
              {preview.immediateCharge ? (
                <Alert>
                  <DollarSign className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">
                        You will be charged ${preview.prorationAmountDollars} today
                      </p>
                      <p className="text-sm text-muted-foreground">
                        This covers the prorated cost difference for the remainder of your
                        current billing period.
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="text-sm">
                      {preview.prorationAmount < 0
                        ? `You will receive a ${Math.abs(parseFloat(preview.prorationAmountDollars)).toFixed(2)} credit on your next invoice.`
                        : "Changes will take effect immediately. Your next invoice will be adjusted accordingly."}
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {/* Next Billing Date */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  Next billing date:{" "}
                  {new Date(preview.nextBillingDate).toLocaleDateString()}
                </span>
              </div>

              {/* Warning for downgrades */}
              {!isUpgrade && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="text-sm font-medium">Important</p>
                    <p className="text-sm">
                      Downgrading may reduce your available features and resource limits.
                      Make sure your current usage is within the new plan's limits.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={confirming || loadingPreview}
            className={isUpgrade ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Confirm ${isUpgrade ? "Upgrade" : "Downgrade"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

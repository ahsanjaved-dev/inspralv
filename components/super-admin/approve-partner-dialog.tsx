"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useApprovePartnerRequest } from "@/lib/hooks/use-partner-requests"
import { useWhiteLabelVariants } from "@/lib/hooks/use-white-label-variants"
import { Loader2, CheckCircle2, Mail, Package, DollarSign, Send, Copy, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import type { PartnerRequest } from "@/types/database.types"

// Platform domain from environment (available in client via NEXT_PUBLIC_ prefix)
const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "genius365.app"

interface ApprovePartnerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: PartnerRequest
  onSuccess?: () => void
}

interface ApprovalResult {
  checkoutUrl: string
  variant: {
    id: string
    name: string
    monthlyPriceCents: number
    maxWorkspaces: number
  }
}

export function ApprovePartnerDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: ApprovePartnerDialogProps) {
  const [step, setStep] = useState<"confirm" | "sending" | "success">("confirm")
  const [selectedVariantId, setSelectedVariantId] = useState<string>("")
  const [approvalResult, setApprovalResult] = useState<ApprovalResult | null>(null)

  const approveRequest = useApprovePartnerRequest()
  const { data: variants, isLoading: variantsLoading } = useWhiteLabelVariants(false)

  // Pre-select the variant if the request already has one assigned
  useEffect(() => {
    if (request.assigned_white_label_variant_id && !selectedVariantId) {
      setSelectedVariantId(request.assigned_white_label_variant_id)
    }
  }, [request.assigned_white_label_variant_id, selectedVariantId])

  // Get the selected variant details for display
  const selectedVariant = variants?.find(v => v.id === selectedVariantId)

  const handleApprove = async () => {
    if (!selectedVariantId) {
      toast.error("Please select a plan tier for this partner")
      return
    }

    try {
      setStep("sending")
      
      // Approve the request - this now sends checkout email instead of provisioning
      const result = await approveRequest.mutateAsync({
        requestId: request.id,
        variantId: selectedVariantId,
      })

      setApprovalResult(result.data as ApprovalResult)
      setStep("success")
      toast.success("Checkout link sent to agency!")
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to approve request"
      toast.error(errorMessage)
      setStep("confirm")
    }
  }

  const handleCopyLink = () => {
    if (approvalResult?.checkoutUrl) {
      navigator.clipboard.writeText(approvalResult.checkoutUrl)
      toast.success("Checkout link copied to clipboard")
    }
  }

  const handleClose = () => {
    if (step === "success") {
      onSuccess?.()
    }
    onOpenChange(false)
    // Reset state after dialog closes
    setTimeout(() => {
      setStep("confirm")
      setSelectedVariantId(request.assigned_white_label_variant_id || "")
      setApprovalResult(null)
    }, 200)
  }

  // Check if request already has a requested variant
  const requestedVariant = request.assigned_white_label_variant_id 
    ? variants?.find(v => v.id === request.assigned_white_label_variant_id)
    : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        {step === "confirm" && (
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Approve Partner Request
              </DialogTitle>
              <DialogDescription>
                Select a plan and send checkout link to the agency.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
              {/* Partner info summary */}
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Company</span>
                  <span className="text-sm font-medium">{request.company_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Platform URL</span>
                  <code className="text-sm bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {request.desired_subdomain}.{PLATFORM_DOMAIN}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Contact Email</span>
                  <span className="text-sm">{request.contact_email}</span>
                </div>
              </div>

              {/* Show agency's requested plan if any */}
              {requestedVariant && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Agency requested:</strong> {requestedVariant.name} - $
                    {((requestedVariant.monthlyPriceCents ?? 0) / 100).toFixed(0)}/mo
                  </p>
                </div>
              )}

              {/* Variant selection - REQUIRED */}
              <div className="space-y-2">
                <Label htmlFor="variant-select" className="text-sm font-medium">
                  Plan Tier <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedVariantId}
                  onValueChange={setSelectedVariantId}
                  disabled={variantsLoading}
                >
                  <SelectTrigger id="variant-select" className="w-full">
                    <SelectValue placeholder={variantsLoading ? "Loading plans..." : "Select a plan tier"} />
                  </SelectTrigger>
                  <SelectContent>
                    {variants?.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        <div className="flex items-center gap-2">
                          <span>{variant.name}</span>
                          <span className="text-muted-foreground">
                            - ${((variant.monthlyPriceCents ?? variant.monthly_price_cents ?? 0) / 100).toFixed(0)}/mo
                          </span>
                          <span className="text-muted-foreground">
                            ({(variant.maxWorkspaces ?? variant.max_workspaces ?? 0) === -1 ? "∞" : (variant.maxWorkspaces ?? variant.max_workspaces ?? 0)} workspaces)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  You can override the agency's requested plan if needed.
                </p>
              </div>

              {/* Selected variant details */}
              {selectedVariant && (
                <div className="border rounded-lg p-4 bg-primary/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{selectedVariant.name}</h4>
                    <Badge variant="outline" className="text-primary border-primary">
                      Selected
                    </Badge>
                  </div>
                  {selectedVariant.description && (
                    <p className="text-sm text-muted-foreground">{selectedVariant.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>${((selectedVariant.monthlyPriceCents ?? selectedVariant.monthly_price_cents ?? 0) / 100).toFixed(0)}/month</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {(selectedVariant.maxWorkspaces ?? selectedVariant.max_workspaces ?? 0) === -1
                          ? "Unlimited workspaces"
                          : `${selectedVariant.maxWorkspaces ?? selectedVariant.max_workspaces ?? 0} workspaces`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* What happens next */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-sm text-green-900 dark:text-green-100">
                  <strong>What happens when you approve:</strong>
                </p>
                <ul className="text-sm text-green-800 dark:text-green-200 mt-2 space-y-1 list-disc list-inside">
                  <li>Agency receives email with Stripe checkout link</li>
                  <li>Link expires in 7 days</li>
                  <li>After payment, their account is automatically provisioned</li>
                  <li>They receive login credentials via email</li>
                </ul>
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveRequest.isPending || !selectedVariantId}
                className="bg-green-600 hover:bg-green-700"
              >
                {approveRequest.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Approve & Send Checkout
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "sending" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Sending Checkout Link
              </DialogTitle>
              <DialogDescription>
                Please wait while we send the checkout link...
              </DialogDescription>
            </DialogHeader>

            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Sending checkout link to {request.contact_email}...
              </p>
            </div>
          </>
        )}

        {step === "success" && approvalResult && (
          <>
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Checkout Link Sent!
              </DialogTitle>
              <DialogDescription>
                The agency has been notified and can now complete payment.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-green-800 dark:text-green-200">Company</span>
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    {request.company_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-800 dark:text-green-200">Plan</span>
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    {approvalResult.variant.name} - ${(approvalResult.variant.monthlyPriceCents / 100).toFixed(0)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-800 dark:text-green-200">Email Sent To</span>
                  <span className="text-sm text-green-900 dark:text-green-100">
                    {request.contact_email}
                  </span>
                </div>
              </div>

              {/* Checkout link for manual sharing */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Checkout Link (for manual sharing)</Label>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                    {approvalResult.checkoutUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(approvalResult.checkoutUrl, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Link expires in 7 days. You can resend by rejecting and re-approving.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Next:</strong> Once the agency completes payment, their account will be
                  automatically provisioned and they'll receive login credentials.
                </p>
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t pt-4">
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

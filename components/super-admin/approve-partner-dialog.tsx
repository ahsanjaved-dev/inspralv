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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useApprovePartnerRequest, useProvisionPartner } from "@/lib/hooks/use-partner-requests"
import { useWhiteLabelVariants } from "@/lib/hooks/use-white-label-variants"
import { Loader2, CheckCircle2, Rocket, AlertCircle, Package, DollarSign } from "lucide-react"
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

export function ApprovePartnerDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: ApprovePartnerDialogProps) {
  const [step, setStep] = useState<"confirm" | "provisioning" | "success">("confirm")
  const [selectedVariantId, setSelectedVariantId] = useState<string>("")
  const [provisionResult, setProvisionResult] = useState<any>(null)

  const approveRequest = useApprovePartnerRequest()
  const provisionPartner = useProvisionPartner()
  const { data: variants, isLoading: variantsLoading } = useWhiteLabelVariants(false)

  // Get the selected variant details for display
  const selectedVariant = variants?.find(v => v.id === selectedVariantId)

  const handleApprove = async () => {
    if (!selectedVariantId) {
      toast.error("Please select a plan tier for this partner")
      return
    }

    try {
      // Step 1: Approve the request
      await approveRequest.mutateAsync(request.id)

      // Step 2: Provision the partner with selected variant
      setStep("provisioning")
      const result = await provisionPartner.mutateAsync({
        requestId: request.id,
        variantId: selectedVariantId,
      })

      setProvisionResult(result.data)
      setStep("success")
      toast.success("Partner provisioned successfully!")
    } catch (error: any) {
      toast.error(error.message || "Failed to provision partner")
      setStep("confirm")
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
      setSelectedVariantId("")
      setProvisionResult(null)
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Approve Partner Request
              </DialogTitle>
              <DialogDescription>
                Select a plan tier and provision this partner.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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
                  <span className="text-sm text-muted-foreground">Owner Email</span>
                  <span className="text-sm">{request.contact_email}</span>
                </div>
              </div>

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
                            - ${(variant.monthly_price_cents / 100).toFixed(0)}/mo
                          </span>
                          <span className="text-muted-foreground">
                            ({variant.max_workspaces === -1 ? "∞" : variant.max_workspaces} workspaces)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This determines the partner's pricing and workspace limits.
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
                      <span>${(selectedVariant.monthly_price_cents / 100).toFixed(0)}/month</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {selectedVariant.max_workspaces === -1
                          ? "Unlimited workspaces"
                          : `${selectedVariant.max_workspaces} workspaces`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* What happens next */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>What happens next:</strong>
                </p>
                <ul className="text-sm text-blue-800 dark:text-blue-200 mt-2 space-y-1 list-disc list-inside">
                  <li>Partner account created with selected plan tier</li>
                  <li>Owner user account provisioned</li>
                  <li>Platform subdomain activated</li>
                  <li>Welcome email with credentials sent</li>
                  <li>Partner must complete checkout to activate subscription</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
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
                    <Rocket className="mr-2 h-4 w-4" />
                    Approve & Provision
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "provisioning" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Provisioning Partner
              </DialogTitle>
              <DialogDescription>
                Please wait while we set up the partner account...
              </DialogDescription>
            </DialogHeader>

            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Creating partner account, domain, and owner user...
              </p>
            </div>
          </>
        )}

        {step === "success" && provisionResult && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Partner Provisioned Successfully!
              </DialogTitle>
              <DialogDescription>
                The partner has been set up and credentials have been sent.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-green-800 dark:text-green-200">Partner</span>
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    {provisionResult.partner?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-800 dark:text-green-200">Plan Tier</span>
                  <span className="text-sm font-medium text-green-900 dark:text-green-100">
                    {provisionResult.variant?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-800 dark:text-green-200">Login URL</span>
                  <code className="text-sm bg-green-100 dark:bg-green-800 px-2 py-0.5 rounded">
                    {provisionResult.login_url}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-green-800 dark:text-green-200">Owner Email</span>
                  <span className="text-sm text-green-900 dark:text-green-100">
                    {provisionResult.owner?.email}
                  </span>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800 dark:text-yellow-200">
                    <p className="font-medium">Next steps for the partner:</p>
                    <ul className="mt-1 space-y-1 list-disc list-inside">
                      <li>Temporary password sent to owner's email</li>
                      <li>Partner must complete Stripe checkout to activate subscription</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

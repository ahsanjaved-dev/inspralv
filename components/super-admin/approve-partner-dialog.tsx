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
import { useApprovePartnerRequest, useProvisionPartner } from "@/lib/hooks/use-partner-requests"
import { Loader2, CheckCircle2, Rocket, AlertCircle } from "lucide-react"
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
  const [provisionResult, setProvisionResult] = useState<any>(null)

  const approveRequest = useApprovePartnerRequest()
  const provisionPartner = useProvisionPartner()

  const handleApprove = async () => {
    try {
      // Step 1: Approve the request
      await approveRequest.mutateAsync(request.id)

      // Step 2: Provision the partner
      setStep("provisioning")
      const result = await provisionPartner.mutateAsync(request.id)

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
      setProvisionResult(null)
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Approve Partner Request
              </DialogTitle>
              <DialogDescription>
                You are about to approve and provision this partner.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>What happens next:</strong>
                </p>
                <ul className="text-sm text-blue-800 dark:text-blue-200 mt-2 space-y-1 list-disc list-inside">
                  <li>Partner account will be created</li>
                  <li>Owner user account will be provisioned</li>
                  <li>Platform subdomain will be activated</li>
                  <li>Welcome email with credentials will be sent</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveRequest.isPending}
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
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Temporary password has been sent to the owner's email.
                  </p>
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

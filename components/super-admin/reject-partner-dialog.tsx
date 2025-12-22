"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRejectPartnerRequest } from "@/lib/hooks/use-partner-requests"
import { Loader2, XCircle, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import type { PartnerRequest } from "@/types/database.types"

interface RejectPartnerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: PartnerRequest
  onSuccess?: () => void
}

export function RejectPartnerDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: RejectPartnerDialogProps) {
  const [reason, setReason] = useState("")
  const rejectRequest = useRejectPartnerRequest()

  const handleReject = async () => {
    if (!reason.trim()) {
      toast.error("Please provide a rejection reason")
      return
    }

    try {
      await rejectRequest.mutateAsync({
        requestId: request.id,
        reason: reason.trim(),
      })
      toast.success("Partner request rejected")
      onOpenChange(false)
      setReason("")
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || "Failed to reject request")
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setReason("")
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Reject Partner Request
          </DialogTitle>
          <DialogDescription>
            Provide a reason for rejecting this request. The applicant will receive an email with
            this feedback.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Company</span>
              <span className="text-sm font-medium">{request.company_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Contact</span>
              <span className="text-sm">{request.contact_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm">{request.contact_email}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Rejection Reason *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this request is being rejected..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This message will be included in the rejection email sent to the applicant.
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                This action cannot be undone. The applicant will need to submit a new request.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={rejectRequest.isPending || !reason.trim()}
          >
            {rejectRequest.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Reject Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

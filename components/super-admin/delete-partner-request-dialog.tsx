"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDeletePartnerRequest } from "@/lib/hooks/use-partner-requests"
import { Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import type { PartnerRequest } from "@/types/database.types"

interface DeletePartnerRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: PartnerRequest
  onSuccess?: () => void
}

export function DeletePartnerRequestDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: DeletePartnerRequestDialogProps) {
  const router = useRouter()
  const deleteMutation = useDeletePartnerRequest()
  const [confirmText, setConfirmText] = useState("")

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(request.id)
      toast.success("Partner request permanently deleted")
      onOpenChange(false)
      onSuccess?.()
      // Navigate back to the list
      router.push("/super-admin/partner-requests")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete partner request")
    }
  }

  const canDelete = confirmText.toLowerCase() === "delete"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <DialogTitle>Delete Partner Request</DialogTitle>
              <DialogDescription>
                This action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-200">
              You are about to <strong>permanently delete</strong> the partner request from{" "}
              <strong>{request.company_name}</strong>. This will remove all associated data including:
            </p>
            <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 mt-2 space-y-1">
              <li>Contact information</li>
              <li>Business details</li>
              <li>Branding data and uploaded logos</li>
              <li>Request history and timeline</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">
              Type <strong className="font-mono">delete</strong> to confirm
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirmText("")
              onOpenChange(false)
            }}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Permanently"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


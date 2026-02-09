"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Loader2, Eye, EyeOff, ExternalLink, Trash2, Calendar } from "lucide-react"
import {
  useCreateWorkspaceIntegration,
  useUpdateWorkspaceIntegration,
  useDeleteWorkspaceIntegration,
  useWorkspaceIntegration,
} from "@/lib/hooks/use-workspace-integrations"
import { toast } from "sonner"

// ============================================================================
// FORM SCHEMA
// ============================================================================

const calcomFormSchema = z.object({
  name: z.string().min(1, "Connection name is required").max(255),
  cal_api_key: z.string().min(1, "Cal.com API Key is required"),
})

type CalcomFormData = z.infer<typeof calcomFormSchema>

// ============================================================================
// COMPONENT
// ============================================================================

interface ConnectCalcomDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isManageMode?: boolean
}

function maskApiKey(hasKey: boolean): string {
  return hasKey ? "••••••••••••••••" : "Not configured"
}

export function ConnectCalcomDialog({
  open,
  onOpenChange,
  isManageMode = false,
}: ConnectCalcomDialogProps) {
  const [showApiKey, setShowApiKey] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  const createIntegration = useCreateWorkspaceIntegration()
  const updateIntegration = useUpdateWorkspaceIntegration("calcom")
  const deleteIntegration = useDeleteWorkspaceIntegration()

  // Fetch integration details when in manage mode
  const {
    data: integrationDetails,
    isLoading: isLoadingDetails,
  } = useWorkspaceIntegration(isManageMode ? "calcom" : "")

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CalcomFormData>({
    resolver: zodResolver(calcomFormSchema),
    defaultValues: {
      name: "",
      cal_api_key: "",
    },
  })

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open && isManageMode && integrationDetails) {
      reset({
        name: integrationDetails.name,
        cal_api_key: "", // Don't show existing key
      })
    } else if (open && !isManageMode) {
      reset({
        name: "Cal.com",
        cal_api_key: "",
      })
    }
  }, [open, isManageMode, integrationDetails, reset])

  const onSubmit = async (data: CalcomFormData) => {
    try {
      if (isManageMode) {
        // Update existing integration
        await updateIntegration.mutateAsync({
          name: data.name,
          default_secret_key: data.cal_api_key,
        })
        toast.success("Cal.com integration updated successfully!")
      } else {
        // Create new integration
        await createIntegration.mutateAsync({
          provider: "calcom",
          name: data.name,
          default_secret_key: data.cal_api_key,
          additional_keys: [],
        })
        toast.success("Cal.com integration connected successfully!")
      }
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving Cal.com integration:", error)
      toast.error(isManageMode ? "Failed to update integration" : "Failed to connect integration")
    }
  }

  const handleDisconnect = async () => {
    if (!integrationDetails) return

    try {
      await deleteIntegration.mutateAsync("calcom")
      toast.success("Cal.com integration disconnected")
      setShowDisconnectConfirm(false)
      onOpenChange(false)
    } catch (error) {
      console.error("Error disconnecting Cal.com:", error)
      toast.error("Failed to disconnect integration")
    }
  }

  const handleClose = () => {
    if (!createIntegration.isPending && !updateIntegration.isPending) {
      onOpenChange(false)
    }
  }

  const isPending = createIntegration.isPending || updateIntegration.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Calendar className="h-6 w-6 text-blue-600" />
              {isManageMode ? "Manage Cal.com" : "Connect Cal.com"}
            </DialogTitle>
            <DialogDescription>
              {isManageMode
                ? "Update your Cal.com API credentials."
                : "Enter your Cal.com API key to enable appointment booking."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Connection Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                placeholder="Cal.com"
                {...register("name")}
                disabled={isPending}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <Separator />

            {/* API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cal_api_key">Cal.com API Key</Label>
                <a
                  href="https://cal.com/settings/developer/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                >
                  Get API Key
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="relative">
                <Input
                  id="cal_api_key"
                  type={showApiKey ? "text" : "password"}
                  placeholder={isManageMode ? maskApiKey(true) : "cal_live_xxxxxxxxxxxx"}
                  {...register("cal_api_key")}
                  disabled={isPending}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.cal_api_key && (
                <p className="text-sm text-destructive">{errors.cal_api_key.message}</p>
              )}
            </div>

            <Separator />

            {/* Documentation Link */}
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">Need help?</p>
              <p className="text-xs text-muted-foreground">
                Visit the Cal.com documentation to learn how to create an API key and set up event types.
              </p>
              <a
                href="https://cal.com/docs/api-reference"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                View Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <DialogFooter className="gap-2">
              {isManageMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDisconnectConfirm(true)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isManageMode ? "Update" : "Connect"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Cal.com?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the Cal.com integration from your workspace. Agents using Cal.com tools
              will no longer be able to access your calendars.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteIntegration.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}


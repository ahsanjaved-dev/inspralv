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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Loader2, Key, Eye, EyeOff, ExternalLink, Trash2, Check, ShieldCheck, Search } from "lucide-react"
import {
  useCreateWorkspaceIntegration,
  useUpdateWorkspaceIntegration,
  useDeleteWorkspaceIntegration,
  useWorkspaceIntegration,
} from "@/lib/hooks/use-workspace-integrations"
import { toast } from "sonner"
import type { AlgoliaIntegrationConfig } from "@/types/database.types"

// ============================================================================
// FORM SCHEMA
// ============================================================================

const algoliaFormSchema = z.object({
  name: z.string().min(1, "Connection name is required").max(255),
  app_id: z.string().min(1, "Application ID is required"),
  admin_api_key: z.string().min(1, "Admin API Key is required"),
  search_api_key: z.string().min(1, "Search API Key is required"),
  call_logs_index: z.string().optional(),
})

type AlgoliaFormData = z.infer<typeof algoliaFormSchema>

// ============================================================================
// COMPONENT
// ============================================================================

interface ConnectAlgoliaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isManageMode?: boolean
}

function maskApiKey(hasKey: boolean): string {
  return hasKey ? "••••••••••••••••" : "Not configured"
}

export function ConnectAlgoliaDialog({
  open,
  onOpenChange,
  isManageMode = false,
}: ConnectAlgoliaDialogProps) {
  const [showAdminKey, setShowAdminKey] = useState(false)
  const [showSearchKey, setShowSearchKey] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  const createIntegration = useCreateWorkspaceIntegration()
  const updateIntegration = useUpdateWorkspaceIntegration("algolia")
  const deleteIntegration = useDeleteWorkspaceIntegration()

  // Fetch integration details when in manage mode
  const {
    data: integrationDetails,
    isLoading: isLoadingDetails,
  } = useWorkspaceIntegration(isManageMode ? "algolia" : "")

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AlgoliaFormData>({
    resolver: zodResolver(algoliaFormSchema),
    defaultValues: {
      name: "",
      app_id: "",
      admin_api_key: "",
      search_api_key: "",
      call_logs_index: "call_logs",
    },
  })

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open && isManageMode && integrationDetails) {
      const config = integrationDetails.config as Record<string, unknown> | null
      reset({
        name: integrationDetails.name,
        app_id: typeof config?.app_id === "string" ? config.app_id : "",
        admin_api_key: "", // Don't show existing key
        search_api_key: "", // Don't show existing key
        call_logs_index: typeof config?.call_logs_index === "string" ? config.call_logs_index : "call_logs",
      })
    } else if (open && !isManageMode) {
      reset({
        name: "Algolia Search",
        app_id: "",
        admin_api_key: "",
        search_api_key: "",
        call_logs_index: "call_logs",
      })
    }
  }, [open, isManageMode, integrationDetails, reset])

  const onSubmit = async (data: AlgoliaFormData) => {
    try {
      // Build Algolia config
      const algoliaConfig: AlgoliaIntegrationConfig = {
        app_id: data.app_id,
        admin_api_key: data.admin_api_key,
        search_api_key: data.search_api_key,
        call_logs_index: data.call_logs_index || "call_logs",
      }
      // API expects `config` as `Record<string, unknown>`
      const configRecord = algoliaConfig as unknown as Record<string, unknown>

      if (isManageMode) {
        // Update existing integration
        await updateIntegration.mutateAsync({
          name: data.name,
          config: configRecord,
        })
        toast.success("Algolia integration updated successfully!")
      } else {
        // Create new integration
        // For Algolia, we store everything in config, but we still need a dummy secret key
        // to satisfy the schema (or we could update the schema to make it optional for algolia)
        await createIntegration.mutateAsync({
          provider: "algolia",
          name: data.name,
          default_secret_key: data.admin_api_key, // Use admin key as the secret
          default_public_key: data.search_api_key, // Use search key as public
          additional_keys: [],
          config: configRecord,
        })
        toast.success("Algolia connected successfully!")
      }
      handleClose(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to save Algolia integration")
    }
  }

  const handleDisconnect = async () => {
    try {
      await deleteIntegration.mutateAsync("algolia")
      toast.success("Algolia disconnected successfully")
      setShowDisconnectConfirm(false)
      handleClose(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to disconnect Algolia")
    }
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset()
      setShowAdminKey(false)
      setShowSearchKey(false)
      setShowDisconnectConfirm(false)
    }
    onOpenChange(isOpen)
  }

  const isPending = createIntegration.isPending || updateIntegration.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="text-2xl">🔍</span>
              {isManageMode ? "Manage Algolia" : "Connect Algolia"}
            </DialogTitle>
            <DialogDescription>
              {isManageMode
                ? "Update your Algolia configuration for fast call log search."
                : "Enter your Algolia credentials to enable fast search for call logs."}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            {isManageMode && isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form id="connect-algolia-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Connection Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Connection Name</Label>
                  <Input
                    id="name"
                    placeholder="My Algolia Account"
                    {...register("name")}
                    disabled={isPending}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>

                <Separator />

                {/* Manage Mode: Show Configured Info */}
                {isManageMode && integrationDetails && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      Current Configuration
                    </h4>

                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Algolia Keys</span>
                        <Badge variant="outline" className="text-green-600 border-green-600/30">
                          <Check className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      </div>

                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">App ID:</span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                          {typeof (integrationDetails.config as any)?.app_id === "string"
                            ? (integrationDetails.config as any).app_id
                            : "Not set"}
                          </code>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Admin Key:</span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                          {maskApiKey(!!(integrationDetails.config as any)?.has_admin_api_key)}
                          </code>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Search Key:</span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                          {maskApiKey(!!(integrationDetails.config as any)?.has_search_api_key)}
                          </code>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Index:</span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                          {typeof (integrationDetails.config as any)?.call_logs_index === "string"
                            ? (integrationDetails.config as any).call_logs_index
                            : "call_logs"}
                          </code>
                        </div>
                      </div>
                    </div>

                    <Separator />
                    <p className="text-sm text-muted-foreground">
                      Enter new values below to update your Algolia configuration:
                    </p>
                  </div>
                )}

                {/* Application ID */}
                <div className="space-y-2">
                  <Label htmlFor="app_id">Application ID *</Label>
                  <Input
                    id="app_id"
                    placeholder="Your Algolia Application ID"
                    {...register("app_id")}
                    disabled={isPending}
                  />
                  {errors.app_id && <p className="text-sm text-destructive">{errors.app_id.message}</p>}
                </div>

                {/* Admin API Key */}
                <div className="space-y-2">
                  <Label htmlFor="admin_api_key">Admin API Key *</Label>
                  <div className="relative">
                    <Input
                      id="admin_api_key"
                      type={showAdminKey ? "text" : "password"}
                      placeholder="Your Admin API Key (for indexing)"
                      className="pr-10"
                      {...register("admin_api_key")}
                      disabled={isPending}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowAdminKey(!showAdminKey)}
                    >
                      {showAdminKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used server-side to index call logs. Never exposed to the client.
                  </p>
                  {errors.admin_api_key && (
                    <p className="text-sm text-destructive">{errors.admin_api_key.message}</p>
                  )}
                </div>

                {/* Search API Key */}
                <div className="space-y-2">
                  <Label htmlFor="search_api_key">Search-Only API Key *</Label>
                  <div className="relative">
                    <Input
                      id="search_api_key"
                      type={showSearchKey ? "text" : "password"}
                      placeholder="Your Search-Only API Key"
                      className="pr-10"
                      {...register("search_api_key")}
                      disabled={isPending}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowSearchKey(!showSearchKey)}
                    >
                      {showSearchKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for searching. Can be safely used in the browser.
                  </p>
                  {errors.search_api_key && (
                    <p className="text-sm text-destructive">{errors.search_api_key.message}</p>
                  )}
                </div>

                {/* Index Name */}
                <div className="space-y-2">
                  <Label htmlFor="call_logs_index">Call Logs Index Name</Label>
                  <Input
                    id="call_logs_index"
                    placeholder="call_logs"
                    {...register("call_logs_index")}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    The Algolia index where call logs will be stored. Default: call_logs
                  </p>
                </div>

                {/* Info Box */}
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="text-muted-foreground">
                    <Key className="inline h-4 w-4 mr-1" />
                    Your Algolia keys are stored securely and used for call log indexing.{" "}
                    <a
                      href="https://www.algolia.com/doc/guides/security/api-keys/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Learn about API keys
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>

                {/* Disconnect Button (manage mode only) */}
                {isManageMode && (
                  <>
                    <Separator />
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full"
                        onClick={() => setShowDisconnectConfirm(true)}
                        disabled={isPending || deleteIntegration.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Disconnect Algolia
                      </Button>
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        This will disable fast search for call logs.
                      </p>
                    </div>
                  </>
                )}
              </form>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" form="connect-algolia-form" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isManageMode ? "Saving..." : "Connecting..."}
                </>
              ) : isManageMode ? (
                "Save Changes"
              ) : (
                "Connect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Algolia?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable fast search for call logs. Call logs will still be stored in the database
              and can be searched there, but search will be slower.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteIntegration.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={deleteIntegration.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteIntegration.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}


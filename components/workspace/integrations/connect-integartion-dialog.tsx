"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
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
import { Loader2, Key, Eye, EyeOff, ExternalLink, Plus, Trash2, Check, ShieldCheck, Phone, Server } from "lucide-react"
import {
  useCreateWorkspaceIntegration,
  useUpdateWorkspaceIntegration,
  useDeleteWorkspaceIntegration,
  useWorkspaceIntegration,
} from "@/lib/hooks/use-workspace-integrations"
import { toast } from "sonner"

const additionalKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Key name is required").max(255),
  secret_key: z.string().min(1, "Secret API key is required"),
  public_key: z.string().optional(),
})

// Vapi-specific config schema for SIP trunk settings
const vapiConfigSchema = z.object({
  sip_trunk_credential_id: z.string().optional(),
  shared_outbound_phone_number_id: z.string().optional(),
  shared_outbound_phone_number: z.string().optional(),
})

const formSchema = z.object({
  name: z.string().min(1, "Connection name is required").max(255),
  default_secret_key: z.string().min(1, "Default secret API key is required"),
  default_public_key: z.string().optional(),
  additional_keys: z.array(additionalKeySchema).optional().default([]),
  vapi_config: vapiConfigSchema.optional(),
})

// Schema for manage mode (keys are optional since we're not showing them)
const manageFormSchema = z.object({
  name: z.string().min(1, "Connection name is required").max(255),
  additional_keys: z.array(additionalKeySchema).optional().default([]),
  vapi_config: vapiConfigSchema.optional(),
})

type FormData = z.infer<typeof formSchema>
type ManageFormData = z.infer<typeof manageFormSchema>

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  category: string
  docsUrl?: string
  requiresPublicKey?: boolean
}

interface ConnectIntegrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integration: Integration | null
  isManageMode?: boolean
}

const providerInfo: Record<string, { docsUrl: string; secretKeyLabel: string; publicKeyLabel?: string }> = {
  vapi: {
    docsUrl: "https://docs.vapi.ai/api-reference/authentication",
    secretKeyLabel: "Private API Key",
    publicKeyLabel: "Public Key (for web calls)",
  },
  retell: {
    docsUrl: "https://docs.retellai.com/get-started/authentication",
    secretKeyLabel: "API Key",
    publicKeyLabel: "Public Key",
  },
  synthflow: {
    docsUrl: "https://docs.synthflow.ai",
    secretKeyLabel: "API Key",
  },
}

function generateUUID(): string {
  return crypto.randomUUID()
}

function maskApiKey(hasKey: boolean): string {
  return hasKey ? "••••••••••••••••" : "Not configured"
}

export function ConnectIntegrationDialog({
  open,
  onOpenChange,
  integration,
  isManageMode = false,
}: ConnectIntegrationDialogProps) {
  const [showDefaultSecretKey, setShowDefaultSecretKey] = useState(false)
  const [showDefaultPublicKey, setShowDefaultPublicKey] = useState(false)
  const [showAdditionalKeys, setShowAdditionalKeys] = useState<Record<string, { secret: boolean; public: boolean }>>({})
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  const createIntegration = useCreateWorkspaceIntegration()
  const updateIntegration = useUpdateWorkspaceIntegration(integration?.id || "")
  const deleteIntegration = useDeleteWorkspaceIntegration()

  // Fetch integration details when in manage mode
  const {
    data: integrationDetails,
    isLoading: isLoadingDetails,
  } = useWorkspaceIntegration(isManageMode && integration?.id ? integration.id : "")

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(isManageMode ? (manageFormSchema as any) : formSchema) as any,
    defaultValues: {
      name: "",
      default_secret_key: "",
      default_public_key: "",
      additional_keys: [],
      vapi_config: {
        sip_trunk_credential_id: "",
        shared_outbound_phone_number_id: "",
        shared_outbound_phone_number: "",
      },
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: "additional_keys",
  })

  const watchDefaultSecretKey = watch("default_secret_key")
  const watchAdditionalKeys = watch("additional_keys")

  // Reset form when dialog opens/closes or mode changes
  useEffect(() => {
    if (open && isManageMode && integrationDetails) {
      // Extract Vapi config from integration details with proper typing
      const rawConfig = integrationDetails.config as Record<string, unknown> | null
      const vapiConfig = {
        sip_trunk_credential_id: typeof rawConfig?.sip_trunk_credential_id === "string" ? rawConfig.sip_trunk_credential_id : "",
        shared_outbound_phone_number_id: typeof rawConfig?.shared_outbound_phone_number_id === "string" ? rawConfig.shared_outbound_phone_number_id : "",
        shared_outbound_phone_number: typeof rawConfig?.shared_outbound_phone_number === "string" ? rawConfig.shared_outbound_phone_number : "",
      }
      reset({
        name: integrationDetails.name,
        default_secret_key: "",
        default_public_key: "",
        additional_keys: [],
        vapi_config: vapiConfig,
      })
    } else if (open && !isManageMode) {
      reset({
        name: "",
        default_secret_key: "",
        default_public_key: "",
        additional_keys: [],
        vapi_config: {
          sip_trunk_credential_id: "",
          shared_outbound_phone_number_id: "",
          shared_outbound_phone_number: "",
        },
      })
    }
  }, [open, isManageMode, integrationDetails, reset])


  // Check if user can add more keys
  const canAddMoreKeys = () => {
    if (isManageMode) {
      // In manage mode, can always add if no pending keys or last key is filled
      if (watchAdditionalKeys.length === 0) return true
      const lastKey = watchAdditionalKeys[watchAdditionalKeys.length - 1]
      return lastKey?.name && lastKey?.secret_key
    }
    
    // In connect mode
    if (!watchDefaultSecretKey) return false
    if (watchAdditionalKeys.length === 0) return true

    const lastKey = watchAdditionalKeys[watchAdditionalKeys.length - 1]
    return lastKey?.name && lastKey?.secret_key
  }

  const handleAddKey = () => {
    if (canAddMoreKeys()) {
      append({
        id: generateUUID(),
        name: "",
        secret_key: "",
        public_key: "",
      })
    }
  }

  const toggleAdditionalKeyVisibility = (index: number, type: "secret" | "public") => {
    setShowAdditionalKeys((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        [type]: !prev[index]?.[type],
      },
    }))
  }

  const onSubmit = async (data: FormData) => {
    if (!integration) return

    try {
      if (isManageMode) {
        // In manage mode, add new additional keys and update config
        const newAdditionalKeys = data.additional_keys.filter((k) => k.name && k.secret_key)

        // Check if there are any changes to save
        const hasKeyChanges = newAdditionalKeys.length > 0 || data.name !== integrationDetails?.name
        
        // Check if Vapi config has changed (for Vapi integrations)
        const currentConfig = integrationDetails?.config as Record<string, unknown> | null
        const currentSipTrunkId = typeof currentConfig?.sip_trunk_credential_id === "string" ? currentConfig.sip_trunk_credential_id : ""
        const currentOutboundPhoneNumberId = typeof currentConfig?.shared_outbound_phone_number_id === "string" ? currentConfig.shared_outbound_phone_number_id : ""
        const currentOutboundPhoneNumber = typeof currentConfig?.shared_outbound_phone_number === "string" ? currentConfig.shared_outbound_phone_number : ""
        const hasVapiConfigChanges = integration.id === "vapi" && (
          data.vapi_config?.sip_trunk_credential_id !== currentSipTrunkId ||
          data.vapi_config?.shared_outbound_phone_number_id !== currentOutboundPhoneNumberId ||
          data.vapi_config?.shared_outbound_phone_number !== currentOutboundPhoneNumber
        )

        if (hasKeyChanges || hasVapiConfigChanges) {
          const existingKeys = integrationDetails?.additional_keys || []

          // Build config object for Vapi
          const config = integration.id === "vapi" && data.vapi_config ? {
            sip_trunk_credential_id: data.vapi_config.sip_trunk_credential_id || undefined,
            shared_outbound_phone_number_id: data.vapi_config.shared_outbound_phone_number_id || undefined,
            shared_outbound_phone_number: data.vapi_config.shared_outbound_phone_number || undefined,
          } : undefined

          await updateIntegration.mutateAsync({
            name: data.name,
            additional_keys: [
              ...existingKeys.map((k) => ({
                id: k.id,
                name: k.name,
                secret_key: "__KEEP__", // Special marker to keep existing key
                public_key: k.has_public_key ? "__KEEP__" : undefined,
              })),
              ...newAdditionalKeys,
            ],
            config,
          })
          toast.success("Integration updated successfully!")
        } else {
          toast.info("No changes to save")
        }
      } else {
        // Create mode - build config for Vapi
        const config = integration.id === "vapi" && data.vapi_config ? {
          sip_trunk_credential_id: data.vapi_config.sip_trunk_credential_id || undefined,
          shared_outbound_phone_number_id: data.vapi_config.shared_outbound_phone_number_id || undefined,
          shared_outbound_phone_number: data.vapi_config.shared_outbound_phone_number || undefined,
        } : undefined

        await createIntegration.mutateAsync({
          provider: integration.id as any,
          name: data.name || `${integration.name} Connection`,
          default_secret_key: data.default_secret_key,
          default_public_key: data.default_public_key || undefined,
          additional_keys: data.additional_keys.filter((k) => k.name && k.secret_key),
          config,
        })
        toast.success(`${integration.name} connected successfully!`)
      }
      handleClose(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to save integration")
    }
  }

  const handleDisconnect = async () => {
    if (!integration) return
    try {
      await deleteIntegration.mutateAsync(integration.id)
      toast.success("Integration disconnected successfully")
      setShowDisconnectConfirm(false)
      handleClose(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to disconnect integration")
    }
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset()
      setShowDefaultSecretKey(false)
      setShowDefaultPublicKey(false)
      setShowAdditionalKeys({})
      setShowDisconnectConfirm(false)
    }
    onOpenChange(isOpen)
  }

  if (!integration) return null

  const info = providerInfo[integration.id] || { docsUrl: "#", secretKeyLabel: "Secret API Key" }
  const isPending = createIntegration.isPending || updateIntegration.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="text-2xl">{integration.icon}</span>
              {isManageMode ? `Manage ${integration.name}` : `Connect ${integration.name}`}
            </DialogTitle>
            <DialogDescription>
              {isManageMode
                ? `View your configured API keys and add additional keys.`
                : `Enter your ${integration.name} API credentials to enable this integration.`}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            {isManageMode && isLoadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form id="connect-integration-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Connection Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Connection Name</Label>
                  <Input
                    id="name"
                    placeholder={`My ${integration.name} Account`}
                    {...register("name")}
                    disabled={isPending}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>

                <Separator />

                {/* Manage Mode: Show Configured Keys Info */}
                {isManageMode && integrationDetails && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      Configured API Keys
                    </h4>

                    {/* Default Keys Display */}
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Default Keys</span>
                        <Badge variant="outline" className="text-green-600 border-green-600/30">
                          <Check className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      </div>

                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">{info.secretKeyLabel}:</span>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {maskApiKey(integrationDetails.has_default_secret_key)}
                          </code>
                        </div>
                        {info.publicKeyLabel && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{info.publicKeyLabel}:</span>
                            <code className="bg-muted px-2 py-1 rounded text-xs">
                              {maskApiKey(integrationDetails.has_default_public_key)}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Existing Additional Keys Display */}
                    {integrationDetails.additional_keys && integrationDetails.additional_keys.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="text-sm font-medium">Additional Keys</h5>
                        {integrationDetails.additional_keys.map((key, index) => (
                          <div key={key.id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{key.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                Key #{index + 1}
                              </Badge>
                            </div>
                            <div className="grid gap-1 text-sm">
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Secret Key:</span>
                                <code className="bg-muted px-2 py-1 rounded text-xs">
                                  {maskApiKey(key.has_secret_key)}
                                </code>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Public Key:</span>
                                <code className="bg-muted px-2 py-1 rounded text-xs">
                                  {maskApiKey(key.has_public_key)}
                                </code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Separator />
                  </div>
                )}

                {/* Vapi SIP Trunk Configuration (Vapi only, manage mode) */}
                {isManageMode && integration.id === "vapi" && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      SIP Trunk Configuration
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Configure your SIP trunk for BYO phone numbers. This enables inbound/outbound calls via your own carrier.
                    </p>

                    {/* SIP Trunk Credential ID */}
                    <div className="space-y-2">
                      <Label htmlFor="sip_trunk_credential_id">SIP Trunk Credential ID</Label>
                      <Input
                        id="sip_trunk_credential_id"
                        placeholder="Vapi credential ID from byo-sip-trunk"
                        {...register("vapi_config.sip_trunk_credential_id")}
                        disabled={isPending}
                      />
                      <p className="text-xs text-muted-foreground">
                        Create a SIP trunk credential in Vapi and paste the ID here.
                      </p>
                    </div>

                    <Separator className="my-4" />

                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Shared Outbound Number
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      All agents in this workspace will use this number for outbound calls (caller ID).
                    </p>

                    {/* Shared Outbound Phone Number ID */}
                    <div className="space-y-2">
                      <Label htmlFor="shared_outbound_phone_number_id">Phone Number ID</Label>
                      <Input
                        id="shared_outbound_phone_number_id"
                        placeholder="Vapi phone number ID"
                        {...register("vapi_config.shared_outbound_phone_number_id")}
                        disabled={isPending}
                      />
                      <p className="text-xs text-muted-foreground">
                        The Vapi phone number ID linked to your SIP trunk for outbound calls.
                      </p>
                    </div>

                    {/* Shared Outbound Phone Number (Display) */}
                    <div className="space-y-2">
                      <Label htmlFor="shared_outbound_phone_number">Phone Number (for display)</Label>
                      <Input
                        id="shared_outbound_phone_number"
                        placeholder="+15551234567"
                        {...register("vapi_config.shared_outbound_phone_number")}
                        disabled={isPending}
                      />
                      <p className="text-xs text-muted-foreground">
                        The E.164 formatted number shown in the UI (e.g., +15551234567).
                      </p>
                    </div>

                    <Separator />
                  </div>
                )}

                {/* Connect Mode: Default API Keys Input */}
                {!isManageMode && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Default API Keys</h4>

                    {/* Default Secret Key */}
                    <div className="space-y-2">
                      <Label htmlFor="default_secret_key">{info.secretKeyLabel} *</Label>
                      <div className="relative">
                        <Input
                          id="default_secret_key"
                          type={showDefaultSecretKey ? "text" : "password"}
                          placeholder="Enter your secret API key"
                          className="pr-10"
                          {...register("default_secret_key")}
                          disabled={isPending}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowDefaultSecretKey(!showDefaultSecretKey)}
                        >
                          {showDefaultSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      {errors.default_secret_key && (
                        <p className="text-sm text-destructive">{errors.default_secret_key.message}</p>
                      )}
                    </div>

                    {/* Default Public Key */}
                    {info.publicKeyLabel && (
                      <div className="space-y-2">
                        <Label htmlFor="default_public_key">{info.publicKeyLabel} (Optional)</Label>
                        <div className="relative">
                          <Input
                            id="default_public_key"
                            type={showDefaultPublicKey ? "text" : "password"}
                            placeholder="Enter public key for client-side usage"
                            className="pr-10"
                            {...register("default_public_key")}
                            disabled={isPending}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowDefaultPublicKey(!showDefaultPublicKey)}
                          >
                            {showDefaultPublicKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* New Additional API Keys Section (for both modes) */}
                {fields.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium">
                        {isManageMode ? "Add New API Keys" : "Additional API Keys"}
                      </h4>

                      {fields.map((field, index) => {
                        const prevKey = index > 0 ? watchAdditionalKeys[index - 1] : null
                        const isDisabled = index > 0 && (!prevKey?.name || !prevKey?.secret_key)

                        return (
                          <div
                            key={field.id}
                            className={`space-y-3 p-4 border rounded-lg ${isDisabled ? "opacity-50" : ""}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {isManageMode ? "New Key" : "Additional Key"} #{index + 1}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => remove(index)}
                                disabled={isPending}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Key Name */}
                            <div className="space-y-2">
                              <Label>Key Name *</Label>
                              <Input
                                placeholder="e.g., Production Key, Backup Key"
                                {...register(`additional_keys.${index}.name`)}
                                disabled={isPending || isDisabled}
                              />
                              {errors.additional_keys?.[index]?.name && (
                                <p className="text-sm text-destructive">
                                  {errors.additional_keys[index]?.name?.message}
                                </p>
                              )}
                            </div>

                            {/* Secret Key */}
                            <div className="space-y-2">
                              <Label>Secret API Key *</Label>
                              <div className="relative">
                                <Input
                                  type={showAdditionalKeys[index]?.secret ? "text" : "password"}
                                  placeholder="Enter secret API key"
                                  className="pr-10"
                                  {...register(`additional_keys.${index}.secret_key`)}
                                  disabled={isPending || isDisabled}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                  onClick={() => toggleAdditionalKeyVisibility(index, "secret")}
                                >
                                  {showAdditionalKeys[index]?.secret ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                              {errors.additional_keys?.[index]?.secret_key && (
                                <p className="text-sm text-destructive">
                                  {errors.additional_keys[index]?.secret_key?.message}
                                </p>
                              )}
                            </div>

                            {/* Public Key */}
                            <div className="space-y-2">
                              <Label>Public API Key (Optional)</Label>
                              <div className="relative">
                                <Input
                                  type={showAdditionalKeys[index]?.public ? "text" : "password"}
                                  placeholder="Enter public API key"
                                  className="pr-10"
                                  {...register(`additional_keys.${index}.public_key`)}
                                  disabled={isPending || isDisabled}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                  onClick={() => toggleAdditionalKeyVisibility(index, "public")}
                                >
                                  {showAdditionalKeys[index]?.public ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Add More Keys Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddKey}
                  disabled={!canAddMoreKeys() || isPending}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add {isManageMode ? "New" : "Additional"} API Key
                </Button>

                {!canAddMoreKeys() && (isManageMode || watchDefaultSecretKey) && (
                  <p className="text-xs text-muted-foreground text-center">
                    Complete the previous key before adding another
                  </p>
                )}

                {/* Info Box */}
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="text-muted-foreground">
                    <Key className="inline h-4 w-4 mr-1" />
                    Your API keys are stored securely and used only for syncing agents.{" "}
                    <a
                      href={info.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Get your API key
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>

                {/* Disconnect Button (only in manage mode) */}
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
                        Disconnect Integration
                      </Button>
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        This will remove all API keys and disconnect the integration.
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
            <Button type="submit" form="connect-integration-form" disabled={isPending}>
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

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Integration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all API keys and disconnect this integration. Agents using this integration may stop
              working. This action cannot be undone.
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
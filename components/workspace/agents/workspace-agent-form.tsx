"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Key, Lock, Globe, AlertCircle, ExternalLink, Check, AlertTriangle, CloudOff, Wrench, Phone, PhoneCall, PhoneOff, Copy } from "lucide-react"
import type { AIAgent, FunctionTool } from "@/types/database.types"
import type { CreateWorkspaceAgentInput } from "@/types/api.types"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useAllIntegrationsWithDetails } from "@/lib/hooks/use-workspace-integrations"
import { useState, useEffect } from "react"
import { FunctionToolEditor } from "./function-tool-editor"
import { toast } from "sonner"

interface WorkspaceAgentFormProps {
  initialData?: AIAgent
  onSubmit: (data: CreateWorkspaceAgentInput) => Promise<void>
  isSubmitting: boolean
}

const selectedApiKeySchema = z.object({
  type: z.enum(["none", "default", "additional"] as const),
  additional_key_id: z.string().uuid().optional(),
  additional_key_name: z.string().optional(),
})

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  provider: z.enum(["vapi", "retell", "synthflow"] as const),
  voice_provider: z
    .enum(["elevenlabs", "deepgram", "azure", "openai", "cartesia"] as const)
    .optional(),
  model_provider: z.enum(["openai", "anthropic", "google", "groq"] as const).optional(),
  transcriber_provider: z.enum(["deepgram", "assemblyai", "openai"] as const).optional(),
  config: z
    .object({
      system_prompt: z.string().optional(),
      first_message: z.string().optional(),
      voice_id: z.string().optional(),
      voice_settings: z
        .object({
          speed: z.number().optional(),
          stability: z.number().optional(),
          similarity_boost: z.number().optional(),
        })
        .optional(),
      api_key_config: z
        .object({
          secret_key: selectedApiKeySchema.optional(),
          public_key: selectedApiKeySchema.optional(),
          assigned_key_id: z.string().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

// Helper to get current assigned key ID from agent config
function getAssignedKeyId(config: any): string | null {
  if (!config?.api_key_config) return null
  if (config.api_key_config.assigned_key_id) return config.api_key_config.assigned_key_id
  
  const secretKey = config.api_key_config.secret_key
  if (!secretKey || secretKey.type === "none") return null
  if (secretKey.type === "default") return "default"
  if (secretKey.type === "additional") return secretKey.additional_key_id || null
  return null
}

export function WorkspaceAgentForm({
  initialData,
  onSubmit,
  isSubmitting,
}: WorkspaceAgentFormProps) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const [showKeyChangeWarning, setShowKeyChangeWarning] = useState(false)
  
  // Function tools state
  const [tools, setTools] = useState<FunctionTool[]>(
    (initialData?.config as any)?.tools || []
  )
  const [toolsServerUrl, setToolsServerUrl] = useState<string>(
    (initialData?.config as any)?.tools_server_url || ""
  )

  // Phone number state (for Vapi agents)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(
    initialData?.external_phone_number || null
  )
  const [phoneNumberId, setPhoneNumberId] = useState<string | null>(
    (initialData?.config as any)?.telephony?.vapi_phone_number_id || null
  )
  const [isProvisioningPhone, setIsProvisioningPhone] = useState(false)
  const [isReleasingPhone, setIsReleasingPhone] = useState(false)
  const [outboundNumber, setOutboundNumber] = useState("")
  const [isCallingOutbound, setIsCallingOutbound] = useState(false)
  const [isLoadingPhoneNumber, setIsLoadingPhoneNumber] = useState(false)

  // Fetch phone number details on mount if we have an ID but no number
  useEffect(() => {
    if (initialData && initialData.provider === "vapi" && phoneNumberId && !phoneNumber) {
      setIsLoadingPhoneNumber(true)
      fetch(`/api/w/${workspaceSlug}/agents/${initialData.id}/phone-number`)
        .then((res) => res.json())
        .then((result) => {
          if (result.data?.currentPhoneNumber) {
            setPhoneNumber(result.data.currentPhoneNumber)
          }
        })
        .catch((err) => console.error("Failed to fetch phone number:", err))
        .finally(() => setIsLoadingPhoneNumber(false))
    }
  }, [initialData, phoneNumberId, phoneNumber, workspaceSlug])

  // Fetch all integrations with details for the current workspace
  const { data: integrations, isLoading: integrationsLoading } = useAllIntegrationsWithDetails()

  // Get the initial assigned key ID
  const initialAssignedKeyId = initialData ? getAssignedKeyId(initialData.config) : null

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      provider: (initialData?.provider as FormData["provider"]) || "vapi",
      voice_provider: (initialData?.voice_provider as FormData["voice_provider"]) || undefined,
      model_provider: (initialData?.model_provider as FormData["model_provider"]) || undefined,
      transcriber_provider:
        (initialData?.transcriber_provider as FormData["transcriber_provider"]) || undefined,
      is_active: initialData?.is_active ?? true,
      config: {
        system_prompt: (initialData?.config as any)?.system_prompt || "",
        first_message: (initialData?.config as any)?.first_message || "",
        voice_id: (initialData?.config as any)?.voice_id || "",
        voice_settings: (initialData?.config as any)?.voice_settings || {},
        // NEW FLOW: Default to "none" for new agents
        api_key_config: (initialData?.config as any)?.api_key_config || {
          secret_key: { type: "none" },
          public_key: { type: "none" },
          assigned_key_id: null,
        },
      },
    },
  })

  const selectedProvider = watch("provider")
  const apiKeyConfig = watch("config.api_key_config")
  
  // Check if agent is synced
  const syncStatus = initialData?.sync_status || "not_synced"
  const isNotSynced = syncStatus === "not_synced"
  const isSyncError = syncStatus === "error"

  // Get the integration for the selected provider
  const currentIntegration = integrations?.find((i: any) => i.provider === selectedProvider)

  const handleFormSubmit = async (data: FormData) => {
    const currentConfig = data.config || {}
    const apiKeyConfigData = currentConfig.api_key_config || {}
    
    const completeConfig = {
      system_prompt: currentConfig.system_prompt || "",
      first_message: currentConfig.first_message || "",
      voice_id: currentConfig.voice_id || "",
      voice_settings: currentConfig.voice_settings || {},
      api_key_config: {
        secret_key: apiKeyConfigData.secret_key || { type: "none" as const },
        public_key: apiKeyConfigData.public_key || { type: "none" as const },
        assigned_key_id: apiKeyConfigData.assigned_key_id || null,
      },
      // Include function tools
      tools: tools.length > 0 ? tools : undefined,
      tools_server_url: toolsServerUrl || undefined,
    }

    const submitData = {
      ...data,
      config: completeConfig,
      agent_secret_api_key: [],
      agent_public_api_key: [],
      tags: [],
      knowledge_document_ids: [],
    }
    
    console.log("[WorkspaceAgentForm] Submitting with config:", JSON.stringify(submitData.config, null, 2))
    
    await onSubmit(submitData as CreateWorkspaceAgentInput)
  }

  const getProviderDisplayName = (provider: string) => {
    switch (provider) {
      case "vapi":
        return "VAPI"
      case "retell":
        return "Retell AI"
      case "synthflow":
        return "Synthflow"
      default:
        return provider
    }
  }

  const handleSecretKeySelection = (value: string) => {
    // Check if changing from an existing key
    if (initialAssignedKeyId && value !== initialAssignedKeyId) {
      setShowKeyChangeWarning(true)
    } else {
      setShowKeyChangeWarning(false)
    }

    if (value === "none") {
      setValue("config.api_key_config.secret_key", { type: "none" })
      setValue("config.api_key_config.assigned_key_id", null)
    } else if (value === "default") {
      setValue("config.api_key_config.secret_key", { type: "default" })
      setValue("config.api_key_config.assigned_key_id", "default")
    } else {
      const additionalKey = currentIntegration?.additional_keys?.find((k: any) => k.id === value)
      setValue("config.api_key_config.secret_key", {
        type: "additional",
        additional_key_id: value,
        additional_key_name: additionalKey?.name || "Additional Key",
      })
      setValue("config.api_key_config.assigned_key_id", value)
    }
  }

  const handlePublicKeySelection = (value: string) => {
    if (value === "none") {
      setValue("config.api_key_config.public_key", { type: "none" })
    } else if (value === "default") {
      setValue("config.api_key_config.public_key", { type: "default" })
    } else {
      const additionalKey = currentIntegration?.additional_keys?.find((k: any) => k.id === value)
      setValue("config.api_key_config.public_key", {
        type: "additional",
        additional_key_id: value,
        additional_key_name: additionalKey?.name || "Additional Key",
      })
    }
  }

  const getSecretKeyValue = () => {
    const config = apiKeyConfig?.secret_key
    if (!config || config.type === "none") return "none"
    if (config.type === "default") return "default"
    return config.additional_key_id || "none"
  }

  const getPublicKeyValue = () => {
    const config = apiKeyConfig?.public_key
    if (!config || config.type === "none") return "none"
    if (config.type === "default") return "default"
    return config.additional_key_id || "none"
  }

  const renderSyncStatus = () => {
    if (isNotSynced) {
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-600/30 bg-amber-500/10">
          <CloudOff className="w-3 h-3 mr-1" />
          Not Synced
        </Badge>
      )
    }
    if (isSyncError) {
      return (
        <Badge variant="outline" className="text-red-600 border-red-600/30 bg-red-500/10">
          <AlertCircle className="w-3 h-3 mr-1" />
          Sync Error
        </Badge>
      )
    }
    if (syncStatus === "synced") {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
          <Check className="w-3 h-3 mr-1" />
          Synced
        </Badge>
      )
    }
    return null
  }

  const renderApiKeyStatus = (type: "secret" | "public") => {
    const config = type === "secret" ? apiKeyConfig?.secret_key : apiKeyConfig?.public_key

    if (!config || config.type === "none") {
      return (
        <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
          <AlertCircle className="w-3 h-3 mr-1" />
          No Key Selected
        </Badge>
      )
    }

    if (config.type === "default") {
      return (
        <Badge className="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20 hover:bg-green-500/20">
          <Check className="w-3 h-3 mr-1" />
          Default Key
        </Badge>
      )
    }

    return (
      <Badge className="bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20">
        <Key className="w-3 h-3 mr-1" />
        {config.additional_key_name || "Additional Key"}
      </Badge>
    )
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Sync Status Alert for existing agents */}
      {initialData && (isNotSynced || isSyncError) && (
        <Alert variant={isSyncError ? "destructive" : "default"} className={isNotSynced ? "border-amber-500/50 bg-amber-500/10" : ""}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{isSyncError ? "Sync Error" : "Agent Not Synced"}</AlertTitle>
          <AlertDescription>
            {isNotSynced ? (
              <>
                This agent has not been synced to {getProviderDisplayName(initialData.provider)}. 
                Assign an API key below to sync the agent.
              </>
            ) : (
              <>
                There was an error syncing this agent. Error: {initialData.last_sync_error || "Unknown error"}
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Key Change Warning */}
      {showKeyChangeWarning && (
        <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-600">API Key Change Warning</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            You are changing the API key for this agent. To preserve call logs, ensure the new API key 
            is from the same provider account as the previous one.
          </AlertDescription>
        </Alert>
      )}

      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Configure the basic settings for your AI agent</CardDescription>
            </div>
            {initialData && renderSyncStatus()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Agent Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Sales Assistant"
              {...register("name")}
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Describe what this agent does..."
              {...register("description")}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">
              AI Provider <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedProvider}
              onValueChange={(value: FormData["provider"]) => {
                setValue("provider", value)
                // Reset API key config when provider changes
                setValue("config.api_key_config.secret_key", { type: "none" })
                setValue("config.api_key_config.public_key", { type: "none" })
                setValue("config.api_key_config.assigned_key_id", null)
                setShowKeyChangeWarning(false)
              }}
              disabled={isSubmitting || !!initialData} // Don't allow provider change on edit
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vapi">Vapi</SelectItem>
                <SelectItem value="retell">Retell AI</SelectItem>
                <SelectItem value="synthflow">Synthflow</SelectItem>
              </SelectContent>
            </Select>
            {initialData && (
              <p className="text-xs text-muted-foreground">
                Provider cannot be changed after agent creation.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              {...register("is_active")}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary"
            />
            <Label htmlFor="is_active" className="text-sm font-normal">
              Agent is active and can receive calls
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* API Key Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Key Configuration
          </CardTitle>
          <CardDescription>
            {!initialData ? (
              <>
                API keys are configured by admin. You can create the agent now and the admin 
                will assign API keys later to sync with {getProviderDisplayName(selectedProvider)}.
              </>
            ) : (
              <>
                Select which API keys from your{" "}
                <Link
                  href={`/w/${workspaceSlug}/integrations`}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  integrations
                  <ExternalLink className="w-3 h-3" />
                </Link>{" "}
                to use for this agent.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {integrationsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !currentIntegration ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
              <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <h4 className="font-medium mb-2">
                No {getProviderDisplayName(selectedProvider)} Integration
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                {!initialData ? (
                  <>You can still create the agent. An admin needs to connect {getProviderDisplayName(selectedProvider)} and assign API keys to sync.</>
                ) : (
                  <>Connect {getProviderDisplayName(selectedProvider)} in your integrations to use API keys.</>
                )}
              </p>
              <Button variant="outline" asChild>
                <Link href={`/w/${workspaceSlug}/integrations`}>Go to Integrations</Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Secret Key Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-base font-medium">Secret API Key</Label>
                  </div>
                  {renderApiKeyStatus("secret")}
                </div>
                <p className="text-sm text-muted-foreground">
                  Server-side key for syncing agents with {getProviderDisplayName(selectedProvider)}.
                  {!initialData && " (Optional - can be configured later by admin)"}
                </p>
                <Select
                  value={getSecretKeyValue()}
                  onValueChange={handleSecretKeySelection}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select a secret key" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-muted-foreground" />
                        <span>No Key (Not Synced)</span>
                      </div>
                    </SelectItem>
                    {currentIntegration.has_default_secret_key && (
                      <SelectItem value="default">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span>Default Secret Key</span>
                        </div>
                      </SelectItem>
                    )}
                    {currentIntegration.additional_keys?.map(
                      (key: any) =>
                        key.has_secret_key && (
                          <SelectItem key={key.id} value={key.id}>
                            <div className="flex items-center gap-2">
                              <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span>{key.name}</span>
                            </div>
                          </SelectItem>
                        )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Public Key Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-base font-medium">Public API Key (Optional)</Label>
                  </div>
                  {renderApiKeyStatus("public")}
                </div>
                <p className="text-sm text-muted-foreground">
                  Client-side key for test calls. Required to enable the "Test Call" feature.
                </p>
                <Select
                  value={getPublicKeyValue()}
                  onValueChange={handlePublicKeySelection}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select a public key" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-muted-foreground" />
                        <span>No Key</span>
                      </div>
                    </SelectItem>
                    {currentIntegration.has_default_public_key && (
                      <SelectItem value="default">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span>Default Public Key</span>
                        </div>
                      </SelectItem>
                    )}
                    {currentIntegration.additional_keys?.map(
                      (key: any) =>
                        key.has_public_key && (
                          <SelectItem key={key.id} value={key.id}>
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span>{key.name}</span>
                            </div>
                          </SelectItem>
                        )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Integration Info */}
              <div className="rounded-lg bg-muted/50 dark:bg-muted/20 p-4 text-sm border border-border/50">
                <p className="text-muted-foreground">
                  <Key className="inline w-4 h-4 mr-1" />
                  API keys are managed in your{" "}
                  <Link
                    href={`/w/${workspaceSlug}/integrations`}
                    className="text-primary hover:underline font-medium"
                  >
                    Integrations settings
                  </Link>
                  . You have {currentIntegration.additional_keys_count || 0} additional key(s)
                  configured.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Voice & Model Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Voice & Model Settings</CardTitle>
          <CardDescription>Choose the voice and language model for your agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Voice Provider</Label>
              <Select
                value={watch("voice_provider") || ""}
                onValueChange={(value) =>
                  setValue("voice_provider", value as FormData["voice_provider"])
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="deepgram">Deepgram</SelectItem>
                  <SelectItem value="azure">Azure</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="cartesia">Cartesia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model Provider</Label>
              <Select
                value={watch("model_provider") || ""}
                onValueChange={(value) =>
                  setValue("model_provider", value as FormData["model_provider"])
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transcriber</Label>
              <Select
                value={watch("transcriber_provider") || ""}
                onValueChange={(value) =>
                  setValue("transcriber_provider", value as FormData["transcriber_provider"])
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select transcriber" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepgram">Deepgram</SelectItem>
                  <SelectItem value="assemblyai">AssemblyAI</SelectItem>
                  <SelectItem value="openai">OpenAI Whisper</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Voice ID Input */}
          <div className="space-y-2">
            <Label htmlFor="voice_id">Voice ID</Label>
            <Input
              id="voice_id"
              placeholder="e.g., 21m00Tcm4TlvDq8ikWAM (ElevenLabs voice ID)"
              {...register("config.voice_id")}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Enter the voice ID from your voice provider. For ElevenLabs, find this in your voice
              settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt Configuration</CardTitle>
          <CardDescription>Define how your agent behaves and responds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system_prompt">System Prompt</Label>
            <textarea
              id="system_prompt"
              className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background placeholder:text-muted-foreground"
              placeholder="You are a helpful sales assistant..."
              {...register("config.system_prompt")}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="first_message">First Message</Label>
            <Input
              id="first_message"
              placeholder="Hello! How can I help you today?"
              {...register("config.first_message")}
              disabled={isSubmitting}
            />
          </div>
        </CardContent>
      </Card>

      {/* Function Tools Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Function Tools
          </CardTitle>
          <CardDescription>
            Add custom function tools to extend your agent's capabilities.
            Tools allow your agent to perform actions like booking appointments, looking up customer data, or transferring calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunctionToolEditor
            tools={tools}
            onChange={setTools}
            serverUrl={toolsServerUrl}
            onServerUrlChange={setToolsServerUrl}
            disabled={isSubmitting}
          />
        </CardContent>
      </Card>

      {/* Phone Number Card - Only for existing Vapi agents */}
      {initialData && selectedProvider === "vapi" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Phone Number
            </CardTitle>
            <CardDescription>
              Provision a free SIP phone number to enable calling for this agent. 
              Note: Free Vapi numbers are SIP-based and work best with web calls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Phone Number Status */}
            {isLoadingPhoneNumber ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading phone number...</span>
              </div>
            ) : phoneNumber && phoneNumberId ? (
              <div className="space-y-4">
                {/* Current Phone Number Display */}
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-800 rounded-full">
                      <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-green-900 dark:text-green-100 break-all">
                        {phoneNumber}
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        {phoneNumber?.startsWith("sip:") 
                          ? "SIP address for VoIP calls (use web call for testing)"
                          : "Call this number to test inbound calls"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(phoneNumber)
                        toast.success("Phone number copied to clipboard")
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setIsReleasingPhone(true)
                        try {
                          const res = await fetch(
                            `/api/w/${workspaceSlug}/agents/${initialData.id}/phone-number`,
                            { method: "DELETE" }
                          )
                          const result = await res.json()
                          if (!res.ok) {
                            throw new Error(result.error || "Failed to release phone number")
                          }
                          setPhoneNumber(null)
                          setPhoneNumberId(null)
                          toast.success("Phone number released")
                        } catch (error: any) {
                          toast.error(error.message || "Failed to release phone number")
                        } finally {
                          setIsReleasingPhone(false)
                        }
                      }}
                      disabled={isReleasingPhone}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      {isReleasingPhone ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PhoneOff className="h-4 w-4" />
                      )}
                      <span className="ml-1">Release</span>
                    </Button>
                  </div>
                </div>

                {/* Outbound Call Section */}
                <div className="space-y-3">
                  <Label>Test Outbound Call</Label>
                  <p className="text-sm text-muted-foreground">
                    Enter a phone number to place a test outbound call from this agent.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="+14155551234"
                      value={outboundNumber}
                      onChange={(e) => setOutboundNumber(e.target.value)}
                      disabled={isCallingOutbound}
                    />
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!outboundNumber.trim()) {
                          toast.error("Please enter a phone number")
                          return
                        }
                        setIsCallingOutbound(true)
                        try {
                          const res = await fetch(
                            `/api/w/${workspaceSlug}/agents/${initialData.id}/outbound-call`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ customerNumber: outboundNumber.trim() }),
                            }
                          )
                          const result = await res.json()
                          if (!res.ok) {
                            throw new Error(result.error || "Failed to initiate call")
                          }
                          toast.success(`Call initiated to ${outboundNumber}`)
                          setOutboundNumber("")
                        } catch (error: any) {
                          toast.error(error.message || "Failed to initiate outbound call")
                        } finally {
                          setIsCallingOutbound(false)
                        }
                      }}
                      disabled={isCallingOutbound || !outboundNumber.trim()}
                    >
                      {isCallingOutbound ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <PhoneCall className="h-4 w-4 mr-2" />
                      )}
                      Call
                    </Button>
                  </div>
                </div>
              </div>
            ) : phoneNumberId && !phoneNumber ? (
              /* Phone number ID exists but number is still activating */
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-100 dark:bg-yellow-800 rounded-full">
                      <Loader2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400 animate-spin" />
                    </div>
                    <div>
                      <p className="font-medium text-yellow-900 dark:text-yellow-100">
                        Phone number activating...
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Your number is being set up. This may take a few minutes.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsLoadingPhoneNumber(true)
                      fetch(`/api/w/${workspaceSlug}/agents/${initialData.id}/phone-number`)
                        .then((res) => res.json())
                        .then((result) => {
                          console.log("[PhoneNumber] Check status response:", result)
                          const phoneNum = result.data?.currentPhoneNumber || result.data?.sipUri
                          if (phoneNum) {
                            setPhoneNumber(phoneNum)
                            toast.success("Phone number is now active!")
                          } else {
                            toast.info(`Status: ${result.data?.vapiStatus || 'activating'}. Phone number may take a few more minutes.`)
                          }
                        })
                        .catch(() => toast.error("Failed to check status"))
                        .finally(() => setIsLoadingPhoneNumber(false))
                    }}
                  >
                    Check Status
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* No Phone Number - Show Provision Button */}
                {!initialData.external_agent_id ? (
                  <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
                    <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Agent must be synced with Vapi before provisioning a phone number.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Save the agent with an API key assigned first.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
                    <Phone className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-4">
                      No phone number assigned. Get a free US phone number to enable calling.
                    </p>
                    <Button
                      type="button"
                      onClick={async () => {
                        setIsProvisioningPhone(true)
                        try {
                          const res = await fetch(
                            `/api/w/${workspaceSlug}/agents/${initialData.id}/phone-number`,
                            { method: "POST" }
                          )
                          const result = await res.json()
                          console.log("[PhoneNumber] Provision response:", result)
                          if (!res.ok) {
                            throw new Error(result.error || "Failed to provision phone number")
                          }
                          
                          // New response format: displayNumber (best available), sipUri, phoneNumber (PSTN)
                          const data = result.data
                          const newPhoneNumberId = data?.phoneNumberId
                          // Use displayNumber (which prefers PSTN, falls back to SIP URI)
                          const newPhoneNumber = data?.displayNumber || data?.sipUri || data?.phoneNumber
                          
                          console.log("[PhoneNumber] Setting state:", { 
                            newPhoneNumber, 
                            newPhoneNumberId,
                            sipUri: data?.sipUri,
                            status: data?.status 
                          })
                          
                          if (newPhoneNumberId) {
                            setPhoneNumberId(newPhoneNumberId)
                            if (newPhoneNumber && newPhoneNumber !== "Activating...") {
                              setPhoneNumber(newPhoneNumber)
                              // Show appropriate message based on number type
                              if (data?.sipUri && !data?.phoneNumber) {
                                toast.success(`SIP number provisioned: ${newPhoneNumber}`)
                              } else {
                                toast.success(`Phone number ${newPhoneNumber} provisioned successfully!`)
                              }
                            } else {
                              // Number is activating - will show "activating" UI
                              toast.success("Phone number provisioned! Activating...")
                            }
                          } else {
                            console.error("[PhoneNumber] Missing phoneNumberId in response:", result)
                            toast.error("Phone number provisioned but data not returned correctly")
                          }
                        } catch (error: any) {
                          toast.error(error.message || "Failed to provision phone number")
                        } finally {
                          setIsProvisioningPhone(false)
                        }
                      }}
                      disabled={isProvisioningPhone}
                    >
                      {isProvisioningPhone ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Provisioning...
                        </>
                      ) : (
                        <>
                          <Phone className="h-4 w-4 mr-2" />
                          Get Free US Number
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Info Box */}
            <div className="rounded-lg bg-muted/50 dark:bg-muted/20 p-4 text-sm border border-border/50">
              <p className="text-muted-foreground">
                <Phone className="inline w-4 h-4 mr-1" />
                Free Vapi numbers are limited to US national calls. Up to 10 free numbers per Vapi account.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" disabled={isSubmitting} asChild>
          <Link href={`/w/${workspaceSlug}/agents`}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {initialData ? "Updating..." : "Creating..."}
            </>
          ) : initialData ? (
            "Update Agent"
          ) : (
            "Create Agent"
          )}
        </Button>
      </div>
    </form>
  )
}
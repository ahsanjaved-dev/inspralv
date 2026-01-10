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
import { Loader2, Lock, Globe, AlertCircle, ExternalLink, Check, AlertTriangle, CloudOff, Wrench, Phone, PhoneCall, PhoneOff, Copy, Info } from "lucide-react"
import type { AIAgent, FunctionTool } from "@/types/database.types"
import type { CreateWorkspaceAgentInput } from "@/types/api.types"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaceAssignedIntegration } from "@/lib/hooks/use-workspace-assigned-integration"
import { useState, useEffect } from "react"
import { FunctionToolEditor } from "./function-tool-editor"
import { toast } from "sonner"

interface WorkspaceAgentFormProps {
  initialData?: AIAgent
  onSubmit: (data: CreateWorkspaceAgentInput) => Promise<void>
  isSubmitting: boolean
}

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
    })
    .optional(),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

export function WorkspaceAgentForm({
  initialData,
  onSubmit,
  isSubmitting,
}: WorkspaceAgentFormProps) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()
  
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
  
  // SIP number assignment state
  const [sipNumberInput, setSipNumberInput] = useState("")
  const [isAssigningSipNumber, setIsAssigningSipNumber] = useState(false)
  const [sipDialUri, setSipDialUri] = useState<string | null>(null)

  // Sync phone number state with initialData when it changes (e.g., after cache invalidation)
  const initialPhoneNumber = initialData?.external_phone_number || null
  const initialPhoneNumberId = (initialData?.config as any)?.telephony?.vapi_phone_number_id || null
  
  useEffect(() => {
    // Update state when initialData changes (happens after React Query refetch)
    setPhoneNumber(initialPhoneNumber)
    setPhoneNumberId(initialPhoneNumberId)
  }, [initialPhoneNumber, initialPhoneNumberId])

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

  // useForm must be defined before watch() is called
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
      },
    },
  })

  const selectedProvider = watch("provider")
  
  // Fetch the assigned integration for the selected provider (from org-level)
  const { data: assignedIntegration, isLoading: assignedIntegrationLoading } = useWorkspaceAssignedIntegration(selectedProvider || "vapi")
  
  // Check if agent is synced
  const syncStatus = initialData?.sync_status || "not_synced"
  const isNotSynced = syncStatus === "not_synced"
  const isSyncError = syncStatus === "error"

  const handleFormSubmit = async (data: FormData) => {
    const currentConfig = data.config || {}
    
    const completeConfig = {
      system_prompt: currentConfig.system_prompt || "",
      first_message: currentConfig.first_message || "",
      voice_id: currentConfig.voice_id || "",
      voice_settings: currentConfig.voice_settings || {},
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

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 pb-8">
      {/* API Key Status - Compact inline alert at top */}
      {assignedIntegrationLoading ? (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted/50 border">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Checking integration status...</span>
        </div>
      ) : assignedIntegration ? (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {getProviderDisplayName(selectedProvider)} key: {assignedIntegration.integration_name}
              {assignedIntegration.is_default && " (Default)"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {assignedIntegration.has_secret_key && (
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3 text-green-500" />
                Secret
              </span>
            )}
            {assignedIntegration.has_public_key && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3 text-green-500" />
                Public
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              No {getProviderDisplayName(selectedProvider)} API key assigned
            </span>
            <span className="text-sm text-muted-foreground ml-1">
              — Contact org admin to assign a key.
              {!initialData && " You can still create the agent."}
            </span>
          </div>
        </div>
      )}

      {/* Sync Status Alert for existing agents */}
      {initialData && (isNotSynced || isSyncError) && (
        <Alert variant={isSyncError ? "destructive" : "default"} className={isNotSynced ? "border-amber-500/50 bg-amber-500/10" : ""}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{isSyncError ? "Sync Error" : "Agent Not Synced"}</AlertTitle>
          <AlertDescription>
            {isNotSynced ? (
              <>
                This agent has not been synced to {getProviderDisplayName(initialData.provider)}. 
                Save the agent to attempt sync.
              </>
            ) : (
              <>
                There was an error syncing this agent to {getProviderDisplayName(initialData.provider)}.
                Please check your configuration and try again.
              </>
            )}
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

      {/* Webhook URL Configuration - Only for Retell */}
      {selectedProvider === "retell" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Webhook URL
            </CardTitle>
            <CardDescription>
              Your server endpoint that receives tool execution requests and call data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  id="tools-server-url"
                  placeholder="https://your-server.com/webhook"
                  value={toolsServerUrl}
                  onChange={(e) => setToolsServerUrl(e.target.value)}
                  disabled={isSubmitting}
                  className="pr-10"
                />
                {toolsServerUrl && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!toolsServerUrl || isSubmitting}
                onClick={() => {
                  if (toolsServerUrl) {
                    navigator.clipboard.writeText(toolsServerUrl)
                    toast.success("Copied!")
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Function Tools Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Function Tools
          </CardTitle>
          <CardDescription>
            Add tools to extend your agent's capabilities like booking appointments, looking up data, or transferring calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunctionToolEditor
            tools={tools}
            onChange={setTools}
            serverUrl={toolsServerUrl}
            disabled={isSubmitting}
            provider={selectedProvider}
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
                          setSipDialUri(null)
                          // Invalidate agent cache so data persists on page revisit
                          queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, initialData.id] })
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

                {/* SIP Dial Info */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>SIP Dial URI</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            `/api/w/${workspaceSlug}/agents/${initialData.id}/sip-info`
                          )
                          const result = await res.json()
                          if (!res.ok) {
                            throw new Error(result.error || "Failed to get SIP info")
                          }
                          const uri = result.data?.inbound?.sipUri
                          if (uri) {
                            setSipDialUri(uri)
                            toast.success("SIP info loaded")
                          } else {
                            toast.info(result.data?.inbound?.instructions || "SIP trunk not configured")
                          }
                        } catch (error: any) {
                          toast.error(error.message || "Failed to get SIP info")
                        }
                      }}
                    >
                      Get SIP Info
                    </Button>
                  </div>
                  {sipDialUri ? (
                    <div className="flex gap-2">
                      <Input
                        value={sipDialUri}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(sipDialUri)
                          toast.success("SIP URI copied!")
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Click "Get SIP Info" to get the dial URI for your webphone
                    </p>
                  )}
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
                  <div className="space-y-6">
                    {/* Option 1: Assign SIP Number (BYO) */}
                    <div className="p-4 border rounded-lg bg-muted/30 dark:bg-muted/10">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Assign SIP Number (Recommended)
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Enter a phone number to assign to this agent for inbound SIP calls.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="+15551234567"
                          value={sipNumberInput}
                          onChange={(e) => setSipNumberInput(e.target.value)}
                          disabled={isAssigningSipNumber}
                        />
                        <Button
                          type="button"
                          onClick={async () => {
                            if (!sipNumberInput.trim()) {
                              toast.error("Please enter a phone number")
                              return
                            }
                            setIsAssigningSipNumber(true)
                            try {
                              const res = await fetch(
                                `/api/w/${workspaceSlug}/agents/${initialData.id}/assign-sip-number`,
                                {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ phoneNumber: sipNumberInput.trim() }),
                                }
                              )
                              const result = await res.json()
                              console.log("[SipNumber] Assign response:", result)
                              if (!res.ok) {
                                throw new Error(result.error || "Failed to assign SIP number")
                              }
                              
                              const data = result.data
                              setPhoneNumber(data.phoneNumber)
                              setPhoneNumberId(data.phoneNumberId)
                              setSipDialUri(data.sipUri)
                              setSipNumberInput("")
                              // Invalidate agent cache so data persists on page revisit
                              queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, initialData.id] })
                              toast.success(
                                <div>
                                  <p>SIP number assigned!</p>
                                  <p className="text-xs mt-1 font-mono">{data.sipUri}</p>
                                </div>
                              )
                            } catch (error: any) {
                              toast.error(error.message || "Failed to assign SIP number")
                            } finally {
                              setIsAssigningSipNumber(false)
                            }
                          }}
                          disabled={isAssigningSipNumber || !sipNumberInput.trim()}
                        >
                          {isAssigningSipNumber ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Assign"
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Requires SIP trunk configured in integration settings.
                      </p>
                    </div>

                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or</span>
                      </div>
                    </div>

                    {/* Option 2: Get Free Vapi Number */}
                    <div className="text-center py-4 border-2 border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
                      <p className="text-sm text-muted-foreground mb-3">
                        Get a free Vapi SIP number (limited to web calls)
                      </p>
                      <Button
                        type="button"
                        variant="outline"
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
                            
                            const data = result.data
                            const newPhoneNumberId = data?.phoneNumberId
                            const newPhoneNumber = data?.displayNumber || data?.sipUri || data?.phoneNumber
                            
                            if (newPhoneNumberId) {
                              setPhoneNumberId(newPhoneNumberId)
                              // Invalidate agent cache so data persists on page revisit
                              queryClient.invalidateQueries({ queryKey: ["workspace-agent", workspaceSlug, initialData.id] })
                              if (newPhoneNumber && newPhoneNumber !== "Activating...") {
                                setPhoneNumber(newPhoneNumber)
                                toast.success(`SIP number provisioned: ${newPhoneNumber}`)
                              } else {
                                toast.success("Phone number provisioned! Activating...")
                              }
                            } else {
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
                            Get Free Vapi Number
                          </>
                        )}
                      </Button>
                    </div>
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
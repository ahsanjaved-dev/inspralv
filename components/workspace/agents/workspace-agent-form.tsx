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
import {
  Loader2,
  Lock,
  Globe,
  AlertCircle,
  Check,
  AlertTriangle,
  CloudOff,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Copy,
  Wrench,
  X,
  Plus,
} from "lucide-react"
import type { AIAgent, FunctionTool, AgentDirection } from "@/types/database.types"
import type { CreateWorkspaceAgentInput } from "@/types/api.types"
import type { CalendarToolSettings } from "./calendar-tool-config"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useWorkspaceAssignedIntegration } from "@/lib/hooks/use-workspace-assigned-integration"
import { useAvailablePhoneNumbers } from "@/lib/hooks/use-workspace-agents"
import { useState } from "react"
import { FunctionToolEditor } from "./function-tool-editor"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { getVoicesForProvider, getVoiceCardColor, type VoiceOption } from "@/lib/voice"
import { useRetellVoices } from "@/lib/hooks/use-retell-voices"
import type { RetellVoice } from "@/lib/integrations/retell/voices"
import { Play, Volume2, Search, Filter, RotateCcw } from "lucide-react"

// ============================================================================
// VOICE FILTER TYPES
// ============================================================================

interface VoiceFilters {
  search: string
  gender: "all" | "Male" | "Female"
  accent: string // "all" or specific accent
}

interface WorkspaceAgentFormProps {
  initialData?: AIAgent
  onSubmit: (data: CreateWorkspaceAgentInput) => Promise<void>
  isSubmitting: boolean
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(40, "Agent name must be 40 characters or less"),
  description: z.string().optional(),
  provider: z.enum(["vapi", "retell"] as const),
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

  // Function tools state
  const [tools, setTools] = useState<FunctionTool[]>((initialData?.config as any)?.tools || [])
  
  // Calendar settings for calendar tools
  const [calendarSettings, setCalendarSettings] = useState<CalendarToolSettings>({
    slot_duration_minutes: (initialData?.config as any)?.calendar_settings?.slot_duration_minutes || 30,
    buffer_between_slots_minutes: (initialData?.config as any)?.calendar_settings?.buffer_between_slots_minutes || 0,
    preferred_days: (initialData?.config as any)?.calendar_settings?.preferred_days || ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    preferred_hours_start: (initialData?.config as any)?.calendar_settings?.preferred_hours_start || "09:00",
    preferred_hours_end: (initialData?.config as any)?.calendar_settings?.preferred_hours_end || "17:00",
    timezone: (initialData?.config as any)?.calendar_settings?.timezone || "America/New_York",
    min_notice_hours: (initialData?.config as any)?.calendar_settings?.min_notice_hours || 1,
    max_advance_days: (initialData?.config as any)?.calendar_settings?.max_advance_days || 60,
    // Email notification settings
    enable_owner_email: (initialData?.config as any)?.calendar_settings?.enable_owner_email || false,
    owner_email: (initialData?.config as any)?.calendar_settings?.owner_email || undefined,
    // Calendar source settings (for using existing calendars)
    calendar_source: (initialData?.config as any)?.calendar_settings?.calendar_source || 'new' as 'new' | 'existing',
    existing_calendar_id: (initialData?.config as any)?.calendar_settings?.existing_calendar_id || undefined,
    existing_calendar_name: (initialData?.config as any)?.calendar_settings?.existing_calendar_name || undefined,
  })
  
  // DEBUG: Wrapper to log tools changes
  const handleToolsChange = (newTools: FunctionTool[]) => {
    console.log("[WorkspaceAgentForm] handleToolsChange called")
    console.log("[WorkspaceAgentForm] New tools:", JSON.stringify(newTools.map(t => ({
      name: t.name,
      parameters: t.parameters,
      paramCount: Object.keys(t.parameters?.properties || {}).length
    })), null, 2))
    setTools(newTools)
  }

  // Agent direction state
  const [agentDirection, setAgentDirection] = useState<AgentDirection>(
    initialData?.agent_direction || "inbound"
  )
  const [allowOutbound, setAllowOutbound] = useState(initialData?.allow_outbound || false)

  // Assigned phone number for outbound agents (from telephony)
  const [assignedPhoneNumberId, setAssignedPhoneNumberId] = useState<string | null>(
    initialData?.assigned_phone_number_id || null
  )

  // Voice list state
  const [isVoiceListOpen, setIsVoiceListOpen] = useState(false)
  
  // Audio preview state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null)

  // Voice filter state
  const [voiceFilters, setVoiceFilters] = useState<VoiceFilters>({
    search: "",
    gender: "all",
    accent: "all",
  })

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

  // Fetch available phone numbers for assignment (only for outbound agents)
  // Filter by provider to only show numbers synced to the selected provider
  const {
    data: availablePhoneNumbers,
    isLoading: isLoadingAvailableNumbers,
    error: phoneNumbersError,
  } = useAvailablePhoneNumbers({ provider: selectedProvider })

  // Fetch the assigned integration for the selected provider (from org-level)
  const { data: assignedIntegration, isLoading: assignedIntegrationLoading } =
    useWorkspaceAssignedIntegration(selectedProvider || "vapi")

  // Fetch Retell voices dynamically
  const { 
    data: retellVoicesData, 
    isLoading: isLoadingRetellVoices,
    error: retellVoicesError 
  } = useRetellVoices()

  // Audio preview handlers
  const playVoicePreview = (voiceId: string, previewUrl: string | undefined) => {
    if (!previewUrl) return

    // Stop any currently playing audio
    if (audioRef) {
      audioRef.pause()
      audioRef.currentTime = 0
    }

    // If clicking the same voice that's playing, just stop it
    if (playingVoiceId === voiceId) {
      setPlayingVoiceId(null)
      return
    }

    // Play new audio
    const audio = new Audio(previewUrl)
    audio.onended = () => setPlayingVoiceId(null)
    audio.onerror = () => {
      setPlayingVoiceId(null)
      toast.error("Failed to play voice preview")
    }
    audio.play()
    setAudioRef(audio)
    setPlayingVoiceId(voiceId)
  }

  const stopVoicePreview = () => {
    if (audioRef) {
      audioRef.pause()
      audioRef.currentTime = 0
    }
    setPlayingVoiceId(null)
  }

  // Reset voice filters
  const resetVoiceFilters = () => {
    setVoiceFilters({
      search: "",
      gender: "all",
      accent: "all",
    })
  }

  // Filter voices based on search and gender only (for accent dropdown)
  const filterVoicesForAccentDropdown = (voices: (VoiceOption | RetellVoice)[]): (VoiceOption | RetellVoice)[] => {
    return voices.filter((voice) => {
      // Search filter - check name, accent, and characteristics
      if (voiceFilters.search) {
        const searchLower = voiceFilters.search.toLowerCase()
        const nameMatch = voice.name.toLowerCase().includes(searchLower)
        const accentMatch = voice.accent.toLowerCase().includes(searchLower)
        const characteristicsMatch = 
          "characteristics" in voice && 
          voice.characteristics?.toLowerCase().includes(searchLower)
        
        if (!nameMatch && !accentMatch && !characteristicsMatch) {
          return false
        }
      }

      // Gender filter
      if (voiceFilters.gender !== "all" && voice.gender !== voiceFilters.gender) {
        return false
      }

      return true
    })
  }

  // Filter voices based on all filters (for display)
  const filterVoices = (voices: (VoiceOption | RetellVoice)[]): (VoiceOption | RetellVoice)[] => {
    return voices.filter((voice) => {
      // Search filter - check name, accent, and characteristics
      if (voiceFilters.search) {
        const searchLower = voiceFilters.search.toLowerCase()
        const nameMatch = voice.name.toLowerCase().includes(searchLower)
        const accentMatch = voice.accent.toLowerCase().includes(searchLower)
        const characteristicsMatch = 
          "characteristics" in voice && 
          voice.characteristics?.toLowerCase().includes(searchLower)
        
        if (!nameMatch && !accentMatch && !characteristicsMatch) {
          return false
        }
      }

      // Gender filter
      if (voiceFilters.gender !== "all" && voice.gender !== voiceFilters.gender) {
        return false
      }

      // Accent filter
      if (voiceFilters.accent !== "all" && voice.accent !== voiceFilters.accent) {
        return false
      }

      return true
    })
  }

  // Get unique accents from voices that match search and gender filters
  const getAvailableAccents = (voices: (VoiceOption | RetellVoice)[]): string[] => {
    const filteredForAccents = filterVoicesForAccentDropdown(voices)
    const accents = new Set<string>()
    filteredForAccents.forEach((voice) => {
      if (voice.accent && voice.accent !== "Unknown") {
        accents.add(voice.accent)
      }
    })
    return Array.from(accents).sort()
  }

  // Check if agent is synced
  const syncStatus = initialData?.sync_status || "not_synced"
  const isNotSynced = syncStatus === "not_synced"
  const isSyncError = syncStatus === "error"

  const handleFormSubmit = async (data: FormData) => {
    // DEBUG: Log tools state at form submission
    console.log("[WorkspaceAgentForm] handleFormSubmit called")
    console.log("[WorkspaceAgentForm] Tools state at submission:", JSON.stringify(tools.map(t => ({
      name: t.name,
      parameters: t.parameters,
      paramCount: Object.keys(t.parameters?.properties || {}).length
    })), null, 2))
    
    const currentConfig = data.config || {}

    // Check if agent has calendar tools
    const calendarToolNames = ["book_appointment", "cancel_appointment", "reschedule_appointment"]
    const hasCalendarTools = tools.some(t => calendarToolNames.includes(t.name))

    const completeConfig = {
      system_prompt: currentConfig.system_prompt || "",
      first_message: currentConfig.first_message || "",
      voice_id: currentConfig.voice_id || "",
      voice_settings: currentConfig.voice_settings || {},
      // Include function tools
      tools: tools.length > 0 ? tools : undefined,
      // Include calendar settings if agent has calendar tools
      calendar_settings: hasCalendarTools ? calendarSettings : undefined,
    }
    
    // DEBUG: Log completeConfig.tools
    console.log("[WorkspaceAgentForm] completeConfig.tools:", JSON.stringify(completeConfig.tools?.map(t => ({
      name: t.name,
      parameters: t.parameters,
      paramCount: Object.keys(t.parameters?.properties || {}).length
    })), null, 2))

    const submitData = {
      ...data,
      config: completeConfig,
      agent_secret_api_key: [],
      agent_public_api_key: [],
      tags: [],
      knowledge_document_ids: [],
      // Agent direction fields
      agent_direction: agentDirection,
      allow_outbound: agentDirection === "inbound" ? allowOutbound : undefined,
      // Phone number assignment for outbound agents
      assigned_phone_number_id: agentDirection === "outbound" ? assignedPhoneNumberId : undefined,
    }

    console.log(
      "[WorkspaceAgentForm] Submitting with config:",
      JSON.stringify(submitData.config, null, 2)
    )

    await onSubmit(submitData as CreateWorkspaceAgentInput)
  }

  const getProviderDisplayName = (provider: string) => {
    switch (provider) {
      case "vapi":
        return "VAPI"
      case "retell":
        return "Retell AI"
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
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
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
        <Alert
          variant={isSyncError ? "destructive" : "default"}
          className={isNotSynced ? "border-amber-500/50 bg-amber-500/10" : ""}
        >
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
                There was an error syncing this agent to{" "}
                {getProviderDisplayName(initialData.provider)}. Please check your configuration and
                try again.
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
              maxLength={40}
              {...register("name")}
              disabled={isSubmitting}
            />
            <div className="flex justify-between items-center">
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              ) : (
                <span />
              )}
              <span className={cn(
                "text-xs",
                (watch("name")?.length || 0) >= 35 ? "text-amber-500" : "text-muted-foreground",
                (watch("name")?.length || 0) >= 40 && "text-destructive"
              )}>
                {watch("name")?.length || 0}/40
              </span>
            </div>
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
              {agentDirection === "outbound" 
                ? "Agent is active and can make calls"
                : "Agent is active and can receive calls"
              }
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Agent Direction Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Agent Direction
          </CardTitle>
          <CardDescription>
            Define whether this agent handles inbound or outbound calls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                value: "inbound" as AgentDirection,
                label: "Inbound",
                description: "Receives incoming calls from customers",
                icon: PhoneIncoming,
                color: "bg-green-100 dark:bg-green-900/30",
                iconColor: "text-green-600",
              },
              {
                value: "outbound" as AgentDirection,
                label: "Outbound",
                description: "Makes outgoing calls to contacts",
                icon: PhoneOutgoing,
                color: "bg-blue-100 dark:bg-blue-900/30",
                iconColor: "text-blue-600",
              },
            ].map((direction) => {
              const Icon = direction.icon
              return (
                <div
                  key={direction.value}
                  onClick={() => {
                    if (!isSubmitting) {
                      setAgentDirection(direction.value)
                      // Reset allow outbound if not inbound
                      if (direction.value !== "inbound") {
                        setAllowOutbound(false)
                      }
                    }
                  }}
                  className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    agentDirection === direction.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  } ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${direction.color}`}
                    >
                      <Icon className={`w-5 h-5 ${direction.iconColor}`} />
                    </div>
                    <h4 className="font-semibold">{direction.label}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">{direction.description}</p>
                </div>
              )
            })}
          </div>

          {/* Allow Outbound Toggle for Inbound Agents */}
          {agentDirection === "inbound" && (
            <div className="ml-4 pl-4 border-l-2 border-primary/20">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <Label className="mb-0">Allow Outbound Campaigns</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable this agent to also make outbound calls in campaigns
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={allowOutbound}
                  onChange={(e) => setAllowOutbound(e.target.checked)}
                  disabled={isSubmitting}
                  className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Phone Number Assignment for Outbound Agents */}
          {agentDirection === "outbound" && (
            <div className="mt-4 p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-3">
                <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                <Label className="font-medium text-blue-700 dark:text-blue-400">
                  Caller ID (Phone Number)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Select a phone number to use as caller ID for outbound calls. Only numbers synced to{" "}
                <span className="font-medium">{selectedProvider?.toUpperCase()}</span> are shown.
              </p>
              {isLoadingAvailableNumbers ? (
                <Skeleton className="h-10 w-full" />
              ) : phoneNumbersError ? (
                <div className="text-center p-4 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-6 w-6 mx-auto text-amber-600 mb-2" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Unable to load phone numbers
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure phone numbers in Organization → Telephony
                  </p>
                </div>
              ) : availablePhoneNumbers && availablePhoneNumbers.length > 0 ? (
                <div className="space-y-2">
                  <Select
                    value={assignedPhoneNumberId || "none"}
                    onValueChange={(value) =>
                      setAssignedPhoneNumberId(value === "none" ? null : value)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a phone number..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No phone number</SelectItem>
                      {availablePhoneNumbers.map((number) => (
                        <SelectItem key={number.id} value={number.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-mono">
                              {number.friendly_name || number.phone_number}
                            </span>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-xs uppercase",
                                number.provider === "vapi" && "bg-blue-500/10 text-blue-600",
                                number.provider === "retell" && "bg-purple-500/10 text-purple-600"
                              )}
                            >
                              {number.provider}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assignedPhoneNumberId && (
                    <p className="text-xs text-muted-foreground">
                      This phone number will be used as the caller ID when this agent makes outbound
                      calls.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <Phone className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No {selectedProvider?.toUpperCase()} phone numbers available
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedProvider === "retell"
                      ? "Sync phone numbers to Retell in Organization → Telephony"
                      : "Sync phone numbers to VAPI in Organization → Telephony"
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voice Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Voice Configuration</CardTitle>
          <CardDescription>Select the voice for your AI agent</CardDescription>
        </CardHeader>
        <CardContent>
            {(() => {
              const selectedVoiceId = watch("config.voice_id")
              // For Retell: use dynamically fetched voices, for VAPI: use static list
              const allVoices: (VoiceOption | RetellVoice)[] = selectedProvider === "retell" 
                ? (retellVoicesData?.voices || [])
                : getVoicesForProvider(selectedProvider as "vapi" | "retell")
              
              // Apply filters to get filtered voices
              const availableVoices = filterVoices(allVoices)
              const availableAccents = getAvailableAccents(allVoices)
              
              // Reset accent filter if the selected accent is no longer available
              if (voiceFilters.accent !== "all" && !availableAccents.includes(voiceFilters.accent)) {
                setVoiceFilters((prev) => ({ ...prev, accent: "all" }))
              }
              
              // Find selected voice - check both id AND providerId (for VAPI ElevenLabs voices)
              // When agents are synced, voice_id might be stored as the provider's voice ID
              const selectedVoice = allVoices.find((v) => {
                if (v.id === selectedVoiceId) return true
                // For VAPI voices, also check the providerId (ElevenLabs ID)
                if ('providerId' in v && (v as VoiceOption).providerId === selectedVoiceId) return true
                return false
              })
              const isRetellProvider = selectedProvider === "retell"
              
              // Check if any filter is active
              const hasActiveFilters = voiceFilters.search !== "" || 
                voiceFilters.gender !== "all" || 
                voiceFilters.accent !== "all"

              return (
                <div className="space-y-3">
                  {/* Selected Voice Display */}
                  {selectedVoice && !isVoiceListOpen && (
                    <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                      <div className="flex items-start gap-3">
                        {(() => {
                          const colors = getVoiceCardColor(selectedVoice.gender)
                          const retellVoice = isRetellProvider ? (selectedVoice as RetellVoice) : null
                          const vapiVoice = !isRetellProvider ? (selectedVoice as VoiceOption) : null
                          const isPlaying = playingVoiceId === selectedVoice.id

                          return (
                            <>
                              <div
                                className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                  colors.bg
                                )}
                              >
                                <span className={cn("font-semibold", colors.text)}>
                                  {selectedVoice.name[0]}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm">{selectedVoice.name}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {selectedVoice.gender}
                                  </Badge>
                                  <Check className="h-4 w-4 text-green-600 ml-auto" />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {selectedVoice.accent} • {isRetellProvider ? `Age: ${retellVoice?.age}` : `Age ${vapiVoice?.age}`}
                                </p>
                                {vapiVoice?.characteristics && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {vapiVoice.characteristics}
                                  </p>
                                )}
                                {isRetellProvider && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Provider: ElevenLabs
                                  </p>
                                )}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                      <div className="mt-3 flex gap-2">
                        {/* Audio Preview Button for selected voice */}
                        {(() => {
                          const previewUrl = isRetellProvider 
                            ? (selectedVoice as RetellVoice)?.previewAudioUrl 
                            : (selectedVoice as VoiceOption)?.previewUrl
                          if (!previewUrl) return null
                          return (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => playVoicePreview(selectedVoice.id, previewUrl)}
                              className={cn(
                                playingVoiceId === selectedVoice.id && "bg-primary text-primary-foreground"
                              )}
                            >
                              {playingVoiceId === selectedVoice.id ? (
                                <>
                                  <Volume2 className="h-4 w-4 mr-1 animate-pulse" />
                                  Playing...
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-1" />
                                  Preview
                                </>
                              )}
                            </Button>
                          )
                        })()}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsVoiceListOpen(true)}
                        >
                          Change Voice
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Voice List (shown when no voice selected or editing) */}
                  {(!selectedVoiceId || isVoiceListOpen) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          Select Voice ({selectedProvider === "vapi" ? "Vapi" : "Retell"})
                        </Label>
                        {isVoiceListOpen && selectedVoiceId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsVoiceListOpen(false)
                              stopVoicePreview()
                              resetVoiceFilters()
                            }}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>

                      {/* Voice Filters */}
                      <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Filter className="h-4 w-4" />
                          <span>Filter Voices</span>
                          {hasActiveFilters && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs ml-auto"
                              onClick={resetVoiceFilters}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset
                            </Button>
                          )}
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="text"
                            placeholder="Search by name, accent, or characteristics..."
                            value={voiceFilters.search}
                            onChange={(e) =>
                              setVoiceFilters((prev) => ({ ...prev, search: e.target.value }))
                            }
                            className="pl-9 h-9"
                          />
                        </div>

                        {/* Filter Row */}
                        <div className="flex flex-wrap gap-2">
                          {/* Gender Filter */}
                          <Select
                            value={voiceFilters.gender}
                            onValueChange={(value: "all" | "Male" | "Female") =>
                              setVoiceFilters((prev) => ({ ...prev, gender: value }))
                            }
                          >
                            <SelectTrigger className="w-[130px] h-9">
                              <SelectValue placeholder="Gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Genders</SelectItem>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Accent Filter */}
                          <Select
                            value={voiceFilters.accent}
                            onValueChange={(value: string) =>
                              setVoiceFilters((prev) => ({ ...prev, accent: value }))
                            }
                          >
                            <SelectTrigger className="w-[160px] h-9">
                              <SelectValue placeholder="Accent" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Accents</SelectItem>
                              {availableAccents.map((accent) => (
                                <SelectItem key={accent} value={accent}>
                                  {accent}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Filter Summary */}
                          <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {availableVoices.length}
                            </span>
                            <span>of {allVoices.length} voices</span>
                          </div>
                        </div>
                      </div>

                      {/* Loading state for Retell voices */}
                      {isRetellProvider && isLoadingRetellVoices && (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="p-3 rounded-lg border">
                              <div className="flex items-start gap-3">
                                <Skeleton className="w-10 h-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-4 w-24" />
                                  <Skeleton className="h-3 w-32" />
                                  <Skeleton className="h-3 w-40" />
                                </div>
                                <Skeleton className="h-8 w-16" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Error state for Retell voices */}
                      {isRetellProvider && retellVoicesError && (
                        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10">
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            <p className="text-sm font-medium">Failed to load voices</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {retellVoicesError instanceof Error 
                              ? retellVoicesError.message 
                              : "Please ensure a Retell integration is configured for this workspace."}
                          </p>
                        </div>
                      )}

                      {/* Voice list */}
                      {!(isRetellProvider && isLoadingRetellVoices) && 
                       !(isRetellProvider && retellVoicesError) && (
                        <>
                          {/* No results state */}
                          {availableVoices.length === 0 && hasActiveFilters && (
                            <div className="p-6 text-center rounded-lg border border-dashed">
                              <Search className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                              <p className="text-sm font-medium text-muted-foreground">
                                No voices match your filters
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 mb-3">
                                Try adjusting your search or filter criteria
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={resetVoiceFilters}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Reset Filters
                              </Button>
                            </div>
                          )}

                          {/* Voice list */}
                          {availableVoices.length > 0 && (
                            <ScrollArea
                              className={cn(
                                "rounded-lg border p-2",
                                availableVoices.length <= 3 ? "h-auto" : "h-[320px]"
                              )}
                            >
                              <div className="space-y-2">
                                {availableVoices.map((voice) => {
                                  const colors = getVoiceCardColor(voice.gender)
                                  const retellVoice = isRetellProvider ? (voice as RetellVoice) : null
                                  const vapiVoice = !isRetellProvider ? (voice as VoiceOption) : null
                                  const isPlaying = playingVoiceId === voice.id

                                  return (
                                    <div
                                      key={voice.id}
                                      className="p-3 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-all"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div
                                          className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                            colors.bg
                                          )}
                                        >
                                          <span className={cn("font-semibold", colors.text)}>
                                            {voice.name[0]}
                                          </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <p className="font-medium text-sm">{voice.name}</p>
                                            <Badge variant="outline" className="text-xs">
                                              {voice.gender}
                                            </Badge>
                                            <Badge variant="secondary" className="text-xs">
                                              {voice.accent}
                                            </Badge>
                                          </div>
                                          <p className="text-xs text-muted-foreground">
                                            {isRetellProvider ? `Age: ${retellVoice?.age}` : `Age ${vapiVoice?.age}`}
                                          </p>
                                          {vapiVoice?.characteristics && (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                              {vapiVoice.characteristics}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {/* Audio Preview Button */}
                                          {(() => {
                                            const previewUrl = isRetellProvider 
                                              ? retellVoice?.previewAudioUrl 
                                              : vapiVoice?.previewUrl
                                            if (!previewUrl) return null
                                            return (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => playVoicePreview(voice.id, previewUrl)}
                                                className={cn(
                                                  "w-8 h-8 p-0",
                                                  isPlaying && "bg-primary text-primary-foreground"
                                                )}
                                              >
                                                {isPlaying ? (
                                                  <Volume2 className="h-4 w-4 animate-pulse" />
                                                ) : (
                                                  <Play className="h-4 w-4" />
                                                )}
                                              </Button>
                                            )
                                          })()}
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => {
                                              setValue("config.voice_id", voice.id)
                                              setIsVoiceListOpen(false)
                                              stopVoicePreview()
                                              resetVoiceFilters()
                                            }}
                                          >
                                            <Plus className="h-4 w-4 mr-1" />
                                            Select
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </ScrollArea>
                          )}

                          {/* Summary text */}
                          {availableVoices.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {hasActiveFilters ? (
                                <>
                                  Showing <span className="font-medium">{availableVoices.length}</span> of{" "}
                                  <span className="font-medium">{allVoices.length}</span> voices
                                </>
                              ) : (
                                <>
                                  {allVoices.length} voice{allVoices.length !== 1 ? "s" : ""} available
                                  for {selectedProvider === "vapi" ? "Vapi" : "Retell"}
                                  {isRetellProvider && " (ElevenLabs)"}
                                </>
                              )}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
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
          
          {/* First Message - Only show for inbound agents */}
          {/* Outbound agents wait for the recipient to speak first (e.g., "Hello?") */}
          {agentDirection !== "outbound" && (
            <div className="space-y-2">
              <Label htmlFor="first_message">First Message</Label>
              <Input
                id="first_message"
                placeholder="Hello! How can I help you today?"
                {...register("config.first_message")}
                disabled={isSubmitting}
              />
            </div>
          )}
          
          {/* Outbound Agent Info Banner */}
          {agentDirection === "outbound" && (
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <PhoneOutgoing className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    Outbound Agent Behavior
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    For outbound calls, the agent waits for the recipient to speak first 
                    (e.g., "Hello?") before responding according to the system prompt.
                    No initial greeting is needed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook URL - Read-Only, Auto-Generated */}
      {(selectedProvider === "retell" || selectedProvider === "vapi") && (
        <Card className={initialData && (initialData.config as any)?.provider_webhook_url ? "border-primary/20 bg-primary/5" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Webhook URL
              </CardTitle>
              {initialData && (initialData.config as any)?.provider_webhook_url && (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                  <Check className="w-3 h-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
            <CardDescription>
              {initialData && (initialData.config as any)?.provider_webhook_url
                ? `This URL receives call events from ${getProviderDisplayName(selectedProvider)}. It's automatically configured and cannot be edited.`
                : `A webhook URL will be automatically generated when the agent is synced with ${getProviderDisplayName(selectedProvider)}.`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {initialData && (initialData.config as any)?.provider_webhook_url ? (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      value={(initialData.config as any)?.provider_webhook_url || ""}
                      readOnly
                      disabled
                      className="bg-muted/50 font-mono text-sm pr-10"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const url = (initialData.config as any)?.provider_webhook_url
                      if (url) {
                        navigator.clipboard.writeText(url)
                        toast.success("Webhook URL copied!")
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {(initialData.config as any)?.provider_webhook_configured_at && (
                  <p className="text-xs text-muted-foreground">
                    Configured on:{" "}
                    {new Date((initialData.config as any).provider_webhook_configured_at).toLocaleString()}
                  </p>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Webhook not configured yet</p>
                    <p className="text-xs text-muted-foreground">
                      {initialData 
                        ? "Save the agent to sync and generate the webhook URL."
                        : "Create the agent first. The webhook URL will be generated when the agent syncs."
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
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
            Add tools to extend your agent's capabilities like booking appointments, looking up
            data, or transferring calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunctionToolEditor
            tools={tools}
            onChange={handleToolsChange}
            disabled={isSubmitting}
            provider={selectedProvider}
            calendarSettings={calendarSettings}
            onCalendarSettingsChange={setCalendarSettings}
            workspaceSlug={workspaceSlug}
            currentAgentId={initialData?.id}
          />
        </CardContent>
      </Card>

      {/* Fixed Action Buttons */}
      <div className="fixed-action-bar fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-6 py-4 bg-background/95 backdrop-blur-sm border-t shadow-lg lg:left-64">
        <div className="max-w-4xl mx-auto flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4">
          <Button type="button" variant="outline" disabled={isSubmitting} asChild className="w-full sm:w-auto">
            <Link href={`/w/${workspaceSlug}/agents`}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
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
      </div>
    </form>
  )
}

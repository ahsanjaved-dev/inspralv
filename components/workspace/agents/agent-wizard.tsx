"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Play,
  Volume2,
  BookOpen,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Briefcase,
  Smile,
  Coffee,
  Wrench,
  FileText,
  HelpCircle,
  ShoppingBag,
  FileCheck,
  Scroll,
  FileQuestion,
  AlertCircle,
  Globe,
  Plus,
  X,
  Variable,
  Info,
  Lock,
  Copy,
  Search,
  Filter,
  RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { functionToolsArraySchema, type CreateWorkspaceAgentInput } from "@/types/api.types"
import type {
  FunctionTool,
  KnowledgeDocument,
  KnowledgeDocumentType,
  AgentDirection,
  WorkspaceSettings,
  CustomVariableDefinition,
  AgentCustomVariableDefinition,
} from "@/types/database.types"
import { STANDARD_CAMPAIGN_VARIABLES } from "@/types/database.types"
import { FunctionToolEditor } from "./function-tool-editor"
import { SystemPromptEditor } from "./system-prompt-editor"
import { AgentCustomVariablesSection } from "./agent-custom-variables-section"
import { useActiveKnowledgeDocuments } from "@/lib/hooks/use-workspace-knowledge-base"
import { useAvailablePhoneNumbers } from "@/lib/hooks/use-workspace-agents"
import { useWorkspaceSettings, useWorkspaceCustomVariables } from "@/lib/hooks/use-workspace-settings"
import { toast } from "sonner"
import {
  getVoicesForProvider,
  getDefaultVoice,
  getVoiceCardColor,
  type VoiceOption,
} from "@/lib/voice"
import { useRetellVoices } from "@/lib/hooks/use-retell-voices"
import type { RetellVoice } from "@/lib/integrations/retell/voices"

// ============================================================================
// TYPES
// ============================================================================

interface VoiceFilters {
  search: string
  gender: "all" | "Male" | "Female"
  accent: string // "all" or specific accent
}

interface AgentWizardProps {
  onSubmit: (data: CreateWorkspaceAgentInput) => Promise<void>
  isSubmitting: boolean
  onCancel: () => void
}

interface WizardFormData {
  // Step 1: Basic Info
  name: string
  description: string
  provider: "vapi" | "retell"
  language: string
  // Agent Direction
  agentDirection: AgentDirection
  allowOutbound: boolean // For inbound agents, allow outbound campaigns
  // Phone Number Assignment
  enablePhoneNumber: boolean
  phoneNumberId: string | null
  // Knowledge Base
  enableKnowledgeBase: boolean
  knowledgeDocumentIds: string[]
  // Voice Configuration
  enableVoice: boolean
  voice: string
  voiceSpeed: number
  // Step 2: Prompts & Tools
  systemPrompt: string
  greeting: string
  style: "formal" | "friendly" | "casual"
  tools: FunctionTool[]
  // Agent-level custom variables
  agentCustomVariables: AgentCustomVariableDefinition[]
  // Calendar Settings (for calendar tools) - matches CalendarToolSettings
  calendarSettings: {
    slot_duration_minutes: number
    buffer_between_slots_minutes: number
    preferred_days: ("SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY")[]
    preferred_hours_start: string
    preferred_hours_end: string
    timezone: string
    min_notice_hours: number
    max_advance_days: number
  }
}

// Knowledge document type icons
const documentTypeIcons: Record<
  KnowledgeDocumentType,
  React.ComponentType<{ className?: string }>
> = {
  document: FileText,
  faq: HelpCircle,
  product_info: ShoppingBag,
  policy: FileCheck,
  script: Scroll,
  other: FileQuestion,
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PROVIDERS = [
  {
    id: "vapi",
    name: "Vapi",
    description: "Advanced voice AI with low latency",
    badge: "Recommended",
    color: "bg-purple-100 dark:bg-purple-900/30",
    textColor: "text-purple-600",
  },
  {
    id: "retell",
    name: "Retell",
    description: "Human-like voice synthesis",
    badge: "Natural voices",
    color: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-600",
  },
]

const LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
]

const PROMPT_TEMPLATES = {
  support: `You are a helpful customer support agent for [Company Name]. Your goal is to assist customers with their inquiries in a friendly and professional manner.

Guidelines:
- Always greet the customer warmly
- Listen carefully to their concerns
- Provide accurate and helpful information
- Escalate complex issues when necessary
- End calls with a summary and next steps

Key information:
- Company hours: Monday-Friday, 9 AM - 6 PM
- Support email: support@company.com`,

  sales: `You are a sales representative for [Company Name]. Your goal is to qualify leads and schedule appointments with the sales team.

Objectives:
- Understand the prospect's needs
- Qualify based on budget, authority, need, and timeline
- Highlight key product benefits
- Schedule demos or callbacks for qualified leads
- Collect contact information for follow-up

Remember to be enthusiastic but not pushy.`,

  booking: `You are an appointment scheduling assistant for [Company Name]. Help customers book, reschedule, or cancel appointments.

Capabilities:
- Check calendar availability
- Book new appointments
- Reschedule existing appointments
- Cancel appointments
- Send confirmation details

Always verify the customer's identity and confirm appointment details before finalizing.`,
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AgentWizard({ onSubmit, isSubmitting, onCancel }: AgentWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = 2

  // Get workspace settings to access workspace ID for webhook URL
  const { data: workspace } = useWorkspaceSettings()
  const workspaceId = workspace?.id || ""

  // Get initial default voice for VAPI
  const initialDefaultVoice = getDefaultVoice("vapi")

  const [formData, setFormData] = useState<WizardFormData>({
    name: "",
    description: "",
    provider: "vapi",
    language: "en-US",
    agentDirection: "inbound",
    allowOutbound: false,
    enablePhoneNumber: true, // Phone numbers shown directly now
    phoneNumberId: null,
    enableKnowledgeBase: false,
    knowledgeDocumentIds: [],
    enableVoice: true, // Voice is always enabled - shown directly
    voice: "", // Empty until user selects
    voiceSpeed: 1,
    systemPrompt: "",
    greeting: "Hello! Thank you for calling. How can I help you today?",
    style: "friendly",
    tools: [],
    agentCustomVariables: [],
    calendarSettings: {
      slot_duration_minutes: 30,
      buffer_between_slots_minutes: 0,
      preferred_days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      preferred_hours_start: "09:00",
      preferred_hours_end: "17:00",
      timezone: "America/New_York",
      min_notice_hours: 1,
      max_advance_days: 60,
    },
  })

  // Fetch Retell voices dynamically
  const { 
    data: retellVoicesData, 
    isLoading: isLoadingRetellVoices,
    error: retellVoicesError 
  } = useRetellVoices()

  // Get available voices based on selected provider
  // For Retell: use dynamically fetched voices, for VAPI: use static list
  const availableVoices = formData.provider === "retell" 
    ? (retellVoicesData?.voices || [])
    : getVoicesForProvider(formData.provider)

  // State for audio preview
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null)

  // Fetch knowledge documents for selection
  const {
    data: knowledgeDocsData,
    isLoading: isLoadingDocs,
    error: docsError,
  } = useActiveKnowledgeDocuments()

  // Fetch available phone numbers for assignment
  // Filter by provider to only show numbers synced to the selected provider
  // VAPI agents can only use VAPI-synced numbers, Retell agents can only use Retell-synced numbers
  const { data: availablePhoneNumbers, isLoading: isLoadingPhoneNumbers } =
    useAvailablePhoneNumbers({ provider: formData.provider })

  // Fetch workspace custom variables
  const { customVariables: workspaceCustomVariables } = useWorkspaceCustomVariables()

  // Combine standard and workspace custom variables for display
  const allAvailableVariables = [
    ...STANDARD_CAMPAIGN_VARIABLES.map((v, i) => ({
      ...v,
      id: `standard-${i}`,
      created_at: new Date().toISOString(),
      is_standard: true,
    })),
    ...workspaceCustomVariables,
  ]

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isVoiceListOpen, setIsVoiceListOpen] = useState(false)

  // Voice filter state
  const [voiceFilters, setVoiceFilters] = useState<VoiceFilters>({
    search: "",
    gender: "all",
    accent: "all",
  })

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

  // Get filtered voices and available accents
  const filteredVoices = filterVoices(availableVoices)
  const availableAccents = getAvailableAccents(availableVoices)
  const hasActiveFilters = voiceFilters.search !== "" || 
    voiceFilters.gender !== "all" || 
    voiceFilters.accent !== "all"
  
  // Reset accent filter if the selected accent is no longer available
  if (voiceFilters.accent !== "all" && !availableAccents.includes(voiceFilters.accent)) {
    setVoiceFilters((prev) => ({ ...prev, accent: "all" }))
  }

  // ============================================================================
  // AUDIO PREVIEW HANDLERS
  // ============================================================================

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

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.name.trim()) {
        newErrors.name = "Agent name is required"
      } else if (formData.name.trim().length > 40) {
        newErrors.name = "Agent name must be 40 characters or less"
      }
      // Voice is required
      if (!formData.enableVoice) {
        newErrors.voice = "Voice configuration is required"
      } else if (!formData.voice) {
        newErrors.voice = "Please select a voice for your agent"
      }
    }

    if (step === 2) {
      if (!formData.systemPrompt.trim()) {
        newErrors.systemPrompt = "System prompt is required"
      }
      // Initial greeting is only required for INBOUND agents
      // For OUTBOUND agents, the agent waits for the recipient to speak first
      if (formData.agentDirection !== "outbound" && !formData.greeting.trim()) {
        newErrors.greeting = "Initial greeting is required"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  // Ref for scrolling to top of wizard
  const wizardTopRef = useRef<HTMLDivElement>(null)

  // Scroll to top when step changes
  useEffect(() => {
    // Small delay to ensure DOM is updated before scrolling
    const timer = setTimeout(() => {
      wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => clearTimeout(timer)
  }, [currentStep])

  const nextStep = () => {
    if (!validateStep(currentStep)) return
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  const updateFormData = <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => {
    setFormData((prev) => {
      const updated = { ...prev, [key]: value }

      // When provider changes, reset voice selection and open voice list
      if (key === "provider") {
        updated.voice = "" // Reset voice, user must select again
        setIsVoiceListOpen(false) // Reset list state
      }

      // When voice toggle is disabled, reset voice
      if (key === "enableVoice" && value === false) {
        updated.voice = ""
      }

      return updated
    })
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const applyTemplate = (templateKey: keyof typeof PROMPT_TEMPLATES) => {
    updateFormData("systemPrompt", PROMPT_TEMPLATES[templateKey])
  }

  // ============================================================================
  // SUBMIT
  // ============================================================================

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    const tools =
      formData.tools.length > 0 ? functionToolsArraySchema.parse(formData.tools) : undefined

    // Check if agent has calendar tools
    const calendarToolNames = ["book_appointment", "cancel_appointment", "reschedule_appointment"]
    const hasCalendarTools = formData.tools.some(t => calendarToolNames.includes(t.name))

    // Map wizard data to API schema
    const apiData: CreateWorkspaceAgentInput = {
      name: formData.name,
      description: formData.description || undefined,
      provider: formData.provider,
      voice_provider: "elevenlabs", // Default
      model_provider: "openai", // Default
      transcriber_provider: "deepgram", // Default
      // Agent direction and telephony
      agent_direction: formData.agentDirection,
      allow_outbound: formData.agentDirection === "inbound" ? formData.allowOutbound : undefined,
      assigned_phone_number_id: formData.enablePhoneNumber ? formData.phoneNumberId : undefined,
      config: {
        system_prompt: formData.systemPrompt,
        // For OUTBOUND agents, don't send first_message so the agent waits for recipient to speak first
        first_message: formData.agentDirection === "outbound" ? undefined : formData.greeting,
        voice_id: formData.voice,
        voice_settings: {
          speed: formData.voiceSpeed,
        },
        // Include function tools if any are configured
        tools,
        // Include knowledge base configuration
        knowledge_base: formData.enableKnowledgeBase
          ? {
              enabled: true,
              document_ids: formData.knowledgeDocumentIds,
              injection_mode: "system_prompt",
            }
          : undefined,
        // Include agent-level custom variables
        custom_variables: formData.agentCustomVariables.length > 0 
          ? formData.agentCustomVariables 
          : undefined,
        // Include calendar settings if agent has calendar tools (for auto-setup)
        calendar_settings: hasCalendarTools ? formData.calendarSettings : undefined,
      },
      agent_secret_api_key: [],
      agent_public_api_key: [],
      is_active: true,
      tags: [],
      // Include knowledge document IDs for linking
      knowledge_document_ids: formData.enableKnowledgeBase ? formData.knowledgeDocumentIds : [],
    }

    await onSubmit(apiData)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Scroll anchor for navigation */}
      <div ref={wizardTopRef} />
      
      {/* Progress Steps */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {/* Step 1 */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  currentStep > 1
                    ? "bg-green-500 text-white"
                    : currentStep === 1
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {currentStep > 1 ? <Check className="w-3 h-3" /> : "1"}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  currentStep === 1 ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Setup & Voice
              </span>
            </div>

            <div
              className={cn("flex-1 h-0.5 mx-4", currentStep > 1 ? "bg-green-500" : "bg-border")}
            />

            {/* Step 2 */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  currentStep === 2
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                2
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  currentStep === 2 ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Prompts & Tools
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs">
                Step 1 of 2
              </Badge>
            </div>
            <CardTitle>Basic Information & Voice</CardTitle>
            <CardDescription>
              Set up your agent's identity, configuration, and voice
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Agent Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Agent Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  const value = e.target.value
                  if (value.length <= 40) {
                    updateFormData("name", value)
                  }
                }}
                placeholder="e.g., Customer Support Bot"
                maxLength={40}
                className={errors.name ? "border-destructive" : ""}
              />
              <div className="flex justify-between items-center">
                {errors.name ? (
                  <p className="text-sm text-destructive">{errors.name}</p>
                ) : (
                  <span />
                )}
                <span className={cn(
                  "text-xs",
                  formData.name.length >= 35 ? "text-amber-500" : "text-muted-foreground",
                  formData.name.length >= 40 && "text-destructive"
                )}>
                  {formData.name.length}/40
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => updateFormData("description", e.target.value)}
                placeholder="Describe what this agent does..."
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Brief description of the agent's purpose and capabilities
              </p>
            </div>

            {/* Provider Selection */}
            <div className="space-y-3">
              <Label>
                Voice Provider <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.id}
                    onClick={() =>
                      updateFormData("provider", provider.id as WizardFormData["provider"])
                    }
                    className={cn(
                      "relative p-4 rounded-lg border-2 cursor-pointer transition-all",
                      formData.provider === provider.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <Badge className="absolute top-2 right-2 text-[10px]" variant="secondary">
                      {provider.badge}
                    </Badge>
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          provider.color
                        )}
                      >
                        <span className={cn("font-bold", provider.textColor)}>
                          {provider.name[0]}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold">{provider.name}</h4>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{provider.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label>
                Language <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.language}
                onValueChange={(v) => updateFormData("language", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Agent Direction Selection */}
            <div className="space-y-4">
              <Label>
                Agent Direction <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground -mt-2">
                Choose the primary purpose of this agent
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        updateFormData("agentDirection", direction.value)
                      }}
                      className={cn(
                        "relative p-4 rounded-lg border-2 cursor-pointer transition-all",
                        formData.agentDirection === direction.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            direction.color
                          )}
                        >
                          <Icon className={cn("w-5 h-5", direction.iconColor)} />
                        </div>
                        <h4 className="font-semibold">{direction.label}</h4>
                      </div>
                      <p className="text-xs text-muted-foreground">{direction.description}</p>
                    </div>
                  )
                })}
              </div>

              {/* Allow Outbound Toggle for Inbound Agents */}
              {formData.agentDirection === "inbound" && (
                <div className="ml-4 pl-4 border-l-2 border-primary/20">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label className="mb-0">Allow Outbound Campaigns</Label>
                      <p className="text-xs text-muted-foreground">
                        Enable this agent to also make outbound calls in campaigns
                      </p>
                    </div>
                    <Switch
                      checked={formData.allowOutbound}
                      onCheckedChange={(checked) => updateFormData("allowOutbound", checked)}
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Voice Configuration - MOVED TO FIRST (before phone number & knowledge base) */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Volume2 className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <Label className="mb-0">
                    Voice Configuration <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">Choose the voice for your agent</p>
                </div>
              </div>

              {/* Voice Selection - Always visible */}
              <div className="space-y-4">
                  {errors.voice && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {errors.voice}
                    </div>
                  )}

                  {/* Selected Voice Display */}
                  {formData.voice && !isVoiceListOpen && (
                    <div className="space-y-3">
                      {(() => {
                        // Find selected voice - check both id AND providerId (for VAPI ElevenLabs voices)
                        const selectedVoice = availableVoices.find(
                          (v: VoiceOption | RetellVoice) => {
                            if (v.id === formData.voice) return true
                            // For VAPI voices, also check the providerId (ElevenLabs ID)
                            if ('providerId' in v && (v as VoiceOption).providerId === formData.voice) return true
                            return false
                          }
                        )
                        if (!selectedVoice) return null
                        const colors = getVoiceCardColor(selectedVoice.gender)
                        const isRetellVoice = formData.provider === "retell"
                        const retellVoice = isRetellVoice ? (selectedVoice as RetellVoice) : null
                        const vapiVoice = !isRetellVoice ? (selectedVoice as VoiceOption) : null
                        const isPlaying = playingVoiceId === selectedVoice.id

                        return (
                          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                                  colors.bg
                                )}
                              >
                                <span className={cn("font-semibold text-lg", colors.text)}>
                                  {selectedVoice.name[0]}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-semibold">{selectedVoice.name}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {selectedVoice.gender}
                                  </Badge>
                                  <Check className="h-4 w-4 text-green-600 ml-auto" />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {selectedVoice.accent} • {isRetellVoice ? `Age: ${retellVoice?.age}` : `Age ${vapiVoice?.age}`}
                                </p>
                                {vapiVoice?.characteristics && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {vapiVoice.characteristics}
                                  </p>
                                )}
                                {isRetellVoice && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Provider: ElevenLabs
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                              {/* Audio Preview Button for selected voice */}
                              {(() => {
                                const previewUrl = isRetellVoice 
                                  ? retellVoice?.previewAudioUrl 
                                  : vapiVoice?.previewUrl
                                if (!previewUrl) return null
                                return (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => playVoicePreview(selectedVoice.id, previewUrl)}
                                    className={cn(
                                      isPlaying && "bg-primary text-primary-foreground"
                                    )}
                                  >
                                    {isPlaying ? (
                                      <>
                                        <Volume2 className="h-4 w-4 mr-1 animate-pulse" />
                                        Playing...
                                      </>
                                    ) : (
                                      <>
                                        <Play className="h-4 w-4 mr-1" />
                                        Preview Voice
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
                        )
                      })()}

                      {/* Voice Speed */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Voice Speed</Label>
                        <Select
                          value={String(formData.voiceSpeed)}
                          onValueChange={(v) => updateFormData("voiceSpeed", parseFloat(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.8">Slow</SelectItem>
                            <SelectItem value="1">Balanced</SelectItem>
                            <SelectItem value="1.2">Fast</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Controls how fast the agent speaks
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Voice List (shown when no voice selected or editing) */}
                  {(!formData.voice || isVoiceListOpen) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          Select Voice ({formData.provider === "vapi" ? "Vapi" : "Retell"})
                        </Label>
                        {isVoiceListOpen && formData.voice && (
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
                              {filteredVoices.length}
                            </span>
                            <span>of {availableVoices.length} voices</span>
                          </div>
                        </div>
                      </div>

                      {/* Loading state for Retell voices */}
                      {formData.provider === "retell" && isLoadingRetellVoices && (
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
                      {formData.provider === "retell" && retellVoicesError && (
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
                      {!(formData.provider === "retell" && isLoadingRetellVoices) && 
                       !(formData.provider === "retell" && retellVoicesError) && (
                        <>
                          {/* No results state */}
                          {filteredVoices.length === 0 && hasActiveFilters && (
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
                          {filteredVoices.length > 0 && (
                            <ScrollArea
                              className={cn(
                                "rounded-lg border p-2",
                                filteredVoices.length <= 3 ? "h-auto" : "h-[320px]"
                              )}
                            >
                              <div className="space-y-2">
                                {filteredVoices.map((voice: VoiceOption | RetellVoice) => {
                                  const colors = getVoiceCardColor(voice.gender)
                                  const isRetellVoice = formData.provider === "retell"
                                  const retellVoice = isRetellVoice ? (voice as RetellVoice) : null
                                  const vapiVoice = !isRetellVoice ? (voice as VoiceOption) : null
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
                                            {isRetellVoice ? `Age: ${retellVoice?.age}` : `Age ${vapiVoice?.age}`}
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
                                            const previewUrl = isRetellVoice 
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
                                              updateFormData("voice", voice.id)
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
                          {filteredVoices.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {hasActiveFilters ? (
                                <>
                                  Showing <span className="font-medium">{filteredVoices.length}</span> of{" "}
                                  <span className="font-medium">{availableVoices.length}</span> voices
                                </>
                              ) : (
                                <>
                                  {availableVoices.length} voice{availableVoices.length !== 1 ? "s" : ""}{" "}
                                  available for {formData.provider === "vapi" ? "Vapi" : "Retell"}
                                  {formData.provider === "retell" && " (ElevenLabs)"}
                                </>
                              )}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
              </div>
            </div>

            <Separator />

            {/* Knowledge Base Toggle */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <Label className="mb-0">Knowledge Base</Label>
                    <p className="text-xs text-muted-foreground">
                      Connect documents to give your agent context
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.enableKnowledgeBase}
                  onCheckedChange={(checked) => {
                    updateFormData("enableKnowledgeBase", checked)
                    if (!checked) {
                      updateFormData("knowledgeDocumentIds", [])
                    }
                  }}
                />
              </div>

              {/* Knowledge Document Selection */}
              {formData.enableKnowledgeBase && (
                <div className="ml-13 pl-4 border-l-2 border-primary/20">
                  {isLoadingDocs ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : docsError ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4" />
                      Failed to load documents
                    </div>
                  ) : knowledgeDocsData?.data && knowledgeDocsData.data.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Select Documents</Label>
                      <ScrollArea className="h-[200px] rounded-lg border p-2">
                        <div className="space-y-1">
                          {knowledgeDocsData.data.map((doc: KnowledgeDocument) => {
                            const DocIcon = documentTypeIcons[doc.document_type] || FileText
                            const isSelected = formData.knowledgeDocumentIds.includes(doc.id)

                            return (
                              <div
                                key={doc.id}
                                className={cn(
                                  "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                                  isSelected
                                    ? "bg-primary/10 border border-primary/30"
                                    : "hover:bg-muted"
                                )}
                                onClick={() => {
                                  if (isSelected) {
                                    updateFormData(
                                      "knowledgeDocumentIds",
                                      formData.knowledgeDocumentIds.filter((id) => id !== doc.id)
                                    )
                                  } else {
                                    updateFormData("knowledgeDocumentIds", [
                                      ...formData.knowledgeDocumentIds,
                                      doc.id,
                                    ])
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => {}}
                                  className="pointer-events-none"
                                />
                                <DocIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{doc.title}</p>
                                  {doc.description && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {doc.description}
                                    </p>
                                  )}
                                </div>
                                {doc.category && (
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    {doc.category}
                                  </Badge>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </ScrollArea>
                      <p className="text-xs text-muted-foreground">
                        {formData.knowledgeDocumentIds.length} document
                        {formData.knowledgeDocumentIds.length !== 1 ? "s" : ""} selected
                      </p>
                    </div>
                  ) : (
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No documents available</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Create documents in the Knowledge Base section first
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Phone Number Assignment - For all agent directions */}
            {(formData.agentDirection === "inbound" || formData.agentDirection === "outbound") && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <Label className="mb-0">Phone Number</Label>
                    <p className="text-xs text-muted-foreground">
                      {formData.agentDirection === "outbound"
                        ? "Select caller ID for outbound calls (optional)"
                        : "Assign a phone number for inbound calls (optional)"}
                    </p>
                  </div>
                </div>

                {/* Phone Number Selection - Always visible */}
                <div className="space-y-2">
                  {isLoadingPhoneNumbers ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : availablePhoneNumbers && availablePhoneNumbers.length > 0 ? (
                    <>
                      <Label className="text-sm font-medium">
                        {formData.agentDirection === "outbound"
                          ? "Select Caller ID"
                          : "Select Phone Number"}
                      </Label>
                      <ScrollArea className={cn(
                        "rounded-lg border p-2",
                        availablePhoneNumbers.length <= 3 ? "h-auto" : "h-[200px]"
                      )}>
                        <div className="space-y-2">
                          {/* None option */}
                          <div
                            onClick={() => updateFormData("phoneNumberId", null)}
                            className={cn(
                              "p-3 rounded-lg cursor-pointer transition-all border",
                              !formData.phoneNumberId
                                ? "border-primary bg-primary/5"
                                : "border-transparent hover:bg-muted hover:border-border"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm">No phone number</p>
                                <p className="text-xs text-muted-foreground">
                                  Skip phone number assignment
                                </p>
                              </div>
                              {!formData.phoneNumberId && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                          
                          {availablePhoneNumbers.map((number) => {
                            const isSelected = formData.phoneNumberId === number.id
                            return (
                              <div
                                key={number.id}
                                onClick={() => updateFormData("phoneNumberId", number.id)}
                                className={cn(
                                  "p-3 rounded-lg cursor-pointer transition-all border",
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-transparent hover:bg-muted hover:border-border"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center",
                                    isSelected 
                                      ? "bg-green-500/20" 
                                      : "bg-green-500/10"
                                  )}>
                                    <Phone className={cn(
                                      "h-4 w-4",
                                      isSelected ? "text-green-600" : "text-green-500"
                                    )} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-mono font-medium text-sm">
                                        {number.phone_number}
                                      </p>
                                      {number.country_code && (
                                        <Badge variant="outline" className="text-xs">
                                          {number.country_code}
                                        </Badge>
                                      )}
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
                                    {number.friendly_name && (
                                      <p className="text-xs text-muted-foreground truncate">
                                        {number.friendly_name}
                                      </p>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <Check className="h-4 w-4 text-primary shrink-0" />
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </ScrollArea>
                      <p className="text-xs text-muted-foreground">
                        {availablePhoneNumbers.length} {formData.provider.toUpperCase()} number
                        {availablePhoneNumbers.length !== 1 ? "s" : ""} available
                      </p>
                    </>
                  ) : (
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <Phone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No {formData.provider.toUpperCase()} phone numbers available
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formData.provider === "retell" 
                          ? "Sync phone numbers to Retell in Organization → Telephony, or use a Retell-purchased number"
                          : "Sync phone numbers to VAPI in Organization → Telephony"
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs">
                  Step 2 of 2
                </Badge>
              </div>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>Define how your agent should behave and respond</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* System Prompt with Fullscreen & Autocomplete */}
              <SystemPromptEditor
                value={formData.systemPrompt}
                onChange={(value) => updateFormData("systemPrompt", value)}
                placeholder="You are a helpful customer support agent for [Company Name]..."
                error={errors.systemPrompt}
                required
                customVariables={workspaceCustomVariables}
                agentCustomVariables={formData.agentCustomVariables}
                showTemplates
                onApplyTemplate={applyTemplate}
              />

              {/* Initial Greeting - Only show for INBOUND agents */}
              {/* For OUTBOUND agents, the agent waits for the recipient to speak first */}
              {formData.agentDirection !== "outbound" && (
                <div className="space-y-2">
                  <Label>
                    Initial Greeting <span className="text-destructive">*</span>
                  </Label>
                  <textarea
                    value={formData.greeting}
                    onChange={(e) => updateFormData("greeting", e.target.value)}
                    placeholder="Hello! Thank you for calling. How can I help you today?"
                    className={cn(
                      "w-full min-h-[60px] px-3 py-2 text-sm rounded-md border bg-background resize-y",
                      errors.greeting ? "border-destructive" : "border-input"
                    )}
                    rows={2}
                  />
                  {errors.greeting && <p className="text-sm text-destructive">{errors.greeting}</p>}
                </div>
              )}

              {/* Outbound Agent Info Banner */}
              {formData.agentDirection === "outbound" && (
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        Outbound Agent Behavior
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        For outbound calls, the agent will wait for the recipient to speak first 
                        (e.g., "Hello?") before responding according to the system prompt instructions.
                        No initial greeting is needed.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook URL - For Retell and VAPI (Read-Only, Auto-Generated) */}
          {(formData.provider === "retell" || formData.provider === "vapi") && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Webhook URL
                </CardTitle>
                <CardDescription>
                  Auto-generated endpoint that receives call events from{" "}
                  {formData.provider === "retell" ? "Retell" : "VAPI"}.
                  This URL is configured automatically when the agent syncs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://genius365.vercel.app").replace(/\/$/, "")
                  const webhookUrl = `${baseUrl}/api/webhooks/w/${workspaceId}/${formData.provider}`
                  return (
                    <>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            value={webhookUrl}
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
                            navigator.clipboard.writeText(webhookUrl)
                            toast.success("Webhook URL copied!")
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        This URL cannot be edited. It will be automatically configured with {formData.provider === "retell" ? "Retell" : "VAPI"} when the agent is created.
                      </p>
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          )}

          {/* Tools Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Function Tools
              </CardTitle>
              <CardDescription>Add tools to extend your agent's capabilities.</CardDescription>
            </CardHeader>
            <CardContent>
              <FunctionToolEditor
                tools={formData.tools}
                onChange={(tools) => updateFormData("tools", tools)}
                provider={formData.provider}
                calendarSettings={formData.calendarSettings}
                onCalendarSettingsChange={(settings) => updateFormData("calendarSettings", settings)}
              />
            </CardContent>
          </Card>

          {/* Available Variables Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Variable className="w-5 h-5" />
                Available Variables
              </CardTitle>
              <CardDescription>
                Use these variables in your system prompt with {"{{variable_name}}"} syntax.
                Click a variable to copy it to your clipboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info Banner */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">How Variables Work</p>
                  <p>
                    When running campaigns, these variables will be replaced with recipient-specific
                    data from your CSV import. For example, {"{{first_name}}"} becomes "John" for
                    each recipient.
                  </p>
                </div>
              </div>

              {/* Variables Grid */}
              <div className="space-y-3">
                {/* Standard Variables */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Standard Variables</Label>
                  <div className="flex flex-wrap gap-2">
                    {allAvailableVariables
                      .filter((v) => v.is_standard)
                      .map((variable) => (
                        <Button
                          key={variable.id}
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="font-mono text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(`{{${variable.name}}}`)
                            toast.success(`Copied {{${variable.name}}} to clipboard`)
                          }}
                          title={variable.description}
                        >
                          <Lock className="h-3 w-3 mr-1 text-muted-foreground" />
                          {`{{${variable.name}}}`}
                        </Button>
                      ))}
                  </div>
                </div>

                {/* Custom Variables */}
                {workspaceCustomVariables.length > 0 && (
                  <div className="pt-3 border-t">
                    <Label className="text-xs text-muted-foreground mb-2 block">Custom Variables</Label>
                    <div className="flex flex-wrap gap-2">
                      {workspaceCustomVariables.map((variable) => (
                        <Button
                          key={variable.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-mono text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(`{{${variable.name}}}`)
                            toast.success(`Copied {{${variable.name}}} to clipboard`)
                          }}
                          title={variable.description}
                        >
                          {`{{${variable.name}}}`}
                          <Copy className="h-3 w-3 ml-1 text-muted-foreground" />
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* No custom variables message */}
                {workspaceCustomVariables.length === 0 && (
                  <div className="pt-3 border-t">
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <Variable className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No workspace custom variables defined</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Add custom variables in Workspace Settings → Custom Variables
                      </p>
                    </div>
                  </div>
                )}

                {/* Agent-Specific Variables */}
                {formData.agentCustomVariables.length > 0 && (
                  <div className="pt-3 border-t">
                    <Label className="text-xs text-muted-foreground mb-2 block">Agent-Specific Variables</Label>
                    <div className="flex flex-wrap gap-2">
                      {formData.agentCustomVariables.map((variable) => (
                        <Button
                          key={variable.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-mono text-xs border-amber-500/50 text-amber-600 dark:text-amber-400"
                          onClick={() => {
                            navigator.clipboard.writeText(`{{${variable.name}}}`)
                            toast.success(`Copied {{${variable.name}}} to clipboard`)
                          }}
                          title={variable.description}
                        >
                          {`{{${variable.name}}}`}
                          <Copy className="h-3 w-3 ml-1 text-muted-foreground" />
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Agent Custom Variables Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Variable className="w-5 h-5" />
                Agent-Specific Variables
              </CardTitle>
              <CardDescription>
                Define custom variables unique to this agent. These are separate from workspace-level variables.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentCustomVariablesSection
                variables={formData.agentCustomVariables}
                onChange={(variables) => updateFormData("agentCustomVariables", variables)}
                compact
              />
            </CardContent>
          </Card>

          {/* Review Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Review & Create</CardTitle>
              <CardDescription>Review your agent configuration before creating</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Agent Name</p>
                  <p className="font-medium">{formData.name || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Provider</p>
                  <p className="font-medium capitalize">{formData.provider}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Direction</p>
                  <p className="font-medium capitalize">
                    {formData.agentDirection}
                    {formData.agentDirection === "inbound" &&
                      formData.allowOutbound &&
                      " (+outbound)"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Language</p>
                  <p className="font-medium">
                    {LANGUAGES.find((l) => l.value === formData.language)?.label || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Voice</p>
                  <p className="font-medium">
                    {availableVoices.find((v) => {
                      if (v.id === formData.voice) return true
                      if ('providerId' in v && (v as VoiceOption).providerId === formData.voice) return true
                      return false
                    })?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone Number</p>
                  <p className="font-medium">
                    {formData.phoneNumberId
                      ? availablePhoneNumbers?.find((p) => p.id === formData.phoneNumberId)
                          ?.phone_number || "Selected"
                      : formData.agentDirection === "outbound"
                        ? "N/A (Outbound)"
                        : "Not assigned"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Knowledge Base</p>
                  <p className="font-medium">
                    {formData.enableKnowledgeBase
                      ? `${formData.knowledgeDocumentIds.length} document${formData.knowledgeDocumentIds.length !== 1 ? "s" : ""} linked`
                      : "Not configured"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tools</p>
                  <p className="font-medium">
                    {formData.tools.length === 0
                      ? "No tools"
                      : `${formData.tools.length} tool${formData.tools.length > 1 ? "s" : ""}`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Workspace Variables</p>
                  <p className="font-medium">
                    {allAvailableVariables.length} available
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Agent Variables</p>
                  <p className="font-medium">
                    {formData.agentCustomVariables.length === 0
                      ? "None defined"
                      : `${formData.agentCustomVariables.length} defined`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        {currentStep > 1 ? (
          <Button type="button" variant="outline" onClick={prevStep}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}

        <div className="flex gap-2">
          {currentStep < totalSteps ? (
            <Button type="button" onClick={nextStep}>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Create Agent
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

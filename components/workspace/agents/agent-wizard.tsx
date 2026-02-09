"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
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
  Sparkles,
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
import { STANDARD_CAMPAIGN_VARIABLES, SYSTEM_VARIABLES } from "@/types/database.types"
import { FunctionToolEditor } from "./function-tool-editor"
import { SystemPromptEditor } from "./system-prompt-editor"
import { AgentCustomVariablesSection } from "./agent-custom-variables-section"
import { useActiveKnowledgeDocuments } from "@/lib/hooks/use-workspace-knowledge-base"
import { useAvailablePhoneNumbers } from "@/lib/hooks/use-workspace-agents"
import { useWorkspaceSettings, useWorkspaceCustomVariables } from "@/lib/hooks/use-workspace-settings"
import { toast } from "sonner"
import {
  getVoicesForProvider,
  getVoiceCardColor,
  type VoiceOption,
} from "@/lib/voice"
import { useRetellVoices } from "@/lib/hooks/use-retell-voices"
import { useElevenLabsVoices } from "@/lib/hooks/use-elevenlabs-voices"
import type { ElevenLabsVoice } from "@/lib/integrations/elevenlabs/voices"
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
  provider: "vapi" | "retell" | "inspra"
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
  // CRM/Webhook URL for call data forwarding
  crmWebhookUrl: string
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
    // Email notification settings
    enable_owner_email: boolean
    owner_email?: string
    // Calendar source settings (for using existing calendars)
    calendar_source: 'new' | 'existing'
    existing_calendar_id?: string
    existing_calendar_name?: string
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
    comingSoon: false,
  },
  {
    id: "retell",
    name: "Retell",
    description: "Human-like voice synthesis",
    badge: "Natural voices",
    color: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-600",
    comingSoon: false,
  },
  {
    id: "inspra",
    name: "Inspra",
    description: "Enterprise voice AI platform with Australian accents",
    badge: "Coming Soon",
    color: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600",
    comingSoon: true,
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
  
  // Get workspace slug from URL params
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  // Get workspace settings to access workspace ID for webhook URL
  const { data: workspace } = useWorkspaceSettings()
  const workspaceId = workspace?.id || ""

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
    crmWebhookUrl: "", // CRM/Webhook URL for call data forwarding
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
      timezone: "", // Empty - will be set to workspace timezone by CalendarToolsSelector
      min_notice_hours: 1,
      max_advance_days: 60,
      enable_owner_email: false,
      owner_email: undefined,
      calendar_source: 'new',
      existing_calendar_id: undefined,
      existing_calendar_name: undefined,
    },
  })

  // Fetch Retell voices dynamically
  const { 
    data: retellVoicesData, 
    isLoading: isLoadingRetellVoices,
    error: retellVoicesError 
  } = useRetellVoices()

  // Fetch ElevenLabs voices dynamically for VAPI
  const {
    data: elevenLabsVoicesData,
    isLoading: isLoadingElevenLabsVoices,
    error: elevenLabsVoicesError
  } = useElevenLabsVoices()

  // Get available voices based on selected provider
  // For Retell: use dynamically fetched Retell voices
  // For VAPI: use dynamically fetched ElevenLabs voices, fall back to static list
  const availableVoices = formData.provider === "retell" 
    ? (retellVoicesData?.voices || [])
    : formData.provider === "vapi"
      ? (elevenLabsVoicesData?.voices || getVoicesForProvider(formData.provider))
      : (formData.provider === "inspra" ? getVoicesForProvider("vapi") : [])
  
  // Track if voices are loading for the current provider
  const isLoadingVoices = formData.provider === "retell" 
    ? isLoadingRetellVoices 
    : formData.provider === "vapi" 
      ? isLoadingElevenLabsVoices 
      : false
  
  // Track voice loading errors for the current provider
  const voicesError = formData.provider === "retell"
    ? retellVoicesError
    : formData.provider === "vapi"
      ? elevenLabsVoicesError
      : null

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

  // System variables (auto-generated at runtime)
  const systemVariables = SYSTEM_VARIABLES.map((v, i) => ({
    ...v,
    id: `system-${i}`,
    created_at: new Date().toISOString(),
    is_system: true,
  }))

  // Combine standard and workspace custom variables for display
  const allAvailableVariables = [
    ...systemVariables,
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
  const filterVoicesForAccentDropdown = (voices: (VoiceOption | ElevenLabsVoice | RetellVoice)[]): (VoiceOption | ElevenLabsVoice | RetellVoice)[] => {
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
  const filterVoices = (voices: (VoiceOption | ElevenLabsVoice | RetellVoice)[]): (VoiceOption | ElevenLabsVoice | RetellVoice)[] => {
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
  const getAvailableAccents = (voices: (VoiceOption | ElevenLabsVoice | RetellVoice)[]): string[] => {
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
      // Block Inspra provider (coming soon)
      if (formData.provider === "inspra") {
        newErrors.provider = "Inspra integration is coming soon. Please select VAPI or Retell to continue."
        toast.info("Inspra integration is coming soon!")
        return false
      }
      // Voice is required
      if (!formData.enableVoice) {
        newErrors.voice = "Voice configuration is required"
      } else if (!formData.voice) {
        newErrors.voice = "Please select a voice for your agent"
      }
      // Phone number is required for inbound agents to receive calls
      if (formData.agentDirection === "inbound" && !formData.phoneNumberId) {
        newErrors.phoneNumber = "Phone number is required for inbound agents to receive calls"
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
    
    // Clear related errors
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
    
    // Clear phoneNumber error when phoneNumberId is updated
    if (key === "phoneNumberId" && errors.phoneNumber) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next.phoneNumber
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
      provider: (formData.provider === "inspra" ? "vapi" : formData.provider) as "vapi" | "retell",
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
        // Include CRM webhook URL if provided
        crm_webhook_url: formData.crmWebhookUrl || undefined,
      },
      agent_secret_api_key: [],
      agent_public_api_key: [],
      is_active: true,
      tags: [],
      // Include knowledge document IDs for linking
      knowledge_document_ids: formData.enableKnowledgeBase ? formData.knowledgeDocumentIds : [],
    }

    // Debug log calendar settings
    if (hasCalendarTools) {
      console.log('[AgentWizard] Submitting with calendarSettings:', JSON.stringify(formData.calendarSettings, null, 2))
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
                    onClick={() => {
                      // Allow selection even for coming soon (to show the placeholder)
                      updateFormData("provider", provider.id as WizardFormData["provider"])
                    }}
                    className={cn(
                      "relative p-4 rounded-lg border-2 cursor-pointer transition-all",
                      formData.provider === provider.id
                        ? provider.comingSoon
                          ? "border-emerald-500 bg-emerald-500/5"
                          : "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50",
                      provider.comingSoon && "opacity-90"
                    )}
                  >
                    <Badge 
                      className={cn(
                        "absolute top-2 right-2 text-[10px]",
                        provider.comingSoon && "bg-emerald-500/20 text-emerald-600 border-emerald-500/30"
                      )} 
                      variant={provider.comingSoon ? "outline" : "secondary"}
                    >
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

            {/* Provider Error */}
            {errors.provider && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-sm">{errors.provider}</p>
              </div>
            )}

            {/* Inspra Coming Soon Banner */}
            {formData.provider === "inspra" && (
              <div className="p-6 rounded-xl bg-linear-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border-2 border-emerald-500/30">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <span className="text-2xl font-bold text-white">I</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                        Inspra Voice AI
                      </h3>
                      <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                        Coming Soon
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Enterprise-ready voice AI platform with natural-sounding Australian accents, 
                      24/7 automated phone handling, and up to 40% increase in conversion rates.
                    </p>
                    
                    {/* Key Features */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <span>Australian Accents</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <span>24/7 Operations</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <span>Lead Qualification</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                        <span>Smart Dashboard</span>
                      </div>
                    </div>

                    {/* Use Cases */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge variant="outline" className="text-xs">Real Estate</Badge>
                      <Badge variant="outline" className="text-xs">Law Firms</Badge>
                      <Badge variant="outline" className="text-xs">Dental Practices</Badge>
                      <Badge variant="outline" className="text-xs">Plumbing Services</Badge>
                      <Badge variant="outline" className="text-xs">Sales</Badge>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                        onClick={() => window.open("https://inspra.ai", "_blank")}
                      >
                        <Globe className="w-4 h-4 mr-2" />
                        Learn More at inspra.ai
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Integration coming in a future update
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Language - Only show for active providers */}
            {formData.provider !== "inspra" && (
              <>
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
                          (v: VoiceOption | ElevenLabsVoice | RetellVoice) => {
                            if (v.id === formData.voice) return true
                            // For VAPI voices, also check the providerId (ElevenLabs ID)
                            if ('providerId' in v && (v as VoiceOption).providerId === formData.voice) return true
                            return false
                          }
                        )
                        if (!selectedVoice) return null
                        // Handle "Unknown" gender safely for getVoiceCardColor
                        const voiceGender = selectedVoice.gender === "Unknown" ? "Male" : selectedVoice.gender
                        const colors = getVoiceCardColor(voiceGender)
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

                      {/* Loading state for voices (Retell or ElevenLabs) */}
                      {isLoadingVoices && (
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

                      {/* Error state for voices */}
                      {voicesError && !isLoadingVoices && (
                        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10">
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            <p className="text-sm font-medium">Failed to load voices</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {voicesError instanceof Error 
                              ? voicesError.message 
                              : formData.provider === "retell"
                                ? "Please ensure a Retell integration is configured for this workspace."
                                : "Please ensure an ElevenLabs API key is configured for this workspace."}
                          </p>
                        </div>
                      )}

                      {/* Voice list */}
                      {!isLoadingVoices && !voicesError && (
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
                                {filteredVoices.map((voice: VoiceOption | RetellVoice | ElevenLabsVoice) => {
                                  // Handle "Unknown" gender safely for getVoiceCardColor
                                  const voiceGender = voice.gender === "Unknown" ? "Male" : voice.gender
                                  const colors = getVoiceCardColor(voiceGender)
                                  const isRetellVoice = formData.provider === "retell"
                                  const isElevenLabsVoice = formData.provider === "vapi" && 'provider' in voice && voice.provider === "elevenlabs"
                                  const retellVoice = isRetellVoice ? (voice as RetellVoice) : null
                                  const elevenLabsVoice = isElevenLabsVoice ? (voice as ElevenLabsVoice) : null
                                  const vapiVoice = !isRetellVoice && !isElevenLabsVoice ? (voice as VoiceOption) : null
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
                                            {isRetellVoice 
                                              ? `Age: ${retellVoice?.age}` 
                                              : isElevenLabsVoice 
                                                ? `Age: ${elevenLabsVoice?.age}` 
                                                : `Age ${vapiVoice?.age}`}
                                          </p>
                                          {vapiVoice?.characteristics && (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                              {vapiVoice.characteristics}
                                            </p>
                                          )}
                                          {elevenLabsVoice?.description && (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                              {elevenLabsVoice.description}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {/* Audio Preview Button */}
                                          {(() => {
                                            const previewUrl = isRetellVoice 
                                              ? retellVoice?.previewAudioUrl 
                                              : isElevenLabsVoice
                                                ? elevenLabsVoice?.previewAudioUrl
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
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    errors.phoneNumber ? "bg-destructive/10" : "bg-green-500/10"
                  )}>
                    <Phone className={cn(
                      "w-5 h-5",
                      errors.phoneNumber ? "text-destructive" : "text-green-600"
                    )} />
                  </div>
                  <div>
                    <Label className="mb-0">
                      Phone Number {formData.agentDirection === "inbound" && <span className="text-destructive">*</span>}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {formData.agentDirection === "outbound"
                        ? "Select caller ID for outbound calls (optional)"
                        : "Assign a phone number to receive inbound calls"}
                    </p>
                  </div>
                </div>

                {/* Phone Number Error */}
                {errors.phoneNumber && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {errors.phoneNumber}
                  </div>
                )}

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
                          {/* None option - only show for outbound agents */}
                          {formData.agentDirection === "outbound" && (
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
                          )}
                          
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
                    <div className={cn(
                      "text-center p-4 rounded-lg",
                      formData.agentDirection === "inbound" 
                        ? "bg-destructive/10 border border-destructive/30" 
                        : "bg-muted/50"
                    )}>
                      <Phone className={cn(
                        "h-8 w-8 mx-auto mb-2",
                        formData.agentDirection === "inbound" ? "text-destructive" : "text-muted-foreground"
                      )} />
                      <p className={cn(
                        "text-sm",
                        formData.agentDirection === "inbound" ? "text-destructive font-medium" : "text-muted-foreground"
                      )}>
                        No {formData.provider.toUpperCase()} phone numbers available
                      </p>
                      {formData.agentDirection === "inbound" && (
                        <p className="text-xs text-destructive mt-1">
                          A phone number is required for inbound agents to receive calls
                        </p>
                      )}
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
              </>
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

          {/* CRM/Webhook URL for Call Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                CRM / Webhook URL
                <Badge variant="outline" className="text-xs font-normal">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Forward call data (transcript, summary, disposition, etc.) to your CRM, n8n, or any external system after each call ends.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="crm-webhook-url">Webhook URL</Label>
                <Input
                  id="crm-webhook-url"
                  type="url"
                  value={formData.crmWebhookUrl}
                  onChange={(e) => updateFormData("crmWebhookUrl", e.target.value)}
                  placeholder="https://your-crm.com/webhook or https://n8n.example.com/webhook/..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  When a call ends, we'll send a POST request with call details including: transcript, summary, duration, cost, sentiment, caller info, and recording URL.
                </p>
              </div>
              
              {/* Example payload preview */}
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs font-medium mb-2">Example payload sent to your webhook:</p>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`{
  "callId": "call_abc123",
  "agentName": "Sales Agent",
  "transcript": "Full conversation...",
  "summary": "AI-generated summary...",
  "duration_seconds": 180,
  "total_cost": 0.45,
  "sentiment": "positive",
  "caller_number": "+1234567890",
  "recording_url": "https://..."
}`}
                </pre>
              </div>
            </CardContent>
          </Card>

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
                provider={(formData.provider === "inspra" ? "vapi" : formData.provider) as "vapi" | "retell"}
                calendarSettings={formData.calendarSettings}
                onCalendarSettingsChange={(settings) => {
                  console.log('[AgentWizard] onCalendarSettingsChange called with:', {
                    calendar_source: settings.calendar_source,
                    existing_calendar_id: settings.existing_calendar_id,
                    enable_owner_email: settings.enable_owner_email,
                  })
                  updateFormData("calendarSettings", settings)
                }}
                workspaceSlug={workspaceSlug}
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
                {/* System Variables (auto-generated) */}
                <div className="p-3.5 bg-linear-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Label className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-2">
                    <span className="text-sm">⚡</span>
                    System Variables
                    <span className="text-[9px] px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full font-bold uppercase tracking-wider">Auto-generated</span>
                  </Label>
                  <div className="flex flex-wrap gap-2 mb-2.5">
                    {systemVariables.map((variable) => (
                      <Button
                        key={variable.id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="font-mono text-xs bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-slate-800 shadow-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(`{{${variable.name}}}`)
                          toast.success(`Copied {{${variable.name}}} to clipboard`)
                        }}
                        title={variable.description}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                        <code className="text-blue-700 dark:text-blue-300 font-bold">{`{{${variable.name}}}`}</code>
                      </Button>
                    ))}
                  </div>
                  <p className="text-[10px] text-blue-600 dark:text-blue-300/80 leading-relaxed">
                    🔄 Auto-populated at runtime • {"{"}{"{"} CURRENT_DATE_TIME {"}"}{"}"}  = call date/time • {"{"}{"{"} CUSTOMER_PHONE {"}"}{"}"}  = recipient number • {"{"}{"{"} AGENT_PHONE {"}"}{"}"}  = agent's number
                  </p>
                </div>

                {/* Standard Variables */}
                <div className="pt-3 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">Batch Variables</Label>
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
                
                {/* Warning for outbound agent without phone number */}
                {formData.agentDirection === "outbound" && !formData.phoneNumberId && (
                  <div className="col-span-2 mt-2">
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium">No phone number configured</p>
                        <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                          The "Call Me" feature will be unavailable until you assign a phone number. 
                          You can add one later in the agent settings.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
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
            formData.provider === "inspra" ? (
              <Button 
                type="button" 
                disabled 
                className="bg-emerald-500/20 text-emerald-600 cursor-not-allowed"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Select VAPI or Retell to Continue
              </Button>
            ) : (
              <Button type="button" onClick={nextStep}>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )
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


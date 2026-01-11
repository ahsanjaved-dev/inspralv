"use client"

import { useState } from "react"
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
  PhoneCall,
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { functionToolsArraySchema, type CreateWorkspaceAgentInput } from "@/types/api.types"
import type { FunctionTool, KnowledgeDocument, KnowledgeDocumentType, AgentDirection } from "@/types/database.types"
import { FunctionToolEditor } from "./function-tool-editor"
import { useActiveKnowledgeDocuments } from "@/lib/hooks/use-workspace-knowledge-base"
import { useAvailablePhoneNumbers } from "@/lib/hooks/use-telephony"

// ============================================================================
// TYPES
// ============================================================================

interface AgentWizardProps {
  onSubmit: (data: CreateWorkspaceAgentInput) => Promise<void>
  isSubmitting: boolean
  onCancel: () => void
}

// Custom variable definition for campaign personalization
interface CustomVariable {
  name: string
  description: string
  defaultValue: string
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
  // Step 2: Voice
  voice: string
  voiceSpeed: number
  voicePitch: number
  // Step 3: Prompts & Tools
  systemPrompt: string
  greeting: string
  style: "formal" | "friendly" | "casual"
  tools: FunctionTool[]
  toolsServerUrl: string
  // Custom variables for campaign personalization
  customVariables: CustomVariable[]
}

// Knowledge document type icons
const documentTypeIcons: Record<KnowledgeDocumentType, React.ComponentType<{ className?: string }>> = {
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

const VOICES = [
  { id: "aria", name: "Aria", gender: "Female", style: "Warm", color: "bg-pink-100", textColor: "text-pink-600" },
  { id: "jason", name: "Jason", gender: "Male", style: "Professional", color: "bg-blue-100", textColor: "text-blue-600" },
  { id: "luna", name: "Luna", gender: "Female", style: "Friendly", color: "bg-purple-100", textColor: "text-purple-600" },
  { id: "marcus", name: "Marcus", gender: "Male", style: "Deep", color: "bg-green-100", textColor: "text-green-600" },
  { id: "sophia", name: "Sophia", gender: "Female", style: "Calm", color: "bg-amber-100", textColor: "text-amber-600" },
  { id: "ethan", name: "Ethan", gender: "Male", style: "Energetic", color: "bg-cyan-100", textColor: "text-cyan-600" },
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
  const totalSteps = 3

  const [formData, setFormData] = useState<WizardFormData>({
    name: "",
    description: "",
    provider: "vapi",
    language: "en-US",
    agentDirection: "inbound",
    allowOutbound: false,
    enablePhoneNumber: false,
    phoneNumberId: null,
    enableKnowledgeBase: false,
    knowledgeDocumentIds: [],
    voice: "aria",
    voiceSpeed: 1,
    voicePitch: 1,
    systemPrompt: "",
    greeting: "Hello! Thank you for calling. How can I help you today?",
    style: "friendly",
    tools: [],
    toolsServerUrl: "",
    customVariables: [],
  })

  // Fetch knowledge documents for selection
  const { data: knowledgeDocsData, isLoading: isLoadingDocs, error: docsError } = useActiveKnowledgeDocuments()
  
  // Fetch available phone numbers for assignment
  const { data: availablePhoneNumbers, isLoading: isLoadingPhoneNumbers } = useAvailablePhoneNumbers()

  const [errors, setErrors] = useState<Record<string, string>>({})

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.name.trim()) {
        newErrors.name = "Agent name is required"
      }
    }

    if (step === 3) {
      if (!formData.systemPrompt.trim()) {
        newErrors.systemPrompt = "System prompt is required"
      }
      if (!formData.greeting.trim()) {
        newErrors.greeting = "Initial greeting is required"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

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
    setFormData((prev) => ({ ...prev, [key]: value }))
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
        first_message: formData.greeting,
        voice_id: formData.voice,
        voice_settings: {
          speed: formData.voiceSpeed,
        },
        // Include function tools if any are configured
        tools,
        tools_server_url: formData.toolsServerUrl || undefined,
        // Include knowledge base configuration
        knowledge_base: formData.enableKnowledgeBase
          ? {
              enabled: true,
              document_ids: formData.knowledgeDocumentIds,
              injection_mode: "system_prompt",
            }
          : undefined,
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
              <span className={cn("text-sm font-medium", currentStep === 1 ? "text-foreground" : "text-muted-foreground")}>
                Basic Info
              </span>
            </div>

            <div className={cn("flex-1 h-0.5 mx-4", currentStep > 1 ? "bg-green-500" : "bg-border")} />

            {/* Step 2 */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  currentStep > 2
                    ? "bg-green-500 text-white"
                    : currentStep === 2
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {currentStep > 2 ? <Check className="w-3 h-3" /> : "2"}
              </div>
              <span className={cn("text-sm font-medium", currentStep === 2 ? "text-foreground" : "text-muted-foreground")}>
                Voice
              </span>
            </div>

            <div className={cn("flex-1 h-0.5 mx-4", currentStep > 2 ? "bg-green-500" : "bg-border")} />

            {/* Step 3 */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  currentStep === 3
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                3
              </div>
              <span className={cn("text-sm font-medium", currentStep === 3 ? "text-foreground" : "text-muted-foreground")}>
                Prompts
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
              <Badge variant="secondary" className="text-xs">Step 1 of 3</Badge>
            </div>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Set up your agent's identity and configuration</CardDescription>
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
                onChange={(e) => updateFormData("name", e.target.value)}
                placeholder="e.g., Customer Support Bot"
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
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
              <p className="text-xs text-muted-foreground">Brief description of the agent's purpose and capabilities</p>
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
                    onClick={() => updateFormData("provider", provider.id as WizardFormData["provider"])}
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
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", provider.color)}>
                        <span className={cn("font-bold", provider.textColor)}>{provider.name[0]}</span>
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
              <Select value={formData.language} onValueChange={(v) => updateFormData("language", v)}>
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
                  {
                    value: "bidirectional" as AgentDirection,
                    label: "Bidirectional",
                    description: "Both inbound and outbound calls",
                    icon: PhoneCall,
                    color: "bg-purple-100 dark:bg-purple-900/30",
                    iconColor: "text-purple-600",
                  },
                ].map((direction) => {
                  const Icon = direction.icon
                  return (
                    <div
                      key={direction.value}
                      onClick={() => {
                        updateFormData("agentDirection", direction.value)
                        // Reset phone number if switching to outbound-only
                        if (direction.value === "outbound") {
                          updateFormData("enablePhoneNumber", false)
                          updateFormData("phoneNumberId", null)
                        }
                      }}
                      className={cn(
                        "relative p-4 rounded-lg border-2 cursor-pointer transition-all",
                        formData.agentDirection === direction.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", direction.color)}>
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

            {/* Phone Number Assignment - For all agent directions */}
            {(formData.agentDirection === "inbound" || formData.agentDirection === "outbound" || formData.agentDirection === "bidirectional") && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Phone className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <Label className="mb-0">Phone Number</Label>
                      <p className="text-xs text-muted-foreground">
                        {formData.agentDirection === "outbound" 
                          ? "Select caller ID for outbound calls"
                          : formData.agentDirection === "bidirectional"
                          ? "Assign a phone number for calls"
                          : "Assign a phone number for inbound calls"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.enablePhoneNumber}
                    onCheckedChange={(checked) => {
                      updateFormData("enablePhoneNumber", checked)
                      if (!checked) {
                        updateFormData("phoneNumberId", null)
                      }
                    }}
                  />
                </div>

                {/* Phone Number Selection */}
                {formData.enablePhoneNumber && (
                  <div className="ml-13 pl-4 border-l-2 border-green-500/20">
                    {isLoadingPhoneNumbers ? (
                      <Skeleton className="h-10 w-full" />
                    ) : availablePhoneNumbers && availablePhoneNumbers.length > 0 ? (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          {formData.agentDirection === "outbound" ? "Select Caller ID" : "Select Phone Number"}
                        </Label>
                        <Select
                          value={formData.phoneNumberId || ""}
                          onValueChange={(value) => updateFormData("phoneNumberId", value || null)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a phone number..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availablePhoneNumbers.map((number) => (
                              <SelectItem key={number.id} value={number.id}>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono">
                                    {number.friendly_name || number.phone_number}
                                  </span>
                                  {number.country_code && (
                                    <Badge variant="outline" className="text-xs">
                                      {number.country_code}
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {availablePhoneNumbers.length} number{availablePhoneNumbers.length !== 1 ? "s" : ""} available
                        </p>
                      </div>
                    ) : (
                      <div className="text-center p-4 rounded-lg bg-muted/50">
                        <Phone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No phone numbers available</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Add phone numbers in Organization → Telephony
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
                    <p className="text-xs text-muted-foreground">Connect documents to give your agent context</p>
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
                        {formData.knowledgeDocumentIds.length} document{formData.knowledgeDocumentIds.length !== 1 ? "s" : ""} selected
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

          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs">Step 2 of 3</Badge>
            </div>
            <CardTitle>Voice Configuration</CardTitle>
            <CardDescription>Choose and customize the voice for your agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Voice Selection */}
            <div className="space-y-3">
              <Label>
                Voice <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {VOICES.map((voice) => (
                  <div
                    key={voice.id}
                    onClick={() => updateFormData("voice", voice.id)}
                    className={cn(
                      "p-3 rounded-lg border-2 cursor-pointer transition-all",
                      formData.voice === voice.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:border-primary/50 bg-card"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", voice.color)}>
                        <span className={cn("font-semibold", voice.textColor)}>{voice.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{voice.name}</p>
                        <p className="text-xs text-muted-foreground">{voice.gender} • {voice.style}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Voice Speed */}
            <div className="space-y-2">
              <Label>Voice Speed</Label>
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
              <p className="text-xs text-muted-foreground">Controls how fast the agent speaks</p>
            </div>

            {/* Voice Pitch */}
            <div className="space-y-2">
              <Label>Voice Pitch</Label>
              <Select
                value={String(formData.voicePitch)}
                onValueChange={(v) => updateFormData("voicePitch", parseFloat(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.8">Low</SelectItem>
                  <SelectItem value="1">Normal</SelectItem>
                  <SelectItem value="1.2">High</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Adjusts the tone of the voice</p>
            </div>

            {/* Voice Preview */}
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Volume2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Voice Preview</p>
                  <p className="text-sm text-muted-foreground">Click to hear a sample of the selected voice</p>
                </div>
                <Button type="button" variant="default">
                  <Play className="w-4 h-4 mr-2" />
                  Test Voice
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs">Step 3 of 3</Badge>
              </div>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>Define how your agent should behave and respond</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* System Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    System Prompt <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">{formData.systemPrompt.length} characters</span>
                </div>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) => updateFormData("systemPrompt", e.target.value)}
                  placeholder="You are a helpful customer support agent for [Company Name]..."
                  className={cn(
                    "w-full min-h-[320px] px-3 py-2 text-sm rounded-md border bg-background resize-y font-mono",
                    errors.systemPrompt ? "border-destructive" : "border-input"
                  )}
                />
                {errors.systemPrompt && <p className="text-sm text-destructive">{errors.systemPrompt}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("support")}>
                    Support Template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("sales")}>
                    Sales Template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("booking")}>
                    Booking Template
                  </Button>
                </div>
              </div>

              {/* Initial Greeting */}
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

              {/* Conversation Style */}
              <div className="space-y-3">
                <Label>Conversation Style</Label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { value: "formal", label: "Formal", icon: Briefcase },
                    { value: "friendly", label: "Friendly", icon: Smile },
                    { value: "casual", label: "Casual", icon: Coffee },
                  ].map((style) => {
                    const Icon = style.icon
                    return (
                      <div
                        key={style.value}
                        onClick={() => updateFormData("style", style.value as WizardFormData["style"])}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-all text-center",
                          formData.style === style.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <Icon className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                        <span className="text-sm font-medium">{style.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Webhook URL - Only for Retell */}
          {formData.provider === "retell" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Webhook URL
                </CardTitle>
                <CardDescription>
                  Your server endpoint that receives tool execution requests and call data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="https://your-server.com/webhook"
                  value={formData.toolsServerUrl}
                  onChange={(e) => updateFormData("toolsServerUrl", e.target.value)}
                />
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
              <CardDescription>
                Add tools to extend your agent's capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FunctionToolEditor
                tools={formData.tools}
                onChange={(tools) => updateFormData("tools", tools)}
                serverUrl={formData.toolsServerUrl}
                provider={formData.provider}
              />
            </CardContent>
          </Card>

          {/* Custom Variables Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Variable className="w-5 h-5" />
                Custom Variables
              </CardTitle>
              <CardDescription>
                Define variables that can be personalized for each recipient in outbound campaigns.
                Use these in your system prompt with {"{{variable_name}}"} syntax.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info Banner */}
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">How Custom Variables Work</p>
                  <p>When running campaigns, these variables will be replaced with recipient-specific data from your CSV import. For example, {"{{first_name}}"} becomes "John" for each recipient.</p>
                </div>
              </div>

              {/* Variables List */}
              {formData.customVariables.length > 0 && (
                <div className="space-y-3">
                  {formData.customVariables.map((variable, index) => (
                    <div key={index} className="p-4 rounded-lg border bg-muted/30">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Variable Name</Label>
                            <Input
                              value={variable.name}
                              onChange={(e) => {
                                const updated = [...formData.customVariables]
                                updated[index] = { ...variable, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }
                                updateFormData("customVariables", updated)
                              }}
                              placeholder="e.g., product_interest"
                              className="mt-1 font-mono text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Description</Label>
                            <Input
                              value={variable.description}
                              onChange={(e) => {
                                const updated = [...formData.customVariables]
                                updated[index] = { ...variable, description: e.target.value }
                                updateFormData("customVariables", updated)
                              }}
                              placeholder="What this variable represents"
                              className="mt-1 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Default Value</Label>
                            <Input
                              value={variable.defaultValue}
                              onChange={(e) => {
                                const updated = [...formData.customVariables]
                                updated[index] = { ...variable, defaultValue: e.target.value }
                                updateFormData("customVariables", updated)
                              }}
                              placeholder="Fallback if not provided"
                              className="mt-1 text-sm"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => {
                            const updated = formData.customVariables.filter((_, i) => i !== index)
                            updateFormData("customVariables", updated)
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Use in prompt: <code className="bg-muted px-1 py-0.5 rounded">{`{{${variable.name || "variable_name"}}}`}</code>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Variable Button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  updateFormData("customVariables", [
                    ...formData.customVariables,
                    { name: "", description: "", defaultValue: "" },
                  ])
                }}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Variable
              </Button>

              {/* Common Variables Suggestions */}
              {formData.customVariables.length === 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Quick Add Common Variables</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: "first_name", desc: "Recipient's first name" },
                      { name: "company", desc: "Company name" },
                      { name: "product_interest", desc: "Product they're interested in" },
                      { name: "appointment_date", desc: "Scheduled appointment date" },
                      { name: "account_balance", desc: "Account balance amount" },
                    ].map((suggestion) => (
                      <Button
                        key={suggestion.name}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          updateFormData("customVariables", [
                            ...formData.customVariables,
                            { name: suggestion.name, description: suggestion.desc, defaultValue: "" },
                          ])
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {suggestion.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
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
                    {formData.agentDirection === "inbound" && formData.allowOutbound && " (+outbound)"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Language</p>
                  <p className="font-medium">{LANGUAGES.find((l) => l.value === formData.language)?.label || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Voice</p>
                  <p className="font-medium">{VOICES.find((v) => v.id === formData.voice)?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone Number</p>
                  <p className="font-medium">
                    {formData.enablePhoneNumber && formData.phoneNumberId
                      ? availablePhoneNumbers?.find(p => p.id === formData.phoneNumberId)?.phone_number || "Selected"
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
                  <p className="font-medium">{formData.tools.length === 0 ? "No tools" : `${formData.tools.length} tool${formData.tools.length > 1 ? "s" : ""}`}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Custom Variables</p>
                  <p className="font-medium">{formData.customVariables.length === 0 ? "None" : `${formData.customVariables.length} variable${formData.customVariables.length > 1 ? "s" : ""}`}</p>
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


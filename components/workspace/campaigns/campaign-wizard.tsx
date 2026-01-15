"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  FileText,
  Upload,
  Clock,
  CheckCircle2,
  Cloud,
  AlertCircle,
} from "lucide-react"
import type {
  CreateCampaignWizardInput,
  CreateRecipientInput,
  BusinessHoursConfig,
  AIAgent,
} from "@/types/database.types"
import { useCampaignDraft, type DraftData } from "@/lib/hooks/use-campaign-draft"

// Step components
import { StepDetails } from "./steps/step-details"
import { StepImport } from "./steps/step-import"
import { StepSchedule } from "./steps/step-schedule"
import { StepReview } from "./steps/step-review"

// ============================================================================
// TYPES
// ============================================================================

export interface CampaignWizardProps {
  onSubmit: (data: CreateCampaignWizardInput) => Promise<void>
  isSubmitting: boolean
  onCancel: () => void
  agents: AIAgent[]
  isLoadingAgents: boolean
  /** REQUIRED: The draft ID (created upfront) */
  draftId?: string
  /** Optional: Initial draft data (when resuming a draft) */
  initialDraft?: DraftData
}

export interface WizardFormData {
  // Step 1: Campaign Details
  name: string
  description: string
  agent_id: string
  selectedAgent: AIAgent | null

  // Step 2: Import Recipients
  recipients: CreateRecipientInput[]
  csvColumnHeaders: string[]
  importedFileName: string | null

  // Step 3: Schedule
  scheduleType: "immediate" | "scheduled"
  scheduledStartAt: string | null
  scheduledExpiresAt: string | null
  businessHoursConfig: BusinessHoursConfig
}

interface WizardStep {
  id: number
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

// ============================================================================
// WIZARD STEPS CONFIGURATION
// ============================================================================

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 1,
    title: "Campaign Details",
    description: "Name, description & AI agent",
    icon: FileText,
  },
  {
    id: 2,
    title: "Import Recipients",
    description: "Upload CSV with contacts",
    icon: Upload,
  },
  {
    id: 3,
    title: "Schedule",
    description: "Business hours & timing",
    icon: Clock,
  },
  {
    id: 4,
    title: "Review & Launch",
    description: "Confirm settings",
    icon: CheckCircle2,
  },
]

// Business hours are always enabled with sensible defaults (9 AM - 5 PM weekdays)
const DEFAULT_BUSINESS_HOURS_CONFIG: BusinessHoursConfig = {
  enabled: true,
  timezone: "America/New_York",
  schedule: {
    monday: [{ start: "09:00", end: "17:00" }],
    tuesday: [{ start: "09:00", end: "17:00" }],
    wednesday: [{ start: "09:00", end: "17:00" }],
    thursday: [{ start: "09:00", end: "17:00" }],
    friday: [{ start: "09:00", end: "17:00" }],
    saturday: [],
    sunday: [],
  },
}

// ============================================================================
// MAIN WIZARD COMPONENT
// ============================================================================

export function CampaignWizard({
  onSubmit,
  isSubmitting,
  onCancel,
  agents,
  isLoadingAgents,
  draftId,
  initialDraft,
}: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = WIZARD_STEPS.length

  // Initialize form data from draft if provided
  const getInitialFormData = (): WizardFormData => {
    if (initialDraft) {
      const selectedAgent = agents.find(a => a.id === initialDraft.agent_id) || null
      return {
        name: initialDraft.name || "",
        description: initialDraft.description || "",
        agent_id: initialDraft.agent_id || "",
        selectedAgent,
        recipients: initialDraft.recipients || [],
        csvColumnHeaders: initialDraft.csv_column_headers || [],
        importedFileName: null,
        scheduleType: initialDraft.schedule_type || "immediate",
        scheduledStartAt: initialDraft.scheduled_start_at || null,
        scheduledExpiresAt: initialDraft.scheduled_expires_at || null,
        businessHoursConfig: initialDraft.business_hours_config || DEFAULT_BUSINESS_HOURS_CONFIG,
      }
    }
    return {
      name: "",
      description: "",
      agent_id: "",
      selectedAgent: null,
      recipients: [],
      csvColumnHeaders: [],
      importedFileName: null,
      scheduleType: "immediate",
      scheduledStartAt: null,
      scheduledExpiresAt: null,
      businessHoursConfig: DEFAULT_BUSINESS_HOURS_CONFIG,
    }
  }

  const [formData, setFormData] = useState<WizardFormData>(getInitialFormData)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Draft auto-save hook - simplified version that only updates
  const {
    isSaving: isDraftSaving,
    lastSavedAt,
    error: draftError,
    updateDraft,
  } = useCampaignDraft({
    debounceMs: 1000,
    autoSave: true,
    draftId: draftId,
    onSaved: () => {
      console.log("[CampaignWizard] Draft auto-saved")
    },
    onError: (error) => {
      console.error("[CampaignWizard] Draft save error:", error)
    },
  })

  // Update selected agent when agents list loads and we have an agent_id
  useEffect(() => {
    if (formData.agent_id && !formData.selectedAgent && agents.length > 0) {
      const agent = agents.find(a => a.id === formData.agent_id)
      if (agent) {
        setFormData(prev => ({ ...prev, selectedAgent: agent }))
      }
    }
  }, [agents, formData.agent_id, formData.selectedAgent])

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateStep = useCallback(
    (step: number): boolean => {
      const newErrors: Record<string, string> = {}

      if (step === 1) {
        if (!formData.name.trim()) {
          newErrors.name = "Campaign name is required"
        }
        if (!formData.agent_id) {
          newErrors.agent_id = "Please select an AI agent"
        }
      }

      // Step 2 is optional - can have 0 recipients and add later
      // Step 3 validation if scheduled
      if (step === 3) {
        if (formData.scheduleType === "scheduled" && !formData.scheduledStartAt) {
          newErrors.scheduledStartAt = "Please select a start date/time"
        }
      }

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
    [formData]
  )

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const nextStep = useCallback(() => {
    if (!validateStep(currentStep)) return
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }, [currentStep, totalSteps, validateStep])

  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }, [currentStep])

  const goToStep = useCallback(
    (step: number) => {
      // Only allow going to previous steps
      if (step < currentStep) {
        setCurrentStep(step)
      }
    },
    [currentStep]
  )

  // ============================================================================
  // FORM UPDATE HANDLERS
  // ============================================================================

  // Helper to convert form data to draft data
  const formToDraft = useCallback((form: WizardFormData): DraftData => ({
    draft_id: draftId,
    name: form.name,
    description: form.description,
    agent_id: form.agent_id || undefined,
    // Convert null values to undefined for type compatibility
    recipients: form.recipients?.map(r => ({
      phone_number: r.phone_number,
      first_name: r.first_name ?? undefined,
      last_name: r.last_name ?? undefined,
      email: r.email ?? undefined,
      company: r.company ?? undefined,
      reason_for_call: r.reason_for_call ?? undefined,
      address_line_1: r.address_line_1 ?? undefined,
      address_line_2: r.address_line_2 ?? undefined,
      suburb: r.suburb ?? undefined,
      state: r.state ?? undefined,
      post_code: r.post_code ?? undefined,
      country: r.country ?? undefined,
    })),
    csv_column_headers: form.csvColumnHeaders,
    schedule_type: form.scheduleType,
    scheduled_start_at: form.scheduledStartAt,
    scheduled_expires_at: form.scheduledExpiresAt,
    timezone: form.businessHoursConfig.timezone,
    business_hours_config: form.businessHoursConfig,
    current_step: currentStep,
  }), [draftId, currentStep])

  const updateFormData = useCallback(
    <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => {
      setFormData((prev) => {
        const updated = { ...prev, [key]: value }
        // Auto-save draft on each change
        updateDraft(formToDraft(updated))
        return updated
      })
      // Clear error for this field
      if (errors[key]) {
        setErrors((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    },
    [errors, formToDraft, updateDraft]
  )

  const updateMultipleFields = useCallback((updates: Partial<WizardFormData>) => {
    setFormData((prev) => {
      const updated = { ...prev, ...updates }
      // Auto-save draft on batch update
      updateDraft(formToDraft(updated))
      return updated
    })
  }, [formToDraft, updateDraft])

  // ============================================================================
  // SUBMIT HANDLER
  // ============================================================================

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    // Convert datetime-local format to ISO 8601 format
    let scheduledStartAt: string | null = null
    let scheduledExpiresAt: string | null = null

    if (formData.scheduleType === "scheduled" && formData.scheduledStartAt) {
      scheduledStartAt = new Date(formData.scheduledStartAt).toISOString()
    }

    if (formData.scheduleType === "scheduled" && formData.scheduledExpiresAt) {
      scheduledExpiresAt = new Date(formData.scheduledExpiresAt).toISOString()
    }

    const wizardData: CreateCampaignWizardInput = {
      name: formData.name,
      description: formData.description || null,
      agent_id: formData.agent_id,
      recipients: formData.recipients,
      csv_column_headers: formData.csvColumnHeaders,
      variable_mappings: [],
      agent_prompt_overrides: null,
      schedule_type: formData.scheduleType,
      scheduled_start_at: scheduledStartAt,
      scheduled_expires_at: scheduledExpiresAt,
      business_hours_config: formData.businessHoursConfig,
      business_hours_only: formData.businessHoursConfig.enabled,
      business_hours_start: null,
      business_hours_end: null,
      timezone: formData.businessHoursConfig.timezone,
      concurrency_limit: 1,
      max_attempts: 3,
      retry_delay_minutes: 30,
      wizard_completed: true,
      // Pass draft ID to convert existing draft instead of creating new
      draft_id: draftId,
    }

    await onSubmit(wizardData)
  }

  // ============================================================================
  // PROGRESS CALCULATION
  // ============================================================================

  const progress = (currentStep / totalSteps) * 100

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Step Indicators */}
            <div className="flex items-center justify-between">
              {WIZARD_STEPS.map((step, index) => {
                const StepIcon = step.icon
                const isCompleted = currentStep > step.id
                const isCurrent = currentStep === step.id
                const isClickable = step.id < currentStep

                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <button
                      type="button"
                      onClick={() => isClickable && goToStep(step.id)}
                      disabled={!isClickable}
                      className={cn(
                        "flex flex-col items-center gap-2 transition-all",
                        isClickable && "cursor-pointer hover:opacity-80",
                        !isClickable && "cursor-default"
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                          isCompleted && "bg-primary text-primary-foreground",
                          isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                          !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <StepIcon className="h-5 w-5" />
                        )}
                      </div>
                      <div className="text-center hidden md:block">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            isCurrent && "text-primary",
                            !isCurrent && !isCompleted && "text-muted-foreground"
                          )}
                        >
                          {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground max-w-[100px]">
                          {step.description}
                        </p>
                      </div>
                    </button>
                    {index < WIZARD_STEPS.length - 1 && (
                      <div
                        className={cn("flex-1 h-0.5 mx-2", isCompleted ? "bg-primary" : "bg-muted")}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Progress Bar */}
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Step {currentStep} of {totalSteps}
              </p>
              {/* Draft Status Indicator */}
              <div className="flex items-center gap-2">
                {draftError ? (
                  <Badge variant="outline" className="gap-1 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    Save failed
                  </Badge>
                ) : isDraftSaving ? (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving...
                  </Badge>
                ) : lastSavedAt ? (
                  <Badge variant="outline" className="gap-1 text-green-600 dark:text-green-400">
                    <Cloud className="h-3 w-3" />
                    Saved
                  </Badge>
                ) : draftId ? (
                  <Badge variant="outline" className="gap-1 text-blue-600 dark:text-blue-400">
                    <Cloud className="h-3 w-3" />
                    Draft
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{WIZARD_STEPS[currentStep - 1]?.title}</CardTitle>
          <CardDescription>{WIZARD_STEPS[currentStep - 1]?.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <StepDetails
              formData={formData}
              updateFormData={updateFormData}
              errors={errors}
              agents={agents}
              isLoadingAgents={isLoadingAgents}
            />
          )}
          {currentStep === 2 && (
            <StepImport
              formData={formData}
              updateMultipleFields={updateMultipleFields}
              errors={errors}
            />
          )}
          {currentStep === 3 && (
            <StepSchedule formData={formData} updateFormData={updateFormData} errors={errors} />
          )}
          {currentStep === 4 && (
            <StepReview
              formData={formData}
              updateFormData={updateFormData}
              errors={errors}
              goToStep={goToStep}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={currentStep === 1 ? onCancel : prevStep}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentStep === 1 ? "Cancel" : "Previous"}
        </Button>

        {currentStep < totalSteps ? (
          <Button type="button" onClick={nextStep}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Create Campaign
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

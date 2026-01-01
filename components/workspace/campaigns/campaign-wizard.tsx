"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  FileText,
  Upload,
  Variable,
  Clock,
  CheckCircle2,
} from "lucide-react"
import type {
  CreateCampaignWizardInput,
  CreateRecipientInput,
  VariableMapping,
  BusinessHoursConfig,
  AgentPromptOverrides,
  AIAgent,
} from "@/types/database.types"

// Step components
import { StepDetails } from "./steps/step-details"
import { StepImport } from "./steps/step-import"
import { StepVariables } from "./steps/step-variables"
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

  // Step 3: Variable Mappings
  variableMappings: VariableMapping[]
  agentPromptOverrides: AgentPromptOverrides | null

  // Step 4: Schedule
  scheduleType: "immediate" | "scheduled"
  scheduledStartAt: string | null
  businessHoursConfig: BusinessHoursConfig

  // Step 5: Advanced Settings
  concurrencyLimit: number
  maxAttempts: number
  retryDelayMinutes: number
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
    title: "Variable Mapping",
    description: "Map CSV columns to prompts",
    icon: Variable,
  },
  {
    id: 4,
    title: "Schedule",
    description: "Business hours & timing",
    icon: Clock,
  },
  {
    id: 5,
    title: "Review & Launch",
    description: "Confirm settings",
    icon: CheckCircle2,
  },
]

const DEFAULT_BUSINESS_HOURS_CONFIG: BusinessHoursConfig = {
  enabled: false,
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
}: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const totalSteps = WIZARD_STEPS.length

  const [formData, setFormData] = useState<WizardFormData>({
    // Step 1
    name: "",
    description: "",
    agent_id: "",
    selectedAgent: null,
    // Step 2
    recipients: [],
    csvColumnHeaders: [],
    importedFileName: null,
    // Step 3
    variableMappings: [],
    agentPromptOverrides: null,
    // Step 4
    scheduleType: "immediate",
    scheduledStartAt: null,
    businessHoursConfig: DEFAULT_BUSINESS_HOURS_CONFIG,
    // Step 5
    concurrencyLimit: 1,
    maxAttempts: 3,
    retryDelayMinutes: 30,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validateStep = useCallback((step: number): boolean => {
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
    // Step 3 is optional - variable mappings are not required
    // Step 4 validation if scheduled
    if (step === 4) {
      if (formData.scheduleType === "scheduled" && !formData.scheduledStartAt) {
        newErrors.scheduledStartAt = "Please select a start date/time"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

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

  const goToStep = useCallback((step: number) => {
    // Only allow going to previous steps or validated future steps
    if (step < currentStep) {
      setCurrentStep(step)
    }
  }, [currentStep])

  // ============================================================================
  // FORM UPDATE HANDLERS
  // ============================================================================

  const updateFormData = useCallback(<K extends keyof WizardFormData>(
    key: K,
    value: WizardFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    // Clear error for this field
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }, [errors])

  const updateMultipleFields = useCallback((updates: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }, [])

  // ============================================================================
  // SUBMIT HANDLER
  // ============================================================================

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return

    // Filter out incomplete variable mappings (empty csv_column or prompt_placeholder)
    // and ensure all mappings have default_value
    const validVariableMappings = formData.variableMappings
      .filter((mapping) => mapping.csv_column.trim() && mapping.prompt_placeholder.trim())
      .map((mapping) => ({
        ...mapping,
        default_value: mapping.default_value || "",
      }))

    // Convert datetime-local format to ISO 8601 format
    // datetime-local gives "2026-01-15T09:00" but Zod expects "2026-01-15T09:00:00.000Z"
    let scheduledStartAt: string | null = null
    if (formData.scheduleType === "scheduled" && formData.scheduledStartAt) {
      // Append seconds and Z for UTC timezone
      scheduledStartAt = new Date(formData.scheduledStartAt).toISOString()
    }

    const wizardData: CreateCampaignWizardInput = {
      name: formData.name,
      description: formData.description || null,
      agent_id: formData.agent_id,
      recipients: formData.recipients,
      csv_column_headers: formData.csvColumnHeaders,
      variable_mappings: validVariableMappings,
      agent_prompt_overrides: formData.agentPromptOverrides,
      schedule_type: formData.scheduleType,
      scheduled_start_at: scheduledStartAt,
      business_hours_config: formData.businessHoursConfig,
      business_hours_only: formData.businessHoursConfig.enabled,
      timezone: formData.businessHoursConfig.timezone,
      concurrency_limit: formData.concurrencyLimit,
      max_attempts: formData.maxAttempts,
      retry_delay_minutes: formData.retryDelayMinutes,
      wizard_completed: true,
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
                        <p className={cn(
                          "text-sm font-medium",
                          isCurrent && "text-primary",
                          !isCurrent && !isCompleted && "text-muted-foreground"
                        )}>
                          {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground max-w-[100px]">
                          {step.description}
                        </p>
                      </div>
                    </button>
                    {index < WIZARD_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "flex-1 h-0.5 mx-2",
                          isCompleted ? "bg-primary" : "bg-muted"
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Progress Bar */}
            <Progress value={progress} className="h-2" />
            <p className="text-center text-sm text-muted-foreground">
              Step {currentStep} of {totalSteps}
            </p>
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
            <StepVariables
              formData={formData}
              updateFormData={updateFormData}
              errors={errors}
            />
          )}
          {currentStep === 4 && (
            <StepSchedule
              formData={formData}
              updateFormData={updateFormData}
              errors={errors}
            />
          )}
          {currentStep === 5 && (
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
        <Button
          type="button"
          variant="outline"
          onClick={currentStep === 1 ? onCancel : prevStep}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentStep === 1 ? "Cancel" : "Previous"}
        </Button>

        {currentStep < totalSteps ? (
          <Button type="button" onClick={nextStep}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
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


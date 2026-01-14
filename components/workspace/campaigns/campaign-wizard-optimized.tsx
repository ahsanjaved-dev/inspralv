"use client"

/**
 * Optimized Campaign Wizard
 * 
 * Uses Zustand store for instant local state management.
 * State is persisted in sessionStorage and restored on page refresh.
 * 
 * Key improvements:
 * - Instant UI updates (no loader for state changes)
 * - Local state persisted in sessionStorage
 * - DB sync only on final submission
 * - Optimized re-renders with selectors
 * - Proper state recovery on page refresh
 */

import { useEffect, useCallback, useRef } from "react"
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
  Clock,
  CheckCircle2,
} from "lucide-react"
import type {
  CreateCampaignWizardInput,
  AIAgent,
} from "@/types/database.types"
import {
  useCampaignWizardStore,
  type WizardFormData,
} from "@/lib/stores/campaign-wizard-store"
import { toast } from "sonner"

// Step components
import { StepDetails } from "./steps/step-details"
import { StepImport } from "./steps/step-import"
import { StepSchedule } from "./steps/step-schedule"
import { StepReview } from "./steps/step-review"

// ============================================================================
// TYPES
// ============================================================================

export interface CampaignWizardOptimizedProps {
  onSubmit: (data: CreateCampaignWizardInput) => Promise<void>
  isSubmitting: boolean
  onCancel: () => void
  agents: AIAgent[]
  isLoadingAgents: boolean
  workspaceSlug: string
  /** Optional: Draft ID if resuming an existing draft */
  draftId?: string | null
  /** Optional: Initial data if resuming a draft */
  initialDraft?: Partial<WizardFormData>
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

// ============================================================================
// MAIN WIZARD COMPONENT
// ============================================================================

export function CampaignWizardOptimized({
  onSubmit,
  isSubmitting,
  onCancel,
  agents,
  isLoadingAgents,
  workspaceSlug,
  draftId,
  initialDraft,
}: CampaignWizardOptimizedProps) {
  // Track if we've initialized to prevent re-initialization
  const hasInitializedRef = useRef(false)
  const agentSyncedRef = useRef(false)

  // Subscribe to individual state slices to avoid unnecessary re-renders
  const currentStep = useCampaignWizardStore((state) => state.currentStep)
  const errors = useCampaignWizardStore((state) => state.errors)
  const formData = useCampaignWizardStore((state) => state.formData)
  const isInitialized = useCampaignWizardStore((state) => state.isInitialized)

  // Get store actions directly (these are stable references)
  const initialize = useCampaignWizardStore((state) => state.initialize)
  const nextStep = useCampaignWizardStore((state) => state.nextStep)
  const prevStep = useCampaignWizardStore((state) => state.prevStep)
  const goToStep = useCampaignWizardStore((state) => state.goToStep)
  const updateField = useCampaignWizardStore((state) => state.updateField)
  const updateFields = useCampaignWizardStore((state) => state.updateFields)
  const selectAgent = useCampaignWizardStore((state) => state.selectAgent)
  const validateAll = useCampaignWizardStore((state) => state.validateAll)
  const reset = useCampaignWizardStore((state) => state.reset)

  const totalSteps = WIZARD_STEPS.length

  // ============================================================================
  // INITIALIZATION - Only run once per mount
  // ============================================================================

  useEffect(() => {
    // Only initialize once per mount
    if (hasInitializedRef.current) {
      return
    }
    hasInitializedRef.current = true
    
    // Initialize store with workspace and optional draft data
    // The store will handle checking for existing persisted state
    initialize(workspaceSlug, draftId || null, initialDraft)
  }, [workspaceSlug, draftId, initialDraft, initialize])

  // Reset the ref when unmounting
  useEffect(() => {
    return () => {
      hasInitializedRef.current = false
      agentSyncedRef.current = false
    }
  }, [])

  // ============================================================================
  // SYNC AGENT - Only when agents load and we have an agent_id without selectedAgent
  // ============================================================================

  useEffect(() => {
    // Guard: only sync once, and only if needed
    if (agentSyncedRef.current) return
    if (!isInitialized) return
    if (!formData.agent_id) return
    if (formData.selectedAgent) return
    if (agents.length === 0) return

    const agent = agents.find(a => a.id === formData.agent_id)
    if (agent) {
      agentSyncedRef.current = true
      selectAgent(agent)
    }
  }, [isInitialized, formData.agent_id, formData.selectedAgent, agents, selectAgent])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleNext = useCallback(() => {
    nextStep()
  }, [nextStep])

  const handlePrev = useCallback(() => {
    prevStep()
  }, [prevStep])

  const handleGoToStep = useCallback((step: number) => {
    goToStep(step)
  }, [goToStep])

  const handleCancel = useCallback(() => {
    reset()
    onCancel()
  }, [reset, onCancel])

  // Form update handler - creates a stable callback for step components
  const handleUpdateFormData = useCallback(
    <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => {
      updateField(key, value)
    },
    [updateField]
  )

  // Batch update handler for import step
  const handleUpdateMultipleFields = useCallback(
    (updates: Partial<WizardFormData>) => {
      updateFields(updates)
    },
    [updateFields]
  )

  // ============================================================================
  // SUBMIT HANDLER
  // ============================================================================

  const handleSubmit = useCallback(async () => {
    // Validate all steps before submission
    const isValid = validateAll()
    if (!isValid) {
      toast.error("Please fill in all required fields")
      return
    }

    // Additional validation before API call
    if (!formData.name || !formData.name.trim()) {
      toast.error("Campaign name is required")
      return
    }

    if (!formData.agent_id) {
      toast.error("Please select an AI agent")
      return
    }

    // Convert datetime-local format to ISO 8601 format
    let scheduledStartAt: string | null = null
    let scheduledExpiresAt: string | null = null

    if (formData.scheduleType === "scheduled" && formData.scheduledStartAt) {
      scheduledStartAt = new Date(formData.scheduledStartAt).toISOString()
    }

    if (formData.scheduleType === "scheduled" && formData.scheduledExpiresAt) {
      scheduledExpiresAt = new Date(formData.scheduledExpiresAt).toISOString()
    }

    // Build the submission data
    // Note: For optional fields (not nullable), we must use undefined, not null
    const wizardData: CreateCampaignWizardInput = {
      name: formData.name.trim(),
      description: formData.description?.trim() || null, // nullable field, null is OK
      agent_id: formData.agent_id,
      recipients: formData.recipients,
      csv_column_headers: formData.csvColumnHeaders,
      variable_mappings: [],
      agent_prompt_overrides: null, // nullable field, null is OK
      schedule_type: formData.scheduleType,
      scheduled_start_at: scheduledStartAt, // nullable field
      scheduled_expires_at: scheduledExpiresAt, // nullable field
      business_hours_config: formData.businessHoursConfig,
      business_hours_only: formData.businessHoursConfig.enabled,
      business_hours_start: undefined, // optional field, use undefined not null
      business_hours_end: undefined, // optional field, use undefined not null
      timezone: formData.businessHoursConfig.timezone,
      concurrency_limit: 1,
      max_attempts: 3,
      retry_delay_minutes: 30,
      wizard_completed: true,
      // Pass draft ID to convert existing draft instead of creating new
      // optional field (not nullable), must use undefined not null
      ...(draftId ? { draft_id: draftId } : {}),
    }

    console.log("[CampaignWizard] Submitting campaign:", {
      name: wizardData.name,
      agent_id: wizardData.agent_id,
      recipients: wizardData.recipients.length,
      schedule_type: wizardData.schedule_type,
    })

    try {
      await onSubmit(wizardData)
      // Reset store after successful submission
      reset()
    } catch (error) {
      // Error handling is done in parent component
      console.error("[CampaignWizard] Submit error:", error)
      throw error
    }
  }, [formData, draftId, onSubmit, validateAll, reset])

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
                      onClick={() => isClickable && handleGoToStep(step.id)}
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
              updateFormData={handleUpdateFormData}
              errors={errors}
              agents={agents}
              isLoadingAgents={isLoadingAgents}
            />
          )}
          {currentStep === 2 && (
            <StepImport
              formData={formData}
              updateMultipleFields={handleUpdateMultipleFields}
              errors={errors}
            />
          )}
          {currentStep === 3 && (
            <StepSchedule 
              formData={formData} 
              updateFormData={handleUpdateFormData} 
              errors={errors} 
            />
          )}
          {currentStep === 4 && (
            <StepReview
              formData={formData}
              updateFormData={handleUpdateFormData}
              errors={errors}
              goToStep={handleGoToStep}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button 
          type="button" 
          variant="outline" 
          onClick={currentStep === 1 ? handleCancel : handlePrev}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentStep === 1 ? "Cancel" : "Previous"}
        </Button>

        {currentStep < totalSteps ? (
          <Button type="button" onClick={handleNext}>
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

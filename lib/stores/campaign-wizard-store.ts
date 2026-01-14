/**
 * Campaign Wizard Zustand Store
 * 
 * Optimized local state management for the campaign creation wizard.
 * This eliminates the need for upfront draft creation and reduces API calls.
 * 
 * Key optimizations:
 * 1. All state changes are instant (local-first)
 * 2. DB syncs only happen on explicit save or step transitions
 * 3. Recipients stored locally until final submission
 * 4. State persisted in sessionStorage and restored on page refresh
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type {
  CreateRecipientInput,
  BusinessHoursConfig,
  AIAgent,
} from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

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

export interface WizardState {
  // Core wizard state
  currentStep: number
  totalSteps: number
  formData: WizardFormData
  errors: Record<string, string>
  
  // Draft management
  draftId: string | null
  isDirty: boolean
  lastSyncedAt: Date | null
  isSyncing: boolean
  syncError: string | null
  
  // Session management
  workspaceSlug: string | null
  isInitialized: boolean
}

export interface WizardActions {
  // Initialization
  initialize: (workspaceSlug: string, draftId?: string | null, initialData?: Partial<WizardFormData>) => void
  reset: () => void
  
  // Navigation
  setCurrentStep: (step: number) => void
  nextStep: () => boolean
  prevStep: () => void
  goToStep: (step: number) => void
  
  // Form updates (instant, local-only)
  updateField: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void
  updateFields: (updates: Partial<WizardFormData>) => void
  setErrors: (errors: Record<string, string>) => void
  clearError: (key: string) => void
  
  // Agent selection
  selectAgent: (agent: AIAgent) => void
  
  // Recipients management (all local)
  setRecipients: (recipients: CreateRecipientInput[], csvHeaders?: string[], fileName?: string | null) => void
  clearRecipients: () => void
  
  // Draft sync (explicit only)
  setDraftId: (id: string | null) => void
  markAsSynced: () => void
  setSyncStatus: (isSyncing: boolean, error?: string | null) => void
  
  // Validation
  validateStep: (step: number) => boolean
  validateAll: () => boolean
  
  // Getters
  getSubmissionData: () => WizardFormData & { draft_id: string | null }
  canProceed: () => boolean
  hasUnsavedChanges: () => boolean
}

export type CampaignWizardStore = WizardState & WizardActions

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: true,
  timezone: "America/New_York",
  schedule: {
    monday: [{ start: "09:00", end: "20:00" }],
    tuesday: [{ start: "09:00", end: "20:00" }],
    wednesday: [{ start: "09:00", end: "20:00" }],
    thursday: [{ start: "09:00", end: "20:00" }],
    friday: [{ start: "09:00", end: "20:00" }],
    saturday: [],
    sunday: [],
  },
}

const DEFAULT_FORM_DATA: WizardFormData = {
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
  businessHoursConfig: DEFAULT_BUSINESS_HOURS,
}

const DEFAULT_STATE: WizardState = {
  currentStep: 1,
  totalSteps: 4,
  formData: DEFAULT_FORM_DATA,
  errors: {},
  draftId: null,
  isDirty: false,
  lastSyncedAt: null,
  isSyncing: false,
  syncError: null,
  workspaceSlug: null,
  isInitialized: false,
}

// ============================================================================
// STORAGE KEY
// ============================================================================

const STORAGE_KEY = "campaign-wizard-storage"

// ============================================================================
// STORE CREATION
// ============================================================================

export const useCampaignWizardStore = create<CampaignWizardStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      // ========================================================================
      // INITIALIZATION
      // ========================================================================

      initialize: (workspaceSlug, draftId = null, initialData) => {
        const currentState = get()
        
        // Case 1: Already initialized for this workspace - preserve state
        if (currentState.isInitialized && currentState.workspaceSlug === workspaceSlug) {
          console.log("[CampaignWizardStore] Already initialized for this workspace, preserving state")
          
          // Only update draft ID if provided (for resuming specific draft)
          if (draftId && draftId !== currentState.draftId) {
            set({ draftId })
          }
          
          // Only merge initialData if provided (API draft data)
          if (initialData) {
            set({
              formData: {
                ...currentState.formData,
                ...initialData,
                businessHoursConfig: {
                  ...DEFAULT_BUSINESS_HOURS,
                  ...initialData.businessHoursConfig,
                },
              },
            })
          }
          return
        }

        // Case 2: Rehydrated from sessionStorage for same workspace
        if (currentState.workspaceSlug === workspaceSlug && currentState.formData.name) {
          console.log("[CampaignWizardStore] Rehydrated from sessionStorage, preserving state")
          set({
            isInitialized: true,
            // Keep draftId if we have one in storage
            draftId: draftId || currentState.draftId,
          })
          return
        }

        // Case 3: Different workspace or fresh start - initialize with defaults
        console.log("[CampaignWizardStore] Fresh initialization for workspace:", workspaceSlug)
        set({
          workspaceSlug,
          draftId,
          isInitialized: true,
          isDirty: false,
          currentStep: 1,
          errors: {},
          syncError: null,
          formData: initialData
            ? {
                ...DEFAULT_FORM_DATA,
                ...initialData,
                businessHoursConfig: {
                  ...DEFAULT_BUSINESS_HOURS,
                  ...initialData.businessHoursConfig,
                },
              }
            : { ...DEFAULT_FORM_DATA },
        })
      },

      reset: () => {
        console.log("[CampaignWizardStore] Resetting store")
        // Clear sessionStorage
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(STORAGE_KEY)
        }
        set({ ...DEFAULT_STATE })
      },

      // ========================================================================
      // NAVIGATION
      // ========================================================================

      setCurrentStep: (step) => {
        set({ currentStep: step })
      },

      nextStep: () => {
        const state = get()
        if (!state.validateStep(state.currentStep)) {
          return false
        }
        if (state.currentStep < state.totalSteps) {
          set({ currentStep: state.currentStep + 1 })
          return true
        }
        return false
      },

      prevStep: () => {
        const { currentStep } = get()
        if (currentStep > 1) {
          set({ currentStep: currentStep - 1 })
        }
      },

      goToStep: (step) => {
        const { currentStep, totalSteps } = get()
        // Allow going to any previously visited step or current step
        if (step >= 1 && step <= totalSteps && step <= currentStep) {
          set({ currentStep: step })
        }
      },

      // ========================================================================
      // FORM UPDATES (Instant, Local-Only)
      // ========================================================================

      updateField: (key, value) => {
        const { formData, errors } = get()
        const newErrors = { ...errors }
        delete newErrors[key]
        
        set({
          formData: { ...formData, [key]: value },
          isDirty: true,
          errors: newErrors,
        })
      },

      updateFields: (updates) => {
        const { formData, errors } = get()
        const newErrors = { ...errors }
        Object.keys(updates).forEach((key) => {
          delete newErrors[key]
        })
        
        set({
          formData: { ...formData, ...updates },
          isDirty: true,
          errors: newErrors,
        })
      },

      setErrors: (errors) => {
        set({ errors })
      },

      clearError: (key) => {
        const { errors } = get()
        const newErrors = { ...errors }
        delete newErrors[key]
        set({ errors: newErrors })
      },

      // ========================================================================
      // AGENT SELECTION
      // ========================================================================

      selectAgent: (agent) => {
        const { formData, errors } = get()
        const newErrors = { ...errors }
        delete newErrors.agent_id
        
        set({
          formData: {
            ...formData,
            agent_id: agent.id,
            selectedAgent: agent,
          },
          isDirty: true,
          errors: newErrors,
        })
      },

      // ========================================================================
      // RECIPIENTS MANAGEMENT (All Local)
      // ========================================================================

      setRecipients: (recipients, csvHeaders, fileName) => {
        const { formData } = get()
        set({
          formData: {
            ...formData,
            recipients,
            ...(csvHeaders !== undefined && { csvColumnHeaders: csvHeaders }),
            ...(fileName !== undefined && { importedFileName: fileName }),
          },
          isDirty: true,
        })
      },

      clearRecipients: () => {
        const { formData } = get()
        set({
          formData: {
            ...formData,
            recipients: [],
            csvColumnHeaders: [],
            importedFileName: null,
          },
          isDirty: true,
        })
      },

      // ========================================================================
      // DRAFT SYNC (Explicit Only)
      // ========================================================================

      setDraftId: (id) => {
        set({ draftId: id })
      },

      markAsSynced: () => {
        set({
          isDirty: false,
          lastSyncedAt: new Date(),
          syncError: null,
        })
      },

      setSyncStatus: (isSyncing, error = null) => {
        set({ isSyncing, syncError: error })
      },

      // ========================================================================
      // VALIDATION
      // ========================================================================

      validateStep: (step) => {
        const { formData, errors: currentErrors } = get()
        const newErrors: Record<string, string> = {}

        if (step === 1) {
          if (!formData.name || !formData.name.trim()) {
            newErrors.name = "Campaign name is required"
          }
          if (!formData.agent_id) {
            newErrors.agent_id = "Please select an AI agent"
          }
        }

        if (step === 3) {
          if (formData.scheduleType === "scheduled" && !formData.scheduledStartAt) {
            newErrors.scheduledStartAt = "Please select a start date/time"
          }
        }

        // Only update state if errors actually changed
        const newErrorKeys = Object.keys(newErrors).sort().join(',')
        const currentErrorKeys = Object.keys(currentErrors).sort().join(',')
        
        if (newErrorKeys !== currentErrorKeys || 
            Object.keys(newErrors).some(key => newErrors[key] !== currentErrors[key])) {
          set({ errors: newErrors })
        }
        
        return Object.keys(newErrors).length === 0
      },

      validateAll: () => {
        const { formData } = get()
        const allErrors: Record<string, string> = {}

        // Step 1 validation
        if (!formData.name || !formData.name.trim()) {
          allErrors.name = "Campaign name is required"
        }
        if (!formData.agent_id) {
          allErrors.agent_id = "Please select an AI agent"
        }

        // Step 3 validation
        if (formData.scheduleType === "scheduled" && !formData.scheduledStartAt) {
          allErrors.scheduledStartAt = "Please select a start date/time"
        }

        set({ errors: allErrors })
        return Object.keys(allErrors).length === 0
      },

      // ========================================================================
      // GETTERS
      // ========================================================================

      getSubmissionData: () => {
        const { formData, draftId } = get()
        return {
          ...formData,
          draft_id: draftId,
        }
      },

      canProceed: () => {
        const state = get()
        return state.validateStep(state.currentStep)
      },

      hasUnsavedChanges: () => {
        return get().isDirty
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      // Persist all relevant fields for page refresh recovery
      partialize: (state) => ({
        formData: state.formData,
        currentStep: state.currentStep,
        draftId: state.draftId,
        workspaceSlug: state.workspaceSlug,
        isDirty: state.isDirty,
        // Don't persist isInitialized - let it be set on mount
      }),
      // Handle rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          console.log("[CampaignWizardStore] Rehydrated from sessionStorage:", {
            workspaceSlug: state.workspaceSlug,
            currentStep: state.currentStep,
            hasName: !!state.formData?.name,
            hasAgentId: !!state.formData?.agent_id,
            recipientCount: state.formData?.recipients?.length || 0,
          })
        }
      },
    }
  )
)

// ============================================================================
// SELECTORS (for optimized re-renders)
// ============================================================================

export const selectFormData = (state: CampaignWizardStore) => state.formData
export const selectCurrentStep = (state: CampaignWizardStore) => state.currentStep
export const selectErrors = (state: CampaignWizardStore) => state.errors
export const selectIsDirty = (state: CampaignWizardStore) => state.isDirty
export const selectIsSyncing = (state: CampaignWizardStore) => state.isSyncing
export const selectDraftId = (state: CampaignWizardStore) => state.draftId
export const selectIsInitialized = (state: CampaignWizardStore) => state.isInitialized

// Step-specific selectors
export const selectStepDetails = (state: CampaignWizardStore) => ({
  name: state.formData.name,
  description: state.formData.description,
  agent_id: state.formData.agent_id,
  selectedAgent: state.formData.selectedAgent,
})

export const selectStepImport = (state: CampaignWizardStore) => ({
  recipients: state.formData.recipients,
  csvColumnHeaders: state.formData.csvColumnHeaders,
  importedFileName: state.formData.importedFileName,
})

export const selectStepSchedule = (state: CampaignWizardStore) => ({
  scheduleType: state.formData.scheduleType,
  scheduledStartAt: state.formData.scheduledStartAt,
  scheduledExpiresAt: state.formData.scheduledExpiresAt,
  businessHoursConfig: state.formData.businessHoursConfig,
})

export const selectRecipientCount = (state: CampaignWizardStore) => 
  state.formData.recipients.length

export const selectSyncStatus = (state: CampaignWizardStore) => ({
  isDirty: state.isDirty,
  isSyncing: state.isSyncing,
  lastSyncedAt: state.lastSyncedAt,
  syncError: state.syncError,
})

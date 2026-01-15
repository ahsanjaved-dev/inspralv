"use client"

/**
 * New Campaign Page - Optimized Version
 *
 * Key optimizations:
 * 1. NO upfront draft creation - page loads instantly
 * 2. All state managed locally via Zustand store
 * 3. State persisted in sessionStorage for recovery
 * 4. Campaign created on final submission only
 * 5. Optional draft loading for resuming existing drafts
 */

import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { CampaignWizard } from "@/components/workspace/campaigns/campaign-wizard-dynamic"
import { CampaignLoading } from "@/components/workspace/campaigns/campaign-loading"
import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"
import { useCreateCampaignWizard } from "@/lib/hooks/use-campaigns"
import { Button } from "@/components/ui/button"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { CreateCampaignWizardInput, AIAgent } from "@/types/database.types"
import type { WizardFormData } from "@/lib/stores/campaign-wizard-store"

// Main page component wrapped in Suspense
export default function NewCampaignPage() {
  return (
    <Suspense fallback={<CampaignLoading message="Loading..." submessage="Please wait" />}>
      <NewCampaignPageContent />
    </Suspense>
  )
}

function NewCampaignPageContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const workspaceSlug = params.workspaceSlug as string

  // Optional draft ID from URL (for resuming existing drafts)
  const draftIdParam = searchParams.get("draft")

  // State for draft loading (only used when resuming)
  const [isLoadingDraft, setIsLoadingDraft] = useState(!!draftIdParam)
  const [draftData, setDraftData] = useState<Partial<WizardFormData> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const { data: agentsData, isLoading: agentsLoading } = useWorkspaceAgents()
  const createMutation = useCreateCampaignWizard()

  const agents: AIAgent[] = agentsData?.data || []

  // =========================================================================
  // OPTIONAL: Load existing draft if resuming
  // =========================================================================

  useEffect(() => {
    // Only load draft if we have a draft ID in URL
    if (!draftIdParam) {
      setIsLoadingDraft(false)
      return
    }

    const loadDraft = async () => {
      try {
        console.log(`[NewCampaignPage] Loading draft: ${draftIdParam}`)
        const response = await fetch(`/api/w/${workspaceSlug}/campaigns/draft?id=${draftIdParam}`)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to load draft: ${response.status}`)
        }

        const result = await response.json()
        const data = result.data || result

        // Map API response to WizardFormData format
        setDraftData({
          name: data.name || "",
          description: data.description || "",
          agent_id: data.agent_id || "",
          selectedAgent: null, // Will be set when agents load
          recipients: data.recipients || [],
          csvColumnHeaders: data.csv_column_headers || [],
          importedFileName: null,
          scheduleType: (data.schedule_type || "immediate") as "immediate" | "scheduled",
          scheduledStartAt: data.scheduled_start_at || null,
          scheduledExpiresAt: data.scheduled_expires_at || null,
          businessHoursConfig: data.business_hours_config || undefined,
        })

        console.log(`[NewCampaignPage] Draft loaded successfully`)
      } catch (error) {
        console.error("[NewCampaignPage] Error loading draft:", error)
        setLoadError(error instanceof Error ? error.message : "Failed to load draft")
      } finally {
        setIsLoadingDraft(false)
      }
    }

    loadDraft()
  }, [draftIdParam, workspaceSlug])

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleSubmit = async (data: CreateCampaignWizardInput) => {
    try {
      const result = await createMutation.mutateAsync(data)

      // Show appropriate success message based on schedule type
      const scheduleType = result.data?.schedule_type

      if (scheduleType === "scheduled") {
        toast.success("Campaign scheduled! It will start automatically at the scheduled time.")
      } else if (scheduleType === "immediate") {
        toast.success("Campaign ready! Click 'Start Campaign' to begin calling.")
      } else {
        toast.success("Campaign created successfully!")
      }

      // Redirect to campaigns list
      router.push(`/w/${workspaceSlug}/campaigns`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create campaign")
      throw error
    }
  }

  const handleCancel = () => {
    router.push(`/w/${workspaceSlug}/campaigns`)
  }

  const handleRetry = () => {
    setLoadError(null)
    setIsLoadingDraft(true)
    // Trigger reload by navigating to same page
    router.replace(
      `/w/${workspaceSlug}/campaigns/new${draftIdParam ? `?draft=${draftIdParam}` : ""}`
    )
  }

  // =========================================================================
  // LOADING STATE (only for draft loading)
  // =========================================================================

  if (isLoadingDraft) {
    return (
      <CampaignLoading
        message="Loading your draft..."
        submessage="Retrieving your saved progress"
      />
    )
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================

  if (loadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Campaign</h1>
            <p className="text-muted-foreground">Something went wrong</p>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{loadError}</span>
            <div className="flex gap-2 ml-4">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Go Back
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // =========================================================================
  // MAIN CONTENT - Instant load, no waiting for draft creation
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {draftData ? "Continue Campaign" : "Create Campaign"}
          </h1>
          <p className="text-muted-foreground">
            {draftData
              ? "Continue setting up your outbound calling campaign"
              : "Set up a new outbound calling campaign step by step"}
          </p>
        </div>
      </div>

      {/* Wizard - loads instantly, no draft creation needed */}
      <CampaignWizard
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        onCancel={handleCancel}
        agents={agents}
        isLoadingAgents={agentsLoading}
        workspaceSlug={workspaceSlug}
        draftId={draftIdParam}
        initialDraft={draftData || undefined}
      />
    </div>
  )
}

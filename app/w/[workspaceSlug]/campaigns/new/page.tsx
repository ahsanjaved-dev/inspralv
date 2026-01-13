"use client"

import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useEffect, useState, useCallback, useRef } from "react"
import { CampaignWizard } from "@/components/workspace/campaigns/campaign-wizard-dynamic"
import { CampaignLoading } from "@/components/workspace/campaigns/campaign-loading"
import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"
import { useCreateCampaignWizard } from "@/lib/hooks/use-campaigns"
import { Button } from "@/components/ui/button"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { CreateCampaignWizardInput, AIAgent } from "@/types/database.types"

interface DraftData {
  draft_id: string
  name: string
  description: string | null
  agent_id: string | null
  recipients: any[]
  csv_column_headers: string[]
  schedule_type: string
  scheduled_start_at: string | null
  scheduled_expires_at: string | null
  timezone: string
  business_hours_config: any
}

export default function NewCampaignPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const workspaceSlug = params.workspaceSlug as string
  const draftIdParam = searchParams.get("draft")

  // State
  const [draftId, setDraftId] = useState<string | null>(draftIdParam)
  const [draftData, setDraftData] = useState<DraftData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  
  // Ref to prevent double creation in strict mode
  const isCreatingDraftRef = useRef(false)

  const { data: agentsData, isLoading: agentsLoading } = useWorkspaceAgents()
  const createMutation = useCreateCampaignWizard()

  const agents: AIAgent[] = agentsData?.data || []

  // =========================================================================
  // STEP 1: Create or Load Draft
  // =========================================================================
  
  const initializeDraft = useCallback(async () => {
    // If we already have a draft ID in URL, load that draft
    if (draftIdParam) {
      try {
        console.log(`[NewCampaignPage] Loading existing draft: ${draftIdParam}`)
        const response = await fetch(
          `/api/w/${workspaceSlug}/campaigns/draft?id=${draftIdParam}`
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to load draft: ${response.status}`)
        }

        const result = await response.json()
        const data = result.data || result // Handle both wrapped and unwrapped responses
        console.log(`[NewCampaignPage] Draft loaded:`, { id: data.id, name: data.name })

        setDraftData({
          draft_id: data.id,
          name: data.name || "",
          description: data.description,
          agent_id: data.agent_id,
          recipients: data.recipients || [],
          csv_column_headers: data.csv_column_headers || [],
          schedule_type: data.schedule_type || "immediate",
          scheduled_start_at: data.scheduled_start_at,
          scheduled_expires_at: data.scheduled_expires_at,
          timezone: data.timezone || "America/New_York",
          business_hours_config: data.business_hours_config,
        })
        setDraftId(data.id)
        setIsLoading(false)
        
      } catch (error) {
        console.error("[NewCampaignPage] Error loading draft:", error)
        const errorMessage = error instanceof Error ? error.message : "Failed to load draft"
        setLoadError(errorMessage)
        setIsLoading(false)
      }
      return
    }

    // No draft ID - create a new empty draft
    // Use ref to prevent double creation in React strict mode
    if (isCreatingDraftRef.current) {
      console.log("[NewCampaignPage] Draft creation already in progress, skipping")
      return
    }

    isCreatingDraftRef.current = true
    console.log("[NewCampaignPage] Creating new empty draft...")

    try {
      const response = await fetch(`/api/w/${workspaceSlug}/campaigns/draft/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create draft: ${response.status}`)
      }

      const result = await response.json()
      const newDraftId = result.data?.draft_id
      console.log(`[NewCampaignPage] New draft created: ${newDraftId}`)

      if (!newDraftId) {
        throw new Error("Failed to get draft ID from response")
      }

      // Redirect to URL with draft ID to prevent re-creation on refresh
      router.replace(`/w/${workspaceSlug}/campaigns/new?draft=${newDraftId}`)
      
    } catch (error) {
      console.error("[NewCampaignPage] Error creating draft:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to create draft"
      setLoadError(errorMessage)
      setIsLoading(false)
      isCreatingDraftRef.current = false
    }
  }, [draftIdParam, workspaceSlug, router])

  useEffect(() => {
    initializeDraft()
  }, [initializeDraft])

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleSubmit = async (data: CreateCampaignWizardInput) => {
    try {
      const result = await createMutation.mutateAsync(data)
      
      // Show appropriate success message based on status and schedule type
      const status = result.data?.status
      const scheduleType = result.data?.schedule_type
      
      if (status === "scheduled") {
        toast.success("Campaign scheduled! It will start automatically at the scheduled time.")
      } else if (scheduleType === "immediate") {
        toast.success("Campaign ready! Click 'Start Campaign' to begin calling.")
      } else {
        toast.success("Campaign created successfully!")
      }
      
      router.push(`/w/${workspaceSlug}/campaigns/${result.data.id}`)
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
    setIsLoading(true)
    isCreatingDraftRef.current = false
    initializeDraft()
  }

  // =========================================================================
  // LOADING STATE
  // =========================================================================

  if (isLoading) {
    return (
      <CampaignLoading 
        message={draftIdParam ? "Loading your draft..." : "Setting up your campaign..."}
        submessage={draftIdParam 
          ? "Retrieving your saved progress" 
          : "Creating a new draft for you"
        }
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
  // MAIN CONTENT
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
            {draftData?.name ? "Continue Campaign" : "Create Campaign"}
          </h1>
          <p className="text-muted-foreground">
            {draftData?.name 
              ? "Continue setting up your outbound calling campaign"
              : "Set up a new outbound calling campaign step by step"
            }
          </p>
        </div>
      </div>

      {/* Wizard */}
      <CampaignWizard
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        onCancel={handleCancel}
        agents={agents}
        isLoadingAgents={agentsLoading}
        draftId={draftId || undefined}
        initialDraft={draftData ? {
          draft_id: draftData.draft_id,
          name: draftData.name,
          description: draftData.description || undefined,
          agent_id: draftData.agent_id || undefined,
          recipients: draftData.recipients,
          csv_column_headers: draftData.csv_column_headers,
          schedule_type: draftData.schedule_type as "immediate" | "scheduled",
          scheduled_start_at: draftData.scheduled_start_at,
          scheduled_expires_at: draftData.scheduled_expires_at,
          timezone: draftData.timezone,
          business_hours_config: draftData.business_hours_config,
        } : undefined}
      />
    </div>
  )
}

"use client"

/**
 * Dynamic Campaign Wizard Wrapper
 *
 * Lazy loads the optimized campaign wizard to reduce initial bundle size.
 * Uses Zustand store for instant local state management.
 */

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { CreateCampaignWizardInput, AIAgent } from "@/types/database.types"
import type { WizardFormData } from "@/lib/stores/campaign-wizard-store"

// Props type for the wizard
export interface CampaignWizardProps {
  onSubmit: (data: CreateCampaignWizardInput) => Promise<void>
  isSubmitting: boolean
  onCancel: () => void
  agents: AIAgent[]
  isLoadingAgents: boolean
  workspaceSlug: string
  /** Optional: ID of existing draft to load */
  draftId?: string | null
  /** Optional: Initial draft data (when resuming a draft) */
  initialDraft?: Partial<WizardFormData>
}

// Dynamically import the optimized campaign wizard component
export const CampaignWizard = dynamic<CampaignWizardProps>(
  () =>
    import("./campaign-wizard-optimized").then((mod) => ({
      default: mod.CampaignWizardOptimized,
    })),
  {
    loading: () => <CampaignWizardSkeleton />,
    ssr: false, // Disable SSR for this heavy client component
  }
)

// Loading skeleton for the wizard
function CampaignWizardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Progress Header Skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Step Indicators */}
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-2">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <Skeleton className="h-4 w-20 hidden md:block" />
                    <Skeleton className="h-3 w-24 hidden md:block" />
                  </div>
                  {step < 4 && <Skeleton className="flex-1 h-0.5 mx-2" />}
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-24 mx-auto" />
          </div>
        </CardContent>
      </Card>

      {/* Step Content Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Form Fields Skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>

      {/* Navigation Buttons Skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  )
}

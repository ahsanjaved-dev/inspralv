"use client"

/**
 * Wizard Draft Card
 * 
 * Shows when there's unsaved wizard progress in sessionStorage.
 * Allows user to continue from where they left off or discard the draft.
 */

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  FileEdit,
  ArrowRight,
  Trash2,
  Clock,
  Users,
  FileText,
  Upload,
  CheckCircle2,
} from "lucide-react"
import { useCampaignWizardStore } from "@/lib/stores/campaign-wizard-store"

// Storage key must match the one in the store
const STORAGE_KEY = "campaign-wizard-storage"

interface WizardDraftData {
  formData: {
    name: string
    description: string
    agent_id: string
    recipients: unknown[]
    scheduleType: string
  }
  currentStep: number
  workspaceSlug: string | null
}

const STEP_INFO = [
  { title: "Campaign Details", icon: FileText },
  { title: "Import Recipients", icon: Upload },
  { title: "Schedule", icon: Clock },
  { title: "Review & Launch", icon: CheckCircle2 },
]

export function WizardDraftCard() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  
  const [draftData, setDraftData] = useState<WizardDraftData | null>(null)
  const [isDiscarding, setIsDiscarding] = useState(false)
  
  // Get the reset function from the store
  const reset = useCampaignWizardStore((state) => state.reset)

  // Check for saved draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        const state = parsed?.state as WizardDraftData | undefined
        
        // Only show if:
        // 1. There's actual data
        // 2. It's for the current workspace
        // 3. The user has made some progress (name or recipients or step > 1)
        if (
          state?.workspaceSlug === workspaceSlug &&
          (state?.formData?.name || 
           state?.formData?.recipients?.length > 0 ||
           state?.currentStep > 1)
        ) {
          setDraftData(state)
        } else {
          setDraftData(null)
        }
      } else {
        setDraftData(null)
      }
    } catch (error) {
      console.error("[WizardDraftCard] Error reading draft:", error)
      setDraftData(null)
    }
  }, [workspaceSlug])

  // Handle continue - navigate to wizard
  const handleContinue = () => {
    router.push(`/w/${workspaceSlug}/campaigns/new`)
  }

  // Handle discard - clear storage and reset state
  const handleDiscard = () => {
    setIsDiscarding(true)
    try {
      reset() // This clears sessionStorage too
      setDraftData(null)
    } finally {
      setIsDiscarding(false)
    }
  }

  // Don't render if no draft
  if (!draftData) return null

  const { formData, currentStep } = draftData
  const totalSteps = 4
  const progress = (currentStep / totalSteps) * 100
  const recipientCount = formData?.recipients?.length || 0
  const campaignName = formData?.name || "Untitled Campaign"
  const CurrentStepIcon = STEP_INFO[currentStep - 1]?.icon || FileText

  return (
    <Card className="border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="p-3 bg-amber-500/20 rounded-lg shrink-0">
            <FileEdit className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg truncate">{campaignName}</h3>
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/50 shrink-0">
                Draft in Progress
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              You have an unsaved campaign draft. Continue where you left off or discard to start fresh.
            </p>

            {/* Progress Info */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CurrentStepIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-muted-foreground">
                    Step {currentStep} of {totalSteps}: {STEP_INFO[currentStep - 1]?.title}
                  </span>
                </div>
                {recipientCount > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{recipientCount} recipients</span>
                  </div>
                )}
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Discard
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard Draft?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to discard this draft? All your progress will be lost.
                    {recipientCount > 0 && (
                      <span className="block mt-2 font-medium text-amber-600 dark:text-amber-400">
                        This includes {recipientCount} imported recipients.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDiscard}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isDiscarding}
                  >
                    {isDiscarding ? "Discarding..." : "Discard Draft"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button onClick={handleContinue} className="gap-2">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


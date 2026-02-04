"use client"

import { useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Variable,
  Sparkles,
  Info,
  Lock,
  Briefcase,
  FileSpreadsheet,
} from "lucide-react"
import type { WizardFormData } from "@/lib/stores/campaign-wizard-store"
import { useWorkspaceCustomVariables } from "@/lib/hooks/use-workspace-settings"
import { STANDARD_CAMPAIGN_VARIABLES } from "@/types/database.types"

interface StepVariablesProps {
  formData: WizardFormData
  updateFormData: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void
  errors: Record<string, string>
}

export function StepVariables({
  formData,
  updateFormData,
  errors,
}: StepVariablesProps) {
  // Get workspace custom variables
  const { customVariables: workspaceVariables, isLoading: isLoadingWorkspaceVars } = useWorkspaceCustomVariables()

  // Get CSV variables (columns beyond standard fields)
  const csvVariables = useMemo(() => {
    const standardNames = new Set(STANDARD_CAMPAIGN_VARIABLES.map((v) => v.name.toLowerCase()))
    const workspaceNames = new Set(workspaceVariables.map((v) => v.name.toLowerCase()))
    
    return (formData.csvColumnHeaders || [])
      .filter((col) => !standardNames.has(col.toLowerCase()) && !workspaceNames.has(col.toLowerCase()))
      .map((col) => ({
        csv_column: col,
        placeholder: `{{${col}}}`,
      }))
  }, [formData.csvColumnHeaders, workspaceVariables])

  // Get agent's system prompt for variable detection
  // Note: For outbound campaigns, greeting/first_message is NOT used because
  // the agent waits for the recipient to speak first (they say "Hello?")
  const agentSystemPrompt = formData.selectedAgent
    ? (formData.selectedAgent.config as { system_prompt?: string })?.system_prompt || ""
    : ""

  // Find variables used in the agent's system prompt
  const usedVariables = useMemo(() => {
    const regex = /\{\{([a-z_]+)\}\}/gi
    const matches = new Set<string>()
    
    let match
    while ((match = regex.exec(agentSystemPrompt)) !== null) {
      if (match[1]) {
        matches.add(match[1].toLowerCase())
      }
    }
    
    return matches
  }, [agentSystemPrompt])

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Variables from your workspace settings and CSV will be automatically available. 
          The agent will use its configured prompts with personalized data for each recipient.
        </AlertDescription>
      </Alert>

      {/* Standard Variables Section */}
      <div>
        <Label className="text-base font-medium flex items-center gap-2 mb-3">
          <Lock className="h-4 w-4" />
          Standard Variables
        </Label>
        <p className="text-sm text-muted-foreground mb-4">
          Built-in variables mapped from standard CSV columns
        </p>

        <div className="flex flex-wrap gap-2">
          {STANDARD_CAMPAIGN_VARIABLES.map((v) => (
            <Badge
              key={v.name}
              variant="secondary"
              className={`text-sm py-1.5 px-3 ${usedVariables.has(v.name) ? 'ring-2 ring-primary ring-offset-2' : ''}`}
              title={v.description}
            >
              {`{{${v.name}}}`}
              {usedVariables.has(v.name) && <span className="ml-1 text-xs">✓</span>}
            </Badge>
          ))}
        </div>
      </div>

      {/* Workspace Custom Variables Section */}
      {workspaceVariables.length > 0 && (
        <div className="border-t pt-6">
          <Label className="text-base font-medium flex items-center gap-2 mb-3">
            <Briefcase className="h-4 w-4" />
            Workspace Variables
          </Label>
          <p className="text-sm text-muted-foreground mb-4">
            Custom variables defined in your workspace settings
          </p>

          <div className="flex flex-wrap gap-2">
            {workspaceVariables.map((v) => (
              <Badge
                key={v.id}
                variant="outline"
                className={`text-sm py-1.5 px-3 ${usedVariables.has(v.name) ? 'ring-2 ring-primary ring-offset-2 bg-primary/10' : ''}`}
                title={`${v.description}${v.default_value ? ` (Default: ${v.default_value})` : ''}`}
              >
                {`{{${v.name}}}`}
                {v.is_required && <span className="ml-1 text-destructive">*</span>}
                {usedVariables.has(v.name) && <span className="ml-1 text-xs">✓</span>}
              </Badge>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            💡 Manage workspace variables in Settings → Custom Variables
          </p>
        </div>
      )}

      {/* CSV Custom Variables Section */}
      {csvVariables.length > 0 && (
        <div className="border-t pt-6">
          <Label className="text-base font-medium flex items-center gap-2 mb-3">
            <FileSpreadsheet className="h-4 w-4" />
            CSV Variables
          </Label>
          <p className="text-sm text-muted-foreground mb-4">
            Additional variables detected from your CSV columns
          </p>

          <div className="flex flex-wrap gap-2">
            {csvVariables.map((cv) => (
              <Badge
                key={cv.csv_column}
                variant="default"
                className={`text-sm py-1.5 px-3 ${usedVariables.has(cv.csv_column) ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                title={`From CSV column: ${cv.csv_column}`}
              >
                {cv.placeholder}
                <Sparkles className="h-3 w-3 ml-1" />
                {usedVariables.has(cv.csv_column) && <span className="ml-1 text-xs">✓</span>}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Variable Usage Summary */}
      {usedVariables.size > 0 && (
        <div className="border-t pt-6">
          <Label className="text-base font-medium mb-3 block">
            Variables Used in Agent Prompts
          </Label>
          <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300">
              Your agent uses <strong>{usedVariables.size}</strong> variable{usedVariables.size > 1 ? 's' : ''}: {Array.from(usedVariables).map(v => `{{${v}}}`).join(', ')}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-2">
              Make sure your CSV includes columns for these variables, or they will use default values.
            </p>
          </div>
        </div>
      )}

      {/* No recipients warning */}
      {formData.recipients.length === 0 && (
        <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
          <Variable className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-lg mb-1">No recipients imported yet</p>
          <p className="text-sm text-muted-foreground">
            Import recipients in the previous step to see additional CSV variables.
          </p>
        </div>
      )}
    </div>
  )
}

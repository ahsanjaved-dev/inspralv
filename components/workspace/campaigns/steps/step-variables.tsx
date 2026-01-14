"use client"

import { useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Variable,
  Sparkles,
  Info,
} from "lucide-react"
import type { WizardFormData } from "@/lib/stores/campaign-wizard-store"

interface StepVariablesProps {
  formData: WizardFormData
  updateFormData: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void
  errors: Record<string, string>
}

// Standard variables that are always available
const STANDARD_VARIABLES = [
  { name: "first_name", description: "Recipient's first name" },
  { name: "last_name", description: "Recipient's last name" },
  { name: "email", description: "Recipient's email" },
  { name: "company", description: "Recipient's company" },
  { name: "phone_number", description: "Recipient's phone" },
]

export function StepVariables({
  formData,
  updateFormData,
  errors,
}: StepVariablesProps) {
  // Get custom variables from imported data or CSV headers
  const customVariables: Array<{ csv_column: string; prompt_placeholder: string }> = 
    (formData.csvColumnHeaders || []).map((col) => ({
      csv_column: col,
      prompt_placeholder: `{{${col}}}`,
    }))

  // All available variables
  const allVariables = useMemo(() => {
    const vars = STANDARD_VARIABLES.map((v) => ({
      name: v.name,
      placeholder: `{{${v.name}}}`,
      description: v.description,
      isCustom: false,
    }))

    customVariables.forEach((cv) => {
      vars.push({
        name: cv.csv_column,
        placeholder: cv.prompt_placeholder,
        description: `Custom variable from CSV column: ${cv.csv_column}`,
        isCustom: true,
      })
    })

    return vars
  }, [customVariables])

  // Get agent's greeting for display
  const agentGreeting = formData.selectedAgent
    ? (formData.selectedAgent.config as { first_message?: string })?.first_message || 
      (formData.selectedAgent.config as { greeting?: string })?.greeting || 
      "No greeting configured"
    : "Select an agent to see greeting"

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Variables from your CSV will be automatically available in your agent's greeting. 
          The agent will use its configured greeting with personalized data for each recipient.
        </AlertDescription>
      </Alert>

      {/* Available Variables Section */}
      <div>
        <Label className="text-base font-medium flex items-center gap-2 mb-3">
          <Variable className="h-4 w-4" />
          Available Variables
        </Label>
        <p className="text-sm text-muted-foreground mb-4">
          These variables will be automatically replaced with recipient data during calls
        </p>

        <div className="flex flex-wrap gap-2">
          {allVariables.map((v) => (
            <Badge
              key={v.name}
              variant={v.isCustom ? "default" : "secondary"}
              className="text-sm py-1.5 px-3"
              title={v.description}
            >
              {v.placeholder}
              {v.isCustom && <Sparkles className="h-3 w-3 ml-1" />}
            </Badge>
          ))}
        </div>

        {formData.recipients.length === 0 && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            💡 Import recipients in the previous step to see custom variables from your CSV
          </p>
        )}
      </div>

      {/* Agent Greeting Preview */}
      <div className="border-t pt-6">
        <Label className="text-base font-medium mb-3 block">
          Agent Greeting (Preview)
        </Label>
        <p className="text-sm text-muted-foreground mb-3">
          This is the greeting configured for your selected agent. Variables will be personalized for each call.
        </p>
        
        <div className="p-4 bg-muted/50 rounded-lg border">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {agentGreeting}
          </p>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          💡 To change the greeting, edit your agent's configuration in the Agents section
        </p>
      </div>

      {/* Custom Variables Info */}
      {customVariables.length > 0 && (
        <div className="border-t pt-6">
          <Label className="text-base font-medium mb-3 block">
            Custom Variables from CSV
          </Label>
          <p className="text-sm text-muted-foreground mb-3">
            {customVariables.length} custom {customVariables.length === 1 ? 'variable' : 'variables'} detected from your CSV file
          </p>

          <div className="space-y-2">
            {customVariables.map((mapping, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">
                    {mapping.csv_column}
                  </Badge>
                  <span className="text-sm text-muted-foreground">→</span>
                  <Badge variant="default" className="font-mono">
                    {mapping.prompt_placeholder}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No recipients warning */}
      {formData.recipients.length === 0 && (
        <div className="text-center p-8 border border-dashed rounded-lg bg-muted/20">
          <Variable className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-lg mb-1">No recipients imported yet</p>
          <p className="text-sm text-muted-foreground">
            Import recipients in the previous step to see personalized variables from your CSV.
          </p>
        </div>
      )}
    </div>
  )
}

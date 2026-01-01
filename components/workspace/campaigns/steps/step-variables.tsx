"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Variable,
  MessageSquare,
  Eye,
  Plus,
  X,
  Sparkles,
  User,
} from "lucide-react"
import type { VariableMapping, AgentPromptOverrides } from "@/types/database.types"
import type { WizardFormData } from "../campaign-wizard"

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
  const [enableOverrides, setEnableOverrides] = useState(
    formData.agentPromptOverrides !== null
  )
  const [previewRecipientIndex, setPreviewRecipientIndex] = useState(0)

  // Get custom variables from imported data
  const customVariables = formData.variableMappings

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
        description: `Custom variable from CSV`,
        isCustom: true,
      })
    })

    return vars
  }, [customVariables])

  // Get sample recipient for preview
  const sampleRecipient = formData.recipients[previewRecipientIndex] || {
    phone_number: "+1 (555) 123-4567",
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    company: "Acme Inc",
    custom_variables: {},
  }

  // Replace variables in text for preview
  const replaceVariables = (text: string): string => {
    let result = text

    // Replace standard variables
    result = result.replace(/\{\{first_name\}\}/gi, sampleRecipient.first_name || "")
    result = result.replace(/\{\{last_name\}\}/gi, sampleRecipient.last_name || "")
    result = result.replace(/\{\{email\}\}/gi, sampleRecipient.email || "")
    result = result.replace(/\{\{company\}\}/gi, sampleRecipient.company || "")
    result = result.replace(/\{\{phone_number\}\}/gi, sampleRecipient.phone_number || "")

    // Replace custom variables
    for (const [key, value] of Object.entries(sampleRecipient.custom_variables || {})) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi")
      result = result.replace(regex, String(value))
    }

    return result
  }

  // Get agent's current greeting for reference
  const agentGreeting = formData.selectedAgent
    ? (formData.selectedAgent.config as { greeting?: string })?.greeting || ""
    : ""

  const handleToggleOverrides = (enabled: boolean) => {
    setEnableOverrides(enabled)
    if (enabled) {
      updateFormData("agentPromptOverrides", {
        greeting_override: agentGreeting,
        system_prompt_additions: "",
      })
    } else {
      updateFormData("agentPromptOverrides", null)
    }
  }

  const updateOverride = (
    field: keyof AgentPromptOverrides,
    value: string
  ) => {
    const current = formData.agentPromptOverrides || {
      greeting_override: "",
      system_prompt_additions: "",
    }
    updateFormData("agentPromptOverrides", {
      ...current,
      [field]: value,
    })
  }

  const updateVariableMapping = (index: number, field: keyof VariableMapping, value: string) => {
    const updated = [...formData.variableMappings]
    updated[index] = { ...updated[index], [field]: value } as VariableMapping
    updateFormData("variableMappings", updated)
  }

  const addVariableMapping = () => {
    updateFormData("variableMappings", [
      ...formData.variableMappings,
      {
        csv_column: "",
        prompt_placeholder: "{{new_variable}}",
        default_value: "",
      },
    ])
  }

  const removeVariableMapping = (index: number) => {
    const updated = formData.variableMappings.filter((_, i) => i !== index)
    updateFormData("variableMappings", updated)
  }

  const insertVariable = (placeholder: string) => {
    const textarea = document.getElementById("greeting-override") as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const currentValue = formData.agentPromptOverrides?.greeting_override || ""
      const newValue = currentValue.slice(0, start) + placeholder + currentValue.slice(end)
      updateOverride("greeting_override", newValue)
      
      // Reset cursor position
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length)
      }, 0)
    }
  }

  return (
    <div className="space-y-8">
      {/* Available Variables Section */}
      <div>
        <Label className="text-base font-medium flex items-center gap-2">
          <Variable className="h-4 w-4" />
          Available Variables
        </Label>
        <p className="text-sm text-muted-foreground mb-3">
          Use these placeholders in your agent's greeting to personalize calls
        </p>

        <div className="flex flex-wrap gap-2">
          {allVariables.map((v) => (
            <Badge
              key={v.name}
              variant={v.isCustom ? "default" : "secondary"}
              className="cursor-pointer hover:bg-primary/80"
              onClick={() => insertVariable(v.placeholder)}
              title={`Click to insert • ${v.description}`}
            >
              {v.placeholder}
              {v.isCustom && <Sparkles className="h-3 w-3 ml-1" />}
            </Badge>
          ))}
        </div>

        {formData.recipients.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            💡 Import recipients in the previous step to see custom variables from your CSV
          </p>
        )}
      </div>

      {/* Custom Variable Mappings */}
      {customVariables.length > 0 && (
        <div>
          <Label className="text-base font-medium">Custom Variable Settings</Label>
          <p className="text-sm text-muted-foreground mb-3">
            Configure how custom variables from your CSV are used
          </p>

          <div className="space-y-3">
            {customVariables.map((mapping, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">CSV Column</Label>
                  <p className="font-mono text-sm">{mapping.csv_column}</p>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Placeholder</Label>
                  <Input
                    value={mapping.prompt_placeholder}
                    onChange={(e) => updateVariableMapping(index, "prompt_placeholder", e.target.value)}
                    className="font-mono h-8"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Default Value</Label>
                  <Input
                    value={mapping.default_value || ""}
                    onChange={(e) => updateVariableMapping(index, "default_value", e.target.value)}
                    placeholder="If empty"
                    className="h-8"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeVariableMapping(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={addVariableMapping}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Variable
          </Button>
        </div>
      )}

      {/* Agent Prompt Override Section */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Label className="text-base font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Customize Agent Greeting
            </Label>
            <p className="text-sm text-muted-foreground">
              Override the agent's default greeting for this campaign
            </p>
          </div>
          <Switch
            checked={enableOverrides}
            onCheckedChange={handleToggleOverrides}
          />
        </div>

        {enableOverrides && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="greeting-override">Campaign Greeting</Label>
              <Textarea
                id="greeting-override"
                value={formData.agentPromptOverrides?.greeting_override || ""}
                onChange={(e) => updateOverride("greeting_override", e.target.value)}
                placeholder="Hi {{first_name}}, this is Alex from {{company}}. I'm calling about..."
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Click variables above to insert them at cursor position
              </p>
            </div>

            <div>
              <Label htmlFor="system-additions">Additional Context (Optional)</Label>
              <Textarea
                id="system-additions"
                value={formData.agentPromptOverrides?.system_prompt_additions || ""}
                onChange={(e) => updateOverride("system_prompt_additions", e.target.value)}
                placeholder="Additional instructions for the agent during this campaign..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Extra instructions appended to the agent's system prompt
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Live Preview */}
      {enableOverrides && formData.agentPromptOverrides?.greeting_override && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <Label className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Live Preview
              </Label>
              {formData.recipients.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewRecipientIndex === 0}
                    onClick={() => setPreviewRecipientIndex((i) => Math.max(0, i - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Recipient {previewRecipientIndex + 1} of {formData.recipients.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewRecipientIndex >= formData.recipients.length - 1}
                    onClick={() =>
                      setPreviewRecipientIndex((i) =>
                        Math.min(formData.recipients.length - 1, i + 1)
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <div className="p-2 bg-muted rounded-full h-fit">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 p-4 bg-muted/50 rounded-lg border">
                <p className="text-sm leading-relaxed">
                  {replaceVariables(formData.agentPromptOverrides.greeting_override)}
                </p>
              </div>
            </div>

            {formData.recipients.length > 0 && (
              <div className="mt-4 p-3 bg-background rounded border">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Sample Recipient Data:
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">
                    {sampleRecipient.first_name} {sampleRecipient.last_name}
                  </Badge>
                  <Badge variant="outline">{sampleRecipient.phone_number}</Badge>
                  {Object.entries(sampleRecipient.custom_variables || {}).map(([key, value]) => (
                    <Badge key={key} variant="secondary">
                      {key}: {String(value)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No recipients warning */}
      {formData.recipients.length === 0 && (
        <div className="text-center p-6 border border-dashed rounded-lg">
          <Variable className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="font-medium">No recipients imported yet</p>
          <p className="text-sm text-muted-foreground">
            Import recipients in the previous step to use personalized variables.
            You can still customize the greeting here.
          </p>
        </div>
      )}
    </div>
  )
}


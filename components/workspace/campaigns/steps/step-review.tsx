"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  FileText,
  Bot,
  Users,
  Variable,
  Clock,
  Settings2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import type { WizardFormData } from "../campaign-wizard"
import type { BusinessHoursTimeSlot } from "@/types/database.types"

interface StepReviewProps {
  formData: WizardFormData
  updateFormData: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void
  errors: Record<string, string>
  goToStep: (step: number) => void
}

export function StepReview({
  formData,
  updateFormData,
  errors,
  goToStep,
}: StepReviewProps) {
  const warnings: string[] = []

  // Check for potential issues
  if (formData.recipients.length === 0) {
    warnings.push("No recipients imported - you'll need to add them after creation")
  }
  
  if (!formData.selectedAgent?.external_phone_number) {
    warnings.push("Selected agent doesn't have a phone number assigned")
  }

  if (formData.businessHoursConfig.enabled) {
    const hasAnySchedule = Object.values(formData.businessHoursConfig.schedule).some(
      (slots) => slots.length > 0
    )
    if (!hasAnySchedule) {
      warnings.push("Business hours enabled but no days/times configured")
    }
  }

  // Calculate total calling hours per week
  const totalHoursPerWeek = Object.values(formData.businessHoursConfig.schedule).reduce(
    (total: number, slots) => {
      return (
        total +
        slots.reduce((acc: number, slot: BusinessHoursTimeSlot) => {
          const startParts = slot.start.split(":")
          const endParts = slot.end.split(":")
          const startH = startParts[0] ? Number(startParts[0]) : 0
          const startM = startParts[1] ? Number(startParts[1]) : 0
          const endH = endParts[0] ? Number(endParts[0]) : 0
          const endM = endParts[1] ? Number(endParts[1]) : 0
          return acc + ((endH + endM / 60) - (startH + startM / 60))
        }, 0)
      )
    },
    0
  )

  // Active days
  const activeDays = Object.entries(formData.businessHoursConfig.schedule)
    .filter(([_, slots]) => slots.length > 0)
    .map(([day]) => day.charAt(0).toUpperCase() + day.slice(1, 3))

  return (
    <div className="space-y-6">
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Review Before Creating
              </p>
              <ul className="mt-1 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                {warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Campaign Details
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => goToStep(1)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            <div className="flex">
              <dt className="w-32 text-muted-foreground text-sm">Name</dt>
              <dd className="flex-1 font-medium">{formData.name}</dd>
            </div>
            {formData.description && (
              <div className="flex">
                <dt className="w-32 text-muted-foreground text-sm">Description</dt>
                <dd className="flex-1 text-sm">{formData.description}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* AI Agent */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Agent
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => goToStep(1)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          {formData.selectedAgent ? (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{formData.selectedAgent.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{formData.selectedAgent.provider}</Badge>
                  {formData.selectedAgent.external_phone_number && (
                    <span>{formData.selectedAgent.external_phone_number}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No agent selected</p>
          )}
        </CardContent>
      </Card>

      {/* Recipients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Recipients
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => goToStep(2)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{formData.recipients.length}</p>
              <p className="text-sm text-muted-foreground">Total Recipients</p>
            </div>
            {formData.importedFileName && (
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Imported from:</p>
                <p className="font-mono text-sm">{formData.importedFileName}</p>
              </div>
            )}
          </div>
          
          {formData.variableMappings.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">Custom Variables:</p>
              <div className="flex flex-wrap gap-2">
                {formData.variableMappings.map((mapping) => (
                  <Badge key={mapping.csv_column} variant="outline">
                    {mapping.prompt_placeholder}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Variable Mapping / Greeting */}
      {formData.agentPromptOverrides && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Variable className="h-4 w-4" />
              Custom Greeting
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => goToStep(3)}>
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-muted/50 rounded-lg border">
              <p className="text-sm italic">
                "{formData.agentPromptOverrides.greeting_override}"
              </p>
            </div>
            {formData.agentPromptOverrides.system_prompt_additions && (
              <p className="text-xs text-muted-foreground mt-2">
                + Additional context configured
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Schedule
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => goToStep(4)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            <div className="flex items-center">
              <dt className="w-32 text-muted-foreground text-sm">Start</dt>
              <dd className="flex-1">
                {formData.scheduleType === "immediate" ? (
                  <Badge variant="default">Immediately</Badge>
                ) : (
                  <span className="font-medium">
                    {formData.scheduledStartAt
                      ? new Date(formData.scheduledStartAt).toLocaleString()
                      : "Not set"}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-center">
              <dt className="w-32 text-muted-foreground text-sm">Business Hours</dt>
              <dd className="flex-1">
                {formData.businessHoursConfig.enabled ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Enabled</Badge>
                    <span className="text-sm text-muted-foreground">
                      {activeDays.join(", ")} • {totalHoursPerWeek.toFixed(0)}h/week
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">24/7</span>
                )}
              </dd>
            </div>
            {formData.businessHoursConfig.enabled && (
              <div className="flex items-center">
                <dt className="w-32 text-muted-foreground text-sm">Timezone</dt>
                <dd className="flex-1">{formData.businessHoursConfig.timezone}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Advanced Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Concurrent Calls</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={formData.concurrencyLimit}
                onChange={(e) =>
                  updateFormData("concurrencyLimit", parseInt(e.target.value) || 1)
                }
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Max Retry Attempts</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={formData.maxAttempts}
                onChange={(e) =>
                  updateFormData("maxAttempts", parseInt(e.target.value) || 3)
                }
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Retry Delay (min)</Label>
              <Input
                type="number"
                min={5}
                value={formData.retryDelayMinutes}
                onChange={(e) =>
                  updateFormData("retryDelayMinutes", parseInt(e.target.value) || 30)
                }
                className="h-9 mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ready to Create */}
      <div className="flex items-center justify-center p-6 bg-green-50 dark:bg-green-950 rounded-lg">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full mb-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="font-medium text-green-800 dark:text-green-200">
            Ready to Create Campaign
          </h3>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
            Click "Create Campaign" below to finalize
          </p>
        </div>
      </div>
    </div>
  )
}


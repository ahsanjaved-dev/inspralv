"use client"

import { memo, useMemo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Bot, Phone, AlertCircle } from "lucide-react"
import type { AIAgent } from "@/types/database.types"
import type { WizardFormData } from "@/lib/stores/campaign-wizard-store"

interface StepDetailsProps {
  formData: WizardFormData
  updateFormData: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void
  errors: Record<string, string>
  agents: AIAgent[]
  isLoadingAgents: boolean
}

export const StepDetails = memo(function StepDetails({
  formData,
  updateFormData,
  errors,
  agents,
  isLoadingAgents,
}: StepDetailsProps) {
  // Memoize filtered agents to prevent recalculation
  const activeAgents = useMemo(() => agents.filter((a) => a.is_active), [agents])

  // Memoize handler to prevent recreation
  const handleAgentSelect = useCallback((agentId: string) => {
    const agent = activeAgents.find((a) => a.id === agentId)
    updateFormData("agent_id", agentId)
    updateFormData("selectedAgent", agent || null)
  }, [activeAgents, updateFormData])

  return (
    <div className="space-y-6">
      {/* Campaign Name */}
      <div className="space-y-2">
        <Label htmlFor="name">
          Campaign Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          placeholder="e.g., Holiday Sale Outreach, Customer Follow-up"
          value={formData.name}
          onChange={(e) => updateFormData("name", e.target.value)}
          className={errors.name ? "border-destructive" : ""}
        />
        {errors.name && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.name}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe the purpose of this campaign..."
          value={formData.description}
          onChange={(e) => updateFormData("description", e.target.value)}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Optional: Add notes about the campaign goal or target audience
        </p>
      </div>

      {/* Agent Selection */}
      <div className="space-y-2">
        <Label>
          AI Agent <span className="text-destructive">*</span>
        </Label>
        {isLoadingAgents ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : activeAgents.length === 0 ? (
          <div className="border border-dashed rounded-lg p-6 text-center">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="font-medium">No active agents available</p>
            <p className="text-sm text-muted-foreground">
              You need to create an AI agent before creating a campaign.
            </p>
          </div>
        ) : (
          <>
            <Select value={formData.agent_id} onValueChange={handleAgentSelect}>
              <SelectTrigger className={errors.agent_id ? "border-destructive" : ""}>
                <SelectValue placeholder="Select an AI agent for this campaign" />
              </SelectTrigger>
              <SelectContent>
                {activeAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>{agent.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {agent.provider}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.agent_id && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {errors.agent_id}
              </p>
            )}
          </>
        )}

        {/* Selected Agent Preview */}
        {formData.selectedAgent && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">{formData.selectedAgent.name}</h4>
                  <Badge variant="outline">{formData.selectedAgent.provider}</Badge>
                </div>
                {formData.selectedAgent.description && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {formData.selectedAgent.description}
                  </p>
                )}
                {/* Show phone number - either external, assigned, or shared outbound */}
                {formData.selectedAgent.external_phone_number ? (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{formData.selectedAgent.external_phone_number}</span>
                  </div>
                ) : formData.selectedAgent.assigned_phone_number_id ? (
                  <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <Phone className="h-3.5 w-3.5" />
                    <span>Phone number assigned</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                    <Phone className="h-3.5 w-3.5" />
                    <span>Will use shared outbound number</span>
                  </div>
                )}
                
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

// Display name for debugging
StepDetails.displayName = "StepDetails"


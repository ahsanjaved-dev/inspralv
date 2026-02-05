"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Key, Check, AlertCircle, Building2, Star } from "lucide-react"
import {
  useWorkspaceIntegrationAssignments,
  useAssignWorkspaceIntegration,
  useRemoveWorkspaceIntegration,
  usePartnerIntegrations,
} from "@/lib/hooks/use-partner-integrations"
import { toast } from "sonner"

interface WorkspaceIntegrationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: {
    id: string
    name: string
    slug: string
  } | null
}

const PROVIDERS = [
  { id: "vapi", name: "Vapi", icon: "🎙️" },
  { id: "retell", name: "Retell AI", icon: "🤖" },
  { id: "elevenlabs", name: "ElevenLabs", icon: "🔊" },
  { id: "algolia", name: "Algolia", icon: "🔍" },
  { id: "google_calendar", name: "Google Calendar", icon: "📅" },
]

export function WorkspaceIntegrationsDialog({
  open,
  onOpenChange,
  workspace,
}: WorkspaceIntegrationsDialogProps) {
  const { data: assignmentsData, isLoading: assignmentsLoading } = useWorkspaceIntegrationAssignments(
    open ? workspace?.id || null : null
  )
  const { data: allIntegrations } = usePartnerIntegrations()
  const assignIntegration = useAssignWorkspaceIntegration(workspace?.id || "")
  const removeIntegration = useRemoveWorkspaceIntegration(workspace?.id || "")

  // Local state for selections
  const [selections, setSelections] = useState<Record<string, string>>({})

  // Initialize selections from current assignments
  useEffect(() => {
    if (assignmentsData?.assignments) {
      const initial: Record<string, string> = {}
      assignmentsData.assignments.forEach((a) => {
        initial[a.provider] = a.partner_integration_id
      })
      setSelections(initial)
    }
  }, [assignmentsData])

  const handleAssign = async (provider: string, integrationId: string) => {
    if (!workspace) return

    if (integrationId === "none") {
      // Remove assignment
      try {
        await removeIntegration.mutateAsync(provider)
        setSelections((prev) => {
          const next = { ...prev }
          delete next[provider]
          return next
        })
        toast.success(`${PROVIDERS.find((p) => p.id === provider)?.name} removed from ${workspace.name}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove integration")
      }
    } else {
      // Assign integration
      try {
        await assignIntegration.mutateAsync({
          provider,
          partner_integration_id: integrationId,
        })
        setSelections((prev) => ({ ...prev, [provider]: integrationId }))
        toast.success(`Integration assigned to ${workspace.name}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to assign integration")
      }
    }
  }

  if (!workspace) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Manage Integrations
          </DialogTitle>
          <DialogDescription>
            Assign API keys to <strong>{workspace.name}</strong>. Each provider can have one assigned key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {assignmentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            PROVIDERS.map((provider) => {
              const currentAssignment = assignmentsData?.assignments?.find(
                (a) => a.provider === provider.id
              )
              const availableKeys = allIntegrations?.filter(
                (i) => i.provider === provider.id && i.is_active
              ) || []
              const selectedValue = selections[provider.id] || "none"

              return (
                <div key={provider.id} className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <span className="text-lg">{provider.icon}</span>
                    {provider.name}
                  </Label>

                  {availableKeys.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed bg-muted/30">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        No {provider.name} keys configured.{" "}
                        <a href="/org/integrations" className="text-primary hover:underline">
                          Add one
                        </a>
                      </span>
                    </div>
                  ) : (
                    <Select
                      value={selectedValue}
                      onValueChange={(value) => handleAssign(provider.id, value)}
                      disabled={assignIntegration.isPending || removeIntegration.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an API key" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-muted-foreground" />
                            <span>No key assigned</span>
                          </div>
                        </SelectItem>
                        {availableKeys.map((key) => (
                          <SelectItem key={key.id} value={key.id}>
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4 text-primary" />
                              <span>{key.name}</span>
                              {key.is_default && (
                                <Badge
                                  variant="outline"
                                  className="ml-1 text-[10px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-500/20"
                                >
                                  <Star className="h-2 w-2 mr-0.5" />
                                  Default
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {currentAssignment && (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <Check className="h-3 w-3" />
                      Using: {currentAssignment.integration_name}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}


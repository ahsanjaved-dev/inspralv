"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Calendar,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import type { FunctionTool } from "@/types/database.types"
import { toast } from "sonner"
import { ALL_TIMEZONES, TIMEZONE_REGIONS, getTimezonesByRegion } from "@/lib/utils/timezones"
import { useWorkspaceSettings } from "@/lib/hooks/use-workspace-settings"

// ============================================================================
// TYPES
// ============================================================================

interface CalcomToolConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tool: FunctionTool | null
  onSave: (tool: FunctionTool) => void
  workspaceSlug: string
}

interface CustomField {
  name: string
  type: "text" | "email" | "phone" | "number" | "textarea" | "select"
  label: string
  required: boolean
  options?: string[]
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long Text" },
  { value: "select", label: "Dropdown" },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function CalcomToolConfigDialog({
  open,
  onOpenChange,
  tool,
  onSave,
  workspaceSlug,
}: CalcomToolConfigDialogProps) {
  // Fetch workspace settings to get timezone
  const { data: workspace, isLoading: isLoadingWorkspace } = useWorkspaceSettings()
  // Timezone is stored in workspace.settings.timezone (JSON field)
  const workspaceSettings = workspace?.settings as { timezone?: string } | undefined
  const workspaceTimezone = workspaceSettings?.timezone || "UTC"

  const [eventTypeId, setEventTypeId] = useState<number | "">("")
  const [timezone, setTimezone] = useState<string>("")
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [hasCalcomIntegration, setHasCalcomIntegration] = useState(false)
  const [isLoadingIntegration, setIsLoadingIntegration] = useState(true)

  // New field form state
  const [newFieldName, setNewFieldName] = useState("")
  const [newFieldType, setNewFieldType] = useState<CustomField["type"]>("text")
  const [newFieldLabel, setNewFieldLabel] = useState("")
  const [newFieldRequired, setNewFieldRequired] = useState(false)
  const [newFieldOptions, setNewFieldOptions] = useState("")

  // Check if workspace has Cal.com integration
  useEffect(() => {
    if (open) {
      checkCalcomIntegration()
    }
  }, [open, workspaceSlug])

  // Load existing tool data OR set defaults with workspace timezone
  // IMPORTANT: Wait for workspace data to be loaded before setting defaults
  useEffect(() => {
    // Don't set defaults until workspace data is loaded (to get correct timezone)
    if (!open || isLoadingWorkspace) return

    if (tool) {
      // Editing existing tool - use its timezone or fallback to workspace timezone
      setEventTypeId(tool.event_type_id || "")
      setTimezone(tool.timezone || workspaceTimezone)
      setCustomFields(tool.custom_fields || [])
    } else {
      // New tool - always use workspace timezone (now correctly loaded)
      setEventTypeId("")
      setTimezone(workspaceTimezone)
      setCustomFields([])
    }
  }, [open, tool, workspaceTimezone, isLoadingWorkspace])

  const checkCalcomIntegration = async () => {
    setIsLoadingIntegration(true)
    try {
      const response = await fetch(`/api/w/${workspaceSlug}/integrations`)
      if (response.ok) {
        const result = await response.json()
        // API returns { data: { data: [...], _deprecation: {...} } }
        const integrations = result.data?.data || []
        const calcomIntegration = integrations.find(
          (i: any) => i.provider === "calcom" && i.is_active
        )
        setHasCalcomIntegration(!!calcomIntegration)
      }
    } catch (error) {
      console.error("Error checking Cal.com integration:", error)
    } finally {
      setIsLoadingIntegration(false)
    }
  }

  const handleAddCustomField = () => {
    if (!newFieldName.trim() || !newFieldLabel.trim()) {
      toast.error("Field name and label are required")
      return
    }

    // Check for duplicate names
    if (customFields.some((f) => f.name === newFieldName.trim())) {
      toast.error("A field with this name already exists")
      return
    }

    const newField: CustomField = {
      name: newFieldName.trim(),
      type: newFieldType,
      label: newFieldLabel.trim(),
      required: newFieldRequired,
    }

    // Add options for select fields
    if (newFieldType === "select" && newFieldOptions.trim()) {
      newField.options = newFieldOptions
        .split(",")
        .map((opt) => opt.trim())
        .filter(Boolean)
    }

    setCustomFields([...customFields, newField])

    // Reset form
    setNewFieldName("")
    setNewFieldType("text")
    setNewFieldLabel("")
    setNewFieldRequired(false)
    setNewFieldOptions("")
  }

  const handleRemoveField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    if (!tool) return

    // Validate event type ID
    if (!eventTypeId || eventTypeId <= 0) {
      toast.error("Please enter a valid Event Type ID")
      return
    }

    // Create updated tool
    const updatedTool: FunctionTool = {
      ...tool,
      event_type_id: Number(eventTypeId),
      timezone,
      custom_fields: customFields.length > 0 ? customFields : undefined,
    }

    onSave(updatedTool)
    onOpenChange(false)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const isValid = eventTypeId && eventTypeId > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Configure Cal.com Tool
          </DialogTitle>
          <DialogDescription>
            Set up your Cal.com appointment booking tool with event type and custom fields.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Cal.com Integration Check */}
            {isLoadingIntegration ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking Cal.com integration...
              </div>
            ) : !hasCalcomIntegration ? (
              <div className="flex items-start gap-2 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Cal.com integration not configured
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Please add your Cal.com API key in <strong>Integrations</strong> (sidebar menu) before adding Cal.com tools to agents.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Cal.com integration connected
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    You can manage your Cal.com connection in <strong>Integrations</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Event Type ID */}
            <div className="space-y-2">
              <Label htmlFor="event_type_id">
                Event Type ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event_type_id"
                type="number"
                placeholder="60444"
                value={eventTypeId}
                onChange={(e) => setEventTypeId(e.target.value ? Number(e.target.value) : "")}
                disabled={!hasCalcomIntegration}
              />
              <p className="text-xs text-muted-foreground">
                The Cal.com event type ID for this booking tool. Find this in your Cal.com event type settings.
              </p>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select 
                value={timezone || workspaceTimezone} 
                onValueChange={setTimezone} 
                disabled={!hasCalcomIntegration || isLoadingWorkspace}
              >
                <SelectTrigger id="timezone">
                  <SelectValue placeholder={isLoadingWorkspace ? "Loading..." : "Select timezone"} />
                </SelectTrigger>
                <SelectContent>
                  {getTimezonesByRegion().map((region) => (
                    <SelectGroup key={region.name}>
                      <SelectLabel>{region.name}</SelectLabel>
                      {region.timezones.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Timezone for displaying and booking appointments. 
                {!isLoadingWorkspace && workspaceSettings?.timezone && (
                  <> Workspace default: <strong>{workspaceTimezone}</strong></>
                )}
              </p>
            </div>

            <Separator />

            {/* Custom Fields */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-1">Custom Booking Fields (Optional)</h3>
                <p className="text-xs text-muted-foreground">
                  Add custom fields to collect additional information during booking.
                </p>
              </div>

              {/* Existing Fields */}
              {customFields.length > 0 && (
                <div className="space-y-2">
                  {customFields.map((field, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{field.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {field.type}
                          </Badge>
                          {field.required && (
                            <Badge variant="secondary" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Field name: {field.name}
                        </p>
                        {field.options && (
                          <p className="text-xs text-muted-foreground">
                            Options: {field.options.join(", ")}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveField(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Field Form */}
              <div className="space-y-3 p-4 rounded-lg border bg-background">
                <h4 className="text-sm font-medium">Add Custom Field</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="field_name" className="text-xs">
                      Field Name
                    </Label>
                    <Input
                      id="field_name"
                      placeholder="phone_number"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      disabled={!hasCalcomIntegration}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="field_type" className="text-xs">
                      Field Type
                    </Label>
                    <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as CustomField["type"])} disabled={!hasCalcomIntegration}>
                      <SelectTrigger id="field_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="field_label" className="text-xs">
                    Field Label
                  </Label>
                  <Input
                    id="field_label"
                    placeholder="Phone Number"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    disabled={!hasCalcomIntegration}
                  />
                </div>

                {newFieldType === "select" && (
                  <div className="space-y-2">
                    <Label htmlFor="field_options" className="text-xs">
                      Options (comma-separated)
                    </Label>
                    <Input
                      id="field_options"
                      placeholder="Option 1, Option 2, Option 3"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      disabled={!hasCalcomIntegration}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="field_required"
                    checked={newFieldRequired}
                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                    disabled={!hasCalcomIntegration}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="field_required" className="text-xs font-normal">
                    Required field
                  </Label>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomField}
                  disabled={!hasCalcomIntegration}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || !hasCalcomIntegration}>
            Save Tool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


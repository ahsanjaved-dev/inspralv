"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Plus,
  Trash2,
  Settings2,
  Code,
  ChevronDown,
  ChevronRight,
  Wrench,
  Globe,
  Zap,
  MessageSquare,
  PhoneForwarded,
  CalendarPlus,
  Search,
  Copy,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FunctionTool, FunctionToolParameters, FunctionToolParameterProperty } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

interface FunctionToolEditorProps {
  tools: FunctionTool[]
  onChange: (tools: FunctionTool[]) => void
  serverUrl?: string
  onServerUrlChange?: (url: string) => void
  disabled?: boolean
}

// ============================================================================
// PRESET TOOLS
// ============================================================================

const PRESET_TOOLS: Omit<FunctionTool, "id">[] = [
  {
    name: "transfer_call",
    description: "Transfer the call to a human agent or another department",
    parameters: {
      type: "object",
      properties: {
        department: {
          type: "string",
          description: "The department to transfer to",
          enum: ["sales", "support", "billing", "technical"],
        },
        reason: {
          type: "string",
          description: "Brief reason for the transfer",
        },
      },
      required: ["department"],
    },
    speak_during_execution: true,
    execution_message: "I'm transferring you now, please hold.",
    enabled: true,
  },
  {
    name: "book_appointment",
    description: "Schedule an appointment for the caller",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "The date for the appointment in YYYY-MM-DD format",
        },
        time: {
          type: "string",
          description: "The time for the appointment in HH:MM format",
        },
        service: {
          type: "string",
          description: "The type of service or appointment",
        },
        notes: {
          type: "string",
          description: "Additional notes or special requests",
        },
      },
      required: ["date", "time"],
    },
    speak_during_execution: true,
    execution_message: "Let me check availability and book that for you.",
    enabled: true,
  },
  {
    name: "lookup_customer",
    description: "Look up customer information from the CRM",
    parameters: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: "Customer phone number",
        },
        email: {
          type: "string",
          description: "Customer email address",
        },
        customer_id: {
          type: "string",
          description: "Customer ID or account number",
        },
      },
    },
    speak_during_execution: true,
    execution_message: "Let me pull up your information.",
    enabled: true,
  },
  {
    name: "end_call",
    description: "End the call gracefully",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Reason for ending the call",
          enum: ["resolved", "callback_scheduled", "transferred", "no_response"],
        },
        summary: {
          type: "string",
          description: "Brief summary of the call",
        },
      },
    },
    enabled: true,
  },
]

const PRESET_ICONS: Record<string, typeof Wrench> = {
  transfer_call: PhoneForwarded,
  book_appointment: CalendarPlus,
  lookup_customer: Search,
  end_call: Zap,
}

// ============================================================================
// PARAMETER TYPE OPTIONS
// ============================================================================

const PARAMETER_TYPES = [
  { value: "string", label: "String", description: "Text value" },
  { value: "number", label: "Number", description: "Numeric value" },
  { value: "integer", label: "Integer", description: "Whole number" },
  { value: "boolean", label: "Boolean", description: "True/False" },
  { value: "array", label: "Array", description: "List of values" },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateParamId(): string {
  return `param_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// ============================================================================
// PARAMETER EDITOR COMPONENT
// ============================================================================

interface ParameterEditorProps {
  parameters: FunctionToolParameters
  onChange: (params: FunctionToolParameters) => void
  disabled?: boolean
}

function ParameterEditor({ parameters, onChange, disabled }: ParameterEditorProps) {
  const [newParamName, setNewParamName] = useState("")
  const [newParamType, setNewParamType] = useState<FunctionToolParameterProperty["type"]>("string")
  const [newParamDesc, setNewParamDesc] = useState("")
  const [newParamRequired, setNewParamRequired] = useState(false)
  const [newParamEnum, setNewParamEnum] = useState("")

  const addParameter = () => {
    if (!newParamName.trim()) return

    const paramName = newParamName.trim().replace(/\s+/g, "_").toLowerCase()
    const newProperty: FunctionToolParameterProperty = {
      type: newParamType,
      description: newParamDesc || undefined,
    }

    if (newParamEnum.trim()) {
      newProperty.enum = newParamEnum.split(",").map((v) => v.trim()).filter(Boolean)
    }

    const newProperties = {
      ...parameters.properties,
      [paramName]: newProperty,
    }

    const newRequired = newParamRequired
      ? [...(parameters.required || []), paramName]
      : parameters.required

    onChange({
      type: "object",
      properties: newProperties,
      required: newRequired,
    })

    // Reset form
    setNewParamName("")
    setNewParamType("string")
    setNewParamDesc("")
    setNewParamRequired(false)
    setNewParamEnum("")
  }

  const removeParameter = (paramName: string) => {
    const { [paramName]: _, ...restProperties } = parameters.properties
    onChange({
      type: "object",
      properties: restProperties,
      required: parameters.required?.filter((r) => r !== paramName),
    })
  }

  const toggleRequired = (paramName: string) => {
    const isRequired = parameters.required?.includes(paramName)
    onChange({
      ...parameters,
      required: isRequired
        ? parameters.required?.filter((r) => r !== paramName)
        : [...(parameters.required || []), paramName],
    })
  }

  const paramEntries = Object.entries(parameters.properties)

  return (
    <div className="space-y-4">
      {/* Existing Parameters */}
      {paramEntries.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Parameters ({paramEntries.length})
          </Label>
          <div className="space-y-2">
            {paramEntries.map(([name, prop]) => (
              <div
                key={name}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{name}</code>
                    <Badge variant="outline" className="text-xs">
                      {prop.type}
                    </Badge>
                    {parameters.required?.includes(name) && (
                      <Badge variant="default" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">
                        required
                      </Badge>
                    )}
                  </div>
                  {prop.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {prop.description}
                    </p>
                  )}
                  {prop.enum && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prop.enum.map((v) => (
                        <Badge key={v} variant="secondary" className="text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => toggleRequired(name)}
                    disabled={disabled}
                  >
                    <span className={cn(
                      "text-xs",
                      parameters.required?.includes(name) ? "text-red-500" : "text-muted-foreground"
                    )}>
                      *
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => removeParameter(name)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Parameter Form */}
      <div className="space-y-3 p-3 rounded-lg border border-dashed border-border bg-muted/20">
        <Label className="text-xs text-muted-foreground">Add Parameter</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Parameter name"
            value={newParamName}
            onChange={(e) => setNewParamName(e.target.value)}
            disabled={disabled}
            className="text-sm"
          />
          <Select
            value={newParamType}
            onValueChange={(v) => setNewParamType(v as FunctionToolParameterProperty["type"])}
            disabled={disabled}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARAMETER_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Description (optional)"
          value={newParamDesc}
          onChange={(e) => setNewParamDesc(e.target.value)}
          disabled={disabled}
          className="text-sm"
        />
        <Input
          placeholder="Enum values (comma-separated, optional)"
          value={newParamEnum}
          onChange={(e) => setNewParamEnum(e.target.value)}
          disabled={disabled}
          className="text-sm"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={newParamRequired}
              onCheckedChange={setNewParamRequired}
              disabled={disabled}
            />
            <Label className="text-sm">Required</Label>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addParameter}
            disabled={disabled || !newParamName.trim()}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TOOL CARD COMPONENT
// ============================================================================

interface ToolCardProps {
  tool: FunctionTool
  onChange: (tool: FunctionTool) => void
  onRemove: () => void
  disabled?: boolean
}

function ToolCard({ tool, onChange, onRemove, disabled }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const Icon = PRESET_ICONS[tool.name] || Wrench

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(tool, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className={cn(
      "transition-all",
      !tool.enabled && "opacity-60"
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center gap-3 p-4">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            tool.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <code className="font-mono font-medium">{tool.name}</code>
              <Badge variant="outline" className="text-xs">
                {Object.keys(tool.parameters.properties).length} params
              </Badge>
              {tool.async && (
                <Badge variant="secondary" className="text-xs">async</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{tool.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={tool.enabled !== false}
              onCheckedChange={(enabled) => onChange({ ...tool, enabled })}
              disabled={disabled}
            />
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border/50">
            <div className="pt-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Function Name</Label>
                <Input
                  value={tool.name}
                  onChange={(e) => onChange({ ...tool, name: e.target.value.replace(/\s+/g, "_") })}
                  disabled={disabled}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Server URL (optional)</Label>
                <Input
                  value={tool.server_url || ""}
                  onChange={(e) => onChange({ ...tool, server_url: e.target.value || undefined })}
                  placeholder="Uses default if empty"
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={tool.description}
                onChange={(e) => onChange({ ...tool, description: e.target.value })}
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label>Parameters</Label>
              <ParameterEditor
                parameters={tool.parameters}
                onChange={(parameters) => onChange({ ...tool, parameters })}
                disabled={disabled}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Async Execution</Label>
                </div>
                <Switch
                  checked={tool.async === true}
                  onCheckedChange={(async_) => onChange({ ...tool, async: async_ })}
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm">Speak During Execution</Label>
                </div>
                <Switch
                  checked={tool.speak_during_execution === true}
                  onCheckedChange={(speak) => onChange({ ...tool, speak_during_execution: speak })}
                  disabled={disabled}
                />
              </div>
            </div>

            {tool.speak_during_execution && (
              <div className="space-y-2">
                <Label>Execution Message</Label>
                <Input
                  value={tool.execution_message || ""}
                  onChange={(e) => onChange({ ...tool, execution_message: e.target.value })}
                  placeholder="Message spoken while function executes"
                  disabled={disabled}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyJson}
                className="text-muted-foreground"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy JSON
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onRemove}
                disabled={disabled}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FunctionToolEditor({
  tools,
  onChange,
  serverUrl,
  onServerUrlChange,
  disabled,
}: FunctionToolEditorProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newToolType, setNewToolType] = useState<"preset" | "custom">("preset")
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [customName, setCustomName] = useState("")
  const [customDesc, setCustomDesc] = useState("")

  const addPresetTool = (preset: Omit<FunctionTool, "id">) => {
    // Check if tool with same name already exists
    if (tools.some((t) => t.name === preset.name)) {
      return
    }

    const newTool: FunctionTool = {
      ...preset,
      id: generateId(),
    }
    onChange([...tools, newTool])
    setShowAddDialog(false)
    setSelectedPreset(null)
  }

  const addCustomTool = () => {
    if (!customName.trim() || !customDesc.trim()) return

    const newTool: FunctionTool = {
      id: generateId(),
      name: customName.trim().replace(/\s+/g, "_").toLowerCase(),
      description: customDesc.trim(),
      parameters: {
        type: "object",
        properties: {},
      },
      enabled: true,
    }
    onChange([...tools, newTool])
    setShowAddDialog(false)
    setCustomName("")
    setCustomDesc("")
  }

  const updateTool = (id: string, updatedTool: FunctionTool) => {
    onChange(tools.map((t) => (t.id === id ? updatedTool : t)))
  }

  const removeTool = (id: string) => {
    onChange(tools.filter((t) => t.id !== id))
  }

  const isPresetAdded = (name: string) => tools.some((t) => t.name === name)

  return (
    <div className="space-y-4">
      {/* Header with Server URL */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {onServerUrlChange && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <Input
                value={serverUrl || ""}
                onChange={(e) => onServerUrlChange(e.target.value)}
                placeholder="Default webhook URL for all tools"
                disabled={disabled}
                className="flex-1"
              />
            </div>
          )}
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={disabled}>
              <Plus className="h-4 w-4 mr-2" />
              Add Tool
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Function Tool</DialogTitle>
              <DialogDescription>
                Add a preset tool or create a custom function
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Toggle between preset and custom */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newToolType === "preset" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewToolType("preset")}
                  className="flex-1"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Preset Tools
                </Button>
                <Button
                  type="button"
                  variant={newToolType === "custom" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewToolType("custom")}
                  className="flex-1"
                >
                  <Code className="h-4 w-4 mr-2" />
                  Custom Tool
                </Button>
              </div>

              {newToolType === "preset" ? (
                <div className="grid gap-2">
                  {PRESET_TOOLS.map((preset) => {
                    const Icon = PRESET_ICONS[preset.name] || Wrench
                    const isAdded = isPresetAdded(preset.name)
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        disabled={isAdded}
                        onClick={() => addPresetTool(preset)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                          isAdded
                            ? "opacity-50 cursor-not-allowed bg-muted"
                            : "hover:bg-muted/50 hover:border-primary/50"
                        )}
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{preset.name.replace(/_/g, " ")}</span>
                            {isAdded && (
                              <Badge variant="secondary" className="text-xs">Added</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{preset.description}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Function Name</Label>
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g., send_email"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use snake_case. Spaces will be converted to underscores.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={customDesc}
                      onChange={(e) => setCustomDesc(e.target.value)}
                      placeholder="What does this function do?"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={addCustomTool}
                    disabled={!customName.trim() || !customDesc.trim()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Custom Tool
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tools List */}
      {tools.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Wrench className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">No Function Tools</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Function tools allow your agent to perform actions like booking appointments,
              looking up customer data, or transferring calls.
            </p>
            <Button variant="outline" onClick={() => setShowAddDialog(true)} disabled={disabled}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Tool
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onChange={(updated) => updateTool(tool.id, updated)}
              onRemove={() => removeTool(tool.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {/* Info */}
      {tools.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm">
          <Settings2 className="h-4 w-4 text-blue-600 mt-0.5" />
          <div className="text-blue-700 dark:text-blue-300">
            <strong>Tip:</strong> Click on a tool to expand and configure its parameters.
            Tools marked as disabled will not be synced to the provider.
          </div>
        </div>
      )}
    </div>
  )
}


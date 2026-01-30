"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plus,
  Trash2,
  Code,
  Wrench,
  Globe,
  Zap,
  PhoneForwarded,
  Search,
  PhoneOff,
  Calendar,
  CalendarCheck,
  Check,
  Edit2,
  Lock,
  Sparkles,
  Link,
  Key,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FunctionTool, FunctionToolParameters, FunctionToolType, FunctionToolParameterProperty } from "@/types/database.types"
import {
  VAPI_TOOL_REGISTRY,
  type BuiltInToolDefinition,
} from "@/lib/integrations/function_tools/vapi/registry"
import { RETELL_TOOL_REGISTRY } from "@/lib/integrations/function_tools/retell/registry"
import { SUGGESTED_PARAMETERS, getParameterCategories, type SuggestedParameter } from "@/lib/tools/registry"
import { CalendarToolConfigDialog, isCalendarToolType, type CalendarToolSettings, type CalendarToolType, CALENDAR_TOOL_TYPES } from "./calendar-tool-config"

// ============================================================================
// AVAILABLE TOOLS CONFIG
// ============================================================================

// VAPI available tools (excluding "function" - custom functions have their own button)
const VAPI_AVAILABLE_TOOLS = [
  "endCall",
  "transferCall", 
  "apiRequest",
  "book_appointment",
  "cancel_appointment",
  "reschedule_appointment",
]

// Retell available tools
const RETELL_AVAILABLE_TOOLS = [
  "check_availability_cal",
  "book_appointment_cal",
  "end_call",
  "transfer_call",
]

// ============================================================================
// ICON MAPPING
// ============================================================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  PhoneOff,
  PhoneForwarded,
  Globe,
  Code,
  Calendar,
  CalendarCheck,
  Wrench,
}

function getToolIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[iconName] || Wrench
}

// ============================================================================
// TYPES
// ============================================================================

interface FunctionToolEditorProps {
  tools: FunctionTool[]
  onChange: (tools: FunctionTool[]) => void
  disabled?: boolean
  provider?: "vapi" | "retell"
  calendarSettings?: CalendarToolSettings
  onCalendarSettingsChange?: (settings: CalendarToolSettings) => void
}

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function createDefaultParameters(): FunctionToolParameters {
  return { type: "object", properties: {}, required: [] }
}

function createToolFromDefinition(def: BuiltInToolDefinition): FunctionTool {
  const baseTool: FunctionTool = {
    id: generateId(),
    name: def.key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, ""),
    description: def.description,
    tool_type: def.type as FunctionToolType,
    parameters: createDefaultParameters(),
    enabled: true,
  }

  switch (def.type) {
    case "end_call":
      return { ...baseTool, name: "end_call" }
    case "transfer_call":
      return { ...baseTool, transfer_destination: { type: "predefined", number: "" } }
    case "book_appointment_cal":
      return { ...baseTool, cal_api_key: "", event_type_id: undefined, timezone: "" }
    case "check_availability_cal":
      return { ...baseTool, cal_api_key: "", event_type_id: undefined, timezone: "" }
    case "transferCall":
      return { ...baseTool, destinations: [] }
    case "endCall":
      return { ...baseTool }
    case "apiRequest":
      return { ...baseTool, method: "POST", url: "" }
    case "function":
      return { ...baseTool }
    default:
      return baseTool
  }
}

function toolNameFromRegistryKey(key: string) {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")
}

// ============================================================================
// PARAMETER EDITOR (INLINE, WITH SUGGESTIONS)
// ============================================================================

interface ParameterEditorProps {
  properties: Record<string, FunctionToolParameterProperty>
  required: string[]
  onChange: (properties: Record<string, FunctionToolParameterProperty>, required: string[]) => void
}

function ParameterEditor({ properties, required, onChange }: ParameterEditorProps) {
  const [newParamName, setNewParamName] = useState("")
  const [newParamDescription, setNewParamDescription] = useState("")
  const [newParamRequired, setNewParamRequired] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const propertyList = Object.entries(properties).map(([name, prop]) => ({
    name,
    description: prop.description || "",
    isRequired: required.includes(name),
  }))

  const resetForm = () => {
    setNewParamName("")
    setNewParamDescription("")
    setNewParamRequired(false)
  }

  const addParameter = () => {
    if (!newParamName.trim() || !newParamDescription.trim()) return
    
    const paramName = newParamName.trim()

    const newProperty: FunctionToolParameterProperty = {
      type: "string",
      description: newParamDescription.trim(),
    }

    const newProperties: Record<string, FunctionToolParameterProperty> = {
      ...properties,
      [paramName]: newProperty,
    }

    const newRequired = newParamRequired 
      ? [...required, paramName]
      : required

    // DEBUG: Log parameter addition
    console.log("[ParameterEditor] addParameter called")
    console.log("[ParameterEditor] Adding parameter:", paramName)
    console.log("[ParameterEditor] New properties:", JSON.stringify(newProperties, null, 2))
    console.log("[ParameterEditor] New required:", newRequired)

    onChange(newProperties, newRequired)
    resetForm()
  }

  const addSuggestedParam = (suggested: SuggestedParameter) => {
    // Skip if already added
    if (properties[suggested.name]) return

    const newProperty: FunctionToolParameterProperty = {
      type: suggested.type,
      description: suggested.description,
    }

    const newProperties: Record<string, FunctionToolParameterProperty> = {
      ...properties,
      [suggested.name]: newProperty,
    }

    onChange(newProperties, required)
  }

  const removeParameter = (paramName: string) => {
    const newProperties: Record<string, FunctionToolParameterProperty> = { ...properties }
    delete newProperties[paramName]
    onChange(newProperties, required.filter(r => r !== paramName))
  }

  const toggleRequired = (paramName: string) => {
    if (required.includes(paramName)) {
      onChange(properties, required.filter(r => r !== paramName))
    } else {
      onChange(properties, [...required, paramName])
    }
  }

  // Get suggestions not already added
  const availableSuggestions = useMemo(() => {
    const existingNames = new Set(Object.keys(properties))
    return SUGGESTED_PARAMETERS.filter(p => !existingNames.has(p.name))
  }, [properties])

  // Group by category
  const suggestionsByCategory = useMemo(() => {
    const categories = getParameterCategories()
    return categories.map(cat => ({
      ...cat,
      params: availableSuggestions.filter(p => p.category === cat.key)
    })).filter(cat => cat.params.length > 0)
  }, [availableSuggestions])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Parameters</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowSuggestions(!showSuggestions)}
          className="h-7 text-xs gap-1"
        >
          <Sparkles className="h-3 w-3" />
          {showSuggestions ? "Hide" : "Show"} Suggestions
        </Button>
      </div>

      {/* Suggested Parameters */}
      {showSuggestions && suggestionsByCategory.length > 0 && (
        <div className="p-3 rounded-md border border-dashed bg-muted/20 space-y-3">
          <p className="text-xs text-muted-foreground">
            Click to add suggested parameters:
          </p>
          {suggestionsByCategory.map(({ key, label, params }) => (
            <div key={key}>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">{label}</p>
              <div className="flex flex-wrap gap-1.5">
                {params.map(param => (
                  <Button
                    key={param.name}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => addSuggestedParam(param)}
                    className="h-6 text-xs px-2"
                    title={param.description}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {param.name}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Existing Parameters */}
      {propertyList.length > 0 && (
        <div className="space-y-2">
          {propertyList.map((param) => (
            <div
              key={param.name}
              className="flex items-start gap-2 p-2 rounded-md border bg-muted/30 text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <code className="font-mono text-xs font-medium text-primary">{param.name}</code>
                  {param.isRequired && (
                    <Badge variant="default" className="text-[10px] h-4 bg-amber-500 hover:bg-amber-500">
                      Required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{param.description}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn("h-6 w-6 p-0", param.isRequired ? "text-amber-600" : "text-muted-foreground")}
                  onClick={() => toggleRequired(param.name)}
                  title={param.isRequired ? "Mark optional" : "Mark required"}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => removeParameter(param.name)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Parameter Form - Always visible */}
      <div className="space-y-3 p-3 rounded-md border bg-muted/20">
        <div className="text-xs font-medium text-muted-foreground">Add New Parameter</div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={newParamName}
            onChange={(e) => setNewParamName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (newParamName.trim() && newParamDescription.trim()) {
                  addParameter()
                }
              }
            }}
            placeholder="Variable name"
            className="h-8 text-sm font-mono"
          />
          <Input
            value={newParamDescription}
            onChange={(e) => setNewParamDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (newParamName.trim() && newParamDescription.trim()) {
                  addParameter()
                }
              }
            }}
            placeholder="Description"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={newParamRequired}
              onChange={(e) => setNewParamRequired(e.target.checked)}
              className="h-3.5 w-3.5 rounded"
            />
            <span className="text-xs">Required</span>
          </label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={addParameter}
            disabled={!newParamName.trim() || !newParamDescription.trim()}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TOOL EDIT DIALOG - Simple, Fixed Height, Scrollable
// ============================================================================

interface ToolEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (tool: FunctionTool) => void
  tool: FunctionTool | null
  existingNames: string[]
  isCustomFunction?: boolean
  provider?: "vapi" | "retell"
}

function ToolEditDialog({ open, onOpenChange, onSave, tool, existingNames, isCustomFunction, provider = "vapi" }: ToolEditDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [properties, setProperties] = useState<Record<string, FunctionToolParameterProperty>>({})
  const [required, setRequired] = useState<string[]>([])
  const [url, setUrl] = useState("")
  const [method, setMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("POST")
  const [transferNumber, setTransferNumber] = useState("")
  // Retell-specific: API URL, Auth Token, and HTTP Method
  const [apiUrl, setApiUrl] = useState("")
  const [authToken, setAuthToken] = useState("")
  const [apiMethod, setApiMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("POST")

  // Track if we've initialized for this open session
  const [initialized, setInitialized] = useState(false)
  
  useEffect(() => {
    if (open && !initialized) {
      // Only initialize once when dialog opens
      if (tool) {
        setName(tool.name || "")
        setDescription(tool.description || "")
        setProperties(tool.parameters?.properties || {})
        setRequired(tool.parameters?.required || [])
        setUrl(tool.url || "")
        setMethod((tool.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE") || "POST")
        setTransferNumber(tool.transfer_destination?.number || "")
        // Retell fields
        setApiUrl(tool.server_url || "")
        // Get metadata from 'extra' or treat tool as any to access metadata
        const toolMeta = (tool as unknown as { metadata?: Record<string, string> }).metadata || {}
        setAuthToken(toolMeta.authToken || "")
        setApiMethod((toolMeta.apiMethod as "GET" | "POST" | "PUT" | "PATCH" | "DELETE") || "POST")
      } else {
        // New custom function
        setName("")
        setDescription("")
        setProperties({})
        setRequired([])
        setUrl("")
        setMethod("POST")
        setTransferNumber("")
        setApiUrl("")
        setAuthToken("")
        setApiMethod("POST")
      }
      setInitialized(true)
    } else if (!open) {
      // Reset initialized flag when dialog closes
      setInitialized(false)
    }
  }, [open, tool, initialized])

  const isEditing = !!tool
  const isApiRequest = tool?.tool_type === "apiRequest"
  const isTransferCall = tool?.tool_type === "transfer_call" || tool?.tool_type === "transferCall"
  const isNameTaken = !isEditing && existingNames.includes(name)
  const isRetellCustom = provider === "retell" && (isCustomFunction || !tool)
  
  // Validation: check required fields based on tool type
  const canSave = name.trim() && description.trim() && !isNameTaken && 
    (!isApiRequest || url.trim()) && 
    (!isTransferCall || transferNumber.trim()) &&
    (!isRetellCustom || apiUrl.trim())

  const handleParametersChange = (
    newProperties: Record<string, FunctionToolParameterProperty>,
    newRequired: string[]
  ) => {
    // DEBUG: Log parameter changes
    console.log("[ToolEditDialog] handleParametersChange called")
    console.log("[ToolEditDialog] Received properties:", JSON.stringify(newProperties, null, 2))
    console.log("[ToolEditDialog] Received required:", newRequired)
    
    setProperties(newProperties)
    setRequired(newRequired)
  }

  const handleSave = () => {
    if (!canSave) return

    // DEBUG: Log what's being saved
    console.log("[ToolEditDialog] handleSave called")
    console.log("[ToolEditDialog] Current properties state:", JSON.stringify(properties, null, 2))
    console.log("[ToolEditDialog] Current required state:", required)
    console.log("[ToolEditDialog] Property count:", Object.keys(properties).length)

    const updatedTool: FunctionTool = {
      ...tool,
      id: tool?.id || generateId(),
      name: name.trim(),
      description: description.trim(),
      tool_type: isRetellCustom ? "custom_function" : (tool?.tool_type || "function"),
      parameters: {
        type: "object",
        properties: properties,
        required: required,
      },
      enabled: tool?.enabled ?? true,
      ...(isApiRequest ? { url: url.trim(), method } : {}),
      ...(isTransferCall ? { transfer_destination: { type: "predefined" as const, number: transferNumber.trim() } } : {}),
      // Retell custom function fields
      ...(isRetellCustom ? { 
        server_url: apiUrl.trim(),
        metadata: {
          ...(authToken.trim() ? { authToken: authToken.trim() } : {}),
          apiMethod: apiMethod,
        },
      } : {}),
    }

    onSave(updatedTool)
    onOpenChange(false)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const getTitle = () => {
    if (!tool) return "Add Custom Function"
    if (isApiRequest) return "Configure API Request"
    if (isTransferCall) return "Configure Transfer Call"
    if (isCustomFunction) return "Edit Custom Function"
    return "Edit Tool"
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              {isApiRequest ? (
                <Globe className="h-4 w-4 text-primary" />
              ) : isTransferCall ? (
                <PhoneForwarded className="h-4 w-4 text-primary" />
              ) : (
                <Code className="h-4 w-4 text-primary" />
              )}
            </div>
            {getTitle()}
          </DialogTitle>
          <DialogDescription>
            Configure the tool settings and parameters.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Name - only editable for custom functions (new tools or existing custom functions) */}
            <div className="space-y-1.5">
              <Label htmlFor="tool-name" className="text-sm">Function Name</Label>
              {isCustomFunction || !tool ? (
                <>
                  <Input
                    id="tool-name"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase())}
                    placeholder="e.g., book_appointment"
                    className="font-mono"
                  />
                  {isNameTaken && (
                    <p className="text-xs text-destructive">Name already exists</p>
                  )}
                </>
              ) : (
                <div className="h-10 px-3 flex items-center rounded-md border bg-muted font-mono text-sm">
                  {name}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="tool-description" className="text-sm">Description</Label>
              <Textarea
                id="tool-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When should the AI use this function?"
                rows={2}
                className="resize-none"
              />
            </div>

            {/* API Request specific fields */}
            {isApiRequest && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="api-url" className="text-sm">API URL</Label>
                  <Input
                    id="api-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="api-method" className="text-sm">HTTP Method</Label>
                  <select
                    id="api-method"
                    aria-label="HTTP Method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as "GET" | "POST" | "PUT" | "PATCH" | "DELETE")}
                    className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              </>
            )}

            {/* Transfer Call specific fields */}
            {isTransferCall && (
              <div className="space-y-1.5">
                <Label htmlFor="transfer-number" className="text-sm">Transfer Phone Number</Label>
                <Input
                  id="transfer-number"
                  value={transferNumber}
                  onChange={(e) => setTransferNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The phone number to transfer calls to (include country code)
                </p>
              </div>
            )}

            {/* Retell Custom Function specific fields */}
            {isRetellCustom && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="api-url" className="text-sm flex items-center gap-2">
                    <Link className="h-3.5 w-3.5" />
                    API URL <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <select
                      id="api-method"
                      aria-label="HTTP Method"
                      value={apiMethod}
                      onChange={(e) => setApiMethod(e.target.value as "GET" | "POST" | "PUT" | "PATCH" | "DELETE")}
                      className="w-[100px] h-10 px-3 rounded-md border bg-background text-sm font-mono shrink-0"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                    <Input
                      id="api-url"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://your-api.com/endpoint"
                      className="font-mono flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The HTTP method and endpoint for tool execution requests
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-token" className="text-sm flex items-center gap-2">
                    <Key className="h-3.5 w-3.5" />
                    Authorization Token <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="auth-token"
                    type="password"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="Bearer token or API key"
                  />
                  <p className="text-xs text-muted-foreground">
                    Will be sent as Authorization header
                  </p>
                </div>
              </>
            )}

            {/* Parameters - only for custom functions */}
            {(isCustomFunction || !tool) && (
              <div className="pt-3 border-t">
                <ParameterEditor
                  properties={properties}
                  required={required}
                  onChange={handleParametersChange}
                />
                      </div>
                    )}
                  </div>
                </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={handleClose}>
                      Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEditing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// SELECTED TOOL ITEM
// ============================================================================

interface SelectedToolItemProps {
  tool: FunctionTool
  toolDef?: BuiltInToolDefinition
  onEdit: () => void
  onRemove: () => void
  disabled?: boolean
  isCustomFunction?: boolean
}

function SelectedToolItem({ tool, toolDef, onEdit, onRemove, disabled, isCustomFunction }: SelectedToolItemProps) {
  const Icon = toolDef ? getToolIcon(toolDef.icon || "Wrench") : Code
  const paramCount = Object.keys(tool.parameters?.properties || {}).length

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-sm font-medium">{tool.name}</code>
          <Badge variant="outline" className="text-xs">
            {toolDef?.displayName || (isCustomFunction ? "Custom" : tool.tool_type || "function")}
          </Badge>
          {isCustomFunction && paramCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {paramCount} params
            </Badge>
          )}
          {tool.url && (
            <Badge variant="secondary" className="text-xs truncate max-w-[120px]" title={tool.url}>
              {tool.url}
            </Badge>
          )}
          {tool.server_url && (
            <Badge variant="secondary" className="text-xs truncate max-w-[140px]" title={tool.server_url}>
              <Link className="h-3 w-3 mr-1" />
              {(tool as unknown as { metadata?: Record<string, string> }).metadata?.apiMethod || "POST"}
            </Badge>
          )}
          {tool.transfer_destination?.number && (
            <Badge variant="secondary" className="text-xs truncate max-w-[120px]" title={tool.transfer_destination.number}>
              {tool.transfer_destination.number}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{tool.description}</p>
            </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
                disabled={disabled}
        >
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
            </div>
          )
        }
        
// ============================================================================
// AVAILABLE TOOL ITEM
// ============================================================================

interface AvailableToolItemProps {
  def: BuiltInToolDefinition
  isSelected: boolean
  isAvailable: boolean
  onToggle: () => void
  disabled?: boolean
}

function AvailableToolItem({ def, isSelected, isAvailable, onToggle, disabled }: AvailableToolItemProps) {
  const Icon = getToolIcon(def.icon || "Wrench")
  const isDisabled = disabled || !isAvailable

          return (
    <div
                className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all",
        isAvailable && !disabled ? "cursor-pointer" : "cursor-not-allowed",
        isSelected && isAvailable
          ? "border-primary bg-primary/5"
          : isAvailable
          ? "hover:bg-muted/50 hover:border-muted-foreground/20"
          : "opacity-60 bg-muted/20"
      )}
      onClick={() => !isDisabled && onToggle()}
    >
      <div
                  className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
          isSelected && isAvailable ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}
      >
        <Icon className="h-4 w-4" />
            </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("font-medium text-sm", !isAvailable && "text-muted-foreground")}>
            {def.displayName}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{def.description}</p>
      </div>
      {isAvailable ? (
        <div
          className={cn(
            "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
            isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
      ) : (
        <Badge variant="secondary" className="text-xs shrink-0">
          <Lock className="h-3 w-3 mr-1" />
          Soon
        </Badge>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FunctionToolEditor({
  tools,
  onChange,
  disabled,
  provider = "vapi",
  calendarSettings,
  onCalendarSettingsChange,
}: FunctionToolEditorProps) {
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingTool, setEditingTool] = useState<FunctionTool | null>(null)
  const [pendingTool, setPendingTool] = useState<FunctionTool | null>(null) // Tool not yet added, waiting for dialog save
  const [searchQuery, setSearchQuery] = useState("")
  
  // Calendar tool config dialog state
  const [showCalendarConfigDialog, setShowCalendarConfigDialog] = useState(false)
  const [selectedCalendarToolType, setSelectedCalendarToolType] = useState<CalendarToolType | null>(null)
  const [editingCalendarTool, setEditingCalendarTool] = useState<FunctionTool | null>(null)
  const [localCalendarSettings, setLocalCalendarSettings] = useState<CalendarToolSettings>(
    calendarSettings || {
      slot_duration_minutes: 30,
      buffer_between_slots_minutes: 0,
      preferred_days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      preferred_hours_start: "09:00",
      preferred_hours_end: "17:00",
      timezone: "America/New_York",
      min_notice_hours: 1,
      max_advance_days: 60,
    }
  )
  
  // Sync calendar settings with props
  useEffect(() => {
    if (calendarSettings) {
      setLocalCalendarSettings(calendarSettings)
    }
  }, [calendarSettings])

  // Get available tools based on provider
  const availableToolKeys = provider === "retell" ? RETELL_AVAILABLE_TOOLS : VAPI_AVAILABLE_TOOLS

  // Get all tools from registry
  const allBuiltInTools = useMemo(() => {
    const registry = provider === "retell" ? RETELL_TOOL_REGISTRY : VAPI_TOOL_REGISTRY
    return Object.values(registry).filter((tool) => {
      if (provider === "retell") return tool.providers.retell
      return tool.providers.vapi
    })
  }, [provider])

  // Separate available and coming soon tools (excluding "function" type - custom functions have their own button)
  const { availableTools, comingSoonTools } = useMemo(() => {
    const available: BuiltInToolDefinition[] = []
    const comingSoon: BuiltInToolDefinition[] = []
    
    allBuiltInTools.forEach((tool) => {
      // Skip "function" type - custom functions are handled by the "Add Custom Function" button
      if (tool.type === "function") return
      
      if (availableToolKeys.includes(tool.key)) {
        available.push(tool)
      } else {
        comingSoon.push(tool)
      }
    })
    
    return { availableTools: available, comingSoonTools: comingSoon }
  }, [allBuiltInTools, availableToolKeys])

  // Filter tools by search
  const filterBySearch = (toolList: BuiltInToolDefinition[]) => {
    if (!searchQuery.trim()) return toolList
    const query = searchQuery.toLowerCase()
    return toolList.filter(
      (tool) =>
        tool.displayName.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)
    )
  }

  const filteredAvailable = filterBySearch(availableTools)
  const filteredComingSoon = filterBySearch(comingSoonTools)

  // Get selected tool names for quick lookup
  const selectedToolNames = useMemo(() => new Set(tools.map((t) => t.name)), [tools])

  // Check if a built-in tool is selected
  const isToolSelected = (def: BuiltInToolDefinition) => {
    const toolName = toolNameFromRegistryKey(def.key)
    return selectedToolNames.has(toolName)
  }

  // Tools that require configuration before being added
  const TOOLS_REQUIRING_CONFIG = ["apiRequest", "transfer_call", "transferCall"]
  
  // Calendar tool keys
  const CALENDAR_TOOL_KEYS = ["book_appointment", "cancel_appointment", "reschedule_appointment"]

  // Toggle a built-in tool
  const toggleBuiltInTool = (def: BuiltInToolDefinition) => {
    const toolName = toolNameFromRegistryKey(def.key)
    if (selectedToolNames.has(toolName)) {
      // Remove tool
      onChange(tools.filter((t) => t.name !== toolName))
    } else {
      // Check if it's a calendar tool
      if (CALENDAR_TOOL_KEYS.includes(def.key)) {
        setSelectedCalendarToolType(def.key as CalendarToolType)
        setEditingCalendarTool(null)
        setShowCalendarConfigDialog(true)
        return
      }
      
      // Add tool
      const newTool = createToolFromDefinition(def)
      
      // For tools requiring config, open dialog first and only add on save
      if (TOOLS_REQUIRING_CONFIG.includes(def.type)) {
        setPendingTool(newTool)
        setEditingTool(null)
        setShowEditDialog(true)
      } else {
        // Add other tools immediately
        onChange([...tools, newTool])
      }
    }
  }
  
  // Handle calendar tool save
  const handleSaveCalendarTool = (tool: FunctionTool) => {
    const existingIndex = tools.findIndex((t) => t.id === tool.id)
    if (existingIndex >= 0) {
      const updated = [...tools]
      updated[existingIndex] = tool
      onChange(updated)
    } else {
      onChange([...tools, tool])
    }
  }
  
  // Handle calendar settings change
  const handleCalendarSettingsChange = (settings: CalendarToolSettings) => {
    setLocalCalendarSettings(settings)
    onCalendarSettingsChange?.(settings)
  }
  
  // Handle edit calendar tool
  const handleEditCalendarTool = (tool: FunctionTool) => {
    setSelectedCalendarToolType(tool.name as CalendarToolType)
    setEditingCalendarTool(tool)
    setShowCalendarConfigDialog(true)
  }

  // Check if a tool is a custom function
  const isCustomFunction = (tool: FunctionTool) => {
    const registry = provider === "retell" ? RETELL_TOOL_REGISTRY : VAPI_TOOL_REGISTRY
    const builtInNames = new Set(
      Object.values(registry).map((def) => toolNameFromRegistryKey(def.key))
    )
    return !builtInNames.has(tool.name) && (tool.tool_type === "function" || !tool.tool_type)
  }

  // Save tool (add or update)
  const handleSaveTool = (tool: FunctionTool) => {
    // DEBUG: Log what's being received and saved
    console.log("[FunctionToolEditor] handleSaveTool called")
    console.log("[FunctionToolEditor] Received tool:", JSON.stringify(tool, null, 2))
    console.log("[FunctionToolEditor] Tool parameters:", JSON.stringify(tool.parameters, null, 2))
    console.log("[FunctionToolEditor] Properties count:", Object.keys(tool.parameters?.properties || {}).length)
    
    const existingIndex = tools.findIndex((t) => t.id === tool.id)
    if (existingIndex >= 0) {
      // Update existing tool
      const updated = [...tools]
      updated[existingIndex] = tool
      console.log("[FunctionToolEditor] Updating existing tool at index:", existingIndex)
      onChange(updated)
    } else {
      // Add new tool (either custom function or pending API request)
      const newTools = [...tools, tool]
      console.log("[FunctionToolEditor] Adding new tool, new tools array:", JSON.stringify(newTools.map(t => ({ name: t.name, paramCount: Object.keys(t.parameters?.properties || {}).length }))))
      onChange(newTools)
    }
    setEditingTool(null)
    setPendingTool(null)
  }

  // Handle dialog close (cancel)
  const handleDialogClose = (open: boolean) => {
    if (!open) {
      // Dialog was closed/cancelled - clear pending tool
      setPendingTool(null)
      setEditingTool(null)
    }
    setShowEditDialog(open)
  }

  // Remove a tool
  const removeTool = (id: string) => {
    onChange(tools.filter((t) => t.id !== id))
  }

  // Edit a tool
  const handleEditTool = (tool: FunctionTool) => {
    setEditingTool(tool)
    setShowEditDialog(true)
  }

  // Add new custom function
  const handleAddCustomFunction = () => {
    setEditingTool(null)
    setShowEditDialog(true)
  }

  // Find tool definition for a tool
  const getToolDef = (tool: FunctionTool) => {
    const registry = provider === "retell" ? RETELL_TOOL_REGISTRY : VAPI_TOOL_REGISTRY
    return Object.values(registry).find(
      (def) => toolNameFromRegistryKey(def.key) === tool.name || def.type === tool.tool_type
    )
  }

  const existingNames = tools.map((t) => t.name)

  return (
    <div className="space-y-6">
      {/* Selected Tools Section */}
      {tools.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            Selected Tools ({tools.length})
          </Label>
          <div className="space-y-2">
            {tools.map((tool) => (
              <SelectedToolItem
                key={tool.id}
                tool={tool}
                toolDef={getToolDef(tool)}
                onEdit={() => isCalendarToolType(tool.name) ? handleEditCalendarTool(tool) : handleEditTool(tool)}
                onRemove={() => removeTool(tool.id)}
                disabled={disabled}
                isCustomFunction={isCustomFunction(tool)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Function Button - Both VAPI and Retell */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddCustomFunction}
        disabled={disabled}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Custom Function
      </Button>

      {/* Available Built-in Tools */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Built-in Tools</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-8 w-[160px] pl-9 text-sm"
            />
          </div>
        </div>

        <div className="rounded-lg border p-3 max-h-[350px] overflow-y-auto">
          <div className="space-y-4">
            {/* Available Tools */}
            {filteredAvailable.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                  <Check className="h-3 w-3" />
                  Available
                </div>
                <div className="space-y-1.5">
                  {filteredAvailable.map((def) => (
                    <AvailableToolItem
                      key={def.key}
                      def={def}
                      isSelected={isToolSelected(def)}
                      isAvailable={true}
                      onToggle={() => toggleBuiltInTool(def)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Coming Soon Tools */}
            {filteredComingSoon.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Coming Soon
                </div>
                <div className="space-y-1.5">
                  {filteredComingSoon.map((def) => (
                    <AvailableToolItem
                      key={def.key}
                      def={def}
                      isSelected={false}
                      isAvailable={false}
                      onToggle={() => {}}
                      disabled={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredAvailable.length === 0 && filteredComingSoon.length === 0 && (
              <div className="text-center py-6">
                <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No tools found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <ToolEditDialog
        open={showEditDialog}
        onOpenChange={handleDialogClose}
        onSave={handleSaveTool}
        tool={editingTool || pendingTool}
        existingNames={existingNames.filter((n) => n !== editingTool?.name && n !== pendingTool?.name)}
        isCustomFunction={editingTool ? isCustomFunction(editingTool) : !pendingTool}
        provider={provider}
      />
      
      {/* Calendar Tool Config Dialog */}
      {selectedCalendarToolType && (
        <CalendarToolConfigDialog
          open={showCalendarConfigDialog}
          onOpenChange={setShowCalendarConfigDialog}
          onSave={handleSaveCalendarTool}
          toolType={selectedCalendarToolType}
          existingTool={editingCalendarTool}
          calendarSettings={localCalendarSettings}
          onCalendarSettingsChange={handleCalendarSettingsChange}
          isFirstCalendarTool={!tools.some(t => isCalendarToolType(t.name))}
        />
      )}
    </div>
  )
}

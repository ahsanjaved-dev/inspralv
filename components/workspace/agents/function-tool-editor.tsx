"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
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
  Phone,
  Terminal,
  PhoneOff,
  Grid3X3,
  ArrowRightLeft,
  Calendar,
  Table,
  MessageCircle,
  Building,
  MoreHorizontal,
  Database,
  Monitor,
  FileText,
  UserPlus,
  UserSearch,
  Puzzle,
  CalendarCheck,
  CalendarSearch,
  Info,
  AlertTriangle,
  TerminalSquare,
  Star,
  CircleDot,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FunctionTool, FunctionToolParameters, FunctionToolParameterProperty, FunctionToolType } from "@/types/database.types"
import {
  VAPI_TOOL_REGISTRY,
  CATEGORY_DISPLAY_NAMES,
  type BuiltInToolDefinition,
} from "@/lib/integrations/function_tools/vapi/registry"
import { RETELL_TOOL_REGISTRY } from "@/lib/integrations/function_tools/retell/registry"
import type { ToolCategory } from "@/lib/integrations/function_tools/types"

// ============================================================================
// ICON MAPPING
// ============================================================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  PhoneOff,
  PhoneForwarded,
  Grid3X3,
  ArrowRightLeft,
  Globe,
  Code,
  Terminal,
  TerminalSquare,
  Monitor,
  FileText,
  Search,
  Calendar,
  CalendarSearch,
  CalendarCheck,
  CalendarPlus,
  Table,
  MessageSquare,
  MessageCircle,
  UserPlus,
  UserSearch,
  Building,
  Puzzle,
  Phone,
  Database,
  MoreHorizontal,
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
  serverUrl?: string
  onServerUrlChange?: (url: string) => void
  disabled?: boolean
  provider?: "vapi" | "retell" | "synthflow"
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PARAMETER_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "boolean", label: "Boolean" },
  { value: "array", label: "Array" },
  { value: "object", label: "Object" },
]

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

const CODE_RUNTIMES = [
  { value: "node18", label: "Node.js 18" },
  { value: "python3.11", label: "Python 3.11" },
] as const

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
    // Retell pre-built tools
    case "end_call":
      return { ...baseTool, name: "end_call", execution_message: "Thank you for calling. Goodbye!" }
    case "transfer_call":
      return { ...baseTool, transfer_destination: { type: "predefined", number: "" }, speak_during_execution: true, execution_message: "I'm transferring you now, please hold." }
    case "book_appointment_cal":
      return { ...baseTool, cal_api_key: "", event_type_id: undefined, timezone: "" }

    case "transferCall":
      return { ...baseTool, speak_during_execution: true, execution_message: "I'm transferring you now, please hold.", destinations: [] }
    case "endCall":
      return { ...baseTool, execution_message: "Thank you for calling. Goodbye!" }
    case "apiRequest":
      return { ...baseTool, method: "POST", url: "", speak_during_execution: true, execution_message: "Processing your request..." }
    case "function":
      return { ...baseTool, server_url: "", speak_during_execution: true, execution_message: "Let me check that for you..." }
    case "code":
      return { ...baseTool, runtime: "node18", code: "" }
    case "dtmf":
      return { ...baseTool, parameters: { type: "object", properties: { digits: { type: "string", description: "DTMF digits to send" } }, required: ["digits"] } }
    default:
      return baseTool
  }
}

// Get all tools as flat array sorted by category
function getAllToolsSorted(provider?: "vapi" | "retell" | "synthflow"): BuiltInToolDefinition[] {
  const categoryOrder: ToolCategory[] = ['call_control', 'api_integration', 'code_execution', 'data', 'google', 'communication', 'ghl', 'other']
  const registry = provider === "retell" ? RETELL_TOOL_REGISTRY : VAPI_TOOL_REGISTRY
  return Object.values(registry).sort((a, b) => {
    return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
  })
}

// ============================================================================
// TOOL FIELDS COMPONENT
// ============================================================================

interface ToolFieldsProps {
  tool: FunctionTool
  onChange: (tool: FunctionTool) => void
  disabled?: boolean
}

function ToolFields({ tool, onChange, disabled }: ToolFieldsProps) {
  const toolType = tool.tool_type || 'function'
  
  // Determine which fields to show based on tool type
  const fields = useMemo(() => {
    const baseFields = [
      { key: 'name', label: 'Function Name', type: 'text', required: true, placeholder: 'e.g., book_appointment' },
      { key: 'description', label: 'Description', type: 'textarea', required: true, placeholder: 'Describe what this tool does...' },
    ]

    const messageFields = [
      { key: 'speak_during_execution', label: 'Speak During Execution', type: 'switch', required: false },
      { key: 'execution_message', label: 'Execution Message', type: 'text', required: false, placeholder: 'Message to speak while executing...' },
    ]

    switch (toolType) {
      // Retell pre-built tools
      case 'end_call':
        return [
          ...baseFields,
          { key: 'execution_message', label: 'Goodbye Message', type: 'text', required: false, placeholder: 'Thank you for calling. Goodbye!' },
        ]
      case 'transfer_call':
        return [
          ...baseFields,
          { key: 'transfer_destination', label: 'Transfer Destination', type: 'retellTransferDestination', required: true },
          ...messageFields,
        ]
      case 'book_appointment_cal':
        return [
          ...baseFields,
          { key: 'cal_api_key', label: 'Cal.com API Key', type: 'text', required: true, placeholder: 'cal_live_...' },
          { key: 'event_type_id', label: 'Event Type ID', type: 'number', required: true, placeholder: '60444' },
          { key: 'timezone', label: 'Timezone', type: 'text', required: true, placeholder: 'America/Los_Angeles' },
        ]

      case 'endCall':
        return [
          ...baseFields,
          { key: 'execution_message', label: 'Goodbye Message', type: 'text', required: false, placeholder: 'Thank you for calling. Goodbye!' },
        ]
      case 'transferCall':
        return [
          ...baseFields,
          ...messageFields,
          { key: 'destinations', label: 'Transfer Destinations', type: 'destinations', required: false },
        ]
      case 'dtmf':
        return [
          ...baseFields,
          ...messageFields,
        ]
      case 'handoff':
        return [
          ...baseFields,
          { key: 'assistant_id', label: 'Assistant ID', type: 'text', required: false, placeholder: 'VAPI Assistant ID' },
          { key: 'squad_id', label: 'Squad ID', type: 'text', required: false, placeholder: 'VAPI Squad ID' },
          ...messageFields,
        ]
      case 'apiRequest':
        return [
          ...baseFields,
          { key: 'method', label: 'HTTP Method', type: 'select', required: true, options: HTTP_METHODS },
          { key: 'url', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'https://api.example.com/endpoint' },
          { key: 'timeout_seconds', label: 'Timeout (seconds)', type: 'number', required: false, placeholder: '30' },
          { key: 'credential_id', label: 'Credential ID', type: 'text', required: false, placeholder: 'Optional VAPI credential' },
          ...messageFields,
        ]
      case 'function':
        return [
          ...baseFields,
          { key: 'server_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://your-server.com/webhook' },
          { key: 'async', label: 'Async Execution', type: 'switch', required: false },
          ...messageFields,
        ]
      case 'code':
        return [
          ...baseFields,
          { key: 'runtime', label: 'Runtime', type: 'select', required: true, options: CODE_RUNTIMES.map(r => r.value) },
          { key: 'code', label: 'Code', type: 'code', required: true, placeholder: 'Enter your code here...' },
          { key: 'timeout_seconds', label: 'Timeout (seconds)', type: 'number', required: false, placeholder: '30' },
        ]
      case 'bash':
        return [
          ...baseFields,
          { key: 'command', label: 'Bash Command', type: 'text', required: false, placeholder: 'ls -la' },
          { key: 'timeout_seconds', label: 'Timeout (seconds)', type: 'number', required: false, placeholder: '30' },
        ]
      case 'query':
        return [
          ...baseFields,
          { key: 'knowledge_base_ids', label: 'Knowledge Base IDs', type: 'text', required: false, placeholder: 'Comma-separated IDs' },
          { key: 'top_k', label: 'Results Count', type: 'number', required: false, placeholder: '5' },
        ]
      case 'googleCalendarCreateEvent':
      case 'googleCalendarCheckAvailability':
      case 'googleSheetsRowAppend':
      case 'slackSendMessage':
      case 'smsSend':
      case 'goHighLevelCalendarAvailability':
      case 'goHighLevelCalendarEventCreate':
      case 'goHighLevelContactCreate':
      case 'goHighLevelContactGet':
        return [
          ...baseFields,
          { key: 'credential_id', label: 'Credential ID', type: 'text', required: true, placeholder: 'Your VAPI credential ID' },
        ]
      case 'mcp':
        return [
          ...baseFields,
          { key: 'mcp_server_url', label: 'MCP Server URL', type: 'text', required: true, placeholder: 'https://mcp-server.example.com' },
          { key: 'mcp_tool_name', label: 'MCP Tool Name', type: 'text', required: true, placeholder: 'Tool name on MCP server' },
        ]
      default:
        return [
          ...baseFields,
          { key: 'server_url', label: 'Webhook URL', type: 'text', required: false, placeholder: 'https://your-server.com/webhook' },
          ...messageFields,
        ]
    }
  }, [toolType])

  const renderField = (field: any) => {
    const value = (tool as any)[field.key]
    
    switch (field.type) {
      case 'text':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
            </Label>
            <Input
              value={value || ''}
              onChange={(e) => onChange({ ...tool, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              disabled={disabled}
              className={cn("text-sm", field.key === 'name' && "font-mono")}
            />
          </div>
        )
      case 'textarea':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
            </Label>
            <Textarea
              value={value || ''}
              onChange={(e) => onChange({ ...tool, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              disabled={disabled}
              rows={2}
              className="text-sm"
            />
          </div>
        )
      case 'code':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
            </Label>
            <Textarea
              value={value || ''}
              onChange={(e) => onChange({ ...tool, [field.key]: e.target.value })}
              placeholder={tool.runtime === 'python3.11' ? "def main(params):\n    return {'result': params}" : "async function main(params) {\n  return { result: params };\n}"}
              disabled={disabled}
              rows={6}
              className="text-sm font-mono"
            />
          </div>
        )
      case 'number':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm">{field.label}</Label>
            <Input
              type="number"
              value={value || ''}
              onChange={(e) => onChange({ ...tool, [field.key]: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder={field.placeholder}
              disabled={disabled}
              className="text-sm"
            />
          </div>
        )
      case 'switch':
        return (
          <div key={field.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <Label className="text-sm">{field.label}</Label>
            <Switch
              checked={value === true}
              onCheckedChange={(checked) => onChange({ ...tool, [field.key]: checked })}
              disabled={disabled}
            />
          </div>
        )
      case 'select':
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
            </Label>
            <Select
              value={value || field.options?.[0]}
              onValueChange={(v) => onChange({ ...tool, [field.key]: v })}
              disabled={disabled}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt: string) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      case 'destinations':
        return <DestinationsField key={field.key} tool={tool} onChange={onChange} disabled={disabled} />
      case 'retellTransferDestination': {
        const numberValue = tool.transfer_destination?.number || ''
        return (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1">
              {field.label}
              {field.required && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
            </Label>
            <Input
              value={numberValue}
              onChange={(e) => onChange({ ...tool, transfer_destination: { type: 'predefined', number: e.target.value } })}
              placeholder="+16175551212"
              disabled={disabled}
              className="text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground">Retell uses a predefined transfer destination number.</p>
          </div>
        )
      }
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {fields.map(renderField)}
    </div>
  )
}

// ============================================================================
// DESTINATIONS FIELD
// ============================================================================

function DestinationsField({ tool, onChange, disabled }: ToolFieldsProps) {
  const [newDest, setNewDest] = useState({ type: "number", value: "" })

  const addDestination = () => {
    if (!newDest.value.trim()) return
    const destinations = [...(tool.destinations || []), {
      type: newDest.type as "number" | "sip",
      [newDest.type === "number" ? "number" : "sipUri"]: newDest.value.trim(),
    }]
    onChange({ ...tool, destinations })
    setNewDest({ type: "number", value: "" })
  }

  const removeDestination = (index: number) => {
    const destinations = [...(tool.destinations || [])]
    destinations.splice(index, 1)
    onChange({ ...tool, destinations })
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">Transfer Destinations</Label>
      {(tool.destinations || []).length > 0 && (
        <div className="space-y-1">
          {(tool.destinations || []).map((dest, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm">
              <Badge variant="outline" className="text-xs">{dest.type}</Badge>
              <code className="flex-1 font-mono text-xs">{dest.type === "number" ? dest.number : dest.sipUri}</code>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeDestination(i)} disabled={disabled}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Select value={newDest.type} onValueChange={(v) => setNewDest({ ...newDest, type: v })} disabled={disabled}>
          <SelectTrigger className="w-24 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="number">Phone</SelectItem>
            <SelectItem value="sip">SIP</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={newDest.value}
          onChange={(e) => setNewDest({ ...newDest, value: e.target.value })}
          placeholder={newDest.type === "number" ? "+1234567890" : "sip:agent@pbx.example.com"}
          disabled={disabled}
          className="flex-1 text-sm font-mono"
        />
        <Button type="button" variant="secondary" size="sm" onClick={addDestination} disabled={disabled || !newDest.value.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// TOOL CARD
// ============================================================================

interface ToolCardProps {
  tool: FunctionTool
  onChange: (tool: FunctionTool) => void
  onRemove: () => void
  disabled?: boolean
  provider?: "vapi" | "retell" | "synthflow"
}

function ToolCard({ tool, onChange, onRemove, disabled, provider }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const toolDef = VAPI_TOOL_REGISTRY[tool.tool_type as keyof typeof VAPI_TOOL_REGISTRY]
  const Icon = toolDef ? getToolIcon(toolDef.icon || 'Wrench') : Wrench
  const isCompatible =
    provider === "retell"
      ? ["end_call", "transfer_call", "book_appointment_cal"].includes(tool.tool_type || "")
      : true

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(tool, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className={cn("transition-all", !tool.enabled && "opacity-60", !isCompatible && "border-amber-500/50")}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center gap-3 p-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tool.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm font-medium">{tool.name}</code>
              <Badge variant="outline" className="text-xs">{tool.tool_type || "function"}</Badge>
              {!isCompatible && <Badge variant="destructive" className="text-xs">Not supported</Badge>}
            </div>
            <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
          </div>
          <Switch checked={tool.enabled !== false} onCheckedChange={(enabled) => onChange({ ...tool, enabled })} disabled={disabled} />
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 space-y-4 border-t">
            <div className="pt-3">
              <ToolFields tool={tool} onChange={onChange} disabled={disabled} />
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <Button type="button" variant="ghost" size="sm" onClick={copyJson} className="text-muted-foreground text-xs">
                {copied ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy JSON</>}
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={onRemove} disabled={disabled} className="text-xs">
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// ============================================================================
// TOOL PICKER MODAL (Custom Implementation - No Dialog Component)
// ============================================================================

interface ToolPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTool: (tool: FunctionTool) => void
  onUpdateTool?: (tool: FunctionTool) => void
  existingToolNames: string[]
  existingTools?: FunctionTool[]
  provider?: "vapi" | "retell" | "synthflow"
}

function toolNameFromRegistryKey(key: string) {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")
}

function ToolPickerDialog({
  open,
  onOpenChange,
  onSelectTool,
  onUpdateTool,
  existingToolNames,
  existingTools,
  provider,
}: ToolPickerDialogProps) {
  const [selectedDef, setSelectedDef] = useState<BuiltInToolDefinition | null>(null)
  const [customTool, setCustomTool] = useState<FunctionTool | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [isEditingExisting, setIsEditingExisting] = useState(false)

  const allTools = useMemo(() => {
    return getAllToolsSorted(provider).filter(tool => {
      if (provider === "retell") return tool.providers.retell
      return tool.providers.vapi
    })
  }, [provider])

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return allTools
    const query = searchQuery.toLowerCase()
    return allTools.filter(tool => 
      tool.displayName.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query) ||
      CATEGORY_DISPLAY_NAMES[tool.category as ToolCategory].toLowerCase().includes(query)
    )
  }, [allTools, searchQuery])

  const groupedTools = useMemo(() => {
    const groups: Record<string, BuiltInToolDefinition[]> = {}
    filteredTools.forEach(tool => {
      const category = tool.category
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category]!.push(tool)
    })
    return groups
  }, [filteredTools])

  const handleSelectDef = (def: BuiltInToolDefinition) => {
    setSelectedDef(def)
    setShowCustom(false)
    setIsEditingExisting(false)

    const existingName = toolNameFromRegistryKey(def.key)
    const existing = existingTools?.find((t) => t.name === existingName)
    if (existing) {
      // Edit existing tool instead of blocking the user with "Added"
      setIsEditingExisting(true)
      setCustomTool({ ...existing })
      return
    }

    setCustomTool(createToolFromDefinition(def))
  }

  const handleAddTool = () => {
    if (!customTool) return
    if (isNameTaken) return

    if (isEditingExisting && onUpdateTool) {
      onUpdateTool(customTool)
      handleClose()
      return
    }

    if (!existingToolNames.includes(customTool.name)) {
      onSelectTool(customTool)
      handleClose()
    }
  }

  const handleShowCustom = () => {
    setShowCustom(true)
    setSelectedDef(null)
    setIsEditingExisting(false)
    setCustomTool({
      id: generateId(),
      name: "",
      description: "",
      tool_type: "function",
      parameters: createDefaultParameters(),
      enabled: true,
      speak_during_execution: true,
      execution_message: "",
    })
  }

  const handleClose = () => {
    onOpenChange(false)
    setSelectedDef(null)
    setCustomTool(null)
    setSearchQuery("")
    setShowCustom(false)
    setIsEditingExisting(false)
  }

  const isNameTaken = customTool
    ? (existingTools
        ? existingTools.some((t) => t.name === customTool.name && t.id !== customTool.id)
        : existingToolNames.includes(customTool.name))
    : false
  const canAdd = Boolean(customTool && customTool.name.trim() && customTool.description.trim() && !isNameTaken)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal Container */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div 
          className="relative w-[1400px] max-w-full h-[min(85vh,900px)] bg-background rounded-2xl shadow-2xl border flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b bg-gradient-to-r from-violet-500/5 via-transparent to-transparent rounded-t-2xl">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Zap className="h-6 w-6 text-white" />
            </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Add Function Tool</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Choose a tool type and configure its settings</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close dialog"
              className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-1 min-h-0">
            {/* Left Sidebar - Tool List */}
            <div className="w-[340px] flex flex-col border-r bg-muted/20">
              {/* Custom Function Card */}
              <div className="p-5 border-b">
                <button
                  type="button"
                  onClick={handleShowCustom}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-200",
                    showCustom 
                      ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30" 
                      : "bg-background border-2 border-dashed border-muted-foreground/20 hover:border-blue-500/50 hover:bg-blue-500/5"
                  )}
                >
                  <div className={cn(
                    "h-11 w-11 rounded-xl flex items-center justify-center",
                    showCustom ? "bg-white/20" : "bg-blue-500/10"
                  )}>
                    <Code className={cn("h-5 w-5", showCustom ? "text-white" : "text-blue-500")} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">Custom Function</div>
                    <div className={cn("text-sm", showCustom ? "text-white/70" : "text-muted-foreground")}>
                      Build your own webhook
                    </div>
                  </div>
                  <Plus className={cn("h-5 w-5", showCustom ? "text-white/70" : "text-muted-foreground")} />
                </button>
              </div>

              {/* Search */}
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tools..."
                    className="w-full h-11 pl-11 pr-4 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Tool List */}
              <div className="flex-1 overflow-y-auto py-3 px-3">
                {Object.entries(groupedTools).map(([category, tools]) => (
                  <div key={category} className="mb-5">
                    <div className="px-3 py-2 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                      {CATEGORY_DISPLAY_NAMES[category as ToolCategory]}
                    </div>
                    <div className="space-y-1">
                      {tools.map((def) => {
                  const Icon = getToolIcon(def.icon || 'Wrench')
                  const isSelected = selectedDef?.key === def.key
                        const isAdded = existingToolNames.includes(toolNameFromRegistryKey(def.key))
                  
                  return (
                          <button
                      key={def.key}
                      type="button"
                      onClick={() => handleSelectDef(def)}
                      className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150",
                              isSelected 
                                ? "bg-primary text-primary-foreground shadow-md" 
                                : "hover:bg-background",
                              isAdded && "opacity-90"
                      )}
                    >
                            <div className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center",
                              isSelected ? "bg-white/20" : "bg-muted"
                            )}>
                              <Icon className="h-4 w-4" />
                        </div>
                            <span className="flex-1 font-medium text-sm truncate">{def.displayName}</span>
                            {isAdded && (
                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                                isSelected ? "bg-white/15 text-primary-foreground border-white/20" : "bg-background text-muted-foreground"
                              )}>
                                Edit
                              </span>
                            )}
                            {def.isNative && !isAdded && (
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            )}
                    </button>
                  )
                })}
              </div>
                  </div>
                ))}
                {filteredTools.length === 0 && (
                  <div className="py-12 text-center">
                    <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No tools found</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Try a different search term</p>
                  </div>
                )}
            </div>
          </div>

            {/* Right Panel - Configuration */}
            <div className="flex-1 flex flex-col min-w-0 bg-background">
            {(selectedDef || showCustom) && customTool ? (
              <>
                  <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-2xl space-y-8">
                      {/* Tool Header Card */}
                    {selectedDef && (
                        <div className="flex items-start gap-5 p-6 rounded-2xl bg-gradient-to-br from-muted/60 to-muted/20 border">
                          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                        {(() => {
                          const Icon = getToolIcon(selectedDef.icon || 'Wrench')
                              return <Icon className="h-7 w-7 text-primary" />
                        })()}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold">{selectedDef.displayName}</h3>
                            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                              {selectedDef.description}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-4">
                              {selectedDef.isNative && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Native Tool
                                </span>
                              )}
                              <span className="text-xs font-medium px-3 py-1 rounded-full bg-muted text-muted-foreground border">
                                {CATEGORY_DISPLAY_NAMES[selectedDef.category as ToolCategory]}
                              </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {showCustom && (
                        <div className="flex items-start gap-5 p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/20">
                          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center border border-blue-500/20">
                            <Code className="h-7 w-7 text-blue-500" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                              Custom Webhook Function
                            </h3>
                            <p className="text-sm text-blue-600/80 dark:text-blue-400/80 mt-1.5 leading-relaxed">
                              Create a custom function that calls your server endpoint when triggered by the AI agent during a conversation.
                            </p>
                        </div>
                      </div>
                    )}

                      {/* Configuration Section */}
                      <div>
                        <div className="flex items-center gap-3 mb-5">
                          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                            <Settings2 className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <h4 className="font-semibold">Configuration</h4>
                        </div>
                        <div className="space-y-5 pl-11">
                          <ToolFieldsCustom
                      tool={customTool}
                      onChange={setCustomTool}
                      disabled={false}
                    />
                        </div>
                      </div>

                      {/* Error */}
                    {isNameTaken && (
                        <div className="flex items-center gap-4 p-5 rounded-2xl bg-red-500/10 border border-red-500/20">
                          <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                          </div>
                          <div className="text-sm font-medium text-red-600 dark:text-red-400">
                            A tool with this name already exists. Please choose a different name.
                          </div>
                      </div>
                    )}
                  </div>
                </div>

                  {/* Footer */}
                  <div className="px-8 py-5 border-t bg-muted/30 flex items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="h-11 px-6 rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddTool}
                      disabled={!canAdd}
                      className={cn(
                        "h-11 px-6 rounded-xl font-medium flex items-center gap-2 transition-all",
                        canAdd 
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25" 
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      {isEditingExisting ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {isEditingExisting ? "Update Tool" : "Add Tool"}
                    </button>
                </div>
              </>
            ) : (
                <div className="flex-1 flex items-center justify-center p-12">
                  <div className="text-center max-w-sm">
                    <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-muted/80 to-muted/30 flex items-center justify-center mx-auto mb-6 border">
                      <Wrench className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                    <h3 className="text-lg font-semibold text-muted-foreground mb-2">Select a Tool</h3>
                    <p className="text-sm text-muted-foreground/70 leading-relaxed">
                      Choose a built-in tool from the list on the left, or create a custom webhook function.
                    </p>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CUSTOM TOOL FIELDS (Native Inputs)
// ============================================================================

interface ToolFieldsCustomProps {
  tool: FunctionTool
  onChange: (tool: FunctionTool) => void
  disabled?: boolean
}

function ToolFieldsCustom({ tool, onChange, disabled }: ToolFieldsCustomProps) {
  const toolType = tool.tool_type || 'function'
  
  const fields = useMemo(() => {
    const baseFields = [
      { key: 'name', label: 'Function Name', type: 'text', required: true, placeholder: 'e.g., book_appointment' },
      { key: 'description', label: 'Description', type: 'textarea', required: true, placeholder: 'Describe what this tool does and when it should be called...' },
    ]

    const messageFields = [
      { key: 'speak_during_execution', label: 'Speak During Execution', type: 'switch', required: false },
      { key: 'execution_message', label: 'Execution Message', type: 'text', required: false, placeholder: 'Message to speak while executing...' },
    ]

    switch (toolType) {
      case 'endCall':
        return [
          ...baseFields,
          { key: 'execution_message', label: 'Goodbye Message', type: 'text', required: false, placeholder: 'Thank you for calling. Goodbye!' },
        ]
      case 'transferCall':
        return [
          ...baseFields,
          ...messageFields,
        ]
      case 'dtmf':
        return [
          ...baseFields,
          ...messageFields,
        ]
      case 'apiRequest':
        return [
          ...baseFields,
          { key: 'method', label: 'HTTP Method', type: 'select', required: true, options: HTTP_METHODS },
          { key: 'url', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'https://api.example.com/endpoint' },
          { key: 'timeout_seconds', label: 'Timeout (seconds)', type: 'number', required: false, placeholder: '30' },
          ...messageFields,
        ]
      case 'function':
        return [
          ...baseFields,
          { key: 'server_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://your-server.com/webhook' },
          { key: 'async', label: 'Async Execution', type: 'switch', required: false },
          ...messageFields,
        ]
      case 'code':
        return [
          ...baseFields,
          { key: 'runtime', label: 'Runtime', type: 'select', required: true, options: CODE_RUNTIMES.map(r => r.value) },
          { key: 'code', label: 'Code', type: 'code', required: true, placeholder: 'Enter your code here...' },
        ]
      default:
        return [
          ...baseFields,
          { key: 'server_url', label: 'Webhook URL', type: 'text', required: false, placeholder: 'https://your-server.com/webhook' },
          ...messageFields,
        ]
    }
  }, [toolType])

  return (
    <div className="space-y-5">
      {fields.map((field) => {
        const value = (tool as any)[field.key]
        const placeholder = 'placeholder' in field ? field.placeholder : undefined
        const options = 'options' in field ? field.options : undefined
        
        if (field.type === 'text') {
          return (
            <div key={field.key}>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                {field.label}
                {field.required && <span className="text-amber-500">*</span>}
              </label>
              <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange({ ...tool, [field.key]: e.target.value })}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                  "w-full h-11 px-4 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all",
                  field.key === 'name' && "font-mono"
                )}
              />
            </div>
          )
        }
        
        if (field.type === 'textarea') {
          return (
            <div key={field.key}>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                {field.label}
                {field.required && <span className="text-amber-500">*</span>}
              </label>
              <textarea
                value={value || ''}
                onChange={(e) => onChange({ ...tool, [field.key]: e.target.value })}
                placeholder={placeholder}
                disabled={disabled}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              />
            </div>
          )
        }
        
        if (field.type === 'code') {
          return (
            <div key={field.key}>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                {field.label}
                {field.required && <span className="text-amber-500">*</span>}
              </label>
              <textarea
                value={value || ''}
                onChange={(e) => onChange({ ...tool, [field.key]: e.target.value })}
                placeholder={tool.runtime === 'python3.11' ? "def main(params):\n    return {'result': params}" : "async function main(params) {\n  return { result: params };\n}"}
                disabled={disabled}
                rows={8}
                className="w-full px-4 py-3 rounded-xl border bg-muted/50 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              />
            </div>
          )
        }
        
        if (field.type === 'number') {
          return (
            <div key={field.key}>
              <label className="text-sm font-medium mb-2 block">{field.label}</label>
              <input
                type="number"
                value={value || ''}
                onChange={(e) => onChange({ ...tool, [field.key]: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder={placeholder}
                disabled={disabled}
                className="w-full h-11 px-4 rounded-xl border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          )
        }
        
        if (field.type === 'switch') {
          const isChecked = Boolean(value)
          return (
            <div key={field.key} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
              <label htmlFor={`switch-${field.key}`} className="text-sm font-medium">{field.label}</label>
              <input
                type="checkbox"
                id={`switch-${field.key}`}
                checked={isChecked}
                onChange={(e) => onChange({ ...tool, [field.key]: e.target.checked })}
                disabled={disabled}
                className="sr-only peer"
              />
              <label
                htmlFor={`switch-${field.key}`}
                className={cn(
                  "relative h-6 w-11 rounded-full cursor-pointer transition-colors",
                  isChecked ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    isChecked && "translate-x-5"
                  )}
                />
              </label>
            </div>
          )
        }
        
        if (field.type === 'select' && options) {
          return (
            <div key={field.key}>
              <label htmlFor={`field-${field.key}`} className="flex items-center gap-2 text-sm font-medium mb-2">
                {field.label}
                {field.required && <span className="text-amber-500">*</span>}
              </label>
              <select
                id={`field-${field.key}`}
                value={value || options[0]}
                onChange={(e) => onChange({ ...tool, [field.key]: e.target.value })}
                disabled={disabled}
                aria-label={field.label}
                className="w-full h-11 px-4 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
              >
                {options.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )
        }
        
        return null
      })}
    </div>
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
  provider = "vapi",
}: FunctionToolEditorProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)

  const addTool = (tool: FunctionTool) => {
    if (tools.some((t) => t.name === tool.name)) return
    onChange([...tools, tool])
  }

  const updateTool = (id: string, updatedTool: FunctionTool) => {
    onChange(tools.map((t) => (t.id === id ? updatedTool : t)))
  }

  const removeTool = (id: string) => {
    onChange(tools.filter((t) => t.id !== id))
  }

  const existingToolNames = tools.map((t) => t.name)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {onServerUrlChange && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
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
        <Button variant="outline" onClick={() => setShowAddDialog(true)} disabled={disabled}>
          <Plus className="h-4 w-4 mr-2" /> Add Tool
        </Button>
      </div>

      {/* Provider Info */}
      {provider === "retell" && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-blue-700 dark:text-blue-300">
            <strong>Retell Provider:</strong> Supported tools: End Call, Transfer Call, Book Calendar (Cal.com).
          </div>
        </div>
      )}

      {/* Tools List */}
      {tools.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Wrench className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">No Function Tools</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Function tools allow your agent to perform actions like booking appointments, transferring calls, or querying data.
            </p>
            <Button variant="outline" onClick={() => setShowAddDialog(true)} disabled={disabled}>
              <Plus className="h-4 w-4 mr-2" /> Add Your First Tool
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onChange={(updated) => updateTool(tool.id, updated)}
              onRemove={() => removeTool(tool.id)}
              disabled={disabled}
              provider={provider}
            />
          ))}
        </div>
      )}

      {/* Tips */}
      {tools.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <Settings2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-primary/80">
            <strong>Tip:</strong> Click on a tool to expand and configure its settings. <Star className="inline h-3 w-3 text-amber-500 fill-amber-500" /> indicates required fields.
          </div>
        </div>
      )}

      {/* Tool Picker Dialog */}
      <ToolPickerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSelectTool={addTool}
        onUpdateTool={(updatedTool) => updateTool(updatedTool.id, updatedTool)}
        existingToolNames={existingToolNames}
        existingTools={tools}
        provider={provider}
      />
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Calendar,
  CalendarPlus,
  CalendarX,
  CalendarClock,
  Clock,
  Globe,
  Lock,
  Plus,
  Trash2,
  Info,
  Settings,
  X,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { FunctionTool, FunctionToolParameterProperty } from "@/types/database.types"

// =============================================================================
// CONSTANTS
// =============================================================================

export const CALENDAR_TOOL_TYPES = ["book_appointment", "cancel_appointment", "reschedule_appointment"] as const
export type CalendarToolType = (typeof CALENDAR_TOOL_TYPES)[number]

export function isCalendarToolType(name: string): name is CalendarToolType {
  return CALENDAR_TOOL_TYPES.includes(name as CalendarToolType)
}

const CALENDAR_TOOL_INFO: Record<CalendarToolType, {
  name: string
  displayName: string
  description: string
  icon: typeof Calendar
}> = {
  book_appointment: {
    name: "book_appointment",
    displayName: "Book Appointment",
    description: "Book a new appointment for the caller",
    icon: CalendarPlus,
  },
  cancel_appointment: {
    name: "cancel_appointment",
    displayName: "Cancel Appointment",
    description: "Cancel an existing appointment",
    icon: CalendarX,
  },
  reschedule_appointment: {
    name: "reschedule_appointment",
    displayName: "Reschedule Appointment",
    description: "Reschedule an existing appointment to a new time",
    icon: CalendarClock,
  },
}

// Built-in parameters that cannot be changed
const BUILT_IN_PARAMETERS: Record<CalendarToolType, Array<{
  name: string
  description: string
  required: boolean
}>> = {
  book_appointment: [
    { name: "attendee_name", description: "Full name of the person booking", required: true },
    { name: "attendee_email", description: "Email address of the person booking", required: true },
    { name: "preferred_date", description: "Preferred date (YYYY-MM-DD)", required: true },
    { name: "preferred_time", description: "Preferred time (HH:MM)", required: true },
  ],
  cancel_appointment: [
    { name: "attendee_email", description: "Email of the person who booked", required: true },
    { name: "attendee_name", description: "Name helps with appointment lookup", required: false },
    { name: "cancellation_reason", description: "Reason for cancelling the appointment", required: true },
  ],
  reschedule_appointment: [
    { name: "attendee_email", description: "Email of the person who booked", required: true },
    { name: "new_date", description: "New preferred date (YYYY-MM-DD)", required: true },
    { name: "new_time", description: "New preferred time (HH:MM)", required: true },
  ],
}

// Timezones
const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)", region: "US" },
  { value: "America/Chicago", label: "Central Time (CT)", region: "US" },
  { value: "America/Denver", label: "Mountain Time (MT)", region: "US" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", region: "US" },
  { value: "America/Anchorage", label: "Alaska Time", region: "US" },
  { value: "Pacific/Honolulu", label: "Hawaii Time", region: "US" },
  { value: "Europe/London", label: "London (GMT/BST)", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (CET)", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (CET)", region: "Europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET)", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid (CET)", region: "Europe" },
  { value: "Europe/Rome", label: "Rome (CET)", region: "Europe" },
  { value: "Asia/Dubai", label: "Dubai (GST)", region: "Asia" },
  { value: "Asia/Kolkata", label: "India (IST)", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", region: "Asia" },
  { value: "Asia/Shanghai", label: "China (CST)", region: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)", region: "Asia" },
  { value: "Australia/Sydney", label: "Sydney (AEST)", region: "Pacific" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST)", region: "Pacific" },
  { value: "Pacific/Auckland", label: "Auckland (NZST)", region: "Pacific" },
  { value: "UTC", label: "UTC", region: "Other" },
]

// =============================================================================
// TYPES
// =============================================================================

type DayOfWeek = "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY"

const DAYS_OF_WEEK: { value: DayOfWeek; label: string; fullLabel: string }[] = [
  { value: "MONDAY", label: "Mon", fullLabel: "Monday" },
  { value: "TUESDAY", label: "Tue", fullLabel: "Tuesday" },
  { value: "WEDNESDAY", label: "Wed", fullLabel: "Wednesday" },
  { value: "THURSDAY", label: "Thu", fullLabel: "Thursday" },
  { value: "FRIDAY", label: "Fri", fullLabel: "Friday" },
  { value: "SATURDAY", label: "Sat", fullLabel: "Saturday" },
  { value: "SUNDAY", label: "Sun", fullLabel: "Sunday" },
]

const SLOT_DURATIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
]

export interface CalendarToolSettings {
  slot_duration_minutes: number
  buffer_between_slots_minutes: number
  preferred_days: DayOfWeek[]
  preferred_hours_start: string
  preferred_hours_end: string
  timezone: string
  min_notice_hours: number
  max_advance_days: number
}

interface CalendarToolConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (tool: FunctionTool) => void
  toolType: CalendarToolType
  existingTool?: FunctionTool | null
  calendarSettings?: CalendarToolSettings
  onCalendarSettingsChange?: (settings: CalendarToolSettings) => void
  isFirstCalendarTool?: boolean
}

// =============================================================================
// HELPER
// =============================================================================

function generateId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const DEFAULT_CALENDAR_SETTINGS: CalendarToolSettings = {
  slot_duration_minutes: 30,
  buffer_between_slots_minutes: 0,
  preferred_days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  preferred_hours_start: "09:00",
  preferred_hours_end: "17:00",
  timezone: "America/New_York",
  min_notice_hours: 1,
  max_advance_days: 60,
}

// =============================================================================
// CALENDAR TOOL CONFIG DIALOG
// =============================================================================

export function CalendarToolConfigDialog({
  open,
  onOpenChange,
  onSave,
  toolType,
  existingTool,
  calendarSettings,
  onCalendarSettingsChange,
  isFirstCalendarTool = false,
}: CalendarToolConfigDialogProps) {
  const toolInfo = CALENDAR_TOOL_INFO[toolType]
  const builtInParams = BUILT_IN_PARAMETERS[toolType]
  const Icon = toolInfo.icon

  // Calendar Settings (only editable if this is first calendar tool being added)
  const [slotDuration, setSlotDuration] = useState("30")
  const [bufferMinutes, setBufferMinutes] = useState("0")
  const [preferredDays, setPreferredDays] = useState<DayOfWeek[]>(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"])
  const [preferredHoursStart, setPreferredHoursStart] = useState("09:00")
  const [preferredHoursEnd, setPreferredHoursEnd] = useState("17:00")
  const [timezone, setTimezone] = useState("America/New_York")
  const [minNoticeHours, setMinNoticeHours] = useState("1")
  const [maxAdvanceDays, setMaxAdvanceDays] = useState("60")

  // Custom parameters
  const [customParams, setCustomParams] = useState<Array<{
    name: string
    description: string
    required: boolean
  }>>([])
  const [newParamName, setNewParamName] = useState("")
  const [newParamDesc, setNewParamDesc] = useState("")
  const [newParamRequired, setNewParamRequired] = useState(false)

  // Load existing tool config
  useEffect(() => {
    if (open) {
      // Load calendar settings
      const settings = calendarSettings || DEFAULT_CALENDAR_SETTINGS
      setSlotDuration(String(settings.slot_duration_minutes))
      setBufferMinutes(String(settings.buffer_between_slots_minutes))
      setPreferredDays(settings.preferred_days)
      setPreferredHoursStart(settings.preferred_hours_start)
      setPreferredHoursEnd(settings.preferred_hours_end)
      setTimezone(settings.timezone)
      setMinNoticeHours(String(settings.min_notice_hours))
      setMaxAdvanceDays(String(settings.max_advance_days))

      if (existingTool) {
        // Load custom params (exclude built-in ones)
        const builtInNames = new Set(builtInParams.map(p => p.name))
        const existingProps = existingTool.parameters?.properties || {}
        const custom = Object.entries(existingProps)
          .filter(([name]) => !builtInNames.has(name))
          .map(([name, prop]) => ({
            name,
            description: (prop as FunctionToolParameterProperty).description || "",
            required: existingTool.parameters?.required?.includes(name) || false,
          }))
        setCustomParams(custom)
      } else {
        setCustomParams([])
        setNewParamName("")
        setNewParamDesc("")
        setNewParamRequired(false)
      }
    }
  }, [open, existingTool, builtInParams, calendarSettings])


  const toggleDay = (day: DayOfWeek) => {
    if (preferredDays.includes(day)) {
      setPreferredDays(preferredDays.filter(d => d !== day))
    } else {
      setPreferredDays([...preferredDays, day])
    }
  }

  const addCustomParam = () => {
    if (!newParamName.trim() || !newParamDesc.trim()) return
    const allNames = [...builtInParams.map(p => p.name), ...customParams.map(p => p.name)]
    if (allNames.includes(newParamName.trim())) return

    setCustomParams([...customParams, {
      name: newParamName.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
      description: newParamDesc.trim(),
      required: newParamRequired,
    }])
    setNewParamName("")
    setNewParamDesc("")
    setNewParamRequired(false)
  }

  const removeCustomParam = (name: string) => {
    setCustomParams(customParams.filter(p => p.name !== name))
  }

  const handleSave = () => {
    // Build parameters
    const properties: Record<string, FunctionToolParameterProperty> = {}
    const required: string[] = []

    // Add built-in params
    builtInParams.forEach(p => {
      properties[p.name] = { type: "string", description: p.description }
      if (p.required) required.push(p.name)
    })

    // Add custom params
    customParams.forEach(p => {
      properties[p.name] = { type: "string", description: p.description }
      if (p.required) required.push(p.name)
    })

    const tool: FunctionTool = {
      id: existingTool?.id || generateId(),
      name: toolType,
      description: toolInfo.description,
      tool_type: "function",
      parameters: { type: "object", properties, required },
      enabled: true,
    }

    // Update calendar settings only for book_appointment
    if (toolType === "book_appointment" && onCalendarSettingsChange) {
      onCalendarSettingsChange({
        slot_duration_minutes: parseInt(slotDuration),
        buffer_between_slots_minutes: parseInt(bufferMinutes),
        preferred_days: preferredDays,
        preferred_hours_start: preferredHoursStart,
        preferred_hours_end: preferredHoursEnd,
        timezone,
        min_notice_hours: parseInt(minNoticeHours),
        max_advance_days: parseInt(maxAdvanceDays),
      })
    }

    onSave(tool)
    onOpenChange(false)
  }

  // Only book_appointment requires calendar settings validation
  const canSave = toolType === "book_appointment" 
    ? (preferredDays.length > 0 && timezone)
    : true

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            Configure {toolInfo.displayName}
          </DialogTitle>
          <DialogDescription>
            Set up calendar settings and parameters for this tool
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Calendar Settings Section - Only for Book Appointment */}
          {toolType === "book_appointment" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Appointment Settings</Label>
                {!isFirstCalendarTool && (
                  <Badge variant="secondary" className="text-xs">Shared across all calendar tools</Badge>
                )}
              </div>

              {/* Slot Duration & Buffer */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Slot Duration</Label>
                  <Select value={slotDuration} onValueChange={setSlotDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOT_DURATIONS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Buffer Between Slots</Label>
                  <Select value={bufferMinutes} onValueChange={setBufferMinutes}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No buffer</SelectItem>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Timezone */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Timezone
                </Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {["US", "Europe", "Asia", "Pacific", "Other"].map(region => (
                      <SelectGroup key={region}>
                        <SelectLabel>{region}</SelectLabel>
                        {TIMEZONES.filter(tz => tz.region === region).map(tz => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preferred Days */}
              <div className="space-y-2">
                <Label className="text-sm">Available Days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OF_WEEK.map(day => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={preferredDays.includes(day.value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                      className={cn(
                        "h-9 px-3",
                        preferredDays.includes(day.value) && "bg-primary hover:bg-primary/90"
                      )}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
                {preferredDays.length === 0 && (
                  <p className="text-xs text-destructive">Select at least one day</p>
                )}
              </div>

              {/* Business Hours */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Start Time
                  </Label>
                  <Input
                    type="time"
                    value={preferredHoursStart}
                    onChange={e => setPreferredHoursStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    End Time
                  </Label>
                  <Input
                    type="time"
                    value={preferredHoursEnd}
                    onChange={e => setPreferredHoursEnd(e.target.value)}
                  />
                </div>
              </div>

              {/* Booking Constraints */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Minimum Notice (hours)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={168}
                    value={minNoticeHours}
                    onChange={e => setMinNoticeHours(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    How far in advance appointments must be booked
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Maximum Advance (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={maxAdvanceDays}
                    onChange={e => setMaxAdvanceDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    How far in advance appointments can be booked
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* Parameters Section */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-sm font-semibold">Parameters</Label>

            {/* Built-in Parameters (Locked) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Built-in Parameters (cannot be changed)
              </div>
              <div className="space-y-1.5">
                {builtInParams.map(param => (
                  <div
                    key={param.name}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-dashed"
                  >
                    <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono font-medium">{param.name}</code>
                        {param.required && (
                          <Badge variant="secondary" className="text-[10px] h-4">Required</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{param.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Parameters */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3 w-3" />
                Custom Parameters (optional)
              </div>

              {customParams.length > 0 && (
                <div className="space-y-1.5">
                  {customParams.map(param => (
                    <div
                      key={param.name}
                      className="flex items-center gap-2 p-2 rounded-md border bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono font-medium">{param.name}</code>
                          {param.required && (
                            <Badge variant="default" className="text-[10px] h-4 bg-amber-500">Required</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{param.description}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeCustomParam(param.name)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Custom Parameter */}
              <div className="p-3 rounded-md border bg-muted/20 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Add Custom Parameter</div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={newParamName}
                    onChange={e => setNewParamName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    placeholder="Variable name"
                    className="h-8 text-sm font-mono"
                  />
                  <Input
                    value={newParamDesc}
                    onChange={e => setNewParamDesc(e.target.value)}
                    placeholder="Description"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newParamRequired}
                      onChange={e => setNewParamRequired(e.target.checked)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    Required
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={addCustomParam}
                    disabled={!newParamName.trim() || !newParamDesc.trim()}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {existingTool ? "Save Changes" : "Add Tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// CALENDAR TOOLS SELECTOR
// =============================================================================

interface CalendarToolsSelectorProps {
  selectedTools: FunctionTool[]
  onToolsChange: (tools: FunctionTool[]) => void
  calendarSettings?: CalendarToolSettings
  onCalendarSettingsChange?: (settings: CalendarToolSettings) => void
  disabled?: boolean
}

export function CalendarToolsSelector({
  selectedTools,
  onToolsChange,
  calendarSettings,
  onCalendarSettingsChange,
  disabled,
}: CalendarToolsSelectorProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [selectedToolType, setSelectedToolType] = useState<CalendarToolType | null>(null)
  const [editingTool, setEditingTool] = useState<FunctionTool | null>(null)
  const [localCalendarSettings, setLocalCalendarSettings] = useState<CalendarToolSettings>(
    calendarSettings || DEFAULT_CALENDAR_SETTINGS
  )

  // Sync local settings with props
  useEffect(() => {
    if (calendarSettings) {
      setLocalCalendarSettings(calendarSettings)
    }
  }, [calendarSettings])

  // Get selected calendar tools
  const selectedCalendarTools = selectedTools.filter(t => isCalendarToolType(t.name))
  const selectedCalendarNames = new Set(selectedCalendarTools.map(t => t.name))

  const handleToggleTool = (toolType: CalendarToolType) => {
    if (selectedCalendarNames.has(toolType)) {
      // Remove tool
      onToolsChange(selectedTools.filter(t => t.name !== toolType))
    } else {
      // Open config dialog to add
      setSelectedToolType(toolType)
      setEditingTool(null)
      setConfigDialogOpen(true)
    }
  }

  const handleEditTool = (tool: FunctionTool) => {
    setSelectedToolType(tool.name as CalendarToolType)
    setEditingTool(tool)
    setConfigDialogOpen(true)
  }

  const handleSaveTool = (tool: FunctionTool) => {
    const existingIndex = selectedTools.findIndex(t => t.id === tool.id)
    if (existingIndex >= 0) {
      const updated = [...selectedTools]
      updated[existingIndex] = tool
      onToolsChange(updated)
    } else {
      onToolsChange([...selectedTools, tool])
    }
  }

  const handleCalendarSettingsChange = (settings: CalendarToolSettings) => {
    setLocalCalendarSettings(settings)
    onCalendarSettingsChange?.(settings)
  }

  // Format current settings for display
  const formatSettingsSummary = () => {
    const tz = TIMEZONES.find(t => t.value === localCalendarSettings.timezone)?.label || localCalendarSettings.timezone
    const days = localCalendarSettings.preferred_days
      .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label)
      .filter(Boolean)
      .join(", ")
    const duration = SLOT_DURATIONS.find(d => d.value === String(localCalendarSettings.slot_duration_minutes))?.label || `${localCalendarSettings.slot_duration_minutes} min`
    
    return { 
      tz, 
      days, 
      duration, 
      hours: `${localCalendarSettings.preferred_hours_start} - ${localCalendarSettings.preferred_hours_end}`,
    }
  }

  const summary = formatSettingsSummary()

  return (
    <div className="space-y-4">
      {/* Current Settings Display (only when book_appointment is selected) */}
      {selectedCalendarNames.has("book_appointment") && (
        <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Booking Settings
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="text-muted-foreground">Timezone:</div>
            <div className="font-medium">{summary.tz}</div>
            <div className="text-muted-foreground">Slot Duration:</div>
            <div className="font-medium">{summary.duration}</div>
            <div className="text-muted-foreground">Available Days:</div>
            <div className="font-medium">{summary.days}</div>
            <div className="text-muted-foreground">Business Hours:</div>
            <div className="font-medium">{summary.hours}</div>
          </div>
        </div>
      )}

      {/* Tools Grid */}
      <div className="grid gap-2">
        {CALENDAR_TOOL_TYPES.map(toolType => {
          const info = CALENDAR_TOOL_INFO[toolType]
          const Icon = info.icon
          const isSelected = selectedCalendarNames.has(toolType)
          const existingTool = selectedCalendarTools.find(t => t.name === toolType)

          return (
            <div
              key={toolType}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-all",
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              )}
              onClick={() => !disabled && !isSelected && handleToggleTool(toolType)}
            >
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                <Icon className="h-4 w-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{info.displayName}</span>
                  {isSelected && (
                    <Badge variant="secondary" className="text-xs">Added</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{info.description}</p>
              </div>

              {isSelected ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={(e) => { e.stopPropagation(); handleEditTool(existingTool!) }}
                    disabled={disabled}
                  >
                    Configure
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleToggleTool(toolType) }}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className={cn(
                  "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                  "border-muted-foreground/30"
                )}>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedToolType && (
        <CalendarToolConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          onSave={handleSaveTool}
          toolType={selectedToolType}
          existingTool={editingTool}
          calendarSettings={localCalendarSettings}
          onCalendarSettingsChange={handleCalendarSettingsChange}
          isFirstCalendarTool={selectedCalendarNames.size === 0}
        />
      )}
    </div>
  )
}

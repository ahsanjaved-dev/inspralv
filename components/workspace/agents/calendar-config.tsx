"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Loader2,
  Calendar,
  Clock,
  Settings,
  Check,
  AlertCircle,
  Globe,
  Trash2,
  Save,
  Mail,
  Bell,
  Plus,
  Link2,
} from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { 
  ALL_TIMEZONES, 
  TIMEZONE_REGIONS, 
  getTimezoneOffset,
  getUserTimezone 
} from "@/lib/utils/timezones"
import { useWorkspaceSettings } from "@/lib/hooks/use-workspace-settings"

// =============================================================================
// CONSTANTS
// =============================================================================

// Use comprehensive timezone list from utility
const TIMEZONES = ALL_TIMEZONES

const DAYS_OF_WEEK = [
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
]

const SLOT_DURATIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
]

const MIN_NOTICE_OPTIONS = [
  { value: 0, label: "No minimum (allow immediate bookings)" },
  { value: 1, label: "1 hour before" },
  { value: 2, label: "2 hours before" },
  { value: 4, label: "4 hours before" },
  { value: 8, label: "8 hours before" },
  { value: 12, label: "12 hours before" },
  { value: 24, label: "24 hours (1 day) before" },
  { value: 48, label: "48 hours (2 days) before" },
  { value: 72, label: "72 hours (3 days) before" },
]

const MAX_ADVANCE_OPTIONS = [
  { value: 7, label: "1 week" },
  { value: 14, label: "2 weeks" },
  { value: 30, label: "1 month" },
  { value: 60, label: "2 months" },
  { value: 90, label: "3 months" },
  { value: 180, label: "6 months" },
  { value: 365, label: "1 year" },
]

// =============================================================================
// TYPES
// =============================================================================

interface CalendarConfigProps {
  workspaceSlug: string
  agentId: string
}

interface GoogleCredential {
  id: string
  client_id: string
  is_active: boolean
  calendars?: Array<{
    id: string
    summary: string
    primary?: boolean
  }>
}

interface CalendarConfig {
  id: string
  google_credential_id: string
  calendar_id: string
  calendar_name: string | null
  timezone: string
  slot_duration_minutes: number
  buffer_between_slots_minutes: number
  preferred_days: string[]
  preferred_hours_start: string
  preferred_hours_end: string
  min_notice_hours: number
  max_advance_days: number
  is_active: boolean
  // Email notification settings
  enable_owner_email: boolean
  owner_email: string | null
  google_credentials?: {
    id: string
    is_active: boolean
  }
}

interface WorkspaceCalendar {
  calendar_id: string
  calendar_name: string | null
  agent_id: string
  agent_name: string
  timezone: string
  slot_duration_minutes: number
  buffer_between_slots_minutes: number
  preferred_days: string[]
  preferred_hours_start: string
  preferred_hours_end: string
  min_notice_hours: number
  max_advance_days: number
  is_active: boolean
  created_at: string
  agents_using?: { id: string; name: string }[]
}

// =============================================================================
// FORM SCHEMA
// =============================================================================

const calendarConfigSchema = z.object({
  google_credential_id: z.string().optional(), // Optional - set during initial setup only
  calendar_id: z.string().optional(), // Optional - set during initial setup only
  timezone: z.string().min(1, "Please select a timezone"),
  slot_duration_minutes: z.number().min(15).max(240),
  buffer_between_slots_minutes: z.number().min(0).max(60),
  preferred_days: z.array(z.string()).min(1, "Select at least one day"),
  preferred_hours_start: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  preferred_hours_end: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  min_notice_hours: z.number().min(0).max(168),
  max_advance_days: z.number().min(1).max(365),
  // Email notification settings
  enable_owner_email: z.boolean().default(false),
  owner_email: z.string().optional(),
})

type CalendarConfigFormData = z.infer<typeof calendarConfigSchema>

// =============================================================================
// COMPONENT
// =============================================================================

export function CalendarConfig({ workspaceSlug, agentId }: CalendarConfigProps) {
  const queryClient = useQueryClient()
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false)
  const [calendarSource, setCalendarSource] = useState<'new' | 'existing'>('new')
  const [selectedExistingCalendarId, setSelectedExistingCalendarId] = useState<string | null>(null)

  // Get workspace timezone for default calendar settings
  const { data: workspace, isLoading: isLoadingWorkspace } = useWorkspaceSettings()
  const workspaceSettings = workspace?.settings as { timezone?: string } | undefined
  const workspaceTimezone = workspaceSettings?.timezone || "UTC"

  // Fetch existing config
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["agent-calendar-config", agentId],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}/calendar`)
      if (!res.ok) throw new Error("Failed to fetch calendar config")
      return res.json()
    },
  })

  // Fetch available Google credentials (only needed to check if any exist)
  const { data: credentialsData, isLoading: credentialsLoading } = useQuery({
    queryKey: ["google-credentials"],
    queryFn: async () => {
      const res = await fetch("/api/partner/google-credentials")
      if (!res.ok) throw new Error("Failed to fetch credentials")
      return res.json()
    },
  })

  // Fetch workspace calendars (for existing calendar selection)
  const { data: workspaceCalendarsData, isLoading: calendarsLoading } = useQuery({
    queryKey: ["workspace-calendars", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/calendars`)
      if (!res.ok) throw new Error("Failed to fetch workspace calendars")
      return res.json()
    },
  })

  const existingConfig = configData?.data as CalendarConfig | null
  const credentials = (credentialsData?.data || []) as GoogleCredential[]
  const workspaceCalendars = (workspaceCalendarsData?.data?.calendars || []) as WorkspaceCalendar[]
  
  // Filter out the current agent's calendar from the list of existing calendars
  const availableCalendars = workspaceCalendars.filter(cal => cal.agent_id !== agentId)

  // Form setup
  const form = useForm<CalendarConfigFormData>({
    // @ts-expect-error - Type mismatch between zod resolver versions
    resolver: zodResolver(calendarConfigSchema),
    defaultValues: {
      google_credential_id: "",
      calendar_id: "",
      timezone: "", // Empty - will be set to workspace timezone
      slot_duration_minutes: 30,
      buffer_between_slots_minutes: 0,
      preferred_days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
      preferred_hours_start: "09:00",
      preferred_hours_end: "17:00",
      min_notice_hours: 0, // Allow immediate bookings by default
      max_advance_days: 60,
      enable_owner_email: false,
      owner_email: "",
    },
  })

  // Set workspace timezone as default when workspace data loads (for new configs)
  useEffect(() => {
    if (isLoadingWorkspace || existingConfig) return
    
    // Only set timezone if form hasn't been modified and no existing config
    const currentTimezone = form.getValues("timezone")
    if (!currentTimezone) {
      form.setValue("timezone", workspaceTimezone)
    }
  }, [workspaceTimezone, isLoadingWorkspace, existingConfig, form])

  // Update form when existing config loads
  useEffect(() => {
    if (existingConfig) {
      console.log('[CalendarConfig] Loading existing config - ALL FIELDS:', {
        timezone: existingConfig.timezone,
        slot_duration_minutes: existingConfig.slot_duration_minutes,
        buffer_between_slots_minutes: existingConfig.buffer_between_slots_minutes,
        preferred_days: existingConfig.preferred_days,
        preferred_hours_start: existingConfig.preferred_hours_start,
        preferred_hours_end: existingConfig.preferred_hours_end,
        min_notice_hours: existingConfig.min_notice_hours,
        max_advance_days: existingConfig.max_advance_days,
        enable_owner_email: existingConfig.enable_owner_email,
        owner_email: existingConfig.owner_email,
        calendar_name: existingConfig.calendar_name,
      })
      form.reset({
        google_credential_id: existingConfig.google_credential_id,
        calendar_id: existingConfig.calendar_id,
        timezone: existingConfig.timezone,
        slot_duration_minutes: existingConfig.slot_duration_minutes,
        buffer_between_slots_minutes: existingConfig.buffer_between_slots_minutes,
        preferred_days: existingConfig.preferred_days,
        preferred_hours_start: existingConfig.preferred_hours_start,
        preferred_hours_end: existingConfig.preferred_hours_end,
        min_notice_hours: existingConfig.min_notice_hours,
        max_advance_days: existingConfig.max_advance_days,
        enable_owner_email: existingConfig.enable_owner_email || false,
        owner_email: existingConfig.owner_email || "",
      })
    }
  }, [existingConfig, form])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: CalendarConfigFormData) => {
      // When editing, use existing credential and calendar IDs
      const payload = existingConfig
        ? {
            ...data,
            google_credential_id: existingConfig.google_credential_id,
            calendar_id: existingConfig.calendar_id,
          }
        : data

      const res = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to save config")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Calendar configuration saved")
      queryClient.invalidateQueries({ queryKey: ["agent-calendar-config", agentId] })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}/calendar`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to remove calendar")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Calendar configuration removed")
      queryClient.invalidateQueries({ queryKey: ["agent-calendar-config", agentId] })
      form.reset()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Load existing calendar config when one is selected
  useEffect(() => {
    if (selectedExistingCalendarId && calendarSource === 'existing') {
      const selectedCalendar = availableCalendars.find(
        cal => cal.calendar_id === selectedExistingCalendarId
      )
      if (selectedCalendar) {
        // Load the selected calendar's configuration into the form
        form.setValue("timezone", selectedCalendar.timezone)
        form.setValue("slot_duration_minutes", selectedCalendar.slot_duration_minutes)
        form.setValue("buffer_between_slots_minutes", selectedCalendar.buffer_between_slots_minutes)
        form.setValue("preferred_days", selectedCalendar.preferred_days)
        form.setValue("preferred_hours_start", selectedCalendar.preferred_hours_start)
        form.setValue("preferred_hours_end", selectedCalendar.preferred_hours_end)
        form.setValue("min_notice_hours", selectedCalendar.min_notice_hours)
        form.setValue("max_advance_days", selectedCalendar.max_advance_days)
      }
    }
  }, [selectedExistingCalendarId, calendarSource, availableCalendars, form])

  // Quick Setup - creates a new calendar or uses existing one
  const handleQuickSetup = async () => {
    const timezone = form.getValues("timezone")
    const preferredDays = form.getValues("preferred_days")
    const preferredHoursStart = form.getValues("preferred_hours_start")
    const preferredHoursEnd = form.getValues("preferred_hours_end")
    const slotDuration = form.getValues("slot_duration_minutes")
    const bufferBetweenSlots = form.getValues("buffer_between_slots_minutes")
    const minNoticeHours = form.getValues("min_notice_hours")
    const maxAdvanceDays = form.getValues("max_advance_days")
    const enableOwnerEmail = form.getValues("enable_owner_email")
    const ownerEmail = form.getValues("owner_email")

    if (!timezone) {
      toast.error("Please select a timezone first")
      return
    }

    // Validate email if notifications are enabled
    if (enableOwnerEmail && (!ownerEmail || ownerEmail === "")) {
      toast.error("Please enter your email address to enable notifications")
      return
    }

    // If using existing calendar, validate selection
    if (calendarSource === 'existing' && !selectedExistingCalendarId) {
      toast.error("Please select an existing calendar")
      return
    }

    setIsCreatingCalendar(true)
    try {
      const selectedCalendar = calendarSource === 'existing' 
        ? availableCalendars.find(cal => cal.calendar_id === selectedExistingCalendarId)
        : null

      const res = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}/calendar/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone,
          slot_duration_minutes: slotDuration,
          buffer_between_slots_minutes: bufferBetweenSlots,
          preferred_days: preferredDays,
          preferred_hours_start: preferredHoursStart,
          preferred_hours_end: preferredHoursEnd,
          min_notice_hours: minNoticeHours,
          max_advance_days: maxAdvanceDays,
          enable_owner_email: enableOwnerEmail,
          owner_email: enableOwnerEmail ? ownerEmail : null,
          // Existing calendar options
          use_existing_calendar: calendarSource === 'existing',
          existing_calendar_id: selectedCalendar?.calendar_id,
          existing_calendar_name: selectedCalendar?.calendar_name,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to setup calendar")
      }

      const result = await res.json()
      const message = calendarSource === 'existing' 
        ? `Calendar linked successfully!`
        : `Calendar "${result.data?.calendar_name}" created successfully!`
      toast.success(message)
      
      // Refresh the config and calendars list
      queryClient.invalidateQueries({ queryKey: ["agent-calendar-config", agentId] })
      queryClient.invalidateQueries({ queryKey: ["workspace-calendars", workspaceSlug] })
      queryClient.invalidateQueries({ queryKey: ["google-credential-calendars"] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to setup calendar")
    } finally {
      setIsCreatingCalendar(false)
    }
  }

  const onSubmit = form.handleSubmit((formData) => {
    const data = formData as unknown as CalendarConfigFormData
    // Validate email if notifications are enabled
    if (data.enable_owner_email && (!data.owner_email || data.owner_email === "")) {
      form.setError("owner_email", {
        type: "manual",
        message: "Email address is required when email notifications are enabled",
      })
      return
    }
    // Validate email format if provided
    if (data.enable_owner_email && data.owner_email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(data.owner_email)) {
        form.setError("owner_email", {
          type: "manual",
          message: "Please enter a valid email address",
        })
        return
      }
    }
    saveMutation.mutate(data)
  })

  if (configLoading || credentialsLoading || calendarsLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  // No credentials configured
  if (credentials.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar Integration
          </CardTitle>
          <CardDescription>
            Enable appointment booking for this agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              No Google Calendar credentials configured. Contact your organization administrator to set up Google Calendar integration.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendar Integration
            </CardTitle>
            <CardDescription>
              Enable appointment booking, cancellation, and rescheduling
            </CardDescription>
          </div>
          {existingConfig && (
            <Badge variant={existingConfig.is_active ? "default" : "secondary"}>
              {existingConfig.is_active ? "Active" : "Inactive"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Current Calendar Info - show when config exists */}
        {existingConfig && (
          <div className="mb-6 p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Current Calendar
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {existingConfig.calendar_name || 'Unnamed Calendar'}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>Timezone: <span className="font-medium text-foreground">{existingConfig.timezone}</span></div>
                <div>Slot: <span className="font-medium text-foreground">{existingConfig.slot_duration_minutes} min</span></div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Modify the settings below to update your calendar configuration.
            </p>
          </div>
        )}

        {/* Calendar Setup - show only when no config exists */}
        {!existingConfig && credentials.length > 0 && (
          <div className="mb-6 space-y-4">
            {/* Calendar Source Selection */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Calendar Source</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose whether to create a new calendar or use an existing one from this workspace.
                </p>
              </div>
              
              <RadioGroup
                value={calendarSource}
                onValueChange={(value: 'new' | 'existing') => {
                  setCalendarSource(value)
                  setSelectedExistingCalendarId(null)
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="new"
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                    calendarSource === 'new' 
                      ? "border-primary bg-primary/5" 
                      : "border-muted hover:border-muted-foreground/50"
                  )}
                >
                  <RadioGroupItem value="new" id="new" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Plus className="h-4 w-4" />
                      Create New Calendar
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      A new Google Calendar will be created specifically for this agent.
                    </p>
                  </div>
                </Label>
                
                <Label
                  htmlFor="existing"
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                    calendarSource === 'existing' 
                      ? "border-primary bg-primary/5" 
                      : "border-muted hover:border-muted-foreground/50",
                    availableCalendars.length === 0 && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <RadioGroupItem 
                    value="existing" 
                    id="existing" 
                    className="mt-0.5"
                    disabled={availableCalendars.length === 0}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Link2 className="h-4 w-4" />
                      Use Existing Calendar
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {availableCalendars.length > 0 
                        ? `Share a calendar from another agent (${availableCalendars.length} available).`
                        : "No existing calendars available in this workspace."
                      }
                    </p>
                  </div>
                </Label>
              </RadioGroup>

              {/* Existing Calendar Selection */}
              {calendarSource === 'existing' && availableCalendars.length > 0 && (
                <div className="space-y-2 pt-2">
                  <Label>Select Calendar</Label>
                  <Select
                    value={selectedExistingCalendarId || ""}
                    onValueChange={setSelectedExistingCalendarId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an existing calendar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCalendars.map((cal) => (
                        <SelectItem key={cal.calendar_id} value={cal.calendar_id}>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {cal.calendar_name || `Calendar - ${cal.agent_name}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Used by: {cal.agents_using?.map(a => a.name).join(', ') || cal.agent_name}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedExistingCalendarId && (
                    <p className="text-xs text-muted-foreground">
                      The configuration below has been loaded from the selected calendar. You can modify it if needed.
                    </p>
                  )}
                </div>
              )}

              {/* Setup Button */}
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={handleQuickSetup}
                  disabled={
                    isCreatingCalendar || 
                    !form.getValues("timezone") ||
                    (calendarSource === 'existing' && !selectedExistingCalendarId)
                  }
                  className="w-full md:w-auto"
                >
                  {isCreatingCalendar ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {calendarSource === 'existing' ? 'Linking...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      {calendarSource === 'existing' ? (
                        <>
                          <Link2 className="mr-2 h-4 w-4" />
                          Link Calendar
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Calendar
                        </>
                      )}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Timezone Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Timezone
            </Label>
            <Controller
              name="timezone"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone">
                      {field.value && (
                        <span className="flex items-center gap-2">
                          <span>{TIMEZONES.find(tz => tz.value === field.value)?.label || field.value}</span>
                          <span className="text-muted-foreground text-xs">
                            ({getTimezoneOffset(field.value)})
                          </span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-[400px]">
                      {TIMEZONE_REGIONS.map((region) => {
                        const regionTimezones = TIMEZONES.filter((tz) => tz.region === region)
                        if (regionTimezones.length === 0) return null
                        return (
                          <div key={region}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                              {region}
                            </div>
                            {regionTimezones.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                <span className="flex items-center justify-between w-full gap-2">
                                  <span>{tz.label}</span>
                                  <span className="text-muted-foreground text-xs">
                                    {getTimezoneOffset(tz.value)}
                                  </span>
                                </span>
                              </SelectItem>
                            ))}
                          </div>
                        )
                      })}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Appointments will be booked in this timezone. Your browser timezone: {getUserTimezone()}
            </p>
          </div>

          {/* Slot Configuration */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Slot Duration
              </Label>
              <Controller
                name="slot_duration_minutes"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOT_DURATIONS.map((dur) => (
                        <SelectItem key={dur.value} value={String(dur.value)}>
                          {dur.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Buffer Between Slots</Label>
              <Controller
                name="buffer_between_slots_minutes"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
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
                )}
              />
            </div>
          </div>

          {/* Preferred Days */}
          <div className="space-y-2">
            <Label>Available Days</Label>
            <div className="flex flex-wrap gap-2">
              <Controller
                name="preferred_days"
                control={form.control}
                render={({ field }) => (
                  <>
                    {DAYS_OF_WEEK.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={field.value.includes(day.value) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const newDays = field.value.includes(day.value)
                            ? field.value.filter((d) => d !== day.value)
                            : [...field.value, day.value]
                          field.onChange(newDays)
                        }}
                      >
                        {day.label.slice(0, 3)}
                      </Button>
                    ))}
                  </>
                )}
              />
            </div>
          </div>

          {/* Business Hours */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Controller
                name="preferred_hours_start"
                control={form.control}
                render={({ field }) => (
                  <Input
                    type="time"
                    {...field}
                  />
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>End Time</Label>
              <Controller
                name="preferred_hours_end"
                control={form.control}
                render={({ field }) => (
                  <Input
                    type="time"
                    {...field}
                  />
                )}
              />
            </div>
          </div>

          {/* Booking Constraints */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings className="h-4 w-4" />
              Booking Rules
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Minimum Advance Notice</Label>
                <Controller
                  name="min_notice_hours"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MIN_NOTICE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Earliest time before an appointment can be booked
                </p>
              </div>

              <div className="space-y-2">
                <Label>Maximum Advance Booking</Label>
                <Controller
                  name="max_advance_days"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAX_ADVANCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Furthest time in advance an appointment can be booked
                </p>
              </div>
            </div>
          </div>

          {/* Email Notifications */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mail className="h-4 w-4" />
              Email Notifications
            </div>
            
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enable_owner_email" className="text-sm font-medium">
                    Enable Email Notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Send email notifications when appointments are booked, rescheduled, or cancelled
                  </p>
                </div>
                <Controller
                  name="enable_owner_email"
                  control={form.control}
                  render={({ field }) => (
                    <Switch
                      id="enable_owner_email"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>

              {form.watch("enable_owner_email") && (
                <div className="space-y-3 pt-3 border-t">
                  <Label htmlFor="owner_email">
                    Owner Email Address
                  </Label>
                  <Controller
                    name="owner_email"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        id="owner_email"
                        type="email"
                        placeholder="Enter your email address"
                        {...field}
                        value={field.value || ""}
                      />
                    )}
                  />
                  {form.formState.errors.owner_email && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.owner_email.message}
                    </p>
                  )}
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
                      📧 How Email Notifications Work
                    </p>
                    <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                      <li><strong>Booking:</strong> Both you and the caller receive confirmation emails</li>
                      <li><strong>Reschedule:</strong> Both parties receive update notifications</li>
                      <li><strong>Cancellation:</strong> Both parties receive cancellation emails</li>
                    </ul>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                      ⚠️ <strong>Note:</strong> If the caller provides the same email as your Google Calendar account, they won&apos;t receive a separate notification (Google Calendar limitation for event organizers).
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Configuration
                </>
              )}
            </Button>

            {existingConfig && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}


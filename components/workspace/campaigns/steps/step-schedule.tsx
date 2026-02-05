"use client"

import { memo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Clock,
  Calendar,
  Plus,
  X,
  AlertCircle,
  Zap,
  Info,
} from "lucide-react"
import type { BusinessHoursConfig, BusinessHoursTimeSlot, DayOfWeek } from "@/types/database.types"
import type { WizardFormData } from "@/lib/stores/campaign-wizard-store"

interface StepScheduleProps {
  formData: WizardFormData
  updateFormData: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void
  errors: Record<string, string>
}

const DAYS_OF_WEEK: { key: DayOfWeek; label: string; shortLabel: string }[] = [
  { key: "monday", label: "Monday", shortLabel: "Mon" },
  { key: "tuesday", label: "Tuesday", shortLabel: "Tue" },
  { key: "wednesday", label: "Wednesday", shortLabel: "Wed" },
  { key: "thursday", label: "Thursday", shortLabel: "Thu" },
  { key: "friday", label: "Friday", shortLabel: "Fri" },
  { key: "saturday", label: "Saturday", shortLabel: "Sat" },
  { key: "sunday", label: "Sunday", shortLabel: "Sun" },
]

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central European (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Dubai", label: "Gulf Standard (GST)" },
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Japan (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEDT)" },
  { value: "Australia/Melbourne", label: "Melbourne (AEDT)" },
]

// Allowed time options: 9:00 AM to 8:00 PM (no night calling)
const ALLOWED_TIMES = [
  { value: "09:00", label: "9:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "13:30", label: "1:30 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "14:30", label: "2:30 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "15:30", label: "3:30 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "16:30", label: "4:30 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "17:30", label: "5:30 PM" },
  { value: "18:00", label: "6:00 PM" },
  { value: "18:30", label: "6:30 PM" },
  { value: "19:00", label: "7:00 PM" },
  { value: "19:30", label: "7:30 PM" },
  { value: "20:00", label: "8:00 PM" },
]

export const StepSchedule = memo(function StepSchedule({
  formData,
  updateFormData,
  errors,
}: StepScheduleProps) {
  const config = formData.businessHoursConfig

  const updateConfig = useCallback((updates: Partial<BusinessHoursConfig>) => {
    updateFormData("businessHoursConfig", {
      ...config,
      ...updates,
    })
  }, [config, updateFormData])

  const updateDaySchedule = useCallback((day: DayOfWeek, slots: BusinessHoursTimeSlot[]) => {
    updateFormData("businessHoursConfig", {
      ...config,
      schedule: {
        ...config.schedule,
        [day]: slots,
      },
    })
  }, [config, updateFormData])

  const addTimeSlot = useCallback((day: DayOfWeek) => {
    const currentSlots = config.schedule[day]
    const lastSlot = currentSlots[currentSlots.length - 1]
    // Default new slot starts after the last one ends, capped at allowed range
    const newStart = lastSlot?.end || "09:00"
    const newEnd = "17:00"
    const newSlot: BusinessHoursTimeSlot = { start: newStart, end: newEnd }
    updateDaySchedule(day, [...currentSlots, newSlot])
  }, [config.schedule, updateDaySchedule])

  const removeTimeSlot = useCallback((day: DayOfWeek, index: number) => {
    const currentSlots = config.schedule[day]
    updateDaySchedule(day, currentSlots.filter((_, i) => i !== index))
  }, [config.schedule, updateDaySchedule])

  const updateTimeSlot = useCallback((
    day: DayOfWeek,
    index: number,
    field: "start" | "end",
    value: string
  ) => {
    const currentSlots = config.schedule[day]
    const updated = [...currentSlots]
    updated[index] = { ...updated[index], [field]: value } as BusinessHoursTimeSlot
    updateDaySchedule(day, updated)
  }, [config.schedule, updateDaySchedule])

  const toggleDay = useCallback((day: DayOfWeek, enabled: boolean) => {
    if (enabled && config.schedule[day].length === 0) {
      // Add default slot when enabling a day
      updateDaySchedule(day, [{ start: "09:00", end: "17:00" }])
    } else if (!enabled) {
      // Clear slots when disabling
      updateDaySchedule(day, [])
    }
  }, [config.schedule, updateDaySchedule])

  // Get available end times (must be after start time)
  const getEndTimeOptions = useCallback((startTime: string) => {
    const startIndex = ALLOWED_TIMES.findIndex(t => t.value === startTime)
    return ALLOWED_TIMES.filter((_, index) => index > startIndex)
  }, [])

  return (
    <div className="space-y-8">
      {/* Schedule Type */}
      <div>
        <Label className="text-base font-medium">When to Start</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Choose when the campaign should begin making calls
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Card
            className={`cursor-pointer transition-all ${
              formData.scheduleType === "immediate"
                ? "ring-2 ring-primary"
                : "hover:border-primary/50"
            }`}
            onClick={() => {
              updateFormData("scheduleType", "immediate")
              updateFormData("scheduledStartAt", null)
            }}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Start Immediately</p>
                  <p className="text-sm text-muted-foreground">
                    Begin calls as soon as campaign is created
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all ${
              formData.scheduleType === "scheduled"
                ? "ring-2 ring-primary"
                : "hover:border-primary/50"
            }`}
            onClick={() => updateFormData("scheduleType", "scheduled")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Schedule for Later</p>
                  <p className="text-sm text-muted-foreground">
                    Set a specific date and time to start
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scheduled Start Date/Time - only for "Schedule for Later" */}
        {formData.scheduleType === "scheduled" && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="scheduled-start">Start Date & Time <span className="text-destructive">*</span></Label>
              <Input
                id="scheduled-start"
                type="datetime-local"
                value={formData.scheduledStartAt || ""}
                onChange={(e) => updateFormData("scheduledStartAt", e.target.value)}
                className={`mt-2 max-w-xs ${errors.scheduledStartAt ? "border-destructive" : ""}`}
              />
              {errors.scheduledStartAt && (
                <p className="text-sm text-destructive flex items-center gap-1 mt-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.scheduledStartAt}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Expiry Date/Time - REQUIRED for both schedule types */}
        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <div>
            <Label htmlFor="scheduled-expires" className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Campaign Expiry Date & Time <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              {formData.scheduleType === "immediate" 
                ? "Campaign will auto-cancel if not completed by this time. This protects recipients from stale campaigns."
                : "Campaign will auto-cancel if not started by this time."
              }
            </p>
            <Input
              id="scheduled-expires"
              type="datetime-local"
              value={formData.scheduledExpiresAt || ""}
              onChange={(e) => updateFormData("scheduledExpiresAt", e.target.value)}
              className={`max-w-xs ${errors.scheduledExpiresAt ? "border-destructive" : ""}`}
            />
            {errors.scheduledExpiresAt && (
              <p className="text-sm text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="h-4 w-4" />
                {errors.scheduledExpiresAt}
              </p>
            )}
            {!errors.scheduledExpiresAt && formData.scheduledExpiresAt && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Campaign will expire on {new Date(formData.scheduledExpiresAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Business Hours Section - Always shown, no toggle */}
      <div className="border-t pt-6">
        <div className="mb-4">
          <Label className="text-base font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Business Hours
          </Label>
          <p className="text-sm text-muted-foreground">
            Configure when calls can be made. Calls are only allowed between 9 AM and 8 PM.
          </p>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 p-3 mb-6 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            To protect recipients from unwanted calls, calling hours are restricted to 9:00 AM - 8:00 PM in the selected timezone.
          </p>
        </div>

        <div className="space-y-6">
          {/* Timezone */}
          <div>
            <Label>Timezone</Label>
            <Select
              value={config.timezone}
              onValueChange={(value) => updateConfig({ timezone: value })}
            >
              <SelectTrigger className="max-w-xs mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day-by-Day Schedule */}
          <div className="space-y-3">
            {DAYS_OF_WEEK.map((day) => {
              const slots = config.schedule[day.key]
              const isEnabled = slots.length > 0

              return (
                <div
                  key={day.key}
                  className={`p-4 rounded-lg border ${
                    isEnabled ? "bg-muted/30" : "bg-muted/10"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <Checkbox
                      id={`day-${day.key}`}
                      checked={isEnabled}
                      onCheckedChange={(checked) => toggleDay(day.key, !!checked)}
                    />
                    <Label
                      htmlFor={`day-${day.key}`}
                      className={`w-24 font-medium cursor-pointer ${
                        !isEnabled && "text-muted-foreground"
                      }`}
                    >
                      {day.label}
                    </Label>

                    {isEnabled ? (
                      <div className="flex-1 space-y-2">
                        {slots.map((slot, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Select
                              value={slot.start}
                              onValueChange={(value) =>
                                updateTimeSlot(day.key, index, "start", value)
                              }
                            >
                              <SelectTrigger className="w-[130px] h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALLOWED_TIMES.slice(0, -1).map((time) => (
                                  <SelectItem key={time.value} value={time.value}>
                                    {time.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-muted-foreground">to</span>
                            <Select
                              value={slot.end}
                              onValueChange={(value) =>
                                updateTimeSlot(day.key, index, "end", value)
                              }
                            >
                              <SelectTrigger className="w-[130px] h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {getEndTimeOptions(slot.start).map((time) => (
                                  <SelectItem key={time.value} value={time.value}>
                                    {time.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {slots.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeTimeSlot(day.key, index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                            {index === slots.length - 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() => addTimeSlot(day.key)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No calls on this day</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})

// Display name for debugging
StepSchedule.displayName = "StepSchedule"

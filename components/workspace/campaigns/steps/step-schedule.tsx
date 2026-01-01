"use client"

import { useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
} from "lucide-react"
import type { BusinessHoursConfig, BusinessHoursTimeSlot, DayOfWeek } from "@/types/database.types"
import type { WizardFormData } from "../campaign-wizard"

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
]

export function StepSchedule({
  formData,
  updateFormData,
  errors,
}: StepScheduleProps) {
  const config = formData.businessHoursConfig

  const updateConfig = (updates: Partial<BusinessHoursConfig>) => {
    updateFormData("businessHoursConfig", {
      ...config,
      ...updates,
    })
  }

  const updateDaySchedule = (day: DayOfWeek, slots: BusinessHoursTimeSlot[]) => {
    updateFormData("businessHoursConfig", {
      ...config,
      schedule: {
        ...config.schedule,
        [day]: slots,
      },
    })
  }

  const addTimeSlot = (day: DayOfWeek) => {
    const currentSlots = config.schedule[day]
    const lastSlot = currentSlots[currentSlots.length - 1]
    const newSlot: BusinessHoursTimeSlot = lastSlot
      ? { start: lastSlot.end, end: "18:00" }
      : { start: "09:00", end: "17:00" }
    updateDaySchedule(day, [...currentSlots, newSlot])
  }

  const removeTimeSlot = (day: DayOfWeek, index: number) => {
    const currentSlots = config.schedule[day]
    updateDaySchedule(day, currentSlots.filter((_, i) => i !== index))
  }

  const updateTimeSlot = (
    day: DayOfWeek,
    index: number,
    field: "start" | "end",
    value: string
  ) => {
    const currentSlots = config.schedule[day]
    const updated = [...currentSlots]
    updated[index] = { ...updated[index], [field]: value } as BusinessHoursTimeSlot
    updateDaySchedule(day, updated)
  }

  const toggleDay = (day: DayOfWeek, enabled: boolean) => {
    if (enabled && config.schedule[day].length === 0) {
      // Add default slot when enabling a day
      updateDaySchedule(day, [{ start: "09:00", end: "17:00" }])
    } else if (!enabled) {
      // Clear slots when disabling
      updateDaySchedule(day, [])
    }
  }

  // Calculate total hours
  const totalHoursPerWeek = useMemo(() => {
    let total = 0
    for (const day of DAYS_OF_WEEK) {
      for (const slot of config.schedule[day.key]) {
        const startParts = slot.start.split(":")
        const endParts = slot.end.split(":")
        const startH = startParts[0] ? Number(startParts[0]) : 0
        const startM = startParts[1] ? Number(startParts[1]) : 0
        const endH = endParts[0] ? Number(endParts[0]) : 0
        const endM = endParts[1] ? Number(endParts[1]) : 0
        const hours = (endH + endM / 60) - (startH + startM / 60)
        if (hours > 0) total += hours
      }
    }
    return total.toFixed(1)
  }, [config.schedule])

  const activeDays = DAYS_OF_WEEK.filter((d) => config.schedule[d.key].length > 0)

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

        {formData.scheduleType === "scheduled" && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <Label htmlFor="scheduled-start">Start Date & Time</Label>
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
        )}
      </div>

      {/* Business Hours Section */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Label className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Business Hours
            </Label>
            <p className="text-sm text-muted-foreground">
              Limit calls to specific days and times
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => updateConfig({ enabled })}
          />
        </div>

        {config.enabled && (
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
                              <Input
                                type="time"
                                value={slot.start}
                                onChange={(e) =>
                                  updateTimeSlot(day.key, index, "start", e.target.value)
                                }
                                className="w-[120px] h-9"
                              />
                              <span className="text-muted-foreground">to</span>
                              <Input
                                type="time"
                                value={slot.end}
                                onChange={(e) =>
                                  updateTimeSlot(day.key, index, "end", e.target.value)
                                }
                                className="w-[120px] h-9"
                              />
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

            {/* Weekly Summary */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Weekly Summary</p>
                    <p className="text-sm text-muted-foreground">
                      Calls will be made during these hours
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{totalHoursPerWeek}</p>
                    <p className="text-sm text-muted-foreground">hours/week</p>
                  </div>
                </div>

                <div className="flex gap-1 mt-4">
                  {DAYS_OF_WEEK.map((day) => {
                    const slots = config.schedule[day.key]
                    const isActive = slots.length > 0
                    const hours = slots.reduce((acc: number, slot) => {
                      const startParts = slot.start.split(":")
                      const endParts = slot.end.split(":")
                      const startH = startParts[0] ? Number(startParts[0]) : 0
                      const startM = startParts[1] ? Number(startParts[1]) : 0
                      const endH = endParts[0] ? Number(endParts[0]) : 0
                      const endM = endParts[1] ? Number(endParts[1]) : 0
                      return acc + ((endH + endM / 60) - (startH + startM / 60))
                    }, 0)

                    return (
                      <div
                        key={day.key}
                        className="flex-1 text-center"
                        title={isActive ? `${hours.toFixed(1)} hours` : "Off"}
                      >
                        <div
                          className={`h-12 rounded-md flex items-end justify-center pb-1 ${
                            isActive ? "bg-primary" : "bg-muted"
                          }`}
                          style={{
                            height: isActive ? `${Math.max(20, hours * 5)}px` : "20px",
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {day.shortLabel}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}


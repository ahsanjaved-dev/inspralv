"use client"

/**
 * Campaign Live Dashboard Component
 * 
 * A comprehensive real-time dashboard for active campaigns with:
 * - Animated progress visualization
 * - Live activity stream
 * - ETA and speed metrics
 * - Sound notifications (optional)
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  Activity,
  Bell,
  BellOff,
  Clock,
  CheckCircle2,
  XCircle,
  Phone,
  PhoneCall,
  PhoneOff,
  Users,
  Zap,
  Timer,
  TrendingUp,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  Pause,
  Play,
} from "lucide-react"
import { CampaignProgressRing } from "./campaign-progress-ring"

// Types
interface CallEvent {
  id: string
  type: "started" | "answered" | "completed" | "failed" | "no_answer"
  recipientPhone: string
  recipientName?: string
  timestamp: Date
  duration?: number
}

interface DashboardProps {
  campaignId: string
  campaignName: string
  status: "active" | "paused" | "completed"
  totalRecipients: number
  pendingCalls: number
  completedCalls: number
  successfulCalls: number
  failedCalls: number
  callsPerMinute?: number
  estimatedCompletion?: string
  recentEvents?: CallEvent[]
  onPause?: () => void
  onResume?: () => void
  onRefresh?: () => void
  isPausing?: boolean
  isResuming?: boolean
  className?: string
}

// Sound notification hook
function useSoundNotification() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // Create audio elements for different events
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/sounds/notification.mp3") // You'd need to add this sound file
    }
  }, [])

  const playSound = useCallback(
    (type: "success" | "error" | "info") => {
      if (!enabled || !audioRef.current) return
      audioRef.current.volume = 0.3
      audioRef.current.play().catch(() => {
        // Ignore autoplay errors
      })
    },
    [enabled]
  )

  return { enabled, setEnabled, playSound }
}

// Live counter animation
function AnimatedCounter({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const [displayValue, setDisplayValue] = useState(value)
  const previousValue = useRef(value)

  useEffect(() => {
    if (value === previousValue.current) return

    const difference = value - previousValue.current
    const duration = 500 // ms
    const steps = 20
    const increment = difference / steps
    let current = previousValue.current

    const timer = setInterval(() => {
      current += increment
      if ((increment > 0 && current >= value) || (increment < 0 && current <= value)) {
        setDisplayValue(value)
        clearInterval(timer)
      } else {
        setDisplayValue(Math.round(current))
      }
    }, duration / steps)

    previousValue.current = value

    return () => clearInterval(timer)
  }, [value])

  return <span className={cn("tabular-nums", className)}>{displayValue.toLocaleString()}</span>
}

// Event item component
function EventItem({ event, isNew }: { event: CallEvent; isNew?: boolean }) {
  const config = {
    started: { icon: PhoneCall, color: "text-blue-500", bg: "bg-blue-500/10", label: "Calling" },
    answered: {
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-500/10",
      label: "Answered",
    },
    completed: { icon: Phone, color: "text-gray-500", bg: "bg-gray-500/10", label: "Ended" },
    failed: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
    no_answer: { icon: PhoneOff, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "No Answer" },
  }[event.type]

  const Icon = config.icon

  return (
    <motion.div
      initial={isNew ? { opacity: 0, x: -20 } : false}
      animate={{ opacity: 1, x: 0 }}
      className={cn("flex items-center gap-3 p-2 rounded-lg", config.bg)}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", config.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", config.color)}>{config.label}</span>
          {event.duration !== undefined && (
            <Badge variant="outline" className="text-xs">
              {Math.floor(event.duration / 60)}:{String(event.duration % 60).padStart(2, "0")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {event.recipientName || event.recipientPhone}
        </p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {event.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </motion.div>
  )
}

export function CampaignLiveDashboard({
  campaignId,
  campaignName,
  status,
  totalRecipients,
  pendingCalls,
  completedCalls,
  successfulCalls,
  failedCalls,
  callsPerMinute = 0,
  estimatedCompletion,
  recentEvents = [],
  onPause,
  onResume,
  onRefresh,
  isPausing,
  isResuming,
  className,
}: DashboardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, playSound } = useSoundNotification()
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set())
  const prevEventsRef = useRef<string[]>([])

  // Calculate metrics
  const progress = totalRecipients > 0 ? Math.round((completedCalls / totalRecipients) * 100) : 0
  const successRate = completedCalls > 0 ? Math.round((successfulCalls / completedCalls) * 100) : 0
  const isActive = status === "active"
  const isPaused = status === "paused"

  // Track new events for animation
  useEffect(() => {
    const currentIds = recentEvents.map((e) => e.id)
    const prevIds = prevEventsRef.current
    const newIds = currentIds.filter((id) => !prevIds.includes(id))

    if (newIds.length > 0) {
      setNewEventIds(new Set(newIds))
      // Play sound for new completed calls
      const hasSuccess = recentEvents.some(
        (e) => newIds.includes(e.id) && (e.type === "answered" || e.type === "completed")
      )
      const hasFailed = recentEvents.some((e) => newIds.includes(e.id) && e.type === "failed")

      if (hasSuccess) playSound("success")
      else if (hasFailed) playSound("error")

      setTimeout(() => setNewEventIds(new Set()), 1000)
    }

    prevEventsRef.current = currentIds
  }, [recentEvents, playSound])

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Header */}
      <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 to-purple-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-2 rounded-lg",
                isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
              )}
            >
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Live Dashboard</CardTitle>
              <p className="text-sm text-muted-foreground">{campaignName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sound toggle */}
            <div className="flex items-center gap-2 mr-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSoundEnabled(!soundEnabled)}
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>

            {/* Action buttons */}
            {isActive && onPause && (
              <Button variant="outline" size="sm" onClick={onPause} disabled={isPausing}>
                {isPausing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4 mr-1" />}
                Pause
              </Button>
            )}
            {isPaused && onResume && (
              <Button size="sm" onClick={onResume} disabled={isResuming}>
                {isResuming ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                Resume
              </Button>
            )}
            {onRefresh && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Left: Progress Ring & Stats */}
                <div className="flex flex-col items-center gap-6">
                  <CampaignProgressRing
                    value={progress}
                    size={180}
                    strokeWidth={16}
                    isActive={isActive}
                    showPercentage={true}
                    showCount={true}
                    total={totalRecipients}
                    processed={completedCalls}
                    variant={isActive ? "success" : isPaused ? "warning" : "default"}
                  />

                  {/* Key metrics */}
                  <div className="grid grid-cols-3 gap-4 w-full">
                    <div className="text-center p-3 bg-emerald-500/10 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-emerald-600">
                        <AnimatedCounter value={successfulCalls} />
                      </p>
                      <p className="text-xs text-muted-foreground">Answered</p>
                    </div>
                    <div className="text-center p-3 bg-red-500/10 rounded-lg">
                      <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-red-600">
                        <AnimatedCounter value={failedCalls} />
                      </p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                    <div className="text-center p-3 bg-amber-500/10 rounded-lg">
                      <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                      <p className="text-2xl font-bold text-amber-600">
                        <AnimatedCounter value={pendingCalls} />
                      </p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>

                  {/* Additional metrics */}
                  <div className="flex items-center justify-center gap-6 w-full">
                    {callsPerMinute > 0 && (
                      <div className="flex items-center gap-2 text-purple-600">
                        <Zap className="h-4 w-4" />
                        <span className="font-medium">{callsPerMinute} calls/min</span>
                      </div>
                    )}
                    {successRate > 0 && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <TrendingUp className="h-4 w-4" />
                        <span className="font-medium">{successRate}% success rate</span>
                      </div>
                    )}
                    {estimatedCompletion && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Timer className="h-4 w-4" />
                        <span className="text-sm">{estimatedCompletion}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Activity Feed */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Live Activity
                      {isActive && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      )}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      {recentEvents.length} recent
                    </Badge>
                  </div>

                  <ScrollArea className="h-[280px] pr-3">
                    {recentEvents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Clock className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm">Waiting for activity...</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentEvents.map((event) => (
                          <EventItem
                            key={event.id}
                            event={event}
                            isNew={newEventIds.has(event.id)}
                          />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// Loader2 icon for internal use
function Loader2Icon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}


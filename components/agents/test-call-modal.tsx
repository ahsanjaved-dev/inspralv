"use client"

import { useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { 
  Phone, 
  PhoneOff, 
  Loader2, 
  Mic,
  AlertCircle,
  CheckCircle2,
  PhoneCall
} from "lucide-react"
import { useWebCall, type CallStatus } from "@/lib/hooks/use-web-calls"
import type { AIAgent } from "@/types/database.types"

interface TestCallModalProps {
  agent: AIAgent
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

function getStatusInfo(status: CallStatus) {
  switch (status) {
    case "idle":
      return { icon: Phone, text: "Ready to call", color: "text-muted-foreground" }
    case "connecting":
      return { icon: Loader2, text: "Connecting...", color: "text-yellow-500", animate: true }
    case "connected":
      return { icon: PhoneCall, text: "Connected", color: "text-green-500" }
    case "ended":
      return { icon: CheckCircle2, text: "Call ended", color: "text-blue-500" }
    case "error":
      return { icon: AlertCircle, text: "Error", color: "text-red-500" }
    default:
      return { icon: Phone, text: "Unknown", color: "text-muted-foreground" }
  }
}

export function TestCallModal({ agent, open, onOpenChange }: TestCallModalProps) {
  const { 
    status, 
    error, 
    duration, 
    provider,
    startCall, 
    endCall, 
    reset,
  } = useWebCall()

  // Track if we've already initiated a call for this modal open
  const hasInitiatedRef = useRef(false)

  const statusInfo = getStatusInfo(status)
  const StatusIcon = statusInfo.icon

  // Auto-start call when modal opens
  useEffect(() => {
    if (open && !hasInitiatedRef.current) {
      hasInitiatedRef.current = true
      // Reset first, then start the call
      reset()
      // Use setTimeout to ensure state is reset before starting
      setTimeout(() => {
        startCall(agent.id)
      }, 0)
    }
    
    // Reset the flag when modal closes
    if (!open) {
      hasInitiatedRef.current = false
    }
  }, [open, agent.id, startCall, reset])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      reset()
    }
    onOpenChange(newOpen)
  }

  const handleEndCall = () => {
    endCall()
  }

  const handleRetry = () => {
    reset()
    startCall(agent.id)
  }

  const handleClose = () => {
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Test Call
          </DialogTitle>
          <DialogDescription>
            Testing voice agent: {agent.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-8 space-y-6">
          {/* Status Icon */}
          <div className={`p-6 rounded-full ${
            status === "connected" 
              ? "bg-green-100 dark:bg-green-900/30" 
              : status === "error"
              ? "bg-red-100 dark:bg-red-900/30"
              : "bg-muted"
          }`}>
            <StatusIcon 
              className={`w-12 h-12 ${statusInfo.color} ${statusInfo.animate ? "animate-spin" : ""}`} 
            />
          </div>

          {/* Status Text */}
          <div className="text-center space-y-1">
            <p className={`text-lg font-medium ${statusInfo.color}`}>
              {statusInfo.text}
            </p>
            {provider && (
              <p className="text-sm text-muted-foreground">
                Provider: {provider.toUpperCase()}
              </p>
            )}
          </div>

          {/* Duration */}
          {(status === "connected" || status === "ended") && (
            <div className="text-3xl font-mono font-bold">
              {formatDuration(duration)}
            </div>
          )}

          {/* Error Message */}
          {status === "error" && error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm text-center max-w-xs">
              {error}
            </div>
          )}

          {/* Audio Indicator */}
          {status === "connected" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mic className="w-4 h-4 text-green-500" />
              <span>Microphone active - Speak to test the agent</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3">
          {status === "connected" && (
            <Button 
              variant="destructive" 
              size="lg"
              onClick={handleEndCall}
              className="gap-2"
            >
              <PhoneOff className="w-4 h-4" />
              End Call
            </Button>
          )}

          {status === "error" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleRetry} className="gap-2">
                <Phone className="w-4 h-4" />
                Retry
              </Button>
            </>
          )}

          {status === "ended" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleRetry} className="gap-2">
                <Phone className="w-4 h-4" />
                Call Again
              </Button>
            </>
          )}

          {(status === "connecting" || status === "idle") && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
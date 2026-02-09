"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Phone, 
  PhoneOutgoing,
  Loader2, 
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import type { AIAgent } from "@/types/database.types"

interface TestOutboundCallModalProps {
  agent: AIAgent
  workspaceSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CallStatus = "idle" | "calling" | "success" | "error"

export function TestOutboundCallModal({ 
  agent, 
  workspaceSlug,
  open, 
  onOpenChange 
}: TestOutboundCallModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [status, setStatus] = useState<CallStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [callId, setCallId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const backgroundTimersRef = useRef<NodeJS.Timeout[]>([])

  /** Invalidate all related queries (agents, calls, stats, dashboard) */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] })
    queryClient.invalidateQueries({ queryKey: ["workspace-calls", workspaceSlug] })
    queryClient.invalidateQueries({ queryKey: ["workspace-conversations", workspaceSlug] })
    queryClient.invalidateQueries({ queryKey: ["workspace-stats", workspaceSlug] })
    queryClient.invalidateQueries({ queryKey: ["workspace-dashboard-stats", workspaceSlug] })
    queryClient.invalidateQueries({ queryKey: ["partner-dashboard-stats"] })
  }

  /**
   * Schedule background invalidations that persist even after modal is closed.
   * Outbound calls typically take 30s–3min. The webhook fires on call end and
   * updates the DB, but the frontend has no direct signal. These delayed
   * invalidations ensure the agent card stats catch up.
   */
  const scheduleBackgroundInvalidations = () => {
    // Clear any existing background timers
    backgroundTimersRef.current.forEach(clearTimeout)
    backgroundTimersRef.current = []

    // Schedule invalidations at 15s, 30s, 60s, 90s, 120s, and 180s after call initiation
    // This covers the typical call lifecycle window
    const delays = [15_000, 30_000, 60_000, 90_000, 120_000, 180_000]
    for (const delay of delays) {
      const timer = setTimeout(() => invalidateAll(), delay)
      backgroundTimersRef.current.push(timer)
    }
  }

  // Cleanup background timers on unmount
  useEffect(() => {
    return () => {
      // Note: we intentionally do NOT clear background timers on unmount
      // They should continue running even after the modal component unmounts
      // to catch webhook-driven stat updates
    }
  }, [])

  // Poll to refresh agent data after call is initiated (while modal is open)
  useEffect(() => {
    if (status === "success" && open) {
      // Start polling every 10 seconds (reduced from 15s for faster updates)
      pollIntervalRef.current = setInterval(() => invalidateAll(), 10_000)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [status, open, queryClient, workspaceSlug])

  const handleCall = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter a phone number")
      return
    }

    // Format phone number to E.164 if not already
    let formattedNumber = phoneNumber.trim()
    if (!formattedNumber.startsWith("+")) {
      // Assume Australian number if starts with 0
      if (formattedNumber.startsWith("0")) {
        formattedNumber = "+61" + formattedNumber.slice(1)
      } else {
        formattedNumber = "+" + formattedNumber
      }
    }

    setStatus("calling")
    setError(null)
    setCallId(null)

    try {
      const response = await fetch(
        `/api/w/${workspaceSlug}/agents/${agent.id}/outbound-call`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerNumber: formattedNumber,
            customerName: customerName.trim() || undefined,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to initiate call")
      }

      setStatus("success")
      setCallId(data.callId)
      toast.success("Outbound call initiated! Your phone should ring shortly.")

      // Schedule background invalidations to catch webhook-driven stat updates
      // These persist even after the modal is closed
      scheduleBackgroundInvalidations()
    } catch (err) {
      setStatus("error")
      const errorMessage = err instanceof Error ? err.message : "Failed to make call"
      setError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const handleClose = () => {
    // Stop in-modal polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    // If call was initiated, do a final invalidation on close
    // Background timers from scheduleBackgroundInvalidations() will continue running
    if (status === "success") {
      invalidateAll()
    }
    setStatus("idle")
    setError(null)
    setCallId(null)
    onOpenChange(false)
  }

  const handleReset = () => {
    setStatus("idle")
    setError(null)
    setCallId(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneOutgoing className="w-5 h-5" />
            Test Outbound Call
          </DialogTitle>
          <DialogDescription>
            The AI agent <span className="font-medium">{agent.name}</span> will call the phone number you enter.
          </DialogDescription>
        </DialogHeader>

        {status === "idle" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+61370566664 or 0370566664"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Enter the phone number to call in E.164 format (e.g., +61370566664) or local format
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Customer Name (Optional)</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The agent can use this name during the call
              </p>
            </div>
          </div>
        )}

        {status === "calling" && (
          <div className="flex flex-col items-center py-8 space-y-4">
            <div className="p-6 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-amber-500">Initiating call...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Calling {phoneNumber}
              </p>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center py-8 space-y-4">
            <div className="p-6 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-green-500">Call Initiated!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your phone ({phoneNumber}) should ring shortly.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                The AI agent will speak when you answer.
              </p>
              {callId && (
                <p className="text-xs text-muted-foreground mt-2 font-mono">
                  Call ID: {callId}
                </p>
              )}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center py-8 space-y-4">
            <div className="p-6 rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-red-500">Call Failed</p>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2 max-w-xs">
                  {error}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {status === "idle" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCall} disabled={!phoneNumber.trim()}>
                <Phone className="w-4 h-4 mr-2" />
                Call Now
              </Button>
            </>
          )}

          {status === "calling" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {(status === "success" || status === "error") && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleReset}>
                <Phone className="w-4 h-4 mr-2" />
                Make Another Call
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


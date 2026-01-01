"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useParams } from "next/navigation"
import type { AgentProvider } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

export type CallStatus = 
  | "idle" 
  | "connecting" 
  | "connected" 
  | "ended" 
  | "error"

export interface WebCallState {
  status: CallStatus
  callId: string | null
  provider: AgentProvider | null
  error: string | null
  duration: number
}

export interface WebCallSession {
  provider: AgentProvider
  callId: string
  token?: string
  accessToken?: string
  agentName: string
  externalAgentId: string
}

// ============================================================================
// HOOK
// ============================================================================

export function useWebCall() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  
  const formatVapiError = (error: any): string => {
    const message = error?.message || error?.reason || error?.toString?.() || ""
    if (message.toLowerCase().includes("meeting has ended") || message.toLowerCase().includes("ejection")) {
      return "The call session ended. Please start a new test call."
    }
    if (message.toLowerCase().includes("token") || message.toLowerCase().includes("auth")) {
      return "Call token expired. Please try again."
    }
    return message || "Call failed. Please try again."
  }

  const [state, setState] = useState<WebCallState>({
    status: "idle",
    callId: null,
    provider: null,
    error: null,
    duration: 0,
  })

  const vapiRef = useRef<any>(null)
  const retellRef = useRef<any>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // Start duration timer
  const startDurationTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    durationIntervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setState((prev) => ({ ...prev, duration: elapsed }))
      }
    }, 1000)
  }, [])

  // Stop duration timer
  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    startTimeRef.current = null
  }, [])

  // Start VAPI call
  const startVapiCall = useCallback(async (session: WebCallSession) => {
    try {
      // Dynamically import VAPI SDK
      const { default: Vapi } = await import("@vapi-ai/web")
      
      vapiRef.current = new Vapi(session.token!)
      
      vapiRef.current.on("call-start", () => {
        setState((prev) => ({ ...prev, status: "connected" }))
        startDurationTimer()
      })

      vapiRef.current.on("call-end", () => {
        setState((prev) => ({ ...prev, status: "ended" }))
        stopDurationTimer()
      })

      vapiRef.current.on("error", (error: any) => {
        console.warn("VAPI error:", error)
        const friendly = formatVapiError(error)
        setState((prev) => ({ 
          ...prev, 
          status: "error", 
          error: friendly
        }))
        stopDurationTimer()
      })

      // Start the call with the assistant
      await vapiRef.current.start(session.externalAgentId)
      
    } catch (error) {
      console.warn("Failed to start VAPI call:", error)
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? formatVapiError(error) : "Failed to start call",
      }))
    }
  }, [startDurationTimer, stopDurationTimer])

  // Start Retell call
  const startRetellCall = useCallback(async (session: WebCallSession) => {
    try {
      // Dynamically import Retell SDK
      const { RetellWebClient } = await import("retell-client-js-sdk")
      
      retellRef.current = new RetellWebClient()

      retellRef.current.on("call_started", () => {
        setState((prev) => ({ ...prev, status: "connected" }))
        startDurationTimer()
      })

      retellRef.current.on("call_ended", () => {
        setState((prev) => ({ ...prev, status: "ended" }))
        stopDurationTimer()
      })

      retellRef.current.on("error", (error: any) => {
        console.error("Retell error:", error)
        setState((prev) => ({ 
          ...prev, 
          status: "error", 
          error: error?.message || "Call failed" 
        }))
        stopDurationTimer()
      })

      // Start the call with access token
      await retellRef.current.startCall({
        accessToken: session.accessToken!,
      })

    } catch (error) {
      console.error("Failed to start Retell call:", error)
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Failed to start call",
      }))
    }
  }, [startDurationTimer, stopDurationTimer])

  // Main start call function
  const startCall = useCallback(async (agentId: string) => {
    setState({
      status: "connecting",
      callId: null,
      provider: null,
      error: null,
      duration: 0,
    })

    try {
      // Request call session from backend (workspace-scoped endpoint)
      const response = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}/test-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create call session")
      }

      const session: WebCallSession = result.data

      setState((prev) => ({
        ...prev,
        callId: session.callId,
        provider: session.provider,
      }))

      // Start call based on provider
      if (session.provider === "vapi") {
        await startVapiCall(session)
      } else if (session.provider === "retell") {
        await startRetellCall(session)
      } else {
        throw new Error(`Unsupported provider: ${session.provider}`)
      }

    } catch (error) {
      console.error("Start call error:", error)
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Failed to start call",
      }))
    }
  }, [workspaceSlug, startVapiCall, startRetellCall])

  // End call function
  const endCall = useCallback(() => {
    try {
      if (vapiRef.current) {
        vapiRef.current.stop()
        vapiRef.current = null
      }
      if (retellRef.current) {
        retellRef.current.stopCall()
        retellRef.current = null
      }
    } catch (error) {
      console.error("End call error:", error)
    }
    
    stopDurationTimer()
    setState((prev) => ({ ...prev, status: "ended" }))
  }, [stopDurationTimer])

  // Reset state
  const reset = useCallback(() => {
    endCall()
    setState({
      status: "idle",
      callId: null,
      provider: null,
      error: null,
      duration: 0,
    })
  }, [endCall])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall()
    }
  }, [endCall])

  return {
    ...state,
    startCall,
    endCall,
    reset,
    isActive: state.status === "connecting" || state.status === "connected",
  }
}
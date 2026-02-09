/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

// Import error suppression module FIRST - it sets up global handlers as a side effect
import "./suppress-sdk-errors"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { useParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

export type VapiCallStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "ended"
  | "ingesting"
  | "error"

export interface VapiWebCallState {
  status: VapiCallStatus
  callId: string | null
  provider: "vapi"
  error: string | null
  duration: number
  ingestionStatus: "pending" | "success" | "failed" | null
}

interface VapiWebCallSession {
  provider: "vapi"
  callId: string // placeholder from backend
  token: string
  agentName: string
  externalAgentId: string
}

function createLogger() {
  const prefix = "[useVapiWebCall]"
  return {
    info: (msg: string, data?: unknown) =>
      console.log(prefix, msg, data !== undefined ? data : ""),
    warn: (msg: string, data?: unknown) =>
      console.warn(prefix, msg, data !== undefined ? data : ""),
    error: (msg: string, data?: unknown) =>
      console.error(prefix, msg, data !== undefined ? data : ""),
  }
}

// Check if a message/error indicates a normal call end (not a real error)
function isNormalCallEndMessage(input: any): boolean {
  // Handle various input types
  let message = ""
  if (typeof input === "string") {
    message = input
  } else if (input?.message) {
    message = input.message
  } else if (input?.reason) {
    message = input.reason
  } else if (input?.toString) {
    message = input.toString()
  }
  
  const lowerMessage = message.toLowerCase()
  return (
    lowerMessage.includes("meeting has ended") ||
    lowerMessage.includes("ejection") ||
    lowerMessage.includes("call has ended") ||
    lowerMessage.includes("meeting ended") ||
    lowerMessage.includes("ended due to ejection")
  )
}

// Track if error suppression is active
let errorSuppressionActive = false
let globalErrorHandler: ((event: ErrorEvent) => void) | null = null
let globalRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null
let originalConsoleError: typeof console.error | null = null

// Setup all error suppression mechanisms
function setupErrorSuppression() {
  if (typeof window === "undefined" || errorSuppressionActive) return
  errorSuppressionActive = true
  
  // 1. Window error event handler (catches errors before Next.js overlay)
  globalErrorHandler = (event: ErrorEvent): void => {
    if (isNormalCallEndMessage(event.message) || isNormalCallEndMessage(event.error)) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      return
    }
  }
  window.addEventListener("error", globalErrorHandler, true) // Use capture phase
  
  // 2. Unhandled rejection handler
  globalRejectionHandler = (event: PromiseRejectionEvent): void => {
    if (isNormalCallEndMessage(event.reason)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
  }
  window.addEventListener("unhandledrejection", globalRejectionHandler, true) // Use capture phase
  
  // 3. Console.error interceptor
  originalConsoleError = console.error
  console.error = (...args: any[]) => {
    const shouldSuppress = args.some(arg => isNormalCallEndMessage(arg))
    if (shouldSuppress) {
      return // Silently suppress
    }
    originalConsoleError?.apply(console, args)
  }
}

function cleanupErrorSuppression() {
  if (typeof window === "undefined" || !errorSuppressionActive) return
  
  // Delay cleanup to catch any async errors after call ends
  setTimeout(() => {
    if (globalErrorHandler) {
      window.removeEventListener("error", globalErrorHandler, true)
      globalErrorHandler = null
    }
    if (globalRejectionHandler) {
      window.removeEventListener("unhandledrejection", globalRejectionHandler, true)
      globalRejectionHandler = null
    }
    if (originalConsoleError) {
      console.error = originalConsoleError
      originalConsoleError = null
    }
    errorSuppressionActive = false
  }, 5000) // 5 second delay to catch all async errors
}

function formatVapiError(error: any): string {
  const message = error?.message || error?.reason || error?.toString?.() || ""
  if (isNormalCallEndMessage(error)) {
    return "The call session ended. Please start a new test call."
  }
  if (message.toLowerCase().includes("token") || message.toLowerCase().includes("auth")) {
    return "Call token expired. Please try again."
  }
  if (message.toLowerCase().includes("network") || message.toLowerCase().includes("connection")) {
    return "Network connection failed. Please check your internet."
  }
  return message || "Call failed (Vapi). Please try again."
}

function isValidVapiCallId(params: { callId: string | null | undefined; placeholderId?: string | null }) {
  const { callId, placeholderId } = params
  if (!callId || typeof callId !== "string") return false
  const trimmed = callId.trim()
  if (trimmed.length < 10) return false
  if (trimmed.startsWith("vapi-")) return false
  if (placeholderId && trimmed === placeholderId) return false

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const compactIdPattern = /^[A-Za-z0-9_-]{10,}$/
  return uuidPattern.test(trimmed) || compactIdPattern.test(trimmed)
}

function extractPossibleId(value: any): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "object") {
    // Common shapes from SDK payloads
    if (typeof value.id === "string") return value.id
    if (typeof value.callId === "string") return value.callId
    if (typeof value.call_id === "string") return value.call_id
    if (value.call && typeof value.call.id === "string") return value.call.id
    if (value.call && typeof value.call.callId === "string") return value.call.callId
  }
  return null
}

function captureVapiCallId(params: {
  log: ReturnType<typeof createLogger>
  candidate: any
  placeholderId: string | null
  vapiCallIdRef: MutableRefObject<string | null>
  setState: Dispatch<SetStateAction<VapiWebCallState>>
}) {
  const { log, candidate, placeholderId, vapiCallIdRef, setState } = params
  const maybe = extractPossibleId(candidate)
  if (!maybe) return
  if (!isValidVapiCallId({ callId: maybe, placeholderId })) return
  if (vapiCallIdRef.current === maybe) return
  vapiCallIdRef.current = maybe
  log.info("Captured Vapi call id", maybe)
  setState((prev) => ({ ...prev, callId: maybe }))
}

export function useVapiWebCall() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  const logRef = useRef(createLogger())

  const [state, setState] = useState<VapiWebCallState>({
    status: "idle",
    callId: null,
    provider: "vapi",
    error: null,
    duration: 0,
    ingestionStatus: null,
  })

  // Refs
  const agentIdRef = useRef<string | null>(null)
  const placeholderCallIdRef = useRef<string | null>(null)
  const vapiRef = useRef<any>(null)
  const vapiCallIdRef = useRef<string | null>(null)
  const ingestionLockRef = useRef(false)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number | null>(null)

  const startDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    startTimeRef.current = Date.now()
    durationIntervalRef.current = setInterval(() => {
      if (!startTimeRef.current) return
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setState((prev) => ({ ...prev, duration: elapsed }))
    }, 1000)
  }, [])

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    startTimeRef.current = null
  }, [])

  const ingestCall = useCallback(
    async (callId: string, agentId: string) => {
      const log = logRef.current

      if (!isValidVapiCallId({ callId, placeholderId: placeholderCallIdRef.current })) {
        log.warn("Invalid/placeholder Vapi call id, skipping ingestion", {
          callId,
          placeholder: placeholderCallIdRef.current,
        })
        setState((prev) => ({ ...prev, status: "ended" }))
        return
      }

      if (ingestionLockRef.current) {
        log.info("Ingestion already in progress, skipping", callId)
        return
      }

      ingestionLockRef.current = true
      setState((prev) => ({ ...prev, status: "ingesting", ingestionStatus: "pending" }))

      try {
        const response = await fetch(`/api/w/${workspaceSlug}/calls/ingest`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ call_id: callId, agent_id: agentId, provider: "vapi" }),
        })
        const result = await response.json()

        if (!response.ok) {
          log.error("Ingestion failed", result?.error)
          setState((prev) => ({
            ...prev,
            status: "ended",
            ingestionStatus: "failed",
            error: `Call completed but failed to save. Call ID: ${callId}. ${result?.error || ""}`,
          }))
          return
        }

        log.info("Call ingested successfully", result?.data)
        setState((prev) => ({ ...prev, status: "ended", ingestionStatus: "success" }))

        // Invalidate all related queries immediately
        const invalidateAll = () => Promise.all([
          queryClient.invalidateQueries({ queryKey: ["workspace-calls", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-conversations", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-stats", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-dashboard-stats", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["partner-dashboard-stats"] }),
        ])

        await invalidateAll()

        // Schedule follow-up invalidations to catch any remaining webhook processing
        // (e.g., Algolia indexing, CRM forwarding, campaign updates)
        setTimeout(() => invalidateAll().catch(() => {}), 5_000)
        setTimeout(() => invalidateAll().catch(() => {}), 15_000)
      } catch (error) {
        log.error("Ingestion exception", error)
        setState((prev) => ({
          ...prev,
          status: "ended",
          ingestionStatus: "failed",
          error: `Call completed but failed to save. Call ID: ${callId}`,
        }))
      }
    },
    [queryClient, workspaceSlug]
  )

  const attachVapiHandlersAndStart = useCallback(
    async (session: VapiWebCallSession) => {
      const log = logRef.current
      try {
        log.info("Loading Vapi SDK")
        const { default: Vapi } = await import("@vapi-ai/web")

        vapiRef.current = new Vapi(session.token)

        vapiRef.current.on("call-start", (payload: any) => {
          try {
            const vapiInstance = vapiRef.current
            // Capture from event payload first (best), then fall back to SDK instance fields.
            captureVapiCallId({
              log,
              candidate: payload,
              placeholderId: session.callId,
              vapiCallIdRef,
              setState,
            })
            captureVapiCallId({
              log,
              candidate: vapiInstance?.call,
              placeholderId: session.callId,
              vapiCallIdRef,
              setState,
            })
            captureVapiCallId({
              log,
              candidate: { id: vapiInstance?.callId },
              placeholderId: session.callId,
              vapiCallIdRef,
              setState,
            })

            setState((prev) => ({ ...prev, status: "connected" }))
            startDurationTimer()
          } catch (e) {
            log.error("Error in call-start handler", e)
          }
        })

        vapiRef.current.on("call-end", (payload: any) => {
          try {
            stopDurationTimer()
            const vapiInstance = vapiRef.current

            // Try to capture ID from the end payload too (some SDKs only provide it here).
            captureVapiCallId({
              log,
              candidate: payload,
              placeholderId: session.callId,
              vapiCallIdRef,
              setState,
            })
            captureVapiCallId({
              log,
              candidate: vapiInstance?.call,
              placeholderId: session.callId,
              vapiCallIdRef,
              setState,
            })
            captureVapiCallId({
              log,
              candidate: { id: vapiInstance?.callId },
              placeholderId: session.callId,
              vapiCallIdRef,
              setState,
            })

            const realCallId = vapiCallIdRef.current

            const agentId = agentIdRef.current
            log.info("Call ended", { callId: realCallId, agentId })
            if (realCallId && agentId && isValidVapiCallId({ callId: realCallId, placeholderId: session.callId })) {
              ingestCall(realCallId, agentId)
            } else {
              log.warn("Call ended but no Vapi call id was captured; cannot ingest")
              setState((prev) => ({ ...prev, status: "ended" }))
            }
          } catch (e) {
            log.error("Error in call-end handler", e)
            setState((prev) => ({ ...prev, status: "ended" }))
          }
        })

        vapiRef.current.on("error", (error: any) => {
          if (isNormalCallEndMessage(error)) {
            // This is a normal call termination (e.g., agent ended the call), not an actual error
            // Don't set error state - let the call-end handler process this
            return
          }
          
          log.warn("SDK error event", error)
          setState((prev) => ({ ...prev, status: "error", error: formatVapiError(error) }))
          stopDurationTimer()
        })

        vapiRef.current.on("message", (message: any) => {
          try {
            // Capture call id from any message shape
            captureVapiCallId({
              log,
              candidate: message,
              placeholderId: session.callId,
              vapiCallIdRef,
              setState,
            })
          } catch {
            // ignore
          }
        })

        log.info("Starting Vapi call with assistant", session.externalAgentId)
        const startResult = await vapiRef.current.start(session.externalAgentId)
        // Some SDKs return call info on start()
        captureVapiCallId({
          log,
          candidate: startResult,
          placeholderId: session.callId,
          vapiCallIdRef,
          setState,
        })
      } catch (error) {
        log.error("Failed to start Vapi call", error)
        setState((prev) => ({ ...prev, status: "error", error: formatVapiError(error) }))
      }
    },
    [ingestCall, startDurationTimer, stopDurationTimer]
  )

  const startCall = useCallback(
    async (agentId: string) => {
      const log = logRef.current
      agentIdRef.current = agentId
      ingestionLockRef.current = false
      vapiCallIdRef.current = null
      placeholderCallIdRef.current = null

      setState((prev) => ({
        ...prev,
        status: "connecting",
        callId: null,
        error: null,
        duration: 0,
        ingestionStatus: null,
      }))

      try {
        log.info("Requesting Vapi call session from backend", agentId)
        const response = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}/test-call`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || "Failed to create call session")

        const session = result.data as VapiWebCallSession
        if (!session?.token || session?.provider !== "vapi") {
          throw new Error("Invalid Vapi session response")
        }

        placeholderCallIdRef.current = session.callId
        setState((prev) => ({ ...prev, callId: session.callId, provider: "vapi" }))

        await attachVapiHandlersAndStart(session)
      } catch (error) {
        log.error("Start call error", error)
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "Failed to start call",
        }))
      }
    },
    [attachVapiHandlersAndStart, workspaceSlug]
  )

  const endCall = useCallback(() => {
    const log = logRef.current
    const isCallActive = state.status === "connecting" || state.status === "connected"
    if (!isCallActive) return

    const realCallId = vapiCallIdRef.current
    const agentId = agentIdRef.current
    const placeholder = placeholderCallIdRef.current

    try {
      if (vapiRef.current) {
        vapiRef.current.stop()
        vapiRef.current = null
      }
    } catch (e) {
      log.error("Error stopping SDK", e)
    }

    stopDurationTimer()

    if (realCallId && agentId && isValidVapiCallId({ callId: realCallId, placeholderId: placeholder })) {
      ingestCall(realCallId, agentId)
    } else {
      setState((prev) => ({ ...prev, status: "ended" }))
    }
  }, [ingestCall, state.status, stopDurationTimer])

  const reset = useCallback(() => {
    const log = logRef.current
    log.info("Resetting call state")

    if (state.status === "connecting" || state.status === "connected") {
      endCall()
    }

    if (vapiRef.current) {
      try {
        vapiRef.current.stop()
      } catch {
        // ignore
      }
      vapiRef.current = null
    }

    stopDurationTimer()

    agentIdRef.current = null
    vapiCallIdRef.current = null
    placeholderCallIdRef.current = null
    ingestionLockRef.current = false

    setState({
      status: "idle",
      callId: null,
      provider: "vapi",
      error: null,
      duration: 0,
      ingestionStatus: null,
    })
  }, [endCall, state.status, stopDurationTimer])

  // Setup error suppression on mount (console interceptor + rejection handler)
  useEffect(() => {
    setupErrorSuppression()
    
    return () => {
      // Cleanup on unmount
      if (vapiRef.current) {
        try {
          vapiRef.current.stop()
        } catch {
          // ignore
        }
      }
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
      
      // Delayed cleanup to catch any async errors after unmount
      cleanupErrorSuppression()
    }
  }, [])

  return {
    ...state,
    startCall,
    endCall,
    reset,
    isActive: state.status === "connecting" || state.status === "connected" || state.status === "ingesting",
    isIngesting: state.status === "ingesting",
  }
}



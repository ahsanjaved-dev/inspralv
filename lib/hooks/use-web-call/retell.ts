/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

export type RetellCallStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "ended"
  | "ingesting"
  | "error"

export interface RetellWebCallState {
  status: RetellCallStatus
  callId: string | null
  provider: "retell"
  error: string | null
  duration: number
  ingestionStatus: "pending" | "success" | "failed" | null
}

interface RetellWebCallSession {
  provider: "retell"
  callId: string // real Retell call_id
  accessToken: string
  agentName: string
  externalAgentId: string
}

function createLogger() {
  const prefix = "[useRetellWebCall]"
  return {
    info: (msg: string, data?: unknown) =>
      console.log(prefix, msg, data !== undefined ? data : ""),
    warn: (msg: string, data?: unknown) =>
      console.warn(prefix, msg, data !== undefined ? data : ""),
    error: (msg: string, data?: unknown) =>
      console.error(prefix, msg, data !== undefined ? data : ""),
  }
}

function formatRetellError(error: any): string {
  const message = error?.message || error?.reason || error?.toString?.() || ""
  if (message.toLowerCase().includes("token") || message.toLowerCase().includes("auth")) {
    return "Call token expired. Please try again."
  }
  if (message.toLowerCase().includes("network") || message.toLowerCase().includes("connection")) {
    return "Network connection failed. Please check your internet."
  }
  return message || "Call failed (Retell). Please try again."
}

function isValidRetellCallId(callId: string | null | undefined) {
  if (!callId || typeof callId !== "string") return false
  const trimmed = callId.trim()
  if (trimmed.length < 10) return false
  const compactIdPattern = /^[A-Za-z0-9_-]{10,}$/
  return compactIdPattern.test(trimmed)
}

export function useRetellWebCall() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()
  const logRef = useRef(createLogger())

  const [state, setState] = useState<RetellWebCallState>({
    status: "idle",
    callId: null,
    provider: "retell",
    error: null,
    duration: 0,
    ingestionStatus: null,
  })

  // Refs
  const agentIdRef = useRef<string | null>(null)
  const retellRef = useRef<any>(null)
  const retellCallIdRef = useRef<string | null>(null)
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
      if (!isValidRetellCallId(callId)) {
        log.warn("Invalid Retell call id, skipping ingestion", callId)
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
          body: JSON.stringify({ call_id: callId, agent_id: agentId, provider: "retell" }),
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

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["workspace-calls", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-conversations", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-stats", workspaceSlug] }),
          queryClient.invalidateQueries({ queryKey: ["workspace-agents", workspaceSlug] }),
        ])
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

  const attachRetellHandlersAndStart = useCallback(
    async (session: RetellWebCallSession) => {
      const log = logRef.current
      try {
        retellCallIdRef.current = session.callId

        log.info("Loading Retell SDK")
        const { RetellWebClient } = await import("retell-client-js-sdk")
        retellRef.current = new RetellWebClient()

        retellRef.current.on("call_started", () => {
          setState((prev) => ({ ...prev, status: "connected" }))
          startDurationTimer()
        })

        retellRef.current.on("call_ended", () => {
          stopDurationTimer()
          const callId = retellCallIdRef.current
          const agentId = agentIdRef.current
          log.info("Call ended", { callId, agentId })

          if (callId && agentId && isValidRetellCallId(callId)) {
            ingestCall(callId, agentId)
          } else {
            setState((prev) => ({ ...prev, status: "ended" }))
          }
        })

        retellRef.current.on("error", (error: any) => {
          log.error("SDK error event", error)
          setState((prev) => ({ ...prev, status: "error", error: formatRetellError(error) }))
          stopDurationTimer()
        })

        log.info("Starting Retell call")
        await retellRef.current.startCall({ accessToken: session.accessToken })
      } catch (error) {
        log.error("Failed to start Retell call", error)
        setState((prev) => ({ ...prev, status: "error", error: formatRetellError(error) }))
      }
    },
    [ingestCall, startDurationTimer, stopDurationTimer]
  )

  const startCall = useCallback(
    async (agentId: string) => {
      const log = logRef.current
      agentIdRef.current = agentId
      ingestionLockRef.current = false
      retellCallIdRef.current = null

      setState((prev) => ({
        ...prev,
        status: "connecting",
        callId: null,
        error: null,
        duration: 0,
        ingestionStatus: null,
      }))

      try {
        log.info("Requesting Retell call session from backend", agentId)
        const response = await fetch(`/api/w/${workspaceSlug}/agents/${agentId}/test-call`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || "Failed to create call session")

        const session = result.data as RetellWebCallSession
        if (!session?.accessToken || session?.provider !== "retell" || !session?.callId) {
          throw new Error("Invalid Retell session response")
        }

        setState((prev) => ({ ...prev, callId: session.callId, provider: "retell" }))
        await attachRetellHandlersAndStart(session)
      } catch (error) {
        log.error("Start call error", error)
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "Failed to start call",
        }))
      }
    },
    [attachRetellHandlersAndStart, workspaceSlug]
  )

  const endCall = useCallback(() => {
    const log = logRef.current
    const isCallActive = state.status === "connecting" || state.status === "connected"
    if (!isCallActive) return

    const callId = retellCallIdRef.current
    const agentId = agentIdRef.current

    try {
      if (retellRef.current) {
        retellRef.current.stopCall()
        retellRef.current = null
      }
    } catch (e) {
      log.error("Error stopping SDK", e)
    }

    stopDurationTimer()

    if (callId && agentId && isValidRetellCallId(callId)) {
      ingestCall(callId, agentId)
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

    if (retellRef.current) {
      try {
        retellRef.current.stopCall()
      } catch {
        // ignore
      }
      retellRef.current = null
    }

    stopDurationTimer()

    agentIdRef.current = null
    retellCallIdRef.current = null
    ingestionLockRef.current = false

    setState({
      status: "idle",
      callId: null,
      provider: "retell",
      error: null,
      duration: 0,
      ingestionStatus: null,
    })
  }, [endCall, state.status, stopDurationTimer])

  useEffect(() => {
    return () => {
      if (retellRef.current) {
        try {
          retellRef.current.stopCall()
        } catch {
          // ignore
        }
      }
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
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



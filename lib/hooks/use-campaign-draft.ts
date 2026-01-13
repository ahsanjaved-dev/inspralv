/**
 * Campaign Draft Auto-Save Hook (Simplified)
 * 
 * This hook ONLY updates existing drafts - it never creates new ones.
 * Draft creation happens upfront when user navigates to /campaigns/new.
 * 
 * This eliminates race conditions that caused duplicate drafts.
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"

// ============================================================================
// TYPES
// ============================================================================

export interface DraftData {
  draft_id?: string
  name?: string
  description?: string
  agent_id?: string
  recipients?: Array<{
    phone_number: string
    first_name?: string
    last_name?: string
    email?: string
    company?: string
    reason_for_call?: string
    address_line_1?: string
    address_line_2?: string
    suburb?: string
    state?: string
    post_code?: string
    country?: string
  }>
  csv_column_headers?: string[]
  schedule_type?: "immediate" | "scheduled"
  scheduled_start_at?: string | null
  scheduled_expires_at?: string | null
  timezone?: string
  business_hours_config?: any
  current_step?: number
}

export interface UseCampaignDraftOptions {
  /** Debounce delay in milliseconds (default: 1000) */
  debounceMs?: number
  /** Enable auto-save (default: true) */
  autoSave?: boolean
  /** REQUIRED: The draft ID to update */
  draftId: string | undefined
  /** Callback when draft is saved */
  onSaved?: () => void
  /** Callback when save fails */
  onError?: (error: string) => void
}

export interface UseCampaignDraftReturn {
  /** Whether a save is in progress */
  isSaving: boolean
  /** Last save timestamp */
  lastSavedAt: Date | null
  /** Error message if save failed */
  error: string | null
  /** Update draft data (triggers auto-save if enabled) */
  updateDraft: (data: Partial<DraftData>) => void
  /** Force save immediately (bypasses debounce) */
  saveNow: () => Promise<boolean>
  /** Clear any pending saves */
  clearPending: () => void
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useCampaignDraft(options: UseCampaignDraftOptions): UseCampaignDraftReturn {
  const {
    debounceMs = 1000,
    autoSave = true,
    draftId,
    onSaved,
    onError,
  } = options

  const params = useParams()
  const workspaceSlug = params?.workspaceSlug as string
  const queryClient = useQueryClient()

  // State
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Refs
  const pendingDataRef = useRef<DraftData | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isSavingRef = useRef(false)
  const isMountedRef = useRef(true)

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // ============================================================================
  // SAVE DRAFT (UPDATE ONLY - never creates)
  // ============================================================================

  const executeSave = useCallback(async (data: DraftData): Promise<boolean> => {
    // MUST have a draft ID - this hook only updates, never creates
    if (!draftId || !workspaceSlug) {
      console.log("[useCampaignDraft] No draftId or workspaceSlug, skipping save")
      return false
    }

    if (!isMountedRef.current) {
      return false
    }

    // Prevent concurrent saves
    if (isSavingRef.current) {
      console.log("[useCampaignDraft] Save in progress, queuing data")
      pendingDataRef.current = { ...pendingDataRef.current, ...data }
      return false
    }

    isSavingRef.current = true
    setIsSaving(true)
    setError(null)

    try {
      const payload = {
        ...data,
        draft_id: draftId, // Always include the draft ID
      }

      console.log("[useCampaignDraft] Updating draft:", draftId)

      const response = await fetch(`/api/w/${workspaceSlug}/campaigns/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Failed to save draft: ${response.status}`)
      }

      if (isMountedRef.current) {
        setLastSavedAt(new Date())
        // Invalidate campaigns query to refresh the list
        queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceSlug] })
        onSaved?.()
      }

      return true

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      console.error("[useCampaignDraft] Save error:", errorMessage)
      if (isMountedRef.current) {
        setError(errorMessage)
        onError?.(errorMessage)
      }
      return false

    } finally {
      isSavingRef.current = false
      if (isMountedRef.current) {
        setIsSaving(false)
      }

      // Process any pending data
      if (pendingDataRef.current && isMountedRef.current) {
        const nextData = { ...pendingDataRef.current }
        pendingDataRef.current = null
        setTimeout(() => executeSave(nextData), 100)
      }
    }
  }, [draftId, workspaceSlug, onSaved, onError, queryClient])

  // ============================================================================
  // UPDATE DRAFT (with debounce)
  // ============================================================================

  const updateDraft = useCallback((data: Partial<DraftData>) => {
    if (!draftId) {
      console.log("[useCampaignDraft] No draftId, skipping update")
      return
    }

    // Merge with pending data
    pendingDataRef.current = {
      ...pendingDataRef.current,
      ...data,
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new timer for auto-save
    if (autoSave && isMountedRef.current) {
      debounceTimerRef.current = setTimeout(() => {
        const pendingData = pendingDataRef.current
        if (!pendingData || !isMountedRef.current) return

        pendingDataRef.current = null
        executeSave(pendingData)
      }, debounceMs)
    }
  }, [draftId, autoSave, debounceMs, executeSave])

  // ============================================================================
  // FORCE SAVE NOW
  // ============================================================================

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!draftId) return false

    // Clear debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    // Get pending data and clear it
    const dataToSave = pendingDataRef.current
    pendingDataRef.current = null

    if (!dataToSave) return true // Nothing to save

    return executeSave(dataToSave)
  }, [draftId, executeSave])

  // ============================================================================
  // CLEAR PENDING
  // ============================================================================

  const clearPending = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    pendingDataRef.current = null
  }, [])

  // ============================================================================
  // CLEANUP
  // ============================================================================

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      pendingDataRef.current = null
    }
  }, [])

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    isSaving,
    lastSavedAt,
    error,
    updateDraft,
    saveNow,
    clearPending,
  }
}

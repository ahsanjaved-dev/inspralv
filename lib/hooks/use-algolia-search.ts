/**
 * React Hook for Algolia Search Integration
 *
 * Provides:
 * - Fetching Algolia config for the workspace
 * - Search functionality via backend proxy (no Algolia details exposed)
 * - Autocomplete suggestions
 * - Fallback handling when Algolia is not configured
 */

import { useState, useCallback, useRef } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type {
  AlgoliaSearchConfig,
  AlgoliaSearchResults,
  AlgoliaSuggestion,
} from "@/lib/algolia/types"

// ============================================================================
// TYPES
// ============================================================================

export interface UseAlgoliaSearchOptions {
  enabled?: boolean
}

export interface SearchParams {
  query: string
  page?: number
  hitsPerPage?: number
  filters?: {
    status?: string
    direction?: string
    callType?: string
    agentId?: string
    startDate?: Date
    endDate?: Date
  }
}

export interface AlgoliaSearchHook {
  // Config state
  config: AlgoliaSearchConfig | null
  isConfigured: boolean
  isLoadingConfig: boolean
  benefits: AlgoliaSearchConfig["benefits"] | null

  // Search state
  search: (params: SearchParams) => Promise<AlgoliaSearchResults | null>
  searchResults: AlgoliaSearchResults | null
  isSearching: boolean
  searchError: Error | null

  // Autocomplete
  getAutocomplete: (query: string) => Promise<AlgoliaSuggestion[]>
  autocompleteResults: AlgoliaSuggestion[]
  isLoadingAutocomplete: boolean

  // Utilities
  clearSearch: () => void
}

// ============================================================================
// BACKEND PROXY SEARCH - All Algolia operations go through our API
// ============================================================================

async function proxySearch(
  workspaceSlug: string,
  params: SearchParams
): Promise<AlgoliaSearchResults> {
  const response = await fetch(`/api/w/${workspaceSlug}/calls/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "search",
      query: params.query || "",
      page: params.page || 0,
      hitsPerPage: params.hitsPerPage || 20,
      filters: {
        status: params.filters?.status,
        direction: params.filters?.direction,
        callType: params.filters?.callType,
        agentId: params.filters?.agentId,
        startDate: params.filters?.startDate?.toISOString(),
        endDate: params.filters?.endDate?.toISOString(),
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`)
  }

  const json = await response.json()
  const result = json.data || json

  return {
    hits: result.hits || [],
    nbHits: result.nbHits || 0,
    page: result.page || 0,
    nbPages: result.nbPages || 0,
    hitsPerPage: result.hitsPerPage || params.hitsPerPage || 20,
    processingTimeMS: result.processingTimeMS,
    query: params.query || "",
  }
}

async function proxyAutocomplete(
  workspaceSlug: string,
  query: string
): Promise<AlgoliaSuggestion[]> {
  if (!query || query.trim().length === 0) {
    return []
  }

  const response = await fetch(`/api/w/${workspaceSlug}/calls/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "autocomplete",
      query,
    }),
  })

  if (!response.ok) {
    return []
  }

  const json = await response.json()
  const result = json.data || json
  const suggestions: AlgoliaSuggestion[] = []
  const seen = new Set<string>()

  // Helper to check if a field has a match
  const hasMatch = (highlightResult: any, field: string): boolean => {
    const fieldHighlight = highlightResult?.[field]
    if (!fieldHighlight) return false
    return fieldHighlight.matchLevel === "full" || fieldHighlight.matchLevel === "partial"
  }

  // Helper to extract highlighted snippet
  const getHighlightSnippet = (highlightResult: any, field: string, maxLength = 60): string | undefined => {
    const fieldHighlight = highlightResult?.[field]
    if (!fieldHighlight?.value) return undefined

    const value = fieldHighlight.value
    const markIndex = value.indexOf("<mark>")
    if (markIndex === -1) return undefined

    const start = Math.max(0, markIndex - 20)
    const end = Math.min(value.length, markIndex + maxLength)
    let snippet = value.slice(start, end)

    if (start > 0) snippet = "..." + snippet
    if (end < value.length) snippet = snippet + "..."

    return snippet
  }

  for (const hit of result.hits || []) {
    if (suggestions.length >= 8) break
    const highlight = hit._highlightResult

    // Caller name match
    if (hit.caller_name && hasMatch(highlight, "caller_name") && !seen.has(`caller:${hit.caller_name}`)) {
      seen.add(`caller:${hit.caller_name}`)
      suggestions.push({
        text: hit.caller_name,
        type: "caller",
        matchedField: "Caller Name",
        objectID: hit.objectID || hit.conversation_id,
      })
    }

    // Phone number match
    if (hit.phone_number && hasMatch(highlight, "phone_number") && !seen.has(`phone:${hit.phone_number}`)) {
      seen.add(`phone:${hit.phone_number}`)
      suggestions.push({
        text: hit.phone_number,
        type: "phone",
        matchedField: "Phone Number",
        objectID: hit.objectID || hit.conversation_id,
      })
    }

    // Agent name match
    if (hit.agent_name && hasMatch(highlight, "agent_name") && !seen.has(`agent:${hit.agent_name}`)) {
      seen.add(`agent:${hit.agent_name}`)
      suggestions.push({
        text: hit.agent_name,
        type: "agent",
        matchedField: "Agent Name",
      })
    }

    // Transcript match
    if (hit.transcript && hasMatch(highlight, "transcript")) {
      const snippet = getHighlightSnippet(highlight, "transcript", 80)
      if (snippet && !seen.has(`transcript:${snippet.slice(0, 30)}`)) {
        seen.add(`transcript:${snippet.slice(0, 30)}`)
        suggestions.push({
          text: query,
          type: "transcript",
          matchedField: "Transcript",
          highlight: snippet,
          objectID: hit.objectID || hit.conversation_id,
        })
      }
    }

    // Summary match
    if (hit.summary && hasMatch(highlight, "summary")) {
      const snippet = getHighlightSnippet(highlight, "summary", 80)
      if (snippet && !seen.has(`summary:${snippet.slice(0, 30)}`)) {
        seen.add(`summary:${snippet.slice(0, 30)}`)
        suggestions.push({
          text: query,
          type: "summary",
          matchedField: "Summary",
          highlight: snippet,
          objectID: hit.objectID || hit.conversation_id,
        })
      }
    }
  }

  // Fallback: show generic suggestions if no field-specific matches
  if (suggestions.length === 0 && result.hits?.length > 0) {
    for (const hit of result.hits.slice(0, 3)) {
      if (hit.caller_name && !seen.has(`caller:${hit.caller_name}`)) {
        seen.add(`caller:${hit.caller_name}`)
        suggestions.push({
          text: hit.caller_name,
          type: "caller",
          matchedField: "Caller Name",
          objectID: hit.objectID || hit.conversation_id,
        })
      }
      if (hit.agent_name && !seen.has(`agent:${hit.agent_name}`)) {
        seen.add(`agent:${hit.agent_name}`)
        suggestions.push({
          text: hit.agent_name,
          type: "agent",
          matchedField: "Agent Name",
        })
      }
    }
  }

  return suggestions
}

// ============================================================================
// HOOK
// ============================================================================

export function useAlgoliaSearch(options: UseAlgoliaSearchOptions = {}): AlgoliaSearchHook {
  const { enabled = true } = options
  const params = useParams()
  const workspaceSlug = params?.workspaceSlug as string | undefined

  // Local state
  const [searchResults, setSearchResults] = useState<AlgoliaSearchResults | null>(null)
  const [autocompleteResults, setAutocompleteResults] = useState<AlgoliaSuggestion[]>([])

  // Keep workspace slug ref stable
  const workspaceSlugRef = useRef(workspaceSlug)
  workspaceSlugRef.current = workspaceSlug

  // Fetch config (just checks if configured, no secrets exposed)
  const {
    data: configData,
    isLoading: isLoadingConfig,
  } = useQuery({
    queryKey: ["algolia-config", workspaceSlug],
    queryFn: async () => {
      if (!workspaceSlug) return null
      const response = await fetch(`/api/w/${workspaceSlug}/integrations/algolia-search-config`)
      if (!response.ok) {
        throw new Error("Failed to fetch Algolia config")
      }
      const json = await response.json()
      return (json.data || json) as AlgoliaSearchConfig
    },
    enabled: enabled && !!workspaceSlug,
    staleTime: 5 * 60 * 1000,
  })

  const config = configData ?? null
  const isConfigured = config?.configured ?? false

  // Keep config ref stable
  const isConfiguredRef = useRef(isConfigured)
  isConfiguredRef.current = isConfigured

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (searchParams: SearchParams) => {
      const slug = workspaceSlugRef.current
      if (!slug || !isConfiguredRef.current) {
        throw new Error("Algolia not configured")
      }
      return proxySearch(slug, searchParams)
    },
    onSuccess: (data) => {
      setSearchResults(data)
    },
  })

  // Autocomplete mutation
  const autocompleteMutation = useMutation({
    mutationFn: async (query: string) => {
      const slug = workspaceSlugRef.current
      if (!slug || !isConfiguredRef.current) {
        return []
      }
      return proxyAutocomplete(slug, query)
    },
    onSuccess: (data) => {
      setAutocompleteResults(data)
    },
  })

  // Search function
  const search = useCallback(
    async (searchParams: SearchParams): Promise<AlgoliaSearchResults | null> => {
      if (!isConfiguredRef.current) {
        return null
      }
      return searchMutation.mutateAsync(searchParams)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchMutation.mutateAsync]
  )

  // Autocomplete function
  const getAutocomplete = useCallback(
    async (query: string): Promise<AlgoliaSuggestion[]> => {
      if (!isConfiguredRef.current) {
        return []
      }
      return autocompleteMutation.mutateAsync(query)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autocompleteMutation.mutateAsync]
  )

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchResults(null)
    setAutocompleteResults([])
  }, [])

  return {
    config,
    isConfigured,
    isLoadingConfig,
    benefits: config?.benefits ?? null,
    search,
    searchResults,
    isSearching: searchMutation.isPending,
    searchError: searchMutation.error as Error | null,
    getAutocomplete,
    autocompleteResults,
    isLoadingAutocomplete: autocompleteMutation.isPending,
    clearSearch,
  }
}

// ============================================================================
// UTILITY HOOK: Check if Algolia is configured
// ============================================================================

export function useIsAlgoliaConfigured(): {
  isConfigured: boolean
  isLoading: boolean
  benefits: AlgoliaSearchConfig["benefits"] | null
} {
  const { config, isConfigured, isLoadingConfig, benefits } = useAlgoliaSearch()

  return {
    isConfigured,
    isLoading: isLoadingConfig,
    benefits,
  }
}

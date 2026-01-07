"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"

// ============================================================================
// TYPES
// ============================================================================

export interface AlgoliaConfig {
  configured: boolean
  appId?: string
  searchApiKey?: string
  indexName?: string
  message?: string
}

export interface AlgoliaSearchResult<T = unknown> {
  hits: T[]
  nbHits: number
  page: number
  nbPages: number
  hitsPerPage: number
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch Algolia configuration for the current workspace
 */
export function useAlgoliaConfig() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<AlgoliaConfig>({
    queryKey: ["algolia-config", workspaceSlug],
    queryFn: async () => {
      const response = await fetch(`/api/w/${workspaceSlug}/integrations/algolia-search-config`)
      if (!response.ok) {
        throw new Error("Failed to fetch Algolia config")
      }
      return response.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!workspaceSlug,
  })
}

/**
 * Check if Algolia is configured for the current workspace
 */
export function useIsAlgoliaConfigured(): boolean {
  const { data } = useAlgoliaConfig()
  return data?.configured ?? false
}

/**
 * Hook for searching with Algolia
 * Falls back to regular search if Algolia is not configured
 */
export function useAlgoliaSearch<T = unknown>(
  query: string,
  options?: {
    enabled?: boolean
    filters?: string[]
    hitsPerPage?: number
    page?: number
  }
) {
  const { data: algoliaConfig, isLoading: isLoadingConfig } = useAlgoliaConfig()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  const searchQuery = useQuery<AlgoliaSearchResult<T>>({
    queryKey: [
      "algolia-search",
      workspaceSlug,
      query,
      options?.filters,
      options?.page,
      options?.hitsPerPage,
    ],
    queryFn: async () => {
      if (!algoliaConfig?.configured || !algoliaConfig.appId || !algoliaConfig.searchApiKey) {
        throw new Error("Algolia not configured")
      }

      const indexName = algoliaConfig.indexName || "call_logs"
      const res = await fetch(
        `https://${algoliaConfig.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Algolia-Application-Id": algoliaConfig.appId,
            "X-Algolia-API-Key": algoliaConfig.searchApiKey,
          },
          body: JSON.stringify({
            query,
            filters: options?.filters?.join(" AND "),
            page: options?.page ?? 0,
            hitsPerPage: options?.hitsPerPage ?? 20,
          }),
        }
      )

      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        throw new Error(msg || "Algolia search failed")
      }

      const result = await res.json()

      return {
        hits: result.hits as T[],
        nbHits: result.nbHits || 0,
        page: result.page || 0,
        nbPages: result.nbPages || 0,
        hitsPerPage: result.hitsPerPage || 20,
      }
    },
    enabled:
      (options?.enabled ?? true) &&
      !!workspaceSlug &&
      !!algoliaConfig?.configured &&
      query.length > 0,
    staleTime: 30 * 1000, // 30 seconds
  })

  return {
    ...searchQuery,
    isAlgoliaConfigured: algoliaConfig?.configured ?? false,
    isLoadingConfig,
  }
}


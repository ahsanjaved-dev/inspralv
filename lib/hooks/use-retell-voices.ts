"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { RetellVoice } from "@/lib/integrations/retell/voices"

interface UseRetellVoicesResponse {
  voices: RetellVoice[]
  count: number
}

/**
 * Hook to fetch available Retell voices (ElevenLabs) for a workspace
 * Caches the result for 5 minutes to avoid excessive API calls
 */
export function useRetellVoices() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<UseRetellVoicesResponse>({
    queryKey: ["retell-voices", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/voices/retell`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch Retell voices")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    // Cache voices for 5 minutes since they don't change often
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    // Don't refetch on window focus for voices
    refetchOnWindowFocus: false,
  })
}

/**
 * Get a specific voice by ID from the cached voices
 */
export function useRetellVoice(voiceId: string | undefined) {
  const { data, isLoading, error } = useRetellVoices()
  
  const voice = voiceId 
    ? data?.voices.find((v) => v.id === voiceId) 
    : undefined

  return {
    voice,
    isLoading,
    error,
  }
}


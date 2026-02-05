"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { ElevenLabsVoice } from "@/lib/integrations/elevenlabs/voices"

interface ElevenLabsVoicesResponse {
  voices: ElevenLabsVoice[]
  count: number
  source: string
}

/**
 * Hook to fetch ElevenLabs voices dynamically
 * Used for VAPI agents which use ElevenLabs as the voice provider
 * 
 * Caches voices for 5 minutes to minimize API calls
 */
export function useElevenLabsVoices() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<ElevenLabsVoicesResponse>({
    queryKey: ["elevenlabs-voices", workspaceSlug],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/voices/elevenlabs`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch ElevenLabs voices")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    // Cache for 5 minutes - voices don't change frequently
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    // Don't refetch on window focus - voices are stable
    refetchOnWindowFocus: false,
  })
}


import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { ConversationWithAgent, PaginatedResponse } from "@/types/database.types"

interface UseWorkspaceConversationsParams {
  page?: number
  pageSize?: number
  status?: string
  direction?: string
  agentId?: string
}

export function useWorkspaceConversations(params: UseWorkspaceConversationsParams = {}) {
  const { workspaceSlug } = useParams()
  const { page = 1, pageSize = 20, status, direction, agentId } = params

  return useQuery<PaginatedResponse<ConversationWithAgent>>({
    queryKey: [
      "workspace-conversations",
      workspaceSlug,
      { page, pageSize, status, direction, agentId },
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })

      if (status) searchParams.set("status", status)
      if (direction) searchParams.set("direction", direction)
      if (agentId) searchParams.set("agent_id", agentId)

      const res = await fetch(`/api/w/${workspaceSlug}/conversations?${searchParams}`)

      if (!res.ok) {
        throw new Error("Failed to fetch conversations")
      }

      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
    // Auto-refresh to catch new calls from webhooks (outbound calls, campaigns)
    refetchInterval: 30_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  })
}

export function useWorkspaceConversation(conversationId: string) {
  const { workspaceSlug } = useParams()

  return useQuery<ConversationWithAgent>({
    queryKey: ["workspace-conversation", workspaceSlug, conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/conversations/${conversationId}`)

      if (!res.ok) {
        throw new Error("Failed to fetch conversation")
      }

      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug && !!conversationId,
  })
}

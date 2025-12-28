"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import type { 
  KnowledgeDocument, 
  KnowledgeDocumentType, 
  KnowledgeDocumentStatus,
  CreateKnowledgeDocumentInput, 
  UpdateKnowledgeDocumentInput,
  PaginatedResponse,
} from "@/types/database.types"

interface UseWorkspaceKnowledgeBaseOptions {
  search?: string
  documentType?: KnowledgeDocumentType
  status?: KnowledgeDocumentStatus
  category?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

export function useWorkspaceKnowledgeBase(options: UseWorkspaceKnowledgeBaseOptions = {}) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<PaginatedResponse<KnowledgeDocument>>({
    queryKey: ["workspace-knowledge-base", workspaceSlug, options],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (options.search) searchParams.set("search", options.search)
      if (options.documentType) searchParams.set("documentType", options.documentType)
      if (options.status) searchParams.set("status", options.status)
      if (options.category) searchParams.set("category", options.category)
      if (options.page) searchParams.set("page", String(options.page))
      if (options.pageSize) searchParams.set("pageSize", String(options.pageSize))
      if (options.sortBy) searchParams.set("sortBy", options.sortBy)
      if (options.sortOrder) searchParams.set("sortOrder", options.sortOrder)

      const res = await fetch(`/api/w/${workspaceSlug}/knowledge-base?${searchParams}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch documents")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug,
  })
}

export function useWorkspaceKnowledgeDocument(documentId: string) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  return useQuery<KnowledgeDocument>({
    queryKey: ["workspace-knowledge-document", workspaceSlug, documentId],
    queryFn: async () => {
      const res = await fetch(`/api/w/${workspaceSlug}/knowledge-base/${documentId}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to fetch document")
      }
      const json = await res.json()
      return json.data
    },
    enabled: !!workspaceSlug && !!documentId,
  })
}

export function useCreateKnowledgeDocument() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateKnowledgeDocumentInput) => {
      const res = await fetch(`/api/w/${workspaceSlug}/knowledge-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create document")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-knowledge-base", workspaceSlug] })
    },
  })
}

export function useUpdateKnowledgeDocument() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateKnowledgeDocumentInput }) => {
      const res = await fetch(`/api/w/${workspaceSlug}/knowledge-base/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update document")
      }
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-knowledge-base", workspaceSlug] })
      queryClient.invalidateQueries({ queryKey: ["workspace-knowledge-document", workspaceSlug, variables.id] })
    },
  })
}

export function useDeleteKnowledgeDocument() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (documentId: string) => {
      const res = await fetch(`/api/w/${workspaceSlug}/knowledge-base/${documentId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to delete document")
      }
      return res.json()
    },
    // Optimistic update: remove document immediately from UI
    onMutate: async (documentId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["workspace-knowledge-base", workspaceSlug] })

      // Snapshot previous value
      const previousDocuments = queryClient.getQueryData<PaginatedResponse<KnowledgeDocument>>([
        "workspace-knowledge-base",
        workspaceSlug,
        {},
      ])

      // Optimistically remove the document
      if (previousDocuments) {
        queryClient.setQueryData<PaginatedResponse<KnowledgeDocument>>(
          ["workspace-knowledge-base", workspaceSlug, {}],
          {
            ...previousDocuments,
            data: previousDocuments.data.filter((doc) => doc.id !== documentId),
          }
        )
      }

      return { previousDocuments }
    },
    // Rollback on error
    onError: (_error, _documentId, context) => {
      if (context?.previousDocuments) {
        queryClient.setQueryData(
          ["workspace-knowledge-base", workspaceSlug, {}],
          context.previousDocuments
        )
      }
    },
    // Always refetch after success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-knowledge-base", workspaceSlug] })
    },
  })
}

// Hook for getting unique categories for filtering
export function useKnowledgeBaseCategories() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const { data } = useWorkspaceKnowledgeBase({ pageSize: 100 })

  const categories = data?.data
    ?.map((doc) => doc.category)
    .filter((cat): cat is string => !!cat)
    .filter((cat, index, self) => self.indexOf(cat) === index)
    .sort() || []

  return categories
}


import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError, getValidationError } from "@/lib/api/helpers"
import { createKnowledgeDocumentSchema } from "@/types/api.types"
import { createAuditLog, getRequestMetadata } from "@/lib/audit"
import type { KnowledgeDocumentType, KnowledgeDocumentStatus } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const search = searchParams.get("search") || ""
    const documentType = searchParams.get("documentType") as KnowledgeDocumentType | null
    const status = searchParams.get("status") as KnowledgeDocumentStatus | null
    const category = searchParams.get("category")
    const sortBy = searchParams.get("sortBy") || "created_at"
    const sortOrder = searchParams.get("sortOrder") || "desc"

    let query = ctx.adminClient
      .from("knowledge_documents")
      .select("*", { count: "exact" })
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)

    // Apply filters
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%,description.ilike.%${search}%`)
    }
    if (documentType) {
      query = query.eq("document_type", documentType)
    }
    if (status) {
      query = query.eq("status", status)
    }
    if (category) {
      query = query.eq("category", category)
    }

    // Apply sorting
    const ascending = sortOrder === "asc"
    query = query.order(sortBy, { ascending })

    // Apply pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: documents, error, count } = await query

    if (error) {
      console.error("List knowledge documents error:", error)
      return apiError("Failed to fetch documents")
    }

    return apiResponse({
      data: documents,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/w/[slug]/knowledge-base error:", error)
    return serverError()
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to create documents in this workspace")
    }

    const body = await request.json()
    const validation = createKnowledgeDocumentSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    const { data: document, error } = await ctx.adminClient
      .from("knowledge_documents")
      .insert({
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id,
        title: validation.data.title,
        description: validation.data.description,
        document_type: validation.data.document_type,
        content: validation.data.content,
        tags: validation.data.tags,
        category: validation.data.category,
        file_name: validation.data.file_name,
        file_url: validation.data.file_url,
        file_type: validation.data.file_type,
        file_size_bytes: validation.data.file_size_bytes,
        status: "active", // Set to active by default for text documents
      })
      .select()
      .single()

    if (error) {
      console.error("Create knowledge document error:", error)
      return apiError("Failed to create document")
    }

    // Audit log
    const { ipAddress, userAgent } = getRequestMetadata(request)
    await createAuditLog({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "knowledge_document.created",
      entityType: "knowledge_document",
      entityId: document.id,
      newValues: {
        title: document.title,
        document_type: document.document_type,
        workspace_id: ctx.workspace.id,
      },
      ipAddress,
      userAgent,
    })

    return apiResponse(document, 201)
  } catch (error) {
    console.error("POST /api/w/[slug]/knowledge-base error:", error)
    return serverError()
  }
}


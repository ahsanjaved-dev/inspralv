import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, forbidden, notFound, serverError, getValidationError } from "@/lib/api/helpers"
import { updateKnowledgeDocumentSchema } from "@/types/api.types"
import { createAuditLog, getRequestMetadata } from "@/lib/audit"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    const { data: document, error } = await ctx.adminClient
      .from("knowledge_documents")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (error || !document) {
      return notFound("Document")
    }

    return apiResponse(document)
  } catch (error) {
    console.error("GET /api/w/[slug]/knowledge-base/[id] error:", error)
    return serverError()
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin", "member"])

    if (!ctx) {
      return forbidden("No permission to update documents in this workspace")
    }

    // First check if document exists
    const { data: existing, error: fetchError } = await ctx.adminClient
      .from("knowledge_documents")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (fetchError || !existing) {
      return notFound("Document")
    }

    const body = await request.json()
    const validation = updateKnowledgeDocumentSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    // Build update object, only including provided fields
    const updateData: Record<string, unknown> = {
      updated_by: ctx.user.id,
    }

    if (validation.data.title !== undefined) updateData.title = validation.data.title
    if (validation.data.description !== undefined) updateData.description = validation.data.description
    if (validation.data.document_type !== undefined) updateData.document_type = validation.data.document_type
    if (validation.data.status !== undefined) updateData.status = validation.data.status
    if (validation.data.content !== undefined) updateData.content = validation.data.content
    if (validation.data.tags !== undefined) updateData.tags = validation.data.tags
    if (validation.data.category !== undefined) updateData.category = validation.data.category

    const { data: document, error } = await ctx.adminClient
      .from("knowledge_documents")
      .update(updateData)
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .select()
      .single()

    if (error) {
      console.error("Update knowledge document error:", error)
      return apiError("Failed to update document")
    }

    // Audit log
    const { ipAddress, userAgent } = getRequestMetadata(request)
    await createAuditLog({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "knowledge_document.updated",
      entityType: "knowledge_document",
      entityId: document.id,
      oldValues: {
        title: existing.title,
        status: existing.status,
      },
      newValues: {
        title: document.title,
        status: document.status,
      },
      ipAddress,
      userAgent,
    })

    return apiResponse(document)
  } catch (error) {
    console.error("PATCH /api/w/[slug]/knowledge-base/[id] error:", error)
    return serverError()
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug, ["owner", "admin"])

    if (!ctx) {
      return forbidden("No permission to delete documents in this workspace")
    }

    // First check if document exists
    const { data: existing, error: fetchError } = await ctx.adminClient
      .from("knowledge_documents")
      .select("id, title")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (fetchError || !existing) {
      return notFound("Document")
    }

    // Soft delete by setting deleted_at
    const { error } = await ctx.adminClient
      .from("knowledge_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)

    if (error) {
      console.error("Delete knowledge document error:", error)
      return apiError("Failed to delete document")
    }

    // Audit log
    const { ipAddress, userAgent } = getRequestMetadata(request)
    await createAuditLog({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      action: "knowledge_document.deleted",
      entityType: "knowledge_document",
      entityId: id,
      oldValues: {
        title: existing.title,
      },
      ipAddress,
      userAgent,
    })

    return apiResponse({ success: true, message: "Document deleted successfully" })
  } catch (error) {
    console.error("DELETE /api/w/[slug]/knowledge-base/[id] error:", error)
    return serverError()
  }
}


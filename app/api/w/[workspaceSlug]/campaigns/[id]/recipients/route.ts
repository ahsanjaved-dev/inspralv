import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceContext, checkWorkspacePaywall } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError, notFound, getValidationError } from "@/lib/api/helpers"
import { createRecipientSchema, importRecipientsSchema } from "@/types/database.types"

// GET /api/w/[workspaceSlug]/campaigns/[id]/recipients - List recipients
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "50")
    const offset = (page - 1) * pageSize

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Build query
    let query = ctx.adminClient
      .from("call_recipients")
      .select("*", { count: "exact" })
      .eq("campaign_id", id)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (status && status !== "all") {
      query = query.eq("call_status", status)
    }

    const { data, error, count } = await query

    if (error) {
      console.error("[RecipientsAPI] Error fetching recipients:", error)
      return serverError("Failed to fetch recipients")
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("[RecipientsAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

// POST /api/w/[workspaceSlug]/campaigns/[id]/recipients - Add recipient(s)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    // Check paywall - block adding recipients if credits exhausted
    const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
    if (paywallError) return paywallError

    const body = await request.json()

    // Verify campaign exists and is in draft/paused status
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, status")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    // Check if this is a bulk import or single add
    const isBulkImport = Array.isArray(body.recipients)

    if (isBulkImport) {
      // Bulk import
      const parsed = importRecipientsSchema.safeParse(body)
      if (!parsed.success) {
        return apiError(getValidationError(parsed.error))
      }

      // Normalize phone numbers and prepare records
      const records = parsed.data.recipients.map((recipient) => ({
        ...recipient,
        phone_number: normalizePhoneNumber(recipient.phone_number),
        campaign_id: id,
        workspace_id: ctx.workspace.id,
        custom_variables: recipient.custom_variables || {},
      }))

      // Insert with upsert to handle duplicates
      const { data: inserted, error } = await ctx.adminClient
        .from("call_recipients")
        .upsert(records, { 
          onConflict: "campaign_id,phone_number",
          ignoreDuplicates: true 
        })
        .select()

      if (error) {
        console.error("[RecipientsAPI] Error importing recipients:", error)
        return serverError("Failed to import recipients")
      }

      return NextResponse.json({ 
        data: inserted || [],
        imported: inserted?.length || 0,
        total: records.length,
        duplicates: records.length - (inserted?.length || 0)
      }, { status: 201 })
    } else {
      // Single add
      const parsed = createRecipientSchema.safeParse(body)
      if (!parsed.success) {
        return apiError(getValidationError(parsed.error))
      }

      const { data: recipient, error } = await ctx.adminClient
        .from("call_recipients")
        .insert({
          ...parsed.data,
          phone_number: normalizePhoneNumber(parsed.data.phone_number),
          campaign_id: id,
          workspace_id: ctx.workspace.id,
          custom_variables: parsed.data.custom_variables || {},
        })
        .select()
        .single()

      if (error) {
        if (error.code === "23505") {
          return apiError("This phone number already exists in this campaign")
        }
        console.error("[RecipientsAPI] Error adding recipient:", error)
        return serverError("Failed to add recipient")
      }

      return apiResponse(recipient, 201)
    }
  } catch (error) {
    console.error("[RecipientsAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

// DELETE /api/w/[workspaceSlug]/campaigns/[id]/recipients - Delete recipients
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; id: string }> }
) {
  try {
    const { workspaceSlug, id } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)
    if (!ctx) return unauthorized()

    const { searchParams } = new URL(request.url)
    const recipientId = searchParams.get("recipientId")
    const deleteAll = searchParams.get("deleteAll") === "true"

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await ctx.adminClient
      .from("call_campaigns")
      .select("id, status")
      .eq("id", id)
      .eq("workspace_id", ctx.workspace.id)
      .is("deleted_at", null)
      .single()

    if (campaignError || !campaign) {
      return notFound("Campaign")
    }

    if (campaign.status === "active") {
      return apiError("Cannot delete recipients from an active campaign")
    }

    if (deleteAll) {
      // Delete all recipients
      const { error } = await ctx.adminClient
        .from("call_recipients")
        .delete()
        .eq("campaign_id", id)

      if (error) {
        console.error("[RecipientsAPI] Error deleting all recipients:", error)
        return serverError("Failed to delete recipients")
      }

      return apiResponse({ success: true, deleted: "all" })
    } else if (recipientId) {
      // Delete single recipient
      const { error } = await ctx.adminClient
        .from("call_recipients")
        .delete()
        .eq("id", recipientId)
        .eq("campaign_id", id)

      if (error) {
        console.error("[RecipientsAPI] Error deleting recipient:", error)
        return serverError("Failed to delete recipient")
      }

      return apiResponse({ success: true })
    } else {
      return apiError("Please specify recipientId or deleteAll=true")
    }
  } catch (error) {
    console.error("[RecipientsAPI] Exception:", error)
    return serverError("Internal server error")
  }
}

// Helper to normalize phone numbers (basic E.164 formatting)
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, "")
  
  // If no + prefix and looks like US number, add +1
  if (!normalized.startsWith("+") && normalized.length === 10) {
    normalized = "+1" + normalized
  }
  
  // If no + prefix at all, add it
  if (!normalized.startsWith("+")) {
    normalized = "+" + normalized
  }
  
  return normalized
}


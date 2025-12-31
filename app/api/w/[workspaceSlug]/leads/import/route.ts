import { NextRequest } from "next/server"
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { hasWorkspacePermission } from "@/lib/rbac/permissions"
import { z } from "zod"

interface RouteContext {
  params: Promise<{ workspaceSlug: string }>
}

// Schema for individual lead in import
const importLeadSchema = z.object({
  first_name: z.string().max(255).optional().nullable(),
  last_name: z.string().max(255).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(255).optional().nullable(),
  job_title: z.string().max(255).optional().nullable(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost', 'nurturing']).optional().default('new'),
  source: z.enum(['voice_agent', 'manual', 'import', 'api', 'webhook']).optional().default('import'),
  priority: z.number().min(0).max(2).optional().default(0),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
})

const importRequestSchema = z.object({
  leads: z.array(importLeadSchema).min(1, "At least one lead is required").max(1000, "Maximum 1000 leads per import"),
  skipDuplicates: z.boolean().optional().default(true),
  duplicateCheckField: z.enum(['email', 'phone', 'both']).optional().default('email'),
})

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { workspaceSlug } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Check permission
    if (!hasWorkspacePermission(ctx.workspace.role, "workspace.leads.create")) {
      return apiError("You don't have permission to import leads", 403)
    }

    const body = await request.json()
    const validation = importRequestSchema.safeParse(body)

    if (!validation.success) {
      const firstError = validation.error.issues[0]
      return apiError(firstError?.message || "Invalid import data", 400)
    }

    const { leads, skipDuplicates, duplicateCheckField } = validation.data

    // Track results
    const results = {
      total: leads.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[],
      duplicates: [] as { row: number; field: string; value: string }[],
    }

    // Get existing leads for duplicate checking
    let existingEmails: Set<string> = new Set()
    let existingPhones: Set<string> = new Set()

    if (skipDuplicates) {
      const { data: existingLeads } = await ctx.adminClient
        .from("leads")
        .select("email, phone")
        .eq("workspace_id", ctx.workspace.id)
        .is("deleted_at", null)

      if (existingLeads) {
        existingEmails = new Set(
          existingLeads
            .filter((l) => l.email)
            .map((l) => l.email!.toLowerCase())
        )
        existingPhones = new Set(
          existingLeads
            .filter((l) => l.phone)
            .map((l) => l.phone!.replace(/\D/g, "")) // Normalize phone numbers
        )
      }
    }

    // Prepare leads for insertion
    const leadsToInsert: Array<{
      workspace_id: string
      created_by: string
      first_name: string | null
      last_name: string | null
      email: string | null
      phone: string | null
      company: string | null
      job_title: string | null
      status: string
      source: string
      priority: number
      notes: string | null
      tags: string[]
    }> = []

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i]
      const rowNum = i + 1

      // Guard: malformed row
      if (!lead) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: "Invalid row (empty lead data)",
        })
        continue
      }

      // Validate at least one contact method
      if (!lead.email && !lead.phone && !lead.first_name && !lead.last_name) {
        results.failed++
        results.errors.push({
          row: rowNum,
          error: "At least one of name, email, or phone is required",
        })
        continue
      }

      // Check for duplicates
      if (skipDuplicates) {
        const emailLower = lead.email?.toLowerCase()
        const phoneNormalized = lead.phone?.replace(/\D/g, "")

        if (duplicateCheckField === 'email' || duplicateCheckField === 'both') {
          if (emailLower && existingEmails.has(emailLower)) {
            results.skipped++
            results.duplicates.push({
              row: rowNum,
              field: "email",
              value: lead.email!,
            })
            continue
          }
        }

        if (duplicateCheckField === 'phone' || duplicateCheckField === 'both') {
          if (phoneNormalized && existingPhones.has(phoneNormalized)) {
            results.skipped++
            results.duplicates.push({
              row: rowNum,
              field: "phone",
              value: lead.phone!,
            })
            continue
          }
        }

        // Add to existing sets to prevent duplicates within the same import
        if (emailLower) existingEmails.add(emailLower)
        if (phoneNormalized) existingPhones.add(phoneNormalized)
      }

      leadsToInsert.push({
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
        email: lead.email || null,
        phone: lead.phone || null,
        company: lead.company || null,
        job_title: lead.job_title || null,
        status: lead.status || 'new',
        source: 'import', // Always set source to 'import' for imported leads
        priority: lead.priority ?? 0,
        notes: lead.notes || null,
        tags: lead.tags || [],
      })
    }

    // Bulk insert in batches of 100
    const BATCH_SIZE = 100
    for (let i = 0; i < leadsToInsert.length; i += BATCH_SIZE) {
      const batch = leadsToInsert.slice(i, i + BATCH_SIZE)
      
      const { error } = await ctx.adminClient
        .from("leads")
        .insert(batch)

      if (error) {
        console.error("Batch insert error:", error)
        // Mark all in this batch as failed
        for (let j = 0; j < batch.length; j++) {
          results.failed++
          results.errors.push({
            row: i + j + 1,
            error: "Database insert failed",
          })
        }
      } else {
        results.imported += batch.length
      }
    }

    return apiResponse({
      success: true,
      results,
    })
  } catch (error) {
    console.error("POST /api/w/[slug]/leads/import error:", error)
    return serverError()
  }
}


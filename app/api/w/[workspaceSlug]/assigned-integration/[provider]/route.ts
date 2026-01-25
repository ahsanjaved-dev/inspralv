/**
 * Workspace Assigned Integration by Provider API
 * GET - Get the assigned integration for a specific provider
 * 
 * Uses Prisma with Supabase fallback for resilience
 */

import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, notFound, serverError, unauthorized } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; provider: string }>
}

// Helper to transform assignment to response format
function transformAssignment(assignment: any) {
  const apiKeys = assignment.partner_integration?.api_keys || assignment.partnerIntegration?.apiKeys || {}
  return {
    provider: assignment.provider,
    integration_id: assignment.partner_integration?.id || assignment.partnerIntegration?.id,
    integration_name: assignment.partner_integration?.name || assignment.partnerIntegration?.name,
    is_default: assignment.partner_integration?.is_default ?? assignment.partnerIntegration?.isDefault,
    has_secret_key: !!apiKeys?.default_secret_key,
    has_public_key: !!apiKeys?.default_public_key,
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug, provider } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Try Prisma first, fallback to Supabase if Prisma fails
    let assignment: any = null

    if (prisma) {
      try {
        // Get the integration assignment for this provider via Prisma
        assignment = await prisma.workspaceIntegrationAssignment.findFirst({
          where: {
            workspaceId: ctx.workspace.id,
            provider: provider,
          },
          include: {
            partnerIntegration: {
              select: {
                id: true,
                provider: true,
                name: true,
                isDefault: true,
                isActive: true,
                apiKeys: true,
              },
            },
          },
        })

        // If no assignment exists, check if there's a default integration and auto-assign it
        if (!assignment) {
          // First get the workspace's partner_id
          const workspace = await prisma.workspace.findUnique({
            where: { id: ctx.workspace.id },
            select: { partnerId: true },
          })

          if (workspace?.partnerId) {
            // Find the default integration for this provider
            const defaultIntegration = await prisma.partnerIntegration.findFirst({
              where: {
                partnerId: workspace.partnerId,
                provider: provider,
                isDefault: true,
                isActive: true,
              },
              select: {
                id: true,
                provider: true,
                name: true,
                isDefault: true,
                isActive: true,
                apiKeys: true,
              },
            })

            if (defaultIntegration) {
              // Auto-create the assignment
              console.log(`[AssignedIntegration] Auto-assigning default ${provider} integration to workspace ${ctx.workspace.id}`)
              await prisma.workspaceIntegrationAssignment.create({
                data: {
                  workspaceId: ctx.workspace.id,
                  provider: provider,
                  partnerIntegrationId: defaultIntegration.id,
                  assignedBy: ctx.user.id,
                },
              })

              // Re-fetch with the new assignment
              assignment = await prisma.workspaceIntegrationAssignment.findFirst({
                where: {
                  workspaceId: ctx.workspace.id,
                  provider: provider,
                },
                include: {
                  partnerIntegration: {
                    select: {
                      id: true,
                      provider: true,
                      name: true,
                      isDefault: true,
                      isActive: true,
                      apiKeys: true,
                    },
                  },
                },
              })
            }
          }
        }
      } catch (prismaError) {
        console.warn("[AssignedIntegration] Prisma failed, falling back to Supabase:", (prismaError as Error).message)
        assignment = null // Will try Supabase fallback below
      }
    }

    // Supabase fallback - used when Prisma is not available or fails
    if (!assignment) {
      console.log("[AssignedIntegration] Using Supabase fallback for provider:", provider)
      
      const { data: supabaseAssignment, error: assignmentError } = await ctx.adminClient
        .from("workspace_integration_assignments")
        .select(`
          id,
          provider,
          partner_integration:partner_integrations (
            id,
            provider,
            name,
            is_default,
            is_active,
            api_keys
          )
        `)
        .eq("workspace_id", ctx.workspace.id)
        .eq("provider", provider)
        .single()

      if (assignmentError && assignmentError.code !== "PGRST116") {
        console.error("[AssignedIntegration] Supabase error:", assignmentError)
      }

      // If no assignment, try to auto-assign the default integration
      if (!supabaseAssignment) {
        // Get workspace partner_id
        const { data: workspaceData } = await ctx.adminClient
          .from("workspaces")
          .select("partner_id")
          .eq("id", ctx.workspace.id)
          .single()

        if (workspaceData?.partner_id) {
          // Find default integration
          const { data: defaultIntegration } = await ctx.adminClient
            .from("partner_integrations")
            .select("id, provider, name, is_default, is_active, api_keys")
            .eq("partner_id", workspaceData.partner_id)
            .eq("provider", provider)
            .eq("is_default", true)
            .eq("is_active", true)
            .single()

          if (defaultIntegration) {
            console.log(`[AssignedIntegration] Supabase: Auto-assigning default ${provider} integration`)
            
            // Create assignment
            const { error: createError } = await ctx.adminClient
              .from("workspace_integration_assignments")
              .insert({
                workspace_id: ctx.workspace.id,
                provider: provider,
                partner_integration_id: defaultIntegration.id,
                assigned_by: ctx.user.id,
              })

            if (!createError) {
              // Return the default integration info directly
              assignment = {
                provider: provider,
                partner_integration: defaultIntegration,
              }
            }
          }
        }
      } else {
        assignment = supabaseAssignment
      }
    }

    if (!assignment) {
      return notFound("Integration assignment")
    }

    return apiResponse(transformAssignment(assignment))
  } catch (error) {
    console.error("GET /api/w/[slug]/assigned-integration/[provider] error:", error)
    return serverError((error as Error).message)
  }
}


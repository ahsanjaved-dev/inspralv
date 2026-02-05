/**
 * Workspace Outbound Call Config API
 * GET - Get the outbound call configuration for a specific provider
 * 
 * Returns integration info including whether a shared outbound phone number is configured
 */

import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, notFound, serverError, unauthorized } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"
import type { VapiIntegrationConfig, RetellIntegrationConfig } from "@/types/database.types"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; provider: string }>
}

// Helper to transform assignment to response format with outbound config
function transformAssignmentWithOutboundConfig(assignment: any, provider: string) {
  const apiKeys = assignment.partner_integration?.api_keys || assignment.partnerIntegration?.apiKeys || {}
  const config = assignment.partner_integration?.config || assignment.partnerIntegration?.config || {}
  
  // Check for shared outbound phone number based on provider
  let hasSharedOutboundPhone = false
  let sharedOutboundPhoneNumber: string | undefined
  
  if (provider === "vapi") {
    const vapiConfig = config as VapiIntegrationConfig
    hasSharedOutboundPhone = !!vapiConfig?.shared_outbound_phone_number_id
    sharedOutboundPhoneNumber = vapiConfig?.shared_outbound_phone_number
  } else if (provider === "retell") {
    const retellConfig = config as RetellIntegrationConfig
    hasSharedOutboundPhone = !!retellConfig?.shared_outbound_phone_number
    sharedOutboundPhoneNumber = retellConfig?.shared_outbound_phone_number
  }

  return {
    provider: assignment.provider,
    integration_id: assignment.partner_integration?.id || assignment.partnerIntegration?.id,
    integration_name: assignment.partner_integration?.name || assignment.partnerIntegration?.name,
    is_default: assignment.partner_integration?.is_default ?? assignment.partnerIntegration?.isDefault,
    has_secret_key: !!apiKeys?.default_secret_key,
    has_public_key: !!apiKeys?.default_public_key,
    has_shared_outbound_phone: hasSharedOutboundPhone,
    shared_outbound_phone_number: sharedOutboundPhoneNumber,
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { workspaceSlug, provider } = await params
    const ctx = await getWorkspaceContext(workspaceSlug)

    if (!ctx) {
      return unauthorized()
    }

    // Only support VAPI and Retell for outbound calls
    if (provider !== "vapi" && provider !== "retell") {
      return notFound("Provider not supported for outbound calls")
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
                config: true, // Include config for shared outbound phone
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
                config: true, // Include config for shared outbound phone
              },
            })

            if (defaultIntegration) {
              // Auto-create the assignment
              console.log(`[OutboundConfig] Auto-assigning default ${provider} integration to workspace ${ctx.workspace.id}`)
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
                      config: true,
                    },
                  },
                },
              })
            }
          }
        }
      } catch (prismaError) {
        console.warn("[OutboundConfig] Prisma failed, falling back to Supabase:", (prismaError as Error).message)
        assignment = null // Will try Supabase fallback below
      }
    }

    // Supabase fallback - used when Prisma is not available or fails
    if (!assignment) {
      console.log("[OutboundConfig] Using Supabase fallback for provider:", provider)
      
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
            api_keys,
            config
          )
        `)
        .eq("workspace_id", ctx.workspace.id)
        .eq("provider", provider)
        .single()

      if (assignmentError && assignmentError.code !== "PGRST116") {
        console.error("[OutboundConfig] Supabase error:", assignmentError)
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
            .select("id, provider, name, is_default, is_active, api_keys, config")
            .eq("partner_id", workspaceData.partner_id)
            .eq("provider", provider)
            .eq("is_default", true)
            .eq("is_active", true)
            .single()

          if (defaultIntegration) {
            console.log(`[OutboundConfig] Supabase: Auto-assigning default ${provider} integration`)
            
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

    return apiResponse(transformAssignmentWithOutboundConfig(assignment, provider))
  } catch (error) {
    console.error("GET /api/w/[slug]/outbound-config/[provider] error:", error)
    return serverError((error as Error).message)
  }
}


import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError, getValidationError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPartnerApprovalEmail } from "@/lib/email/send"
import { env } from "@/lib/env"
import { z } from "zod"

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "genius365.app"

const createPartnerSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  hostname: z.string().min(1, "Primary hostname is required"),
  branding: z
    .object({
      company_name: z.string().optional(),
      logo_url: z.string().url().optional().or(z.literal("")),
      favicon_url: z.string().url().optional().or(z.literal("")),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
    })
    .optional(),
  plan_tier: z.enum(["free", "starter", "pro", "enterprise"]).default("enterprise"),
  features: z
    .object({
      white_label: z.boolean().optional(),
      custom_domain: z.boolean().optional(),
      api_access: z.boolean().optional(),
      sso: z.boolean().optional(),
      advanced_analytics: z.boolean().optional(),
    })
    .optional(),
  resource_limits: z
    .object({
      max_workspaces: z.number().optional(),
      max_users_per_workspace: z.number().optional(),
      max_agents_per_workspace: z.number().optional(),
    })
    .optional(),
  is_platform_partner: z.boolean().default(false),
  // New fields for admin user creation
  admin_email: z.string().email("Valid email is required").optional(),
  admin_first_name: z.string().max(100).optional(),
  admin_last_name: z.string().max(100).optional(),
  send_welcome_email: z.boolean().default(true),
  create_first_workspace: z.boolean().default(true),
  first_workspace_name: z.string().max(255).optional(),
})

// Generate a random password
function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%"
  let password = ""
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

// Generate a slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
}

export async function GET(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get("search") || ""
    const planTier = searchParams.get("plan_tier") || "all"
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "10")

    const adminClient = createAdminClient()

    // Build query for partners table (not partner_requests!)
    let query = adminClient
      .from("partners")
      .select("*, partner_domains(*)", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    // Filter by plan tier
    if (planTier !== "all") {
      query = query.eq("plan_tier", planTier)
    }

    // Search by name or slug
    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
    }

    // Pagination
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data: partners, error, count } = await query

    if (error) {
      console.error("List partners error:", error)
      return serverError()
    }

    // Fetch workspace and agent counts for each partner
    const partnersWithCounts = await Promise.all(
      (partners || []).map(async (partner) => {
        // Get workspace count
        const { count: workspaceCount } = await adminClient
          .from("workspaces")
          .select("*", { count: "exact", head: true })
          .eq("partner_id", partner.id)
          .is("deleted_at", null)

        // Get agent count across all workspaces
        const { data: workspaces } = await adminClient
          .from("workspaces")
          .select("id")
          .eq("partner_id", partner.id)
          .is("deleted_at", null)

        let agentCount = 0
        if (workspaces && workspaces.length > 0) {
          const workspaceIds = workspaces.map((w) => w.id)
          const { count: agents } = await adminClient
            .from("ai_agents")
            .select("*", { count: "exact", head: true })
            .in("workspace_id", workspaceIds)
            .is("deleted_at", null)
          agentCount = agents || 0
        }

        return {
          ...partner,
          workspace_count: workspaceCount || 0,
          agent_count: agentCount,
        }
      })
    )

    return apiResponse({
      data: partnersWithCounts,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error("GET /api/super-admin/partners error:", error)
    return serverError()
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const body = await request.json()
    const validation = createPartnerSchema.safeParse(body)

    if (!validation.success) {
      return apiError(getValidationError(validation.error))
    }

    const adminClient = createAdminClient()
    const {
      hostname,
      admin_email,
      admin_first_name,
      admin_last_name,
      send_welcome_email,
      create_first_workspace,
      first_workspace_name,
      ...partnerData
    } = validation.data

    // Check slug uniqueness
    const { data: existingSlug } = await adminClient
      .from("partners")
      .select("id")
      .eq("slug", partnerData.slug)
      .maybeSingle()

    if (existingSlug) {
      return apiError("A partner with this slug already exists")
    }

    // Check hostname uniqueness
    const { data: existingDomain } = await adminClient
      .from("partner_domains")
      .select("id")
      .eq("hostname", hostname)
      .maybeSingle()

    if (existingDomain) {
      return apiError("This hostname is already in use")
    }

    // Create partner
    // Note: onboarding_status defaults to "active" in the database
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .insert({
        name: partnerData.name,
        slug: partnerData.slug,
        branding: partnerData.branding || {},
        plan_tier: partnerData.plan_tier,
        features: partnerData.features || {
          white_label: true,
          custom_domain: true,
          api_access: true,
          sso: true,
          advanced_analytics: true,
        },
        resource_limits: partnerData.resource_limits || {
          max_workspaces: -1,
          max_users_per_workspace: -1,
          max_agents_per_workspace: -1,
        },
        is_platform_partner: partnerData.is_platform_partner,
        subscription_status: "active",
        settings: {},
      })
      .select()
      .single()

    if (partnerError) {
      console.error("Create partner error:", partnerError)
      return apiError("Failed to create partner")
    }

    // Create primary domain
    const { error: domainError } = await adminClient.from("partner_domains").insert({
      partner_id: partner.id,
      hostname,
      is_primary: true,
      verified_at: new Date().toISOString(), // Auto-verify for now
    })

    if (domainError) {
      console.error("Create domain error:", domainError)
      // Rollback partner
      await adminClient.from("partners").delete().eq("id", partner.id)
      return apiError("Failed to create partner domain")
    }

    let userId: string | null = null
    let temporaryPassword: string | null = null
    let isExistingUser = false

    // Create or find admin user if email provided
    if (admin_email) {
      // Check if user already exists
      const { data: existingUser } = await adminClient
        .from("users")
        .select("id")
        .eq("email", admin_email.toLowerCase())
        .maybeSingle()

      if (existingUser) {
        userId = existingUser.id
        isExistingUser = true
      } else {
        // Create new user in Supabase Auth
        temporaryPassword = generateTemporaryPassword()

        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email: admin_email.toLowerCase(),
          password: temporaryPassword,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            first_name: admin_first_name || "",
            last_name: admin_last_name || "",
          },
        })

        if (authError) {
          console.error("Create auth user error:", authError)
          // Don't fail the whole operation, just log it
        } else if (authData.user) {
          userId = authData.user.id

          // Create user profile in public.users table
          const { error: profileError } = await adminClient.from("users").insert({
            id: userId,
            email: admin_email.toLowerCase(),
            first_name: admin_first_name || null,
            last_name: admin_last_name || null,
          })

          if (profileError) {
            console.error("Create user profile error:", profileError)
          }
        }
      }

      // Add user as partner owner
      if (userId) {
        const { error: memberError } = await adminClient.from("partner_members").insert({
          partner_id: partner.id,
          user_id: userId,
          role: "owner",
        })

        if (memberError) {
          console.error("Create partner member error:", memberError)
        }
      }
    }

    // Create first workspace if requested
    let workspace = null
    if (create_first_workspace && first_workspace_name) {
      const workspaceSlug = generateSlug(first_workspace_name)

      const { data: newWorkspace, error: workspaceError } = await adminClient
        .from("workspaces")
        .insert({
          partner_id: partner.id,
          name: first_workspace_name,
          slug: workspaceSlug,
          status: "active",
          resource_limits: {},
          settings: {},
        })
        .select()
        .single()

      if (workspaceError) {
        console.error("Create workspace error:", workspaceError)
      } else {
        workspace = newWorkspace

        // Add admin user to workspace as owner
        if (userId) {
          const { error: wsMemberError } = await adminClient.from("workspace_members").insert({
            workspace_id: workspace.id,
            user_id: userId,
            role: "owner",
          })

          if (wsMemberError) {
            console.error("Create workspace member error:", wsMemberError)
          }
        }
      }
    }

    // Send welcome email if requested
    if (send_welcome_email && admin_email) {
      const loginUrl = `https://${hostname}/login`

      try {
        await sendPartnerApprovalEmail(admin_email, {
          company_name: partnerData.name,
          subdomain: hostname,
          login_url: loginUrl,
          temporary_password: isExistingUser ? "existing-user-use-your-password" : temporaryPassword,
          contact_email: admin_email,
        })
        console.log("Welcome email sent to:", admin_email)
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError)
        // Don't fail the operation if email fails
      }
    }

    return apiResponse(
      {
        ...partner,
        admin_created: !!userId,
        workspace_created: !!workspace,
        email_sent: send_welcome_email && !!admin_email,
      },
      201
    )
  } catch (error) {
    console.error("POST /api/super-admin/partners error:", error)
    return serverError()
  }
}

import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPartnerApprovalEmail } from "@/lib/email/send"
import { getFullSubdomainUrl, getLoginUrl } from "@/lib/utils/subdomain"
import { env } from "@/lib/env"

interface RouteContext {
  params: Promise<{ id: string }>
}

// Generate random password
function generatePassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  let password = ""
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const context = await getSuperAdminContext()
    if (!context) return unauthorized()

    const { id } = await params
    const adminClient = createAdminClient()

    // Get the partner request
    const { data: partnerRequest, error: fetchError } = await adminClient
      .from("partner_requests")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !partnerRequest) {
      return apiError("Partner request not found", 404)
    }

    if (partnerRequest.status !== "provisioning") {
      return apiError("Request must be in provisioning status", 400)
    }

    if (partnerRequest.provisioned_partner_id) {
      return apiError("Partner has already been provisioned", 400)
    }

    // Get the platform subdomain (this is the primary access URL now)
    const platformSubdomain = partnerRequest.desired_subdomain
    const fullPlatformHostname = getFullSubdomainUrl(platformSubdomain)
    const loginUrl = getLoginUrl(platformSubdomain)

    // Get the assigned white-label variant (if any) to determine workspace limits
    let maxWorkspaces = -1 // Default unlimited
    const variantId = partnerRequest.assigned_white_label_variant_id
    
    if (variantId) {
      const { data: variant } = await adminClient
        .from("white_label_variants")
        .select("max_workspaces")
        .eq("id", variantId)
        .single()
      
      if (variant) {
        maxWorkspaces = variant.max_workspaces
      }
    }

    // Step 1: Create partner record with variant assignment
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .insert({
        name: partnerRequest.company_name,
        slug: platformSubdomain,
        branding: partnerRequest.branding_data || {},
        plan_tier: partnerRequest.selected_plan || "partner",
        features: {
          white_label: true,
          custom_domain: true,
          api_access: true,
          sso: false,
          advanced_analytics: true,
        },
        resource_limits: {
          max_workspaces: maxWorkspaces,
          max_users_per_workspace: -1,
          max_agents_per_workspace: -1,
        },
        subscription_status: variantId ? "pending" : "active", // Pending until they complete checkout
        is_platform_partner: false,
        onboarding_status: "provisioning",
        request_id: id,
        white_label_variant_id: variantId || null,
      })
      .select()
      .single()

    if (partnerError) {
      console.error("Create partner error:", partnerError)
      return apiError("Failed to create partner: " + partnerError.message, 500)
    }

    // Step 2: Create partner domain using platform subdomain
    // Platform subdomains are pre-verified (no DNS setup needed)
    const { error: domainError } = await adminClient.from("partner_domains").insert({
      partner_id: partner.id,
      hostname: fullPlatformHostname,
      is_primary: true,
      verified_at: new Date().toISOString(), // Pre-verified for platform subdomain
    })

    if (domainError) {
      console.error("Create domain error:", domainError)
      await adminClient.from("partners").delete().eq("id", partner.id)
      return apiError("Failed to create partner domain: " + domainError.message, 500)
    }

    // Step 3: Create or get owner user account
    let userId: string
    let temporaryPassword: string | null = null
    let isNewUser = false

    // First, check if user already exists
    const { data: existingUsers } = await adminClient
      .from("users")
      .select("id")
      .eq("email", partnerRequest.contact_email)
      .maybeSingle()

    if (existingUsers) {
      // User exists - use existing user
      userId = existingUsers.id
      console.log("User already exists, using existing account:", userId)
    } else {
      // Try to create new user in Supabase Auth
      temporaryPassword = generatePassword()

      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email: partnerRequest.contact_email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          first_name: partnerRequest.contact_name.split(" ")[0] || partnerRequest.contact_name,
          last_name: partnerRequest.contact_name.split(" ").slice(1).join(" ") || "",
        },
      })

      if (authError) {
        // Check if user exists in auth but not in public.users
        if (authError.code === "email_exists") {
          // Get user by email from auth
          const { data: authUsers } = await adminClient.auth.admin.listUsers()
          const existingAuthUser = authUsers?.users?.find(
            (u) => u.email === partnerRequest.contact_email
          )

          if (existingAuthUser) {
            userId = existingAuthUser.id
            console.log("Auth user exists, using existing account:", userId)

            // Make sure user record exists in public.users
            await adminClient.from("users").upsert(
              {
                id: userId,
                email: partnerRequest.contact_email,
                first_name:
                  partnerRequest.contact_name.split(" ")[0] || partnerRequest.contact_name,
                last_name: partnerRequest.contact_name.split(" ").slice(1).join(" ") || "",
                role: "org_admin",
                status: "active",
              },
              { onConflict: "id" }
            )
          } else {
            console.error("Create auth user error:", authError)
            await adminClient.from("partner_domains").delete().eq("partner_id", partner.id)
            await adminClient.from("partners").delete().eq("id", partner.id)
            return apiError("Failed to create owner account", 500)
          }
        } else {
          console.error("Create auth user error:", authError)
          await adminClient.from("partner_domains").delete().eq("partner_id", partner.id)
          await adminClient.from("partners").delete().eq("id", partner.id)
          return apiError("Failed to create owner account", 500)
        }
      } else if (authUser?.user) {
        userId = authUser.user.id
        isNewUser = true

        // Step 4: Create user record in public.users
        const { error: userError } = await adminClient.from("users").insert({
          id: userId,
          email: partnerRequest.contact_email,
          first_name: partnerRequest.contact_name.split(" ")[0] || partnerRequest.contact_name,
          last_name: partnerRequest.contact_name.split(" ").slice(1).join(" ") || "",
          role: "org_admin",
          status: "active",
        })

        if (userError) {
          console.error("Create user record error:", userError)
        }
      } else {
        await adminClient.from("partner_domains").delete().eq("partner_id", partner.id)
        await adminClient.from("partners").delete().eq("id", partner.id)
        return apiError("Failed to create owner account", 500)
      }
    }

    // Step 5: Add user as partner owner (if not already)
    const { data: existingMember } = await adminClient
      .from("partner_members")
      .select("id")
      .eq("partner_id", partner.id)
      .eq("user_id", userId)
      .maybeSingle()

    if (!existingMember) {
      const { error: memberError } = await adminClient.from("partner_members").insert({
        partner_id: partner.id,
        user_id: userId,
        role: "owner",
        joined_at: new Date().toISOString(),
      })

      if (memberError) {
        console.error("Create partner member error:", memberError)
      }
    }

    // Step 6: Create a default workspace for the partner
    const { data: defaultWorkspace, error: wsError } = await adminClient
      .from("workspaces")
      .insert({
        partner_id: partner.id,
        name: "Default Workspace",
        slug: "default",
        description: `Default workspace for ${partnerRequest.company_name}`,
        resource_limits: {
          max_users: 50,
          max_agents: 20,
          max_minutes_per_month: 10000,
        },
        status: "active",
      })
      .select()
      .single()

    if (wsError) {
      console.error("Create default workspace error:", wsError)
    } else {
      // Add owner as workspace admin
      await adminClient.from("workspace_members").insert({
        workspace_id: defaultWorkspace.id,
        user_id: userId,
        role: "owner",
        joined_at: new Date().toISOString(),
      })
    }

    // Step 7: Update partner request status
    const { error: updateError } = await adminClient
      .from("partner_requests")
      .update({
        status: "approved",
        provisioned_partner_id: partner.id,
      })
      .eq("id", id)

    if (updateError) {
      console.error("Update partner request error:", updateError)
    }

    // Step 8: Update partner onboarding status
    await adminClient.from("partners").update({ onboarding_status: "active" }).eq("id", partner.id)

    // Step 9: Send welcome email with platform subdomain URL
    try {
      await sendPartnerApprovalEmail(partnerRequest.contact_email, {
        company_name: partnerRequest.company_name,
        subdomain: fullPlatformHostname,
        login_url: loginUrl,
        temporary_password: temporaryPassword,
        contact_email: partnerRequest.contact_email,
      })
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError)
    }

    return apiResponse({
      success: true,
      message: isNewUser
        ? "Partner provisioned successfully"
        : "Partner provisioned successfully (existing user account linked)",
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        platform_subdomain: platformSubdomain,
        domain: fullPlatformHostname,
      },
      owner: {
        email: partnerRequest.contact_email,
        temporary_password: temporaryPassword,
        is_existing_user: !isNewUser,
      },
      login_url: loginUrl,
    })
  } catch (error) {
    console.error("POST /api/super-admin/partner-requests/[id]/provision error:", error)
    return serverError()
  }
}

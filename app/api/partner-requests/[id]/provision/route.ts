import { NextRequest } from "next/server"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPartnerApprovalEmail } from "@/lib/email/send"
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

    // Step 1: Create partner record
    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .insert({
        name: partnerRequest.company_name,
        slug: partnerRequest.desired_subdomain,
        branding: partnerRequest.branding_data || {},
        plan_tier: "enterprise",
        features: {
          white_label: true,
          custom_domain: true,
          api_access: true,
          sso: false,
          advanced_analytics: true,
        },
        resource_limits: {
          max_workspaces: -1, // Unlimited
          max_users_per_workspace: -1,
          max_agents_per_workspace: -1,
        },
        subscription_status: "active",
        is_platform_partner: false,
        onboarding_status: "provisioning",
        request_id: id,
      })
      .select()
      .single()

    if (partnerError) {
      console.error("Create partner error:", partnerError)
      return apiError("Failed to create partner", 500)
    }

    // Step 2: Create partner domain
    const { error: domainError } = await adminClient.from("partner_domains").insert({
      partner_id: partner.id,
      hostname: partnerRequest.custom_domain,
      is_primary: true,
      verified_at: null, // Will be verified later
    })

    if (domainError) {
      console.error("Create domain error:", domainError)
      // Rollback partner
      await adminClient.from("partners").delete().eq("id", partner.id)
      return apiError("Failed to create partner domain", 500)
    }

    // Step 3: Create owner user account
    const temporaryPassword = generatePassword()

    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: partnerRequest.contact_email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        first_name: partnerRequest.contact_name.split(" ")[0] || partnerRequest.contact_name,
        last_name: partnerRequest.contact_name.split(" ").slice(1).join(" ") || "",
      },
    })

    if (authError || !authUser.user) {
      console.error("Create auth user error:", authError)
      // Rollback
      await adminClient.from("partner_domains").delete().eq("partner_id", partner.id)
      await adminClient.from("partners").delete().eq("id", partner.id)
      return apiError("Failed to create owner account", 500)
    }

    // Step 4: Create user record in public.users
    const { error: userError } = await adminClient.from("users").insert({
      id: authUser.user.id,
      email: partnerRequest.contact_email,
      first_name: partnerRequest.contact_name.split(" ")[0] || partnerRequest.contact_name,
      last_name: partnerRequest.contact_name.split(" ").slice(1).join(" ") || "",
      role: "org_admin",
      status: "active",
    })

    if (userError) {
      console.error("Create user record error:", userError)
      // Continue anyway - auth user exists
    }

    // Step 5: Add user as partner owner
    const { error: memberError } = await adminClient.from("partner_members").insert({
      partner_id: partner.id,
      user_id: authUser.user.id,
      role: "owner",
      joined_at: new Date().toISOString(),
    })

    if (memberError) {
      console.error("Create partner member error:", memberError)
      // Continue anyway
    }

    // Step 6: Update partner request status
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

    // Step 7: Update partner onboarding status
    await adminClient.from("partners").update({ onboarding_status: "active" }).eq("id", partner.id)

    // Step 8: Send welcome email
    const loginUrl = `https://${partnerRequest.custom_domain}/login`

    try {
      await sendPartnerApprovalEmail(partnerRequest.contact_email, {
        company_name: partnerRequest.company_name,
        subdomain: partnerRequest.custom_domain,
        login_url: loginUrl,
        temporary_password: temporaryPassword,
      })
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError)
      // Don't fail the provisioning
    }

    return apiResponse({
      success: true,
      message: "Partner provisioned successfully",
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        domain: partnerRequest.custom_domain,
      },
      owner: {
        email: partnerRequest.contact_email,
        temporary_password: temporaryPassword,
      },
      login_url: loginUrl,
    })
  } catch (error) {
    console.error("POST /api/super-admin/partner-requests/[id]/provision error:", error)
    return serverError()
  }
}

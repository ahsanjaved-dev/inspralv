/**
 * Partner Provisioning Logic
 * 
 * Extracted from the super-admin provision route to be reusable by:
 * 1. Super admin manual provisioning
 * 2. Stripe webhook after successful payment
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { sendPartnerApprovalEmail } from "@/lib/email/send"
import { getFullSubdomainUrl, getLoginUrl } from "@/lib/utils/subdomain"

// Generate random password
function generatePassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  let password = ""
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

export interface ProvisionPartnerInput {
  requestId: string
  /** Stripe customer ID from checkout session (optional) */
  stripeCustomerId?: string
  /** Stripe subscription ID from checkout session (optional) */
  stripeSubscriptionId?: string
}

export interface ProvisionPartnerResult {
  success: boolean
  message: string
  partner: {
    id: string
    name: string
    slug: string
    platformSubdomain: string
    domain: string
  }
  owner: {
    email: string
    temporaryPassword: string | null
    isExistingUser: boolean
  }
  loginUrl: string
}

/**
 * Provision a partner from an approved partner request
 */
export async function provisionPartner(
  input: ProvisionPartnerInput
): Promise<ProvisionPartnerResult> {
  const { requestId, stripeCustomerId, stripeSubscriptionId } = input
  const adminClient = createAdminClient()

  // Get the partner request
  const { data: partnerRequest, error: fetchError } = await adminClient
    .from("partner_requests")
    .select("*")
    .eq("id", requestId)
    .single()

  if (fetchError || !partnerRequest) {
    throw new Error("Partner request not found")
  }

  // Allow provisioning from "approved" (checkout completed) or "provisioning" (legacy flow)
  if (!["approved", "provisioning"].includes(partnerRequest.status)) {
    throw new Error(`Request must be in approved or provisioning status, got: ${partnerRequest.status}`)
  }

  if (partnerRequest.provisioned_partner_id) {
    throw new Error("Partner has already been provisioned")
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
      // If we have Stripe info from checkout, mark as active; otherwise pending
      subscription_status: stripeSubscriptionId ? "active" : "pending",
      stripe_customer_id: stripeCustomerId || null,
      stripe_subscription_id: stripeSubscriptionId || null,
      is_platform_partner: false,
      onboarding_status: "provisioning",
      request_id: requestId,
      white_label_variant_id: variantId || null,
    })
    .select()
    .single()

  if (partnerError) {
    console.error("Create partner error:", partnerError)
    throw new Error("Failed to create partner: " + partnerError.message)
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
    throw new Error("Failed to create partner domain: " + domainError.message)
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
    console.log("[Provision] User already exists, using existing account:", userId)
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
          console.log("[Provision] Auth user exists, using existing account:", userId)

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
          console.error("[Provision] Create auth user error:", authError)
          await adminClient.from("partner_domains").delete().eq("partner_id", partner.id)
          await adminClient.from("partners").delete().eq("id", partner.id)
          throw new Error("Failed to create owner account")
        }
      } else {
        console.error("[Provision] Create auth user error:", authError)
        await adminClient.from("partner_domains").delete().eq("partner_id", partner.id)
        await adminClient.from("partners").delete().eq("id", partner.id)
        throw new Error("Failed to create owner account")
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
        console.error("[Provision] Create user record error:", userError)
      }
    } else {
      await adminClient.from("partner_domains").delete().eq("partner_id", partner.id)
      await adminClient.from("partners").delete().eq("id", partner.id)
      throw new Error("Failed to create owner account")
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
      console.error("[Provision] Create partner member error:", memberError)
    }
  }

  // Step 6: Create a default workspace for the partner
  // Note: We set is_billing_exempt = true so the workspace uses partner-level credits
  // until the partner sets up their own billing/Stripe Connect
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
      is_billing_exempt: true, // Uses partner credits during onboarding
    })
    .select()
    .single()

  if (wsError) {
    console.error("[Provision] Create default workspace error:", wsError)
  } else {
    // Add owner as workspace admin
    await adminClient.from("workspace_members").insert({
      workspace_id: defaultWorkspace.id,
      user_id: userId,
      role: "owner",
      joined_at: new Date().toISOString(),
    })
  }

  // Step 7: Grant initial partner credits ($10 = 1000 cents)
  // This allows the partner to start using the platform while setting up billing
  const INITIAL_PARTNER_CREDITS_CENTS = 1000 // $10
  try {
    // Create billing_credits record
    const { data: billingCredits, error: creditsError } = await adminClient
      .from("billing_credits")
      .insert({
        partner_id: partner.id,
        balance_cents: INITIAL_PARTNER_CREDITS_CENTS,
        low_balance_threshold_cents: 500, // Alert at $5
      })
      .select()
      .single()

    if (!creditsError && billingCredits) {
      // Record the initial credit transaction
      await adminClient.from("credit_transactions").insert({
        billing_credits_id: billingCredits.id,
        type: "adjustment",
        amount_cents: INITIAL_PARTNER_CREDITS_CENTS,
        balance_after_cents: INITIAL_PARTNER_CREDITS_CENTS,
        description: "Initial partner credits - welcome bonus",
        metadata: { reason: "provisioning_grant" },
      })
    }
  } catch (creditError) {
    console.error("[Provision] Failed to grant initial credits:", creditError)
    // Non-fatal - partner can still use the platform
  }

  // Step 8: Update partner request status
  const { error: updateError } = await adminClient
    .from("partner_requests")
    .update({
      status: "provisioned",
      provisioned_partner_id: partner.id,
    })
    .eq("id", requestId)

  if (updateError) {
    console.error("[Provision] Update partner request error:", updateError)
  }

  // Step 9: Update partner onboarding status
  await adminClient.from("partners").update({ onboarding_status: "active" }).eq("id", partner.id)

  // Step 10: Send welcome email with platform subdomain URL
  try {
    await sendPartnerApprovalEmail(partnerRequest.contact_email, {
      company_name: partnerRequest.company_name,
      subdomain: fullPlatformHostname,
      login_url: loginUrl,
      temporary_password: temporaryPassword,
      contact_email: partnerRequest.contact_email,
    })
  } catch (emailError) {
    console.error("[Provision] Failed to send approval email:", emailError)
  }

  return {
    success: true,
    message: isNewUser
      ? "Partner provisioned successfully"
      : "Partner provisioned successfully (existing user account linked)",
    partner: {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      platformSubdomain,
      domain: fullPlatformHostname,
    },
    owner: {
      email: partnerRequest.contact_email,
      temporaryPassword,
      isExistingUser: !isNewUser,
    },
    loginUrl,
  }
}

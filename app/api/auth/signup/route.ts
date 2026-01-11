import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPartnerFromHost } from "@/lib/api/partner"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"
import { grantInitialFreeTierCredits } from "@/lib/stripe/workspace-credits"
import { prisma } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "@/lib/stripe"
import { env } from "@/lib/env"

// Generate a URL-friendly slug from a name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
}

/**
 * POST /api/auth/signup
 * 
 * This endpoint is called after Supabase auth signup to set up the user's account.
 * 
 * Three distinct flows:
 * 
 * 1. SELF-SIGNUP (Business Owners - Platform Partner Only):
 *    - User signs up directly on the platform partner (genius365.ai)
 *    - Gets added as partner member (member role)
 *    - Gets a DEFAULT WORKSPACE created (they become owner)
 *    - Can then invite their team to their workspace
 * 
 * 2. CLIENT INVITATION (White-Label Partners):
 *    - Partner admin invites a client via client-invitations API
 *    - Client receives invitation with a token
 *    - Client signs up with the token
 *    - Gets added as partner member (member role)
 *    - NEW WORKSPACE created with the plan limits from the invitation
 *    - Client becomes OWNER of their new workspace
 * 
 * 3. TEAM INVITATION (Both Platform and White-Label):
 *    - User signs up via a team invitation link
 *    - Gets added as partner member (member role)
 *    - NO default workspace is created
 *    - After signup, they complete the invitation acceptance flow
 *    - They get added to the inviter's workspace with the invited role
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      userId, 
      email, 
      firstName, 
      lastName, 
      selectedPlan, 
      signupSource,
      isInvitation = false,  // Flag to indicate if signup is from an invitation
      invitationToken = null // NEW: Token for client invitations
    } = body

    if (!userId || !email) {
      return apiError("User ID and email are required")
    }

    const adminClient = createAdminClient()

    // Step 1: Create user record in public.users table
    const { error: userError } = await adminClient.from("users").upsert(
      {
        id: userId,
        email: email,
        first_name: firstName || null,
        last_name: lastName || null,
        role: "org_member", // Default role
        status: "active",
      },
      {
        onConflict: "id",
      }
    )

    if (userError) {
      console.error("Failed to create user record:", userError)
      // Continue - user auth exists
    }

    // Step 2: Update user metadata with plan info (in auth.users)
    if (selectedPlan || signupSource) {
      try {
        await adminClient.auth.admin.updateUserById(userId, {
          user_metadata: {
            selected_plan: selectedPlan || "starter",
            signup_source: signupSource || "direct",
            signup_date: new Date().toISOString(),
          },
        })
      } catch (metaError) {
        console.error("Failed to update user metadata:", metaError)
        // Continue - not critical
      }
    }

    // Step 3: Get the partner from current hostname (platform partner for genius365.ai)
    const partner = await getPartnerFromHost()

    // Step 4: Auto-add user as member of the partner
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
        role: "member", // Default role for self-registered users
        joined_at: new Date().toISOString(),
      })

      if (memberError) {
        console.error("Failed to add partner membership:", memberError)
        // Continue - user can still access platform
      }
    }

    // Step 5: Create workspace based on signup type
    // - Platform partner self-signup: Default workspace with default limits
    // - Client invitation: Workspace with plan limits from invitation
    // - Team invitation: No workspace (handled by invitation acceptance)
    let defaultWorkspace = null
    let workspaceRedirect: string | null = null
    let clientInvitationPlan: { id: string; name: string; includedMinutes: number; maxAgents: number | null } | null = null

    // Check if this is a client invitation (has token)
    let clientInvitation = null
    if (invitationToken) {
      const { data: invitation, error: invError } = await adminClient
        .from("partner_invitations")
        .select("id, partner_id, email, metadata, status")
        .eq("token", invitationToken)
        .eq("status", "pending")
        .maybeSingle()

      if (!invError && invitation) {
        const metadata = invitation.metadata as Record<string, unknown>
        if (metadata?.invitation_type === "client") {
          clientInvitation = invitation
          clientInvitationPlan = {
            id: metadata.plan_id as string,
            name: metadata.plan_name as string,
            includedMinutes: metadata.plan_included_minutes as number || 0,
            maxAgents: metadata.plan_max_agents as number | null,
          }
        }
      }
    }

    // Create workspace based on signup type
    if (clientInvitation && clientInvitationPlan) {
      // CLIENT INVITATION: Create workspace with plan limits
      const metadata = clientInvitation.metadata as Record<string, unknown>
      const workspaceName = (metadata.workspace_name as string) || `${firstName || email.split("@")[0]}'s Workspace`
      const workspaceSlug = generateSlug(workspaceName) + "-" + Date.now().toString(36)

      const { data: workspace, error: wsError } = await adminClient
        .from("workspaces")
        .insert({
          partner_id: clientInvitation.partner_id,
          name: workspaceName,
          slug: workspaceSlug,
          description: `Workspace on ${clientInvitationPlan.name} plan`,
          resource_limits: {
            max_users: 10,
            max_agents: clientInvitationPlan.maxAgents || 999,
            max_minutes_per_month: clientInvitationPlan.includedMinutes || 100,
          },
          status: "active",
        })
        .select()
        .single()

      if (wsError) {
        console.error("Failed to create client workspace:", wsError)
      } else {
        defaultWorkspace = workspace

        // Add user as workspace owner
        await adminClient.from("workspace_members").insert({
          workspace_id: workspace.id,
          user_id: userId,
          role: "owner",
          joined_at: new Date().toISOString(),
        })

        // Create subscription record for the workspace
        if (prisma && clientInvitationPlan.id) {
          try {
            await prisma.workspaceSubscription.create({
              data: {
                workspaceId: workspace.id,
                planId: clientInvitationPlan.id,
                status: "active",
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              },
            })
          } catch (subError) {
            console.error("Failed to create subscription:", subError)
          }
        }

        // Mark invitation as accepted
        await adminClient
          .from("partner_invitations")
          .update({ 
            status: "accepted",
            accepted_at: new Date().toISOString()
          })
          .eq("id", clientInvitation.id)

        workspaceRedirect = `/w/${workspace.slug}/dashboard`
      }
    } else if (!isInvitation && partner.is_platform_partner) {
      // PLATFORM PARTNER SELF-SIGNUP: Create default workspace
      const workspaceName = `${firstName || email.split("@")[0]}'s Workspace`
      const workspaceSlug = generateSlug(workspaceName) + "-" + Date.now().toString(36)

      const { data: workspace, error: wsError } = await adminClient
        .from("workspaces")
        .insert({
          partner_id: partner.id,
          name: workspaceName,
          slug: workspaceSlug,
          description: "Your personal AI voice agent workspace",
          resource_limits: {
            max_users: 5,
            max_agents: 3,
            max_minutes_per_month: 100,
          },
          status: "active",
        })
        .select()
        .single()

      if (wsError) {
        console.error("Failed to create default workspace:", wsError)
      } else {
        defaultWorkspace = workspace

        // Add user as workspace owner
        const { error: wsMemberError } = await adminClient.from("workspace_members").insert({
          workspace_id: workspace.id,
          user_id: userId,
          role: "owner",
          joined_at: new Date().toISOString(),
        })

        if (wsMemberError) {
          console.error("Failed to add workspace member:", wsMemberError)
        } else {
          workspaceRedirect = `/w/${workspace.slug}/dashboard`
        }
      }
    }

    // For team invitation signups, don't set a redirect - let the invitation flow handle it
    if (isInvitation && !clientInvitation) {
      workspaceRedirect = null
    }

    // Step 6: Handle plan-specific logic
    // This works for both platform partner and white-label partners
    // - Platform partner: Uses main Stripe account
    // - White-label partners: Uses their Stripe Connect account
    let checkoutUrl: string | null = null

    if (defaultWorkspace && !isInvitation) {
      const planKey = selectedPlan?.toLowerCase() || "free"

      if (planKey === "free") {
        // Grant initial free tier credits
        try {
          await grantInitialFreeTierCredits(defaultWorkspace.id)
        } catch (creditsError) {
          console.error("Failed to grant free tier credits:", creditsError)
          // Continue - user can still use workspace, just without initial credits
        }
      } else if (planKey === "pro" || planKey === "starter" || planKey === "professional") {
        // Start Stripe checkout for paid plans
        // The createPlanCheckoutSession function handles both platform and Connect accounts
        const mappedPlanKey = planKey === "pro" ? "pro" : planKey
        try {
          checkoutUrl = await createPlanCheckoutSession(
            defaultWorkspace.id,
            defaultWorkspace.slug,
            partner.id,
            mappedPlanKey,
            email
          )
        } catch (checkoutError) {
          console.error("Failed to create checkout session:", checkoutError)
          // Continue - user can subscribe later from billing page
        }
      }
    }

    return apiResponse({
      success: true,
      message: isInvitation 
        ? "Account created. Complete the invitation to join the workspace."
        : "User setup complete",
      isInvitation,
      partner: {
        id: partner.id,
        name: partner.name,
        is_platform_partner: partner.is_platform_partner,
      },
      user: {
        id: userId,
        email,
        selected_plan: selectedPlan || "free",
        signup_source: signupSource || "direct",
      },
      workspace: defaultWorkspace
        ? {
            id: defaultWorkspace.id,
            name: defaultWorkspace.name,
            slug: defaultWorkspace.slug,
          }
        : null,
      redirect: checkoutUrl ? null : workspaceRedirect,
      checkoutUrl,
    })
  } catch (error) {
    console.error("POST /api/auth/signup error:", error)
    return serverError()
  }
}

/**
 * Create a Stripe Checkout session for a paid plan (Starter/Professional)
 * Maps the marketing plan key to a WorkspaceSubscriptionPlan and creates a checkout session.
 */
async function createPlanCheckoutSession(
  workspaceId: string,
  workspaceSlug: string,
  partnerId: string,
  planKey: string,
  userEmail: string
): Promise<string | null> {
  if (!prisma) {
    console.error("[Signup Checkout] Database not configured")
    return null
  }

  // Map marketing plan key to plan slug for matching
  const planSlugMap: Record<string, string> = {
    pro: "pro",
    starter: "pro", // Legacy - maps to Pro
    professional: "pro", // Legacy - maps to Pro
  }

  const planSlug = planSlugMap[planKey]
  if (!planSlug) {
    console.error(`[Signup Checkout] Unknown plan key: ${planKey}`)
    return null
  }

  // Find the subscription plan in the database by slug
  const subscriptionPlan = await prisma.workspaceSubscriptionPlan.findFirst({
    where: {
      partnerId,
      isActive: true,
      isPublic: true,
      slug: planSlug,
    },
  })

  if (!subscriptionPlan) {
    console.error(`[Signup Checkout] No subscription plan found for slug "${planSlug}" (partner: ${partnerId})`)
    return null
  }

  if (!subscriptionPlan.stripePriceId) {
    console.error(`[Signup Checkout] Plan "${subscriptionPlan.name}" has no Stripe price ID configured`)
    return null
  }

  // Get partner's Connect account and platform partner flag
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: {
      settings: true,
      isPlatformPartner: true,
    },
  })

  const isPlatformPartner = partner?.isPlatformPartner || false

  console.log(`[Signup Checkout] Partner ${partnerId} is platform partner: ${isPlatformPartner}`)

  // For platform partner: use main Stripe account
  // For other partners: use Stripe Connect account
  let connectAccountId: string | null = null

  if (!isPlatformPartner) {
    connectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown> | null) ?? null

    if (!connectAccountId) {
      console.error(`[Signup Checkout] Non-platform partner ${partnerId} has no Stripe Connect account`)
      return null
    }
    console.log(`[Signup Checkout] Using Stripe Connect account: ${connectAccountId}`)
  } else {
    console.log(`[Signup Checkout] Using main platform Stripe account for platform partner`)
  }

  // Create or get Stripe customer
  // For platform partner: use main account
  // For other partners: use Connect account
  const stripe = getStripe()

  const customerParams = {
    email: userEmail,
    metadata: {
      workspace_id: workspaceId,
      workspace_slug: workspaceSlug,
      partner_id: partnerId,
      is_platform_partner: isPlatformPartner.toString(),
    },
  }

  const customer = connectAccountId
    ? await stripe.customers.create(customerParams, { stripeAccount: connectAccountId })
    : await stripe.customers.create(customerParams)

  console.log(`[Signup Checkout] Created Stripe customer: ${customer.id}`)

  // Create subscription record as incomplete
  await prisma.workspaceSubscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      planId: subscriptionPlan.id,
      stripeCustomerId: customer.id,
      status: "incomplete",
    },
    update: {
      planId: subscriptionPlan.id,
      stripeCustomerId: customer.id,
      status: "incomplete",
    },
  })

  // Create Checkout Session
  const baseUrl = env.appUrl || "http://localhost:3000"
  // After successful payment, redirect to login page (user needs to confirm email and login)
  // The workspace slug is passed so we can redirect to the correct workspace after login
  const successUrl = `${baseUrl}/login?subscription=success&workspace=${workspaceSlug}`
  const cancelUrl = `${baseUrl}/login?subscription=canceled&workspace=${workspaceSlug}`

  const sessionParams = {
    customer: customer.id,
    mode: "subscription" as const,
    payment_method_types: ["card" as const],
    line_items: [
      {
        price: subscriptionPlan.stripePriceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: {
        workspace_id: workspaceId,
        plan_id: subscriptionPlan.id,
        type: "workspace_subscription",
        partner_id: partnerId,
        is_platform_partner: isPlatformPartner.toString(),
      },
    },
    metadata: {
      workspace_id: workspaceId,
      plan_id: subscriptionPlan.id,
      type: "workspace_subscription",
      partner_id: partnerId,
    },
  }

  const session = connectAccountId
    ? await stripe.checkout.sessions.create(sessionParams, { stripeAccount: connectAccountId })
    : await stripe.checkout.sessions.create(sessionParams)

  console.log(`[Signup Checkout] Created checkout session ${session.id} for workspace ${workspaceId}, plan: ${subscriptionPlan.name}`)

  return session.url
}

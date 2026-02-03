import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPartnerFromHost } from "@/lib/api/partner"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"
import { grantInitialFreeTierCredits } from "@/lib/stripe/workspace-credits"
import { prisma } from "@/lib/prisma"
import { getStripe, getConnectAccountId } from "@/lib/stripe"
import { env } from "@/lib/env"
import { assignDefaultIntegrationsToWorkspace } from "@/lib/workspace/setup"

// Generate a URL-friendly slug from a name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
}

// Check if a string is a valid UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * POST /api/auth/signup
 * 
 * This endpoint is called after Supabase auth signup to set up the user's account.
 * 
 * Three distinct flows:
 * 
 * 1. PLATFORM PARTNER SELF-SIGNUP (Business Owners on Genius365):
 *    - User signs up directly on the platform partner (genius365.ai)
 *    - Gets added as partner member (member role)
 *    - Gets a DEFAULT WORKSPACE created (they become owner)
 *    - Can select a plan (Free or Pro) during signup
 *    - Can then invite their team to their workspace
 * 
 * 2. WHITE-LABEL PLAN-BASED SIGNUP (Agency Customers):
 *    - User signs up on a white-label partner's domain with a plan parameter
 *    - The plan parameter is the plan ID from the agency's pricing page
 *    - Gets added as partner member (member role)
 *    - Gets their own workspace created with the plan's limits
 *    - Workspace is subscribed to the selected plan
 *    - If paid plan, redirect to Stripe checkout (via agency's Connect account)
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
      selectedPlan, // Can be slug (free, pro) for platform or plan ID (UUID) for white-label
      signupSource,
      isInvitation = false  // Flag to indicate if signup is from a team invitation
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
            selected_plan: selectedPlan || "free",
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
    let defaultWorkspace = null
    let workspaceRedirect: string | null = null
    let checkoutUrl: string | null = null

    // Determine the signup flow
    const isPlanBasedSignup = selectedPlan && !isInvitation
    const isWhiteLabelPlanSignup = isPlanBasedSignup && !partner.is_platform_partner && isUUID(selectedPlan)
    const isPlatformPlanSignup = isPlanBasedSignup && partner.is_platform_partner

    if (isWhiteLabelPlanSignup && prisma) {
      // =========================================================================
      // WHITE-LABEL PLAN-BASED SIGNUP
      // User selected a plan from the agency's pricing page
      // =========================================================================
      console.log(`[Signup] White-label plan-based signup for plan ID: ${selectedPlan}`)

      // Fetch the plan from the database
      const subscriptionPlan = await prisma.workspaceSubscriptionPlan.findFirst({
        where: {
          id: selectedPlan,
          partnerId: partner.id,
          isActive: true,
          isPublic: true,
        },
      })

      if (!subscriptionPlan) {
        console.error(`[Signup] Plan not found or not available: ${selectedPlan}`)
        return apiError("Selected plan is not available")
      }

      console.log(`[Signup] Found plan: ${subscriptionPlan.name} ($${subscriptionPlan.monthlyPriceCents / 100}/mo)`)

      // Create workspace with plan limits
      const workspaceName = `${firstName || email.split("@")[0]}'s Workspace`
      const workspaceSlug = generateSlug(workspaceName) + "-" + Date.now().toString(36)

      const { data: workspace, error: wsError } = await adminClient
        .from("workspaces")
        .insert({
          partner_id: partner.id,
          name: workspaceName,
          slug: workspaceSlug,
          description: `Workspace on ${subscriptionPlan.name} plan`,
          resource_limits: {
            max_users: 10,
            max_agents: subscriptionPlan.maxAgents || 999,
            max_minutes_per_month: subscriptionPlan.includedMinutes || 100,
          },
          status: "active",
        })
        .select()
        .single()

      if (wsError) {
        console.error("Failed to create workspace:", wsError)
        return serverError("Failed to create workspace")
      }

      defaultWorkspace = workspace

      // Add user as workspace owner
      await adminClient.from("workspace_members").insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: "owner",
        joined_at: new Date().toISOString(),
      })

      // Auto-assign default partner integrations
      const integrationResult = await assignDefaultIntegrationsToWorkspace(
        workspace.id,
        partner.id,
        userId
      )
      if (integrationResult.assignedCount > 0) {
        console.log(`[Signup] Assigned ${integrationResult.assignedCount} default integration(s) to workspace ${workspace.slug}`)
      }

      // Handle billing based on plan price
      if (subscriptionPlan.monthlyPriceCents === 0) {
        // FREE PLAN: Create subscription record, grant credits if configured
        await prisma.workspaceSubscription.create({
          data: {
            workspaceId: workspace.id,
            planId: subscriptionPlan.id,
            status: "active",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        })

        // Grant initial credits for free tier
        try {
          await grantInitialFreeTierCredits(workspace.id)
        } catch (creditsError) {
          console.error("Failed to grant free tier credits:", creditsError)
        }

        workspaceRedirect = `/w/${workspace.slug}/dashboard`
      } else {
        // PAID PLAN: Create Stripe checkout session
        checkoutUrl = await createAgencyPlanCheckoutSession(
          workspace.id,
          workspace.slug,
          partner.id,
          subscriptionPlan,
          email
        )

        if (!checkoutUrl) {
          // If checkout failed, still allow access but subscription will be incomplete
          workspaceRedirect = `/w/${workspace.slug}/dashboard`
        }
      }

    } else if (isPlatformPlanSignup) {
      // =========================================================================
      // PLATFORM PARTNER SELF-SIGNUP
      // User signed up on the main platform (genius365.ai)
      // =========================================================================
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
          // Auto-assign default partner integrations
          const integrationResult = await assignDefaultIntegrationsToWorkspace(
            workspace.id,
            partner.id,
            userId
          )
          if (integrationResult.assignedCount > 0) {
            console.log(`[Signup] Assigned ${integrationResult.assignedCount} default integration(s) to workspace ${workspace.slug}`)
          }

          workspaceRedirect = `/w/${workspace.slug}/dashboard`
        }

        // Handle platform plan-specific logic
        const planKey = selectedPlan?.toLowerCase() || "free"

        if (planKey === "free") {
          // Grant initial free tier credits
          try {
            await grantInitialFreeTierCredits(workspace.id)
          } catch (creditsError) {
            console.error("Failed to grant free tier credits:", creditsError)
          }
        } else if (planKey === "pro" || planKey === "starter" || planKey === "professional") {
          // Start Stripe checkout for paid plans
          const mappedPlanKey = planKey === "pro" ? "pro" : planKey
          try {
            checkoutUrl = await createPlatformPlanCheckoutSession(
              workspace.id,
              workspace.slug,
              partner.id,
              mappedPlanKey,
              email
            )
          } catch (checkoutError) {
            console.error("Failed to create checkout session:", checkoutError)
          }
        }
      }
    }

    // For team invitation signups, don't set a redirect - let the invitation flow handle it
    if (isInvitation) {
      workspaceRedirect = null
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
 * Create a Stripe Checkout session for a white-label agency's plan
 * Uses the agency's Stripe Connect account
 */
async function createAgencyPlanCheckoutSession(
  workspaceId: string,
  workspaceSlug: string,
  partnerId: string,
  subscriptionPlan: {
    id: string
    name: string
    stripePriceId: string | null
    monthlyPriceCents: number
  },
  userEmail: string
): Promise<string | null> {
  if (!prisma) {
    console.error("[Agency Checkout] Database not configured")
    return null
  }

  if (!subscriptionPlan.stripePriceId) {
    console.error(`[Agency Checkout] Plan "${subscriptionPlan.name}" has no Stripe price ID configured`)
    return null
  }

  // Get partner's Connect account
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { settings: true },
  })

  const connectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown> | null)

  if (!connectAccountId) {
    console.error(`[Agency Checkout] Partner ${partnerId} has no Stripe Connect account`)
    return null
  }

  console.log(`[Agency Checkout] Using Stripe Connect account: ${connectAccountId}`)

  const stripe = getStripe()

  // Create customer on the Connect account
  const customer = await stripe.customers.create(
    {
      email: userEmail,
      metadata: {
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        partner_id: partnerId,
      },
    },
    { stripeAccount: connectAccountId }
  )

  console.log(`[Agency Checkout] Created Stripe customer: ${customer.id}`)

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
  const successUrl = `${baseUrl}/login?subscription=success&workspace=${workspaceSlug}`
  const cancelUrl = `${baseUrl}/login?subscription=canceled&workspace=${workspaceSlug}`

  const session = await stripe.checkout.sessions.create(
    {
      customer: customer.id,
      mode: "subscription",
      payment_method_types: ["card"],
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
        },
      },
      metadata: {
        workspace_id: workspaceId,
        plan_id: subscriptionPlan.id,
        type: "workspace_subscription",
        partner_id: partnerId,
      },
    },
    { stripeAccount: connectAccountId }
  )

  console.log(`[Agency Checkout] Created checkout session ${session.id} for workspace ${workspaceId}, plan: ${subscriptionPlan.name}`)

  return session.url
}

/**
 * Create a Stripe Checkout session for a platform partner plan (Free/Pro)
 * Uses the main Stripe account
 */
async function createPlatformPlanCheckoutSession(
  workspaceId: string,
  workspaceSlug: string,
  partnerId: string,
  planKey: string,
  userEmail: string
): Promise<string | null> {
  if (!prisma) {
    console.error("[Platform Checkout] Database not configured")
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
    console.error(`[Platform Checkout] Unknown plan key: ${planKey}`)
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
    console.error(`[Platform Checkout] No subscription plan found for slug "${planSlug}" (partner: ${partnerId})`)
    return null
  }

  if (!subscriptionPlan.stripePriceId) {
    console.error(`[Platform Checkout] Plan "${subscriptionPlan.name}" has no Stripe price ID configured`)
    return null
  }

  console.log(`[Platform Checkout] Using main platform Stripe account`)

  const stripe = getStripe()

  // Create customer on the main account
  const customer = await stripe.customers.create({
    email: userEmail,
    metadata: {
      workspace_id: workspaceId,
      workspace_slug: workspaceSlug,
      partner_id: partnerId,
      is_platform_partner: "true",
    },
  })

  console.log(`[Platform Checkout] Created Stripe customer: ${customer.id}`)

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
  const successUrl = `${baseUrl}/login?subscription=success&workspace=${workspaceSlug}`
  const cancelUrl = `${baseUrl}/login?subscription=canceled&workspace=${workspaceSlug}`

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: "subscription",
    payment_method_types: ["card"],
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
        is_platform_partner: "true",
      },
    },
    metadata: {
      workspace_id: workspaceId,
      plan_id: subscriptionPlan.id,
      type: "workspace_subscription",
      partner_id: partnerId,
    },
  })

  console.log(`[Platform Checkout] Created checkout session ${session.id} for workspace ${workspaceId}, plan: ${subscriptionPlan.name}`)

  return session.url
}

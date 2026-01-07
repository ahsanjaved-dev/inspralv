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
 * Two distinct flows:
 * 
 * 1. SELF-SIGNUP (Business Owners):
 *    - User signs up directly on the platform
 *    - Gets added as partner member (member role)
 *    - Gets a DEFAULT WORKSPACE created (they become owner)
 *    - Can then invite their team to their workspace
 * 
 * 2. INVITATION-BASED (Team Members):
 *    - User signs up via an invitation link
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
      isInvitation = false  // NEW: Flag to indicate if signup is from an invitation
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

    // Step 5: Create a default workspace ONLY for self-signup users (NOT for invitations)
    let defaultWorkspace = null
    let workspaceRedirect: string | null = null

    // Only create default workspace if:
    // 1. This is the platform partner
    // 2. This is NOT an invitation-based signup
    if (partner.is_platform_partner && !isInvitation) {
      // For platform partner self-signup: create a personal workspace for the user
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
        // Continue - user can create workspace later
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
          // Direct redirect to the workspace dashboard
          workspaceRedirect = `/w/${workspace.slug}/dashboard`
        }
      }
    }

    // For invitation signups, don't set a redirect - let the invitation flow handle it
    if (isInvitation) {
      workspaceRedirect = null
    }

    // Step 6: Handle plan-specific logic
    let checkoutUrl: string | null = null

    if (defaultWorkspace && !isInvitation) {
      const planKey = selectedPlan?.toLowerCase() || "free"

      if (planKey === "free") {
        // Grant $10 free tier credits
        try {
          await grantInitialFreeTierCredits(defaultWorkspace.id)
        } catch (creditsError) {
          console.error("Failed to grant free tier credits:", creditsError)
          // Continue - user can still use workspace, just without initial credits
        }
      } else if (planKey === "starter" || planKey === "professional") {
        // Start Stripe checkout for paid plans
        try {
          checkoutUrl = await createPlanCheckoutSession(
            defaultWorkspace.id,
            defaultWorkspace.slug,
            partner.id,
            planKey,
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

  // Map marketing plan key to display name for matching
  const planNameMap: Record<string, string> = {
    starter: "Starter",
    professional: "Professional",
  }

  const planName = planNameMap[planKey]
  if (!planName) {
    console.error(`[Signup Checkout] Unknown plan key: ${planKey}`)
    return null
  }

  // Find the subscription plan in the database
  // Match by name (case-insensitive) for the partner
  const subscriptionPlan = await prisma.workspaceSubscriptionPlan.findFirst({
    where: {
      partnerId,
      isActive: true,
      isPublic: true,
      name: {
        equals: planName,
        mode: "insensitive",
      },
    },
  })

  if (!subscriptionPlan) {
    console.error(`[Signup Checkout] No subscription plan found for "${planName}" (partner: ${partnerId})`)
    return null
  }

  if (!subscriptionPlan.stripePriceId) {
    console.error(`[Signup Checkout] Plan "${planName}" has no Stripe price ID configured`)
    return null
  }

  // Get partner's Connect account
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { settings: true },
  })

  const connectAccountId = getConnectAccountId(partner?.settings as Record<string, unknown> | null)

  if (!connectAccountId) {
    console.error(`[Signup Checkout] Partner ${partnerId} has no Stripe Connect account`)
    return null
  }

  // Create or get Stripe customer on Connect account
  const stripe = getStripe()

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
  const successUrl = `${baseUrl}/w/${workspaceSlug}/dashboard?subscription=success`
  const cancelUrl = `${baseUrl}/w/${workspaceSlug}/billing?subscription=canceled`

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
          partner_id: partnerId,
        },
      },
      metadata: {
        workspace_id: workspaceId,
        plan_id: subscriptionPlan.id,
        type: "workspace_subscription",
      },
    },
    { stripeAccount: connectAccountId }
  )

  console.log(`[Signup Checkout] Created checkout session for workspace ${workspaceId}, plan: ${planName}`)

  return session.url
}

import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPartnerFromHost } from "@/lib/api/partner"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"

// Generate a URL-friendly slug from a name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, email, firstName, lastName, selectedPlan, signupSource } = body

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

    // Step 3: Get the partner from current hostname (platform partner for inspralv.com)
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

    // Step 5: Create a default workspace for the user (for platform partner)
    // For white-label partners, they may want to invite users to existing workspaces
    let defaultWorkspace = null
    let workspaceRedirect: string | null = null

    if (partner.is_platform_partner) {
      // For platform partner: create a personal workspace for the user
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

    return apiResponse({
      success: true,
      message: "User setup complete",
      partner: {
        id: partner.id,
        name: partner.name,
        is_platform_partner: partner.is_platform_partner,
      },
      user: {
        id: userId,
        email,
        selected_plan: selectedPlan || "starter",
        signup_source: signupSource || "direct",
      },
      workspace: defaultWorkspace
        ? {
            id: defaultWorkspace.id,
            name: defaultWorkspace.name,
            slug: defaultWorkspace.slug,
          }
        : null,
      redirect: workspaceRedirect,
    })
  } catch (error) {
    console.error("POST /api/auth/signup error:", error)
    return serverError()
  }
}

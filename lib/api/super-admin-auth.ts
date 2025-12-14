import { createClient } from "@/lib/supabase/server"
import type { SuperAdmin } from "@/types/database.types"

export interface SuperAdminContext {
  superAdmin: SuperAdmin
  supabase: Awaited<ReturnType<typeof createClient>>
}

export async function getSuperAdminContext(): Promise<SuperAdminContext | null> {
  try {
    const supabase = await createClient()

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      return null
    }

    // Check if user is super admin
    const { data: superAdmin, error: superAdminError } = await supabase
      .from("super_admin")
      .select("*")
      .eq("id", authUser.id)
      .single()

    if (superAdminError || !superAdmin) {
      return null
    }

    // Update last login
    await supabase
      .from("super_admin")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", authUser.id)

    return {
      superAdmin: superAdmin as SuperAdmin,
      supabase,
    }
  } catch (error) {
    console.error("[getSuperAdminContext] Error:", error)
    return null
  }
}

export function isSuperAdmin(context: SuperAdminContext | null): boolean {
  return context !== null
}

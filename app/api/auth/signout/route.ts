import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  await supabase.auth.signOut()

  // Redirect to login page after signout
  return NextResponse.redirect(new URL("/login", request.url))
}

import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Update request cookies so Supabase sees the latest values in this request lifecycle.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

          // Recreate the response after mutating request cookies.
          supabaseResponse = NextResponse.next({ request })

          /**
           * IMPORTANT: Prevent cookie bloat.
           * Supabase may chunk large auth cookies into `.0`, `.1`, ... parts. If the chunk count shrinks,
           * older chunk cookies can stick around and accumulate, eventually causing HTTP 431.
           *
           * We proactively delete any existing chunk cookies for the same base name that are not present
           * in the latest `cookiesToSet`.
           */
          const toSetNames = new Set(cookiesToSet.map((c) => c.name))
          const baseOptions = new Map<string, CookieOptions | undefined>()
          for (const c of cookiesToSet) {
            const base = c.name.replace(/\.\d+$/, "")
            if (!baseOptions.has(base)) baseOptions.set(base, c.options)
          }

          for (const existing of request.cookies.getAll()) {
            const existingBase = existing.name.replace(/\.\d+$/, "")
            if (baseOptions.has(existingBase) && !toSetNames.has(existing.name)) {
              supabaseResponse.cookies.set(existing.name, "", {
                ...(baseOptions.get(existingBase) || {}),
                maxAge: 0,
              })
            }
          }

          // Set the new cookies from Supabase
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabaseResponse, user }
}

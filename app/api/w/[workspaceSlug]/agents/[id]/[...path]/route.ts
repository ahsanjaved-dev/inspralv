import { NextRequest } from "next/server"
import { apiError } from "@/lib/api/helpers"

// NOTE:
// Some Next.js builds (observed in this repo) are not registering nested static
// route handler segments under a dynamic `[id]` API segment (e.g. `/agents/:id/test-call`).
// This catch-all route explicitly dispatches to the existing handler modules so
// the endpoints remain available.

import { POST as testCallPOST } from "../test-call/route"
import { POST as outboundCallPOST } from "../outbound-call/route"

interface RouteContext {
  params: Promise<{ workspaceSlug: string; id: string; path: string[] }>
}

function makeCtx(workspaceSlug: string, id: string): any {
  return {
    params: Promise.resolve({ workspaceSlug, id })
  }
}

export async function GET(_request: NextRequest, _context: RouteContext) {
  return apiError("Not found", 404)
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { workspaceSlug, id, path } = await params
  const segment = path?.[0]
  console.log(`[CatchAll] POST request for segment: ${segment}, path: ${JSON.stringify(path)}`)

  if (segment === "test-call") {
    console.log("[CatchAll] Routing to testCallPOST")
    return testCallPOST(request, makeCtx(workspaceSlug, id))
  }

  if (segment === "outbound-call") {
    return outboundCallPOST(request, makeCtx(workspaceSlug, id))
  }

  return apiError("Not found", 404)
}

export async function DELETE(_request: NextRequest, _context: RouteContext) {
  return apiError("Not found", 404)
}



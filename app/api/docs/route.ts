/**
 * GET /api/docs
 * Returns the OpenAPI specification document as JSON
 */

import { NextResponse } from "next/server"
import { openAPIDocument } from "@/lib/openapi"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(openAPIDocument, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}


/**
 * MFA API Routes
 * Handles MFA enrollment, challenge, verification, and unenrollment
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child({ module: "MFA-API" })

export const dynamic = "force-dynamic"

// GET: Get MFA status
export async function GET() {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    // Get AAL
    const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError) {
      log.error("Failed to get AAL", { error: aalError.message })
      return NextResponse.json({ error: aalError.message }, { status: 500 })
    }
    
    // Get factors
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError) {
      log.error("Failed to list factors", { error: factorsError.message })
      return NextResponse.json({ error: factorsError.message }, { status: 500 })
    }
    
    const allFactors = [
      ...(factorsData.totp || []),
      ...(factorsData.phone || []),
    ]
    
    const verifiedFactors = allFactors.filter(f => f.status === "verified")
    
    return NextResponse.json({
      enabled: verifiedFactors.length > 0,
      currentLevel: aalData.currentLevel,
      nextLevel: aalData.nextLevel,
      factors: allFactors,
      needsVerification: aalData.nextLevel === "aal2" && aalData.currentLevel === "aal1",
    })
  } catch (error) {
    log.error("Exception in GET /api/auth/mfa", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST: Enroll, Challenge, Verify, or Unenroll based on action
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const body = await request.json()
    const { action } = body
    
    switch (action) {
      case "enroll": {
        const { friendlyName } = body
        
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: friendlyName || "Authenticator App",
        })
        
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        
        log.info("TOTP enrollment started", { userId: user.id, factorId: data.id })
        
        return NextResponse.json({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri,
        })
      }
      
      case "challenge": {
        const { factorId } = body
        
        if (!factorId) {
          return NextResponse.json({ error: "factorId is required" }, { status: 400 })
        }
        
        const { data, error } = await supabase.auth.mfa.challenge({ factorId })
        
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        
        return NextResponse.json({
          challengeId: data.id,
        })
      }
      
      case "verify": {
        const { factorId, challengeId, code } = body
        
        if (!factorId || !challengeId || !code) {
          return NextResponse.json({ 
            error: "factorId, challengeId, and code are required" 
          }, { status: 400 })
        }
        
        const { error } = await supabase.auth.mfa.verify({
          factorId,
          challengeId,
          code,
        })
        
        if (error) {
          log.warn("MFA verification failed", { userId: user.id, error: error.message })
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        
        log.info("MFA verification successful", { userId: user.id, factorId })
        
        return NextResponse.json({ success: true })
      }
      
      case "unenroll": {
        const { factorId } = body
        
        if (!factorId) {
          return NextResponse.json({ error: "factorId is required" }, { status: 400 })
        }
        
        const { error } = await supabase.auth.mfa.unenroll({ factorId })
        
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        
        log.info("MFA factor unenrolled", { userId: user.id, factorId })
        
        return NextResponse.json({ success: true })
      }
      
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    log.error("Exception in POST /api/auth/mfa", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


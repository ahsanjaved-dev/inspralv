/**
 * Multi-Factor Authentication (MFA) Utilities
 * Phase 3.1: Security Hardening - MFA Implementation
 * 
 * Uses Supabase Auth MFA APIs for TOTP-based 2FA
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/logger"

const log = logger.child({ module: "MFA" })

// ============================================================================
// TYPES
// ============================================================================

export interface MFAFactor {
  id: string
  type: "totp" | "phone"
  friendly_name?: string
  status: "unverified" | "verified"
  created_at: string
  updated_at: string
}

export interface MFAEnrollmentResponse {
  success: boolean
  factorId?: string
  qrCode?: string
  secret?: string
  error?: string
}

export interface MFAChallengeResponse {
  success: boolean
  challengeId?: string
  error?: string
}

export interface MFAVerifyResponse {
  success: boolean
  error?: string
}

export interface MFAStatus {
  enabled: boolean
  currentLevel: "aal1" | "aal2"
  nextLevel: "aal1" | "aal2"
  factors: MFAFactor[]
}

// ============================================================================
// GET MFA STATUS
// ============================================================================

/**
 * Get the current MFA status for the authenticated user
 */
export async function getMFAStatus(): Promise<MFAStatus | null> {
  try {
    const supabase = await createClient()
    
    // Get AAL (Authenticator Assurance Level)
    const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    
    if (aalError) {
      log.error("Failed to get AAL", { error: aalError.message })
      return null
    }
    
    // Get enrolled factors
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()
    
    if (factorsError) {
      log.error("Failed to list MFA factors", { error: factorsError.message })
      return null
    }
    
    // Combine TOTP and phone factors
    const allFactors: MFAFactor[] = [
      ...(factorsData.totp || []).map(f => ({
        id: f.id,
        type: "totp" as const,
        friendly_name: f.friendly_name,
        status: f.status as "unverified" | "verified",
        created_at: f.created_at,
        updated_at: f.updated_at,
      })),
      ...(factorsData.phone || []).map(f => ({
        id: f.id,
        type: "phone" as const,
        friendly_name: f.friendly_name,
        status: f.status as "unverified" | "verified",
        created_at: f.created_at,
        updated_at: f.updated_at,
      })),
    ]
    
    const verifiedFactors = allFactors.filter(f => f.status === "verified")
    
    return {
      enabled: verifiedFactors.length > 0,
      currentLevel: aalData.currentLevel || "aal1",
      nextLevel: aalData.nextLevel || "aal1",
      factors: allFactors,
    }
  } catch (error) {
    log.error("Exception getting MFA status", { error })
    return null
  }
}

// ============================================================================
// ENROLLMENT
// ============================================================================

/**
 * Start TOTP factor enrollment
 * Returns a QR code and secret for the user to set up their authenticator app
 */
export async function enrollTOTP(friendlyName?: string): Promise<MFAEnrollmentResponse> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: friendlyName || "Authenticator App",
    })
    
    if (error) {
      log.error("TOTP enrollment failed", { error: error.message })
      return {
        success: false,
        error: error.message,
      }
    }
    
    log.info("TOTP enrollment started", { factorId: data.id })
    
    return {
      success: true,
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    }
  } catch (error) {
    log.error("Exception during TOTP enrollment", { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown enrollment error",
    }
  }
}

// ============================================================================
// CHALLENGE & VERIFY
// ============================================================================

/**
 * Create a challenge for a factor
 */
export async function createChallenge(factorId: string): Promise<MFAChallengeResponse> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase.auth.mfa.challenge({ factorId })
    
    if (error) {
      log.error("Challenge creation failed", { factorId, error: error.message })
      return {
        success: false,
        error: error.message,
      }
    }
    
    return {
      success: true,
      challengeId: data.id,
    }
  } catch (error) {
    log.error("Exception during challenge creation", { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown challenge error",
    }
  }
}

/**
 * Verify a challenge with a code from the authenticator app
 */
export async function verifyChallenge(
  factorId: string,
  challengeId: string,
  code: string
): Promise<MFAVerifyResponse> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    })
    
    if (error) {
      log.error("Challenge verification failed", { factorId, error: error.message })
      return {
        success: false,
        error: error.message,
      }
    }
    
    log.info("MFA challenge verified successfully", { factorId })
    
    return {
      success: true,
    }
  } catch (error) {
    log.error("Exception during challenge verification", { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown verification error",
    }
  }
}

// ============================================================================
// UNENROLL
// ============================================================================

/**
 * Unenroll (remove) an MFA factor
 */
export async function unenrollFactor(factorId: string): Promise<MFAVerifyResponse> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    
    if (error) {
      log.error("Factor unenrollment failed", { factorId, error: error.message })
      return {
        success: false,
        error: error.message,
      }
    }
    
    log.info("MFA factor unenrolled successfully", { factorId })
    
    return {
      success: true,
    }
  } catch (error) {
    log.error("Exception during factor unenrollment", { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown unenrollment error",
    }
  }
}

// ============================================================================
// AAL CHECK HELPER
// ============================================================================

/**
 * Check if user needs to verify MFA (upgrade from aal1 to aal2)
 */
export async function needsMFAVerification(): Promise<boolean> {
  const status = await getMFAStatus()
  if (!status) return false
  
  // User has MFA enrolled but current session is only aal1
  return status.nextLevel === "aal2" && status.currentLevel === "aal1"
}

/**
 * Check if user has verified MFA for the current session
 */
export async function hasVerifiedMFA(): Promise<boolean> {
  const status = await getMFAStatus()
  if (!status) return false
  
  return status.currentLevel === "aal2"
}


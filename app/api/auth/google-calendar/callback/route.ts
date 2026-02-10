/**
 * Google Calendar OAuth Callback
 * Handles the OAuth redirect from Google after user grants permission
 * Implements smart reactivation: when switching back to a previous account,
 * automatically reactivates calendar configs that were created with that account.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/integrations/calendar/encryption'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

/**
 * Fetch the authenticated user's email from Google
 */
async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      console.error('[GoogleCalendarCallback] Failed to fetch user info:', await response.text())
      return null
    }

    const userInfo = await response.json()
    return userInfo.email || null
  } catch (error) {
    console.error('[GoogleCalendarCallback] Error fetching user email:', error)
    return null
  }
}

/**
 * Handle smart reactivation when connecting Google account
 * Simple approach: 
 * 1. Deactivate ALL configs for this credential
 * 2. Reactivate ONLY configs that were created with the new email
 * 3. If configs have no email set, assume they belong to current account
 */
async function handleSmartReactivation(
  supabase: ReturnType<typeof createAdminClient>,
  partnerId: string,
  previousEmail: string | null,
  newEmail: string
): Promise<{ deactivatedCount: number; reactivatedCount: number; fixedNullCount: number }> {
  let deactivatedCount = 0
  let reactivatedCount = 0
  let fixedNullCount = 0

  // Get the credential ID for this partner
  const { data: credential } = await supabase
    .from('google_calendar_credentials')
    .select('id')
    .eq('partner_id', partnerId)
    .single()

  if (!credential) {
    return { deactivatedCount, reactivatedCount, fixedNullCount }
  }

  console.log('[GoogleCalendarCallback] Smart reactivation for:', {
    previousEmail,
    newEmail,
    credentialId: credential.id,
  })

  // Step 1: Fix any configs without created_with_email (assign to current email)
  const { data: fixedConfigs } = await supabase
    .from('agent_calendar_configs')
    .update({
      created_with_email: newEmail,
      updated_at: new Date().toISOString(),
    })
    .eq('google_credential_id', credential.id)
    .is('created_with_email', null)
    .select('id')

  fixedNullCount = fixedConfigs?.length || 0
  if (fixedNullCount > 0) {
    console.log(`[GoogleCalendarCallback] Fixed ${fixedNullCount} configs without email, assigned to ${newEmail}`)
  }

  // Step 2: Deactivate ALL configs for this credential
  const { data: deactivated, error: deactivateError } = await supabase
    .from('agent_calendar_configs')
    .update({ 
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('google_credential_id', credential.id)
    .eq('is_active', true)
    .select('id, created_with_email')

  if (deactivateError) {
    console.error('[GoogleCalendarCallback] Error deactivating configs:', deactivateError)
  } else {
    deactivatedCount = deactivated?.length || 0
    console.log(`[GoogleCalendarCallback] Deactivated ${deactivatedCount} configs:`, {
      emails: [...new Set(deactivated?.map(d => d.created_with_email) || [])]
    })
  }

  // Step 3: Reactivate ONLY configs created with the new email
  const { data: reactivated, error: reactivateError } = await supabase
    .from('agent_calendar_configs')
    .update({ 
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('google_credential_id', credential.id)
    .eq('is_active', false)
    .ilike('created_with_email', newEmail) // Case-insensitive match
    .select('id, created_with_email')

  if (reactivateError) {
    console.error('[GoogleCalendarCallback] Error reactivating configs:', reactivateError)
  } else {
    reactivatedCount = reactivated?.length || 0
    console.log(`[GoogleCalendarCallback] Reactivated ${reactivatedCount} configs for ${newEmail}`)
  }

  // Final state check
  const { data: finalState } = await supabase
    .from('agent_calendar_configs')
    .select('id, is_active, created_with_email')
    .eq('google_credential_id', credential.id)

  const activeCount = finalState?.filter(c => c.is_active).length || 0
  const inactiveCount = finalState?.filter(c => !c.is_active).length || 0

  console.log('[GoogleCalendarCallback] Final state:', {
    total: finalState?.length || 0,
    active: activeCount,
    inactive: inactiveCount,
    byEmail: finalState?.reduce((acc, c) => {
      const email = c.created_with_email || 'null'
      acc[email] = (acc[email] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  })

  return { deactivatedCount, reactivatedCount, fixedNullCount }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle errors from Google
  if (error) {
    console.error('[GoogleCalendarCallback] OAuth error:', error)
    return NextResponse.redirect(
      new URL(`/org/integrations?error=${encodeURIComponent(error)}`, request.url)
    )
  }

  // Validate required params
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/org/integrations?error=missing_params', request.url)
    )
  }

  try {
    // Parse state (contains partner_id and integration_id)
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    const { partner_id, integration_id } = stateData

    if (!partner_id || !integration_id) {
      throw new Error('Invalid state data')
    }

    // Get the integration to retrieve client_id and client_secret
    const supabase = createAdminClient()
    const { data: integration, error: fetchError } = await supabase
      .from('partner_integrations')
      .select('api_keys, config')
      .eq('id', integration_id)
      .eq('partner_id', partner_id)
      .single()

    if (fetchError || !integration) {
      throw new Error('Integration not found')
    }

    // Credentials stored in api_keys JSON field or config
    const apiKeys = integration.api_keys as any
    const config = integration.config as any
    const clientId = apiKeys?.default_public_key || config?.client_id
    const clientSecret = apiKeys?.default_secret_key || config?.client_secret

    if (!clientId || !clientSecret) {
      throw new Error('OAuth credentials not configured')
    }

    // Get the redirect URI (must match what was used in the auth request)
    const redirectUri = `${request.nextUrl.origin}/api/auth/google-calendar/callback`

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('[GoogleCalendarCallback] Token exchange failed:', errorData)
      throw new Error(errorData.error_description || 'Token exchange failed')
    }

    const tokens = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokens

    if (!refresh_token) {
      console.warn('[GoogleCalendarCallback] No refresh token received - user may have already granted access')
    }

    // Fetch the Google user's email
    const googleEmail = await fetchGoogleUserEmail(access_token)
    console.log('[GoogleCalendarCallback] Authenticated user email:', googleEmail)

    // Get the previous email from existing credentials (if any)
    const { data: existingCredential } = await supabase
      .from('google_calendar_credentials')
      .select('google_email')
      .eq('partner_id', partner_id)
      .single()

    const previousEmail = existingCredential?.google_email || null

    // Handle smart reactivation if we have the new email
    let reactivationResult = { deactivatedCount: 0, reactivatedCount: 0, fixedNullCount: 0 }
    if (googleEmail) {
      reactivationResult = await handleSmartReactivation(
        supabase,
        partner_id,
        previousEmail,
        googleEmail
      )
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (expires_in * 1000))

    // Encrypt sensitive tokens before storing
    const encryptedAccessToken = encrypt(access_token)
    const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null
    const encryptedClientSecret = encrypt(clientSecret)

    // Store or update the credentials in google_calendar_credentials table
    const { error: upsertError } = await supabase
      .from('google_calendar_credentials')
      .upsert({
        partner_id,
        client_id: clientId,
        client_secret: encryptedClientSecret,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expiry: expiresAt.toISOString(),
        google_email: googleEmail, // Store the authenticated email
        scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'],
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'partner_id',
      })

    if (upsertError) {
      console.error('[GoogleCalendarCallback] Failed to save credentials:', upsertError)
      throw new Error('Failed to save credentials')
    }

    // Build success URL with reactivation info if applicable
    let successUrl = '/org/integrations?success=google_calendar_connected'
    if (reactivationResult.reactivatedCount > 0) {
      successUrl += `&reactivated=${reactivationResult.reactivatedCount}`
    }
    if (reactivationResult.deactivatedCount > 0) {
      successUrl += `&deactivated=${reactivationResult.deactivatedCount}`
    }
    console.log('[GoogleCalendarCallback] Redirecting with results:', reactivationResult)

    // Redirect back to integrations page with success
    return NextResponse.redirect(new URL(successUrl, request.url))

  } catch (error) {
    console.error('[GoogleCalendarCallback] Error:', error)
    return NextResponse.redirect(
      new URL(`/org/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`, request.url)
    )
  }
}

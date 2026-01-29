/**
 * Google Calendar OAuth Callback
 * Handles the OAuth redirect from Google after user grants permission
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/integrations/calendar/encryption'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

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
        scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'partner_id',
      })

    if (upsertError) {
      console.error('[GoogleCalendarCallback] Failed to save credentials:', upsertError)
      throw new Error('Failed to save credentials')
    }

    // Redirect back to integrations page with success
    return NextResponse.redirect(
      new URL('/org/integrations?success=google_calendar_connected', request.url)
    )

  } catch (error) {
    console.error('[GoogleCalendarCallback] Error:', error)
    return NextResponse.redirect(
      new URL(`/org/integrations?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`, request.url)
    )
  }
}


/**
 * Google Calendar OAuth Authorization
 * Initiates the OAuth flow by redirecting to Google's consent screen
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPartnerAuthContext } from '@/lib/api/auth'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

// Scopes required for calendar operations and user identification
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email', // Required to fetch user's email for account identification
].join(' ')

export async function GET(request: NextRequest) {
  try {
    // Get the authenticated partner
    const authContext = await getPartnerAuthContext()
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const partnerId = authContext.partner?.id

    console.log('[GoogleCalendarAuthorize] Auth context:', { 
      partnerId, 
      hasPartner: !!authContext.partner,
    })

    if (!partnerId) {
      return NextResponse.json(
        { error: 'Partner ID not found in auth context' },
        { status: 401 }
      )
    }

    // Get the Google Calendar integration for this partner
    const supabase = createAdminClient()
    
    // First, let's see ALL integrations for this partner to debug
    const { data: allIntegrations } = await supabase
      .from('partner_integrations')
      .select('id, provider, is_active, api_keys, config')
      .eq('partner_id', partnerId)
    
    console.log('[GoogleCalendarAuthorize] All integrations for partner:', JSON.stringify(allIntegrations, null, 2))

    const { data: integration, error: fetchError } = await supabase
      .from('partner_integrations')
      .select('id, api_keys, config')
      .eq('partner_id', partnerId)
      .eq('provider', 'google_calendar')
      .eq('is_active', true)
      .single()

    console.log('[GoogleCalendarAuthorize] Google Calendar integration:', integration, 'Error:', fetchError)

    if (fetchError || !integration) {
      return NextResponse.json(
        { error: 'Google Calendar integration not configured. Please add credentials in Organization > Integrations.' },
        { status: 400 }
      )
    }

    // Client ID can be in api_keys.default_public_key or config.client_id
    const apiKeys = integration.api_keys as any
    const config = integration.config as any
    const clientId = apiKeys?.default_public_key || config?.client_id

    if (!clientId) {
      return NextResponse.json(
        { error: 'Google Client ID not configured' },
        { status: 400 }
      )
    }

    // Build the redirect URI
    const redirectUri = `${request.nextUrl.origin}/api/auth/google-calendar/callback`

    // Create state parameter (for security and to pass data through the flow)
    const state = Buffer.from(JSON.stringify({
      partner_id: partnerId,
      integration_id: integration.id,
    })).toString('base64')

    // Build the Google OAuth URL
    const authUrl = new URL(GOOGLE_AUTH_URL)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('access_type', 'offline') // Request refresh token
    authUrl.searchParams.set('prompt', 'consent') // Force consent to get refresh token
    authUrl.searchParams.set('state', state)

    // Redirect to Google's OAuth consent screen
    return NextResponse.redirect(authUrl.toString())

  } catch (error) {
    console.error('[GoogleCalendarAuthorize] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Authorization failed' },
      { status: 500 }
    )
  }
}


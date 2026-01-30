/**
 * Google Credentials Management API (Organization Level)
 * GET: List Google credentials
 * POST: Add new Google credential
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPartnerAuthContext, isPartnerAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt, decrypt, listCalendars, refreshAccessToken, GOOGLE_CALENDAR_SCOPES } from '@/lib/integrations/calendar'

// =============================================================================
// GET - List Google credentials for partner
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()

    if (!auth?.partner?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permission - only partner admins can manage credentials
    if (!isPartnerAdmin(auth)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const supabase = createAdminClient()

    const { data: credentials, error } = await supabase
      .from('google_calendar_credentials')
      .select(`
        id,
        client_id,
        scopes,
        is_active,
        last_used_at,
        last_error,
        created_at,
        updated_at
      `)
      .eq('partner_id', auth.partner.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GoogleCredentialsAPI] List error:', error)
      return NextResponse.json({ error: 'Failed to get credentials' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: credentials || [],
    })
  } catch (error) {
    console.error('[GoogleCredentialsAPI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// POST - Add new Google credential
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()

    if (!auth?.partner?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permission - only partner admins can add credentials
    if (!isPartnerAdmin(auth)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await request.json()
    const { client_id, client_secret, refresh_token } = body

    // Validate required fields
    if (!client_id || !client_secret || !refresh_token) {
      return NextResponse.json(
        { error: 'Missing required fields: client_id, client_secret, refresh_token' },
        { status: 400 }
      )
    }

    // Validate the credentials by trying to get an access token
    const tokenResult = await refreshAccessToken(client_id, client_secret, refresh_token)

    if (!tokenResult.success || !tokenResult.data) {
      return NextResponse.json(
        { error: `Invalid credentials: ${tokenResult.error}` },
        { status: 400 }
      )
    }

    // Validate we can list calendars
    const calendarsResult = await listCalendars(tokenResult.data.access_token)

    if (!calendarsResult.success) {
      return NextResponse.json(
        { error: `Failed to access calendars: ${calendarsResult.error}` },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Check if credential with same client_id already exists
    const { data: existing } = await supabase
      .from('google_calendar_credentials')
      .select('id')
      .eq('partner_id', auth.partner.id)
      .eq('client_id', client_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A credential with this client ID already exists' },
        { status: 400 }
      )
    }

    // Store credentials (encrypted)
    const credentialData = {
      partner_id: auth.partner.id,
      client_id,
      client_secret: encrypt(client_secret),
      refresh_token: encrypt(refresh_token),
      access_token: encrypt(tokenResult.data.access_token),
      token_expiry: new Date(Date.now() + tokenResult.data.expires_in * 1000).toISOString(),
      scopes: GOOGLE_CALENDAR_SCOPES,
      is_active: true,
      created_by: auth.user.id,
    }

    const { data: credential, error: insertError } = await supabase
      .from('google_calendar_credentials')
      .insert(credentialData)
      .select(`
        id,
        client_id,
        scopes,
        is_active,
        created_at
      `)
      .single()

    if (insertError) {
      console.error('[GoogleCredentialsAPI] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save credential' }, { status: 500 })
    }

    // Also return available calendars
    return NextResponse.json({
      success: true,
      data: credential,
      calendars: calendarsResult.data?.items || [],
    })
  } catch (error) {
    console.error('[GoogleCredentialsAPI] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


/**
 * Single Google Credential API
 * GET: Get credential details with available calendars
 * PATCH: Update credential
 * DELETE: Delete credential
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPartnerAuthContext, isPartnerAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  encrypt,
  decrypt,
  listCalendars,
  getValidAccessToken,
  refreshAccessToken,
} from '@/lib/integrations/calendar'
import type { GoogleCalendarCredential } from '@/lib/integrations/calendar'

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

// =============================================================================
// GET - Get credential details with available calendars
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const auth = await getPartnerAuthContext()

    if (!auth?.partner?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isPartnerAdmin(auth)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const supabase = createAdminClient()

    const { data: credential, error } = await supabase
      .from('google_calendar_credentials')
      .select('*')
      .eq('id', id)
      .eq('partner_id', auth.partner.id)
      .single()

    if (error || !credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    // Try to get available calendars
    let calendars: unknown[] = []
    let calendarError: string | null = null

    try {
      const tokenResult = await getValidAccessToken(
        credential as GoogleCalendarCredential,
        async (newToken, expiry) => {
          await supabase
            .from('google_calendar_credentials')
            .update({
              access_token: newToken,
              token_expiry: expiry.toISOString(),
              last_used_at: new Date().toISOString(),
            })
            .eq('id', id)
        }
      )

      if (tokenResult.success && tokenResult.data) {
        const calendarsResult = await listCalendars(tokenResult.data)
        if (calendarsResult.success) {
          calendars = calendarsResult.data?.items || []
        } else {
          calendarError = calendarsResult.error || 'Failed to fetch calendars'
        }
      } else {
        calendarError = tokenResult.error || 'Failed to get access token'
      }
    } catch (err) {
      calendarError = 'Error connecting to Google Calendar'
    }

    // Don't return sensitive fields
    const { client_secret, refresh_token, access_token, ...safeCredential } = credential

    return NextResponse.json({
      success: true,
      data: {
        ...safeCredential,
        calendars,
        calendarError,
      },
    })
  } catch (error) {
    console.error('[GoogleCredentialAPI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// PATCH - Update credential
// =============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const auth = await getPartnerAuthContext()

    if (!auth?.partner?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isPartnerAdmin(auth)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await request.json()
    const { client_id, client_secret, refresh_token, is_active } = body

    const supabase = createAdminClient()

    // Verify credential exists and belongs to partner
    const { data: existing, error: findError } = await supabase
      .from('google_calendar_credentials')
      .select('*')
      .eq('id', id)
      .eq('partner_id', auth.partner.id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (is_active !== undefined) updateData.is_active = is_active
    if (client_id !== undefined) updateData.client_id = client_id

    // If sensitive fields are updated, validate and encrypt
    if (client_secret || refresh_token) {
      const actualClientId = client_id || existing.client_id
      const actualClientSecret = client_secret || decrypt(existing.client_secret)
      const actualRefreshToken = refresh_token || decrypt(existing.refresh_token)

      // Validate new credentials
      const tokenResult = await refreshAccessToken(
        actualClientId,
        actualClientSecret,
        actualRefreshToken
      )

      if (!tokenResult.success || !tokenResult.data) {
        return NextResponse.json(
          { error: `Invalid credentials: ${tokenResult.error}` },
          { status: 400 }
        )
      }

      if (client_secret) updateData.client_secret = encrypt(client_secret)
      if (refresh_token) updateData.refresh_token = encrypt(refresh_token)
      updateData.access_token = encrypt(tokenResult.data.access_token)
      updateData.token_expiry = new Date(Date.now() + tokenResult.data.expires_in * 1000).toISOString()
      updateData.last_error = null
    }

    const { data: updated, error: updateError } = await supabase
      .from('google_calendar_credentials')
      .update(updateData)
      .eq('id', id)
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
      .single()

    if (updateError) {
      console.error('[GoogleCredentialAPI] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update credential' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: updated,
    })
  } catch (error) {
    console.error('[GoogleCredentialAPI] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Delete credential
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const auth = await getPartnerAuthContext()

    if (!auth?.partner?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isPartnerAdmin(auth)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // Check if any agent calendars are using this credential
    const { data: usageCount } = await supabase
      .from('agent_calendar_configs')
      .select('id', { count: 'exact' })
      .eq('google_credential_id', id)

    if (usageCount && usageCount.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${usageCount.length} agent(s) are using this credential` },
        { status: 400 }
      )
    }

    const { error: deleteError } = await supabase
      .from('google_calendar_credentials')
      .delete()
      .eq('id', id)
      .eq('partner_id', auth.partner.id)

    if (deleteError) {
      console.error('[GoogleCredentialAPI] Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[GoogleCredentialAPI] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


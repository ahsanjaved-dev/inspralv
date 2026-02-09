/**
 * Google Credentials Status API
 * GET: Returns the current Google Calendar authentication status
 * including connected email and affected agents
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPartnerAuthContext, isPartnerAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export interface GoogleCredentialsStatus {
  isConnected: boolean
  googleEmail: string | null
  credentialId: string | null
  lastUsedAt: string | null
  tokenExpiry: string | null
  affectedAgents: Array<{
    id: string
    name: string
    workspaceId: string
    workspaceName: string
    calendarId: string
    calendarName: string | null
    isActive: boolean
    createdWithEmail: string | null
  }>
  affectedAgentsCount: number
  activeAgentsCount: number
  inactiveAgentsCount: number
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()

    if (!auth?.partner?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permission - only partner admins can view credentials status
    if (!isPartnerAdmin(auth)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // Get the Google Calendar credentials for this partner
    const { data: credential, error: credError } = await supabase
      .from('google_calendar_credentials')
      .select(`
        id,
        google_email,
        last_used_at,
        token_expiry,
        is_active
      `)
      .eq('partner_id', auth.partner.id)
      .single()

    // If no credentials found, return not connected status
    if (credError || !credential) {
      const status: GoogleCredentialsStatus = {
        isConnected: false,
        googleEmail: null,
        credentialId: null,
        lastUsedAt: null,
        tokenExpiry: null,
        affectedAgents: [],
        affectedAgentsCount: 0,
        activeAgentsCount: 0,
        inactiveAgentsCount: 0,
      }
      return NextResponse.json({ success: true, data: status })
    }

    // Get all agent calendar configs that use this credential
    // Join with agents and workspaces to get names
    const { data: calendarConfigs, error: configError } = await supabase
      .from('agent_calendar_configs')
      .select(`
        id,
        calendar_id,
        calendar_name,
        is_active,
        created_with_email,
        agent:ai_agents!agent_id (
          id,
          name,
          workspace:workspaces!workspace_id (
            id,
            name
          )
        )
      `)
      .eq('google_credential_id', credential.id)

    if (configError) {
      console.error('[GoogleCredentialsStatus] Error fetching configs:', configError)
      return NextResponse.json({ error: 'Failed to fetch calendar configs' }, { status: 500 })
    }

    // Transform the data
    const affectedAgents = (calendarConfigs || [])
      .filter(config => config.agent) // Only include configs with valid agents
      .map(config => {
        const agent = config.agent as any
        const workspace = agent?.workspace as any
        return {
          id: agent?.id || '',
          name: agent?.name || 'Unknown Agent',
          workspaceId: workspace?.id || '',
          workspaceName: workspace?.name || 'Unknown Workspace',
          calendarId: config.calendar_id,
          calendarName: config.calendar_name,
          isActive: config.is_active,
          createdWithEmail: config.created_with_email,
        }
      })

    const activeAgentsCount = affectedAgents.filter(a => a.isActive).length
    const inactiveAgentsCount = affectedAgents.filter(a => !a.isActive).length

    const status: GoogleCredentialsStatus = {
      isConnected: credential.is_active,
      googleEmail: credential.google_email,
      credentialId: credential.id,
      lastUsedAt: credential.last_used_at,
      tokenExpiry: credential.token_expiry,
      affectedAgents,
      affectedAgentsCount: affectedAgents.length,
      activeAgentsCount,
      inactiveAgentsCount,
    }

    return NextResponse.json({ success: true, data: status })

  } catch (error) {
    console.error('[GoogleCredentialsStatus] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


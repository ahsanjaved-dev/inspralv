-- =============================================================================
-- VAPI CALENDAR INTEGRATION MIGRATION
-- =============================================================================
-- This migration adds tables for Google Calendar integration with VAPI agents:
-- 1. google_calendar_credentials - Org-level Google OAuth credentials
-- 2. agent_calendar_configs - Per-agent calendar configuration
-- 3. appointments - Appointment records
-- =============================================================================

-- Create appointment status enum
CREATE TYPE appointment_status AS ENUM ('scheduled', 'cancelled', 'rescheduled', 'completed', 'no_show');

-- Create appointment type enum
CREATE TYPE appointment_type AS ENUM ('book', 'reschedule', 'cancel');

-- =============================================================================
-- GOOGLE CALENDAR CREDENTIALS (Organization Level)
-- =============================================================================

CREATE TABLE IF NOT EXISTS google_calendar_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    
    -- OAuth Credentials (encrypted in application layer)
    client_id VARCHAR(255) NOT NULL,
    client_secret TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    token_expiry TIMESTAMPTZ,
    
    -- Scopes granted
    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    last_error TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE (partner_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_calendar_credentials_partner_id ON google_calendar_credentials(partner_id);

-- =============================================================================
-- AGENT CALENDAR CONFIGURATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_calendar_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL UNIQUE REFERENCES ai_agents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    
    -- Google Calendar Settings
    google_credential_id UUID NOT NULL REFERENCES google_calendar_credentials(id) ON DELETE CASCADE,
    calendar_id VARCHAR(255) NOT NULL,
    
    -- Timezone (REQUIRED - IANA format)
    timezone VARCHAR(100) NOT NULL,
    
    -- Slot Configuration
    slot_duration_minutes INTEGER DEFAULT 30,
    buffer_between_slots_minutes INTEGER DEFAULT 0,
    
    -- Availability Windows
    preferred_days TEXT[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    preferred_hours_start VARCHAR(5) DEFAULT '09:00',
    preferred_hours_end VARCHAR(5) DEFAULT '17:00',
    
    -- Booking Rules
    min_notice_hours INTEGER DEFAULT 24,
    max_advance_days INTEGER DEFAULT 30,
    
    -- Legacy Reminder Settings (kept for backwards compatibility)
    send_24h_reminder BOOLEAN DEFAULT true,
    send_1h_reminder BOOLEAN DEFAULT true,
    reminder_email_template TEXT,
    
    -- New Email Notification Settings
    enable_owner_email BOOLEAN DEFAULT false,
    owner_email VARCHAR(255),
    
    -- New Dynamic Reminder Settings
    enable_reminders BOOLEAN DEFAULT false,
    reminders JSONB DEFAULT '[]'::JSONB,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_calendar_configs_agent_id ON agent_calendar_configs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_calendar_configs_workspace_id ON agent_calendar_configs(workspace_id);

-- =============================================================================
-- APPOINTMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    calendar_config_id UUID NOT NULL REFERENCES agent_calendar_configs(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    -- Google Calendar Reference
    google_event_id VARCHAR(255),
    calendar_id VARCHAR(255) NOT NULL,
    
    -- Attendee Information
    attendee_name VARCHAR(255) NOT NULL,
    attendee_email VARCHAR(255) NOT NULL,
    attendee_phone VARCHAR(50),
    
    -- Appointment Details
    appointment_type appointment_type NOT NULL,
    status appointment_status DEFAULT 'scheduled',
    
    -- Timing (stored in UTC)
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(100) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    
    -- Rescheduling History
    original_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    rescheduled_from TIMESTAMPTZ,
    rescheduled_to TIMESTAMPTZ,
    
    -- Cancellation Info
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    
    -- Reminder Tracking
    reminder_24h_sent BOOLEAN DEFAULT false,
    reminder_24h_sent_at TIMESTAMPTZ,
    reminder_1h_sent BOOLEAN DEFAULT false,
    reminder_1h_sent_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    extracted_from_transcript BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_agent_id ON appointments(agent_id);
CREATE INDEX IF NOT EXISTS idx_appointments_workspace_id ON appointments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_appointments_attendee_email ON appointments(attendee_email);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_start ON appointments(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id ON appointments(google_event_id);
CREATE INDEX IF NOT EXISTS idx_appointments_calendar_config_id ON appointments(calendar_config_id);

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================

-- Trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_google_calendar_credentials_updated_at ON google_calendar_credentials;
CREATE TRIGGER update_google_calendar_credentials_updated_at
    BEFORE UPDATE ON google_calendar_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_calendar_configs_updated_at ON agent_calendar_configs;
CREATE TRIGGER update_agent_calendar_configs_updated_at
    BEFORE UPDATE ON agent_calendar_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS
ALTER TABLE google_calendar_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_calendar_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow service role full access
CREATE POLICY "Service role has full access to google_calendar_credentials"
    ON google_calendar_credentials FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to agent_calendar_configs"
    ON agent_calendar_configs FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to appointments"
    ON appointments FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE google_calendar_credentials IS 'Stores Google Calendar OAuth credentials at the organization (partner) level';
COMMENT ON TABLE agent_calendar_configs IS 'Per-agent calendar configuration including timezone, slot settings, and availability';
COMMENT ON TABLE appointments IS 'Appointment records created through VAPI voice agents';

COMMENT ON COLUMN google_calendar_credentials.client_secret IS 'Encrypted Google OAuth client secret';
COMMENT ON COLUMN google_calendar_credentials.refresh_token IS 'Encrypted Google OAuth refresh token';
COMMENT ON COLUMN google_calendar_credentials.access_token IS 'Encrypted Google OAuth access token (short-lived)';

COMMENT ON COLUMN agent_calendar_configs.timezone IS 'IANA timezone identifier (e.g., America/New_York)';
COMMENT ON COLUMN agent_calendar_configs.preferred_days IS 'Days of week when appointments can be booked';
COMMENT ON COLUMN agent_calendar_configs.slot_duration_minutes IS 'Duration of each appointment slot in minutes';
COMMENT ON COLUMN agent_calendar_configs.enable_owner_email IS 'Whether to send email notifications to the agent owner';
COMMENT ON COLUMN agent_calendar_configs.owner_email IS 'Email address of the agent owner for notifications';
COMMENT ON COLUMN agent_calendar_configs.enable_reminders IS 'Whether to send appointment reminders via Google Calendar';
COMMENT ON COLUMN agent_calendar_configs.reminders IS 'JSON array of reminder settings [{id, value, unit}]';

COMMENT ON COLUMN appointments.scheduled_start IS 'Appointment start time in UTC';
COMMENT ON COLUMN appointments.scheduled_end IS 'Appointment end time in UTC';
COMMENT ON COLUMN appointments.timezone IS 'Original timezone of the appointment for display purposes';

-- =============================================================================
-- MIGRATION FOR EXISTING DATABASES
-- =============================================================================
-- If agent_calendar_configs table already exists, add new columns

DO $$
BEGIN
    -- Add enable_owner_email column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_calendar_configs' AND column_name = 'enable_owner_email'
    ) THEN
        ALTER TABLE agent_calendar_configs ADD COLUMN enable_owner_email BOOLEAN DEFAULT false;
    END IF;
    
    -- Add owner_email column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_calendar_configs' AND column_name = 'owner_email'
    ) THEN
        ALTER TABLE agent_calendar_configs ADD COLUMN owner_email VARCHAR(255);
    END IF;
    
    -- Add enable_reminders column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_calendar_configs' AND column_name = 'enable_reminders'
    ) THEN
        ALTER TABLE agent_calendar_configs ADD COLUMN enable_reminders BOOLEAN DEFAULT false;
    END IF;
    
    -- Add reminders column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_calendar_configs' AND column_name = 'reminders'
    ) THEN
        ALTER TABLE agent_calendar_configs ADD COLUMN reminders JSONB DEFAULT '[]'::JSONB;
    END IF;
END $$;


# Genius365 Campaign Module - Complete Technical Reference

> **LLM-Friendly Documentation** - This document provides a comprehensive reference for the Campaign Module in Genius365. It covers architecture, data models, API endpoints, frontend components, hooks, and integration flows.

> **Last Updated:** January 15, 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Database Schema](#3-database-schema)
4. [API Routes Reference](#4-api-routes-reference)
5. [Frontend Pages](#5-frontend-pages)
6. [Components Reference](#6-components-reference)
7. [Hooks & State Management](#7-hooks--state-management)
8. [Provider Integrations](#8-provider-integrations)
9. [Campaign Lifecycle](#9-campaign-lifecycle)
10. [Draft System](#10-draft-system)
11. [Business Logic](#11-business-logic)
12. [Stale Call Cleanup](#12-stale-call-cleanup)
13. [Error Handling](#13-error-handling)
14. [File Reference Map](#14-file-reference-map)

---

## 1. Executive Summary

The **Campaign Module** is Genius365's outbound calling campaign management system. It enables users to:

- Create AI-powered voice campaigns
- Import recipient lists via CSV
- Schedule campaigns with business hours
- Execute calls through **VAPI** (direct integration)
- Monitor campaign progress in real-time
- Handle retries and call outcomes

### Key Features

| Feature | Description |
|---------|-------------|
| VAPI Provider | Direct VAPI integration for outbound calls |
| CSV Import | Up to 10,000 recipients per campaign |
| Business Hours | Configurable daily schedules with timezone support |
| Auto-save Drafts | Wizard progress saved automatically via sessionStorage + DB |
| Concurrency Control | Configurable parallel call limits |
| Retry Logic | Automatic retry with configurable attempts |
| Real-time Status | Live campaign and recipient status updates via Supabase Realtime |
| Stale Call Cleanup | Automatic detection and cleanup of orphaned calls |

---

## 2. Architecture Overview

### 2.1 High-Level Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│   API Routes    │────▶│      VAPI       │
│  (React/Next)   │     │  (Next.js API)  │     │   (Provider)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React Query   │     │    Supabase     │     │   Webhooks      │
│   + Realtime    │     │   (Database)    │     │  (Callbacks)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 2.2 Campaign Flow

```
[Create] → [Draft] → [Ready] → [Active] → [Completed/Cancelled]
    │          │         │         │
    │          │         │         └── Calling recipients
    │          │         └── Awaiting start
    │          └── Wizard in progress
    └── Initial creation
```

### 2.3 Provider Architecture (VAPI-Only)

```typescript
// File: lib/integrations/campaign-provider.ts

// Campaigns now use VAPI directly for outbound calls
// Inspra integration has been deprecated

export async function startCampaignBatch(
  campaign: CampaignData,
  recipients: RecipientData[],
  vapiConfig?: { apiKey: string; phoneNumberId: string },
  options?: { startNow?: boolean }
): Promise<CampaignBatchResult> {
  // 1. Validate VAPI configuration
  if (!vapiConfig?.apiKey || !vapiConfig?.phoneNumberId) {
    return { success: false, provider: "vapi", error: "VAPI config required" }
  }
  
  // 2. Start batch via VAPI batch-calls module
  const result = await startVapiBatch(config, callItems)
  
  return {
    success: result.success,
    provider: "vapi",
    batchRef: result.batchRef,
    vapiResults: result,
  }
}
```

---

## 3. Database Schema

### 3.1 call_campaigns Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `workspace_id` | uuid | FK to workspaces |
| `agent_id` | uuid | FK to ai_agents |
| `created_by` | uuid | FK to users |
| `name` | text | Campaign name |
| `description` | text | Optional description |
| `status` | enum | draft, ready, scheduled, active, paused, completed, cancelled |
| `schedule_type` | enum | immediate, scheduled |
| `scheduled_start_at` | timestamptz | Start time for scheduled campaigns |
| `scheduled_expires_at` | timestamptz | Expiration time |
| `timezone` | text | Timezone for business hours |
| `business_hours_config` | jsonb | Business hours schedule |
| `business_hours_only` | boolean | Restrict to business hours |
| `concurrency_limit` | integer | Max parallel calls (default: 1) |
| `max_attempts` | integer | Max call attempts per recipient |
| `retry_delay_minutes` | integer | Delay between retries |
| `total_recipients` | integer | Total imported recipients |
| `pending_calls` | integer | Recipients awaiting call |
| `completed_calls` | integer | Finished calls |
| `successful_calls` | integer | Answered calls |
| `failed_calls` | integer | Failed/error calls |
| `wizard_completed` | boolean | Whether wizard finished |
| `csv_column_headers` | text[] | Imported CSV headers |
| `external_campaign_id` | text | Provider's campaign ID |
| `started_at` | timestamptz | Actual start time |
| `completed_at` | timestamptz | Completion time |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update |
| `deleted_at` | timestamptz | Soft delete timestamp |

### 3.2 call_recipients Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `campaign_id` | uuid | FK to call_campaigns |
| `workspace_id` | uuid | FK to workspaces |
| `phone_number` | text | Recipient phone |
| `first_name` | text | First name |
| `last_name` | text | Last name |
| `email` | text | Email address |
| `company` | text | Company name |
| `reason_for_call` | text | Call reason |
| `address_line_1` | text | Address fields |
| `address_line_2` | text | |
| `suburb` | text | |
| `state` | text | |
| `post_code` | text | |
| `country` | text | |
| `call_status` | enum | pending, queued, calling, completed, failed, skipped |
| `call_outcome` | enum | answered, no_answer, busy, voicemail, invalid_number, declined, error |
| `attempts` | integer | Call attempt count |
| `last_attempt_at` | timestamptz | Last call time |
| `call_duration_seconds` | integer | Call duration |
| `external_call_id` | text | Provider's call ID |
| `error_message` | text | Error details |
| `custom_variables` | jsonb | Additional CSV data |
| `call_notes` | text | Call notes |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update |

### 3.3 BusinessHoursConfig Type

```typescript
interface BusinessHoursConfig {
  enabled: boolean
  timezone: string
  schedule: {
    monday: BusinessHoursTimeSlot[]
    tuesday: BusinessHoursTimeSlot[]
    wednesday: BusinessHoursTimeSlot[]
    thursday: BusinessHoursTimeSlot[]
    friday: BusinessHoursTimeSlot[]
    saturday: BusinessHoursTimeSlot[]
    sunday: BusinessHoursTimeSlot[]
  }
}

interface BusinessHoursTimeSlot {
  start: string  // "HH:MM" format (e.g., "09:00")
  end: string    // "HH:MM" format (e.g., "17:00")
}
```

### 3.4 Status Enums

```typescript
type CampaignStatus = 
  | "draft"      // Wizard in progress
  | "ready"      // Ready to start
  | "scheduled"  // Awaiting scheduled start time
  | "active"     // Currently making calls
  | "paused"     // Temporarily stopped
  | "completed"  // All calls finished
  | "cancelled"  // Terminated by user

type RecipientCallStatus = 
  | "pending"    // Not yet called
  | "queued"     // In provider queue
  | "calling"    // Currently ringing
  | "completed"  // Call finished
  | "failed"     // Call failed
  | "skipped"    // Skipped (e.g., invalid number)

type RecipientCallOutcome = 
  | "answered"       // Call connected
  | "no_answer"      // No response
  | "busy"           // Line busy
  | "voicemail"      // Went to voicemail
  | "invalid_number" // Bad phone number
  | "declined"       // Call declined
  | "error"          // System error
```

---

## 4. API Routes Reference

### 4.1 Campaign CRUD Routes

#### `GET /api/w/[workspaceSlug]/campaigns`

**Purpose:** List all campaigns for a workspace

**Response:**
```typescript
{
  data: Campaign[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `pageSize` - Items per page (default: 20)
- `status` - Filter by status
- `search` - Search by name

---

#### `POST /api/w/[workspaceSlug]/campaigns`

**Purpose:** Create a new campaign (from wizard completion)

**Request Body:**
```typescript
{
  name: string
  description?: string
  agent_id: string
  schedule_type: "immediate" | "scheduled"
  scheduled_start_at?: string
  timezone: string
  business_hours_config: BusinessHoursConfig
  concurrency_limit?: number
  max_attempts?: number
  recipients: CreateRecipientInput[]
  csv_column_headers?: string[]
}
```

**Validation:**
- Name is required
- Agent must exist and be active
- Agent must have phone number assigned
- Business hours validation

**Response:**
```typescript
{
  data: Campaign
  message: "Campaign created successfully"
}
```

---

#### `GET /api/w/[workspaceSlug]/campaigns/[id]`

**Purpose:** Get single campaign with details

**Response:**
```typescript
{
  data: Campaign & {
    agent: AIAgent
    recipients_count: number
    stats: {
      total: number
      pending: number
      completed: number
      successful: number
      failed: number
    }
  }
}
```

---

#### `PUT /api/w/[workspaceSlug]/campaigns/[id]`

**Purpose:** Update campaign (only drafts)

**Allowed Fields:**
- name, description
- agent_id
- schedule_type, scheduled_start_at
- timezone, business_hours_config
- concurrency_limit, max_attempts

---

#### `DELETE /api/w/[workspaceSlug]/campaigns/[id]`

**Purpose:** Soft delete a campaign

**Restrictions:**
- Cannot delete active campaigns
- Must pause/terminate first

---

### 4.2 Campaign Action Routes

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/start`

**Purpose:** Start a campaign

**Flow:**
1. Validate campaign status (must be `ready` or `scheduled`)
2. Check agent has phone number
3. Update status to `active`
4. Trigger provider-specific start logic
5. Record `started_at` timestamp

**Response:**
```typescript
{ success: true, message: "Campaign started" }
```

---

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/pause`

**Purpose:** Pause an active campaign

**Flow:**
1. Validate status is `active`
2. Update status to `paused`
3. Current calls complete normally
4. Batch caller stops picking up new recipients

---

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/resume`

**Purpose:** Resume a paused campaign

**Flow:**
1. Validate status is `paused`
2. Validate agent is still synced and active
3. Get pending recipients
4. Update status to `active`
5. Restart batch caller via unified provider

**Response:**
```typescript
{
  success: true,
  campaign: Campaign,
  provider: {
    used: "vapi",
    success: boolean,
    fallbackUsed: boolean,
    batchRef: string,
    recipientCount: number
  },
  message: string
}
```

---

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/cleanup`

**Purpose:** Manually cleanup stale "calling" recipients

**Purpose:** Mark recipients stuck in "calling" status as failed

**Restrictions:**
- Only works on `active` campaigns

**Flow:**
1. Find recipients with `call_status = "calling"` older than threshold (5 min default)
2. Mark them as `failed` with timeout error
3. Update campaign statistics
4. Check if campaign should be completed

**Response:**
```typescript
{
  success: true,
  message: string,
  staleRecipientsFound: number,
  staleRecipientsUpdated: number,
  campaignCompleted: boolean
}
```

---

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/terminate`

**Purpose:** Permanently stop a campaign

**Flow:**
1. Validate status is `active` or `paused`
2. Cancel all pending recipients
3. Update status to `cancelled`
4. Record `completed_at`
5. Notify provider to cancel

---

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/test-call`

**Purpose:** Make a single test call

**Request Body:**
```typescript
{
  phone_number: string  // Phone to call
}
```

**Flow:**
1. Validate campaign exists
2. Create temporary recipient or use existing
3. Make single call via provider
4. Return call details

---

### 4.3 Recipients Routes

#### `GET /api/w/[workspaceSlug]/campaigns/[id]/recipients`

**Purpose:** List recipients with pagination

**Query Parameters:**
- `page` - Page number
- `pageSize` - Items per page
- `status` - Filter by call_status
- `search` - Search phone/name

**Response:**
```typescript
{
  data: Recipient[]
  pagination: { ... }
}
```

---

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/recipients`

**Purpose:** Add single recipient

**Request Body:**
```typescript
{
  phone_number: string
  first_name?: string
  last_name?: string
  email?: string
  company?: string
}
```

---

#### `POST /api/w/[workspaceSlug]/campaigns/[id]/recipients/import`

**Purpose:** Bulk import recipients

**Request Body:**
```typescript
{
  recipients: CreateRecipientInput[]
}
```

**Response:**
```typescript
{
  imported: number
  duplicates: number
}
```

---

### 4.4 Draft Routes

#### `POST /api/w/[workspaceSlug]/campaigns/draft`

**Purpose:** Auto-save wizard progress

**Request Body:** Partial campaign data at any step

**Response:**
```typescript
{
  draft_id: string
  saved_at: string
}
```

---

#### `GET /api/w/[workspaceSlug]/campaigns/draft`

**Purpose:** Get user's recent drafts

**Query Parameters:**
- `id` - Specific draft ID (optional)

**Response:**
```typescript
{
  drafts: Campaign[]
}
// or with id parameter:
{
  ...campaign,
  recipients: Recipient[]
}
```

---

#### `POST /api/w/[workspaceSlug]/campaigns/draft/create`

**Purpose:** Create empty draft for new campaign

**Features:**
- Duplicate prevention (30-second window)
- Uses first available agent as placeholder
- Initializes default business hours

**Response:**
```typescript
{
  draft_id: string
  reused: boolean  // true if existing draft returned
}
```

---

## 5. Frontend Pages

### 5.1 Campaign List Page

**Path:** `/w/[workspaceSlug]/campaigns/page.tsx`

**Features:**
- Grid of campaign cards
- Status filtering
- Search functionality
- Pagination
- Quick actions (start, pause, delete)
- Empty state with CTA

**Key Components:**
- `CampaignCard` - Individual campaign display
- `CampaignStatusBadge` - Status indicator

---

### 5.2 New Campaign Page

**Path:** `/w/[workspaceSlug]/campaigns/new/page.tsx`

**Flow:**
1. Creates draft on mount
2. Renders `CampaignWizard` with draft ID
3. Handles wizard completion
4. Redirects to campaign detail

**Loading States:**
- `CampaignLoading` component during draft creation
- Error boundary for failures

---

### 5.3 Campaign Detail Page

**Path:** `/w/[workspaceSlug]/campaigns/[id]/page.tsx`

**Sections:**
- Campaign header with actions
- Progress statistics
- Recipients table
- Call logs timeline
- Settings panel

**Actions:**
- Start/Pause/Resume/Terminate
- Add recipient
- Import more recipients
- Test call
- Delete campaign

---

## 6. Components Reference

### 6.1 CampaignWizard

**Path:** `components/workspace/campaigns/campaign-wizard.tsx`

**Steps:**
1. **Details** - Name, description, agent selection
2. **Import** - CSV upload and recipient management
3. **Schedule** - Timing and business hours
4. **Review** - Summary and warnings

**Form Data Structure:**
```typescript
interface WizardFormData {
  name: string
  description: string
  agent_id: string
  selectedAgent: AIAgent | null
  recipients: RecipientInput[]
  importedFileName: string
  scheduleType: "immediate" | "scheduled"
  scheduledStartAt: string | null
  businessHoursConfig: BusinessHoursConfig
  csvColumnHeaders: string[]
}
```

**Features:**
- Step navigation with validation
- Auto-save draft on changes
- Progress persistence
- Field validation per step

---

### 6.2 Step Components

#### StepDetails (`steps/step-details.tsx`)

**Fields:**
- Campaign name (required)
- Description (optional)
- Agent selection (required)

**Agent Selection:**
- Filters to active agents only
- Shows agent provider badge
- Displays phone number status
- Preview of agent greeting

---

#### StepImport (`steps/step-import.tsx`)

**Features:**
- CSV file upload
- Drag and drop support
- Data preview table
- Validation errors display
- Manual recipient addition
- Template download

**CSV Parsing:**
```typescript
// Required column (one of):
"phone_number" | "phone" | "phonenumber" | "mobile"

// Optional columns:
"first_name" | "firstname" | "first"
"last_name" | "lastname" | "last"
"email"
"company"

// All other columns → custom_variables
```

---

#### StepSchedule (`steps/step-schedule.tsx`)

**Options:**
- **Immediate:** Start as soon as ready
- **Scheduled:** Pick date/time

**Business Hours:**
- Per-day time slot configuration
- Multiple slots per day supported
- Timezone selection
- Enable/disable toggle

---

#### StepReview (`steps/step-review.tsx`)

**Displays:**
- Campaign summary
- Agent info
- Recipient count
- Schedule details
- Warnings for issues

**Warnings Checked:**
- No recipients imported
- Agent missing phone number
- Business hours enabled but empty

---

### 6.3 CampaignCard

**Path:** `components/workspace/campaigns/campaign-card.tsx`

**Displays:**
- Campaign name & description
- Status badge
- Progress bar (completed/total)
- Quick stats
- Action buttons

**Status-specific Actions:**
- Draft: Edit, Delete
- Ready: Start, Edit, Delete
- Active: Pause, Terminate
- Paused: Resume, Terminate
- Completed/Cancelled: View, Delete

---

### 6.4 Status Badges

**Path:** `components/workspace/campaigns/campaign-status-badge.tsx`

**Campaign Statuses:**
| Status | Color | Icon |
|--------|-------|------|
| draft | Gray | FileEdit |
| ready | Cyan | Rocket |
| scheduled | Purple | CalendarClock |
| active | Green | Animated dot |
| paused | Yellow | Pause |
| completed | Blue | CheckCircle2 |
| cancelled | Red | XCircle |

**Recipient Call Statuses:**
| Status | Color |
|--------|-------|
| pending | Gray |
| queued | Blue |
| calling | Yellow |
| completed | Green |
| failed | Red |
| skipped | Orange |

---

### 6.5 CampaignActionOverlay

**Path:** `components/workspace/campaigns/campaign-action-overlay.tsx`

**Purpose:** Modal overlay shown during campaign actions (start, pause, resume, terminate)

**Props:**
```typescript
interface CampaignActionOverlayProps {
  open: boolean
  action: "start" | "pause" | "resume" | "terminate" | null
  campaignName?: string
  recipientCount?: number
  progress?: number // 0-100 for start action
}
```

**Features:**
- Non-dismissable modal during action
- Action-specific icons and messaging
- Progress bar for start action
- Prevents accidental navigation

---

### 6.6 WizardDraftCard

**Path:** `components/workspace/campaigns/wizard-draft-card.tsx`

**Purpose:** Shows unsaved wizard progress from sessionStorage

**Features:**
- Detects wizard draft in sessionStorage
- Shows progress summary (step, recipients count, schedule type)
- "Continue" button to resume wizard
- "Discard" option with confirmation dialog
- Auto-hides if no draft found

**Storage Key:** `campaign-wizard-storage`

---

### 6.7 Dialog Components

#### AddRecipientDialog

**Path:** `components/workspace/campaigns/add-recipient-dialog.tsx`

**Fields:**
- Phone number (required)
- First name
- Last name
- Email
- Company

**Validation:**
- Phone number format
- Email format if provided

---

#### ImportRecipientsDialog

**Path:** `components/workspace/campaigns/import-recipients-dialog.tsx`

**Steps:**
1. **Upload** - File selection
2. **Preview** - Data quality report
3. **Importing** - Progress indicator
4. **Complete** - Success summary

**Data Quality Report:**
- Total records
- Field completeness percentages
- Missing data warnings
- Per-field statistics

---

## 7. Hooks & State Management

### 7.1 useCampaigns Hook

**Path:** `lib/hooks/use-campaigns.ts`

**Queries:**
```typescript
// List campaigns
useCampaigns(options?: { status?: CampaignStatus })

// Single campaign
useCampaign(id: string)

// Campaign recipients
useCampaignRecipients(campaignId: string, options?: {
  page?: number
  pageSize?: number
  status?: RecipientCallStatus
})
```

**Mutations:**
```typescript
// Create
useCreateCampaign()

// Update
useUpdateCampaign()

// Delete
useDeleteCampaign()

// Actions
useStartCampaign()
usePauseCampaign()
useTerminateCampaign()

// Recipients
useAddRecipient()
useImportRecipients()
```

---

### 7.2 useCampaignDraft Hook

**Path:** `lib/hooks/use-campaign-draft.ts`

**Purpose:** Auto-save wizard progress

**Features:**
- Debounced saves (1 second default)
- Prevents duplicate saves
- Handles concurrent save requests
- Query cache invalidation

**Usage:**
```typescript
const { 
  isSaving,
  lastSavedAt,
  error,
  updateDraft,
  saveNow,
  clearPending
} = useCampaignDraft({
  draftId: string,
  debounceMs?: number,
  autoSave?: boolean,
  onSaved?: () => void,
  onError?: (error: string) => void
})
```

**Important:** This hook only UPDATES existing drafts. Draft creation happens separately via `/draft/create` endpoint.

---

### 7.3 useRealtimeCampaignRecipients Hook

**Path:** `lib/hooks/use-realtime-campaign.ts`

**Purpose:** Real-time campaign status updates via Supabase Realtime

**Features:**
- Subscribes to `call_recipients` table changes
- Tracks recipient status transitions
- Computes live statistics
- Supports multiple callback hooks

**Usage:**
```typescript
const { 
  isConnected,
  connectionState,
  recentUpdates,      // Last N recipient updates
  stats,              // Live campaign statistics
  currentlyCalling,   // Recipients currently in "calling" state
  error
} = useRealtimeCampaignRecipients({
  campaignId: string,
  workspaceId?: string,
  onRecipientUpdate?: (recipient: CampaignRecipient) => void,
  onCallComplete?: (recipient: CampaignRecipient) => void,
  onCallFailed?: (recipient: CampaignRecipient) => void,
  onStatsUpdate?: (stats: CampaignStatsUpdate) => void
})
```

**Types:**
```typescript
interface CampaignStatsUpdate {
  total: number
  pending: number
  calling: number
  completed: number
  failed: number
  successful: number
}

interface RecipientUpdateEvent {
  recipientId: string
  phoneNumber: string
  previousStatus: RecipientCallStatus | null
  newStatus: RecipientCallStatus
  outcome?: RecipientCallOutcome
  eventType: "INSERT" | "UPDATE"
  timestamp: Date
  data: CampaignRecipient
}
```

---

## 8. Provider Integrations

### 8.1 Provider Architecture (VAPI-Only)

**Note:** Inspra integration has been deprecated. All campaigns now use VAPI directly.

**Primary Files:**
- `lib/integrations/campaign-provider.ts` - Provider abstraction layer
- `lib/integrations/vapi/batch-calls.ts` - VAPI batch calling implementation
- `lib/campaigns/batch-caller.ts` - Native batch calling engine

---

### 8.2 Campaign Provider Interface

**Path:** `lib/integrations/campaign-provider.ts`

```typescript
export type CampaignProvider = "vapi"

export interface CampaignProviderConfig {
  vapi?: {
    apiKey: string
    phoneNumberId: string  // VAPI phone number ID for outbound calls
  }
}

export interface CampaignBatchResult {
  success: boolean
  provider: CampaignProvider
  error?: string
  batchRef?: string
  recipientCount?: number
  vapiResults?: VapiBatchResult
  fallbackUsed?: boolean
  primaryError?: string
}

// Main function for starting campaigns
export async function startCampaignBatch(
  campaign: CampaignData,
  recipients: RecipientData[],
  vapiConfig?: CampaignProviderConfig["vapi"],
  options?: { startNow?: boolean }
): Promise<CampaignBatchResult>
```

---

### 8.3 VAPI Batch Calls

**Path:** `lib/integrations/vapi/batch-calls.ts`

**Features:**
- Sequential call creation with configurable delays
- Business hours scheduling
- Integration with campaign infrastructure
- Call tracking and status updates

**Key Types:**
```typescript
interface VapiBatchConfig {
  apiKey: string
  assistantId: string          // VAPI external_agent_id
  phoneNumberId: string        // VAPI phone number ID for outbound
  workspaceId: string
  campaignId: string
  batchRef: string
  businessHoursConfig?: BusinessHoursConfig | null
  timezone?: string
  delayBetweenCallsMs?: number // Default: 1000ms
  skipBusinessHoursCheck?: boolean
}

interface VapiBatchResult {
  success: boolean
  batchRef: string
  totalRecipients: number
  initiated: number
  failed: number
  skipped: number
  outsideBusinessHours: boolean
  errors: string[]
  results: VapiBatchCallResult[]
}
```

---

### 8.4 Native Batch Caller Engine

**Path:** `lib/campaigns/batch-caller.ts`

**Purpose:** Handles batch outbound calling using VAPI directly

**Features:**
- Concurrent call processing with configurable limits
- Recipient status tracking
- Campaign state management (pause/terminate via DB flags)
- Business hours enforcement
- Retry logic with configurable attempts and delays

**Key Functions:**
```typescript
// Start a campaign
export async function startCampaign(config: BatchCallerConfig): Promise<BatchCallResult>

// Pause a campaign
export async function pauseCampaign(campaignId: string): Promise<{ success: boolean; error?: string }>

// Resume a paused campaign
export async function resumeCampaign(config: BatchCallerConfig): Promise<BatchCallResult>

// Terminate/cancel a campaign
export async function terminateCampaign(campaignId: string): Promise<{ success: boolean; error?: string }>

// Check if within business hours
export function isWithinBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  timezone: string
): boolean
```

**BatchCallerConfig:**
```typescript
interface BatchCallerConfig {
  campaignId: string
  workspaceId: string
  agentId: string
  externalAgentId: string
  phoneNumberId: string      // VAPI phone number ID
  vapiSecretKey: string
  concurrencyLimit: number
  maxAttempts: number
  retryDelayMinutes: number
  businessHoursConfig?: BusinessHoursConfig | null
  timezone: string
}
```

---

## 9. Campaign Lifecycle

### 9.1 State Machine

```
                    ┌──────────────┐
                    │    Draft     │
                    └──────┬───────┘
                           │ Complete wizard
                           ▼
                    ┌──────────────┐
                    │    Ready     │◄──────────────┐
                    └──────┬───────┘               │
                           │ Start                 │
             Schedule=     │                       │
             "scheduled"   ▼                       │
                    ┌──────────────┐               │
                    │  Scheduled   │               │
                    └──────┬───────┘               │
                           │ Reach scheduled time  │
                           ▼                       │
                    ┌──────────────┐               │
             ┌─────▶│    Active    │───────────────┘
             │      └──────┬───────┘     Resume
             │             │
        Resume             │ Pause
             │             ▼
             │      ┌──────────────┐
             └──────│    Paused    │
                    └──────┬───────┘
                           │ Terminate
                           │ or
                           │ All calls complete
                           ▼
              ┌───────────────────────┐
              │ Completed │ Cancelled │
              └───────────────────────┘
```

### 9.2 Status Transitions

| From | To | Trigger |
|------|------|---------|
| draft | ready | Wizard completion |
| ready | active | Start (immediate) |
| ready | scheduled | Start (scheduled) |
| scheduled | active | Scheduled time reached |
| active | paused | Pause action |
| active | completed | All recipients called |
| paused | active | Resume action |
| paused | cancelled | Terminate action |
| active | cancelled | Terminate action |

---

## 10. Draft System

### 10.1 Draft Creation Flow

```
User navigates to /campaigns/new
         │
         ▼
Check for recent "Untitled Campaign" draft (< 30 seconds)
         │
         ├── Found → Return existing draft ID
         │
         └── Not found → Create new draft
                   │
                   ├── Get first available agent
                   │
                   ├── Insert campaign with status="draft"
                   │
                   └── Return new draft ID
```

### 10.2 Auto-Save Flow

```
User makes change in wizard
         │
         ▼
updateDraft() called
         │
         ▼
Start/restart debounce timer (1 second)
         │
         ▼
Timer expires
         │
         ▼
POST /api/w/.../campaigns/draft
         │
         ├── Validate partial data
         │
         ├── Update existing draft
         │
         ├── Update recipients if provided
         │
         └── Return { draft_id, saved_at }
```

### 10.3 Draft Fields

Drafts accept partial data at any wizard step:

**Step 1 (Details):**
- name
- description
- agent_id

**Step 2 (Import):**
- recipients[]
- csv_column_headers[]

**Step 3 (Schedule):**
- schedule_type
- scheduled_start_at
- timezone
- business_hours_config

---

## 11. Business Logic

### 11.1 Recipient Validation

```typescript
// Phone number validation
function validatePhoneNumber(phone: string): boolean {
  // Must start with + and country code
  // Must be 10-15 digits
  const regex = /^\+[1-9]\d{9,14}$/
  return regex.test(phone.replace(/\s/g, ''))
}

// Duplicate detection
// Phone numbers are unique per campaign
```

### 11.2 Business Hours Enforcement

```typescript
function isWithinBusinessHours(
  config: BusinessHoursConfig,
  timestamp: Date
): boolean {
  if (!config.enabled) return true
  
  // Convert to campaign timezone
  const localTime = toTimezone(timestamp, config.timezone)
  const dayName = getDayName(localTime) // "monday", etc.
  const slots = config.schedule[dayName]
  
  if (!slots || slots.length === 0) return false
  
  const currentTime = formatTime(localTime) // "HH:MM"
  
  return slots.some(slot => 
    currentTime >= slot.start && currentTime <= slot.end
  )
}
```

### 11.3 Campaign Expiration

**Cron Job:** `app/api/cron/master/route.ts`

**Logic:**
```typescript
// File: lib/campaigns/cleanup-expired.ts

async function cleanupExpiredCampaigns() {
  const now = new Date()
  
  // Find active/scheduled campaigns past expiration
  const expired = await db.call_campaigns.findMany({
    where: {
      status: { in: ['active', 'scheduled'] },
      scheduled_expires_at: { lt: now }
    }
  })
  
  for (const campaign of expired) {
    // Update status to cancelled
    await db.call_campaigns.update({
      where: { id: campaign.id },
      data: { 
        status: 'cancelled',
        completed_at: now
      }
    })
    
    // Cancel pending recipients
    await db.call_recipients.updateMany({
      where: { 
        campaign_id: campaign.id,
        call_status: { in: ['pending', 'queued'] }
      },
      data: { call_status: 'skipped' }
    })
  }
}
```

---

## 12. Stale Call Cleanup

### 12.1 Overview

**Path:** `lib/campaigns/stale-call-cleanup.ts`

**Problem:** VAPI webhooks may not always fire (network issues, timeouts). Recipients can get stuck in "calling" status indefinitely.

**Solution:** Stale call cleanup utility that detects and marks orphaned calls as failed.

### 12.2 Stale Call Detection

A call is considered "stale" when:
1. Status is `calling`
2. `call_started_at` was more than 5 minutes ago (configurable)
3. No webhook has been received (no completion data)

### 12.3 Cleanup Functions

```typescript
// Cleanup stale calls for a specific campaign
export async function cleanupStaleCalls(
  campaignId: string,
  thresholdMinutes: number = 5  // Default: 5 minutes
): Promise<StaleCallCleanupResult>

// Cleanup stale calls for all active campaigns (background job)
export async function cleanupAllActiveCampaigns(): Promise<{
  success: boolean
  campaignsProcessed: number
  totalStaleRecipients: number
  totalCampaignsCompleted: number
}>
```

### 12.4 Cleanup Result

```typescript
interface StaleCallCleanupResult {
  success: boolean
  campaignId: string
  staleRecipientsFound: number
  staleRecipientsUpdated: number
  campaignCompleted: boolean  // True if campaign auto-completed
  error?: string
}
```

### 12.5 API Endpoint

**Path:** `POST /api/w/[workspaceSlug]/campaigns/[id]/cleanup`

Manually trigger cleanup for a specific campaign. Only works on active campaigns.

### 12.6 Auto-Completion

After cleanup, the utility checks if the campaign should be marked as completed:
- If no recipients remain in `pending`, `queued`, or `calling` status
- Campaign is still `active`
- Then: Update status to `completed`

---

## 13. Error Handling

### 13.1 Common Error Codes

| Error | Code | Description |
|-------|------|-------------|
| Campaign not found | 404 | Invalid campaign ID |
| Invalid status transition | 400 | Cannot perform action in current state |
| Agent not synced | 400 | Agent missing external_agent_id |
| No phone number | 400 | Agent has no assigned phone |
| Max recipients | 400 | Over 10,000 recipient limit |
| Invalid CSV | 400 | Missing required columns |
| Provider error | 502 | External provider failure |
| Paywall blocked | 403 | Usage limits exceeded |
| Stale call timeout | 408 | Call timed out without webhook response |

### 13.2 Error Response Format

```typescript
{
  error: string,
  code?: string,
  details?: any
}
```

---

## 14. File Reference Map

### API Routes

| Path | File |
|------|------|
| `/api/w/[slug]/campaigns` | `app/api/w/[workspaceSlug]/campaigns/route.ts` |
| `/api/w/[slug]/campaigns/[id]` | `app/api/w/[workspaceSlug]/campaigns/[id]/route.ts` |
| `/api/w/[slug]/campaigns/[id]/start` | `app/api/w/[workspaceSlug]/campaigns/[id]/start/route.ts` |
| `/api/w/[slug]/campaigns/[id]/pause` | `app/api/w/[workspaceSlug]/campaigns/[id]/pause/route.ts` |
| `/api/w/[slug]/campaigns/[id]/resume` | `app/api/w/[workspaceSlug]/campaigns/[id]/resume/route.ts` |
| `/api/w/[slug]/campaigns/[id]/terminate` | `app/api/w/[workspaceSlug]/campaigns/[id]/terminate/route.ts` |
| `/api/w/[slug]/campaigns/[id]/cleanup` | `app/api/w/[workspaceSlug]/campaigns/[id]/cleanup/route.ts` |
| `/api/w/[slug]/campaigns/[id]/test-call` | `app/api/w/[workspaceSlug]/campaigns/[id]/test-call/route.ts` |
| `/api/w/[slug]/campaigns/[id]/recipients` | `app/api/w/[workspaceSlug]/campaigns/[id]/recipients/route.ts` |
| `/api/w/[slug]/campaigns/draft` | `app/api/w/[workspaceSlug]/campaigns/draft/route.ts` |
| `/api/w/[slug]/campaigns/draft/create` | `app/api/w/[workspaceSlug]/campaigns/draft/create/route.ts` |

### Frontend Pages

| Path | File |
|------|------|
| `/w/[slug]/campaigns` | `app/w/[workspaceSlug]/campaigns/page.tsx` |
| `/w/[slug]/campaigns/new` | `app/w/[workspaceSlug]/campaigns/new/page.tsx` |
| `/w/[slug]/campaigns/[id]` | `app/w/[workspaceSlug]/campaigns/[id]/page.tsx` |

### Components

| Component | File |
|-----------|------|
| CampaignWizardOptimized | `components/workspace/campaigns/campaign-wizard-optimized.tsx` |
| CampaignWizardDynamic | `components/workspace/campaigns/campaign-wizard-dynamic.tsx` (lazy loader) |
| CampaignCard | `components/workspace/campaigns/campaign-card.tsx` |
| CampaignStatusBadge | `components/workspace/campaigns/campaign-status-badge.tsx` |
| CampaignLoading | `components/workspace/campaigns/campaign-loading.tsx` |
| CampaignActionOverlay | `components/workspace/campaigns/campaign-action-overlay.tsx` |
| WizardDraftCard | `components/workspace/campaigns/wizard-draft-card.tsx` |
| StepDetails | `components/workspace/campaigns/steps/step-details.tsx` |
| StepImport | `components/workspace/campaigns/steps/step-import.tsx` |
| StepSchedule | `components/workspace/campaigns/steps/step-schedule.tsx` |
| StepVariables | `components/workspace/campaigns/steps/step-variables.tsx` |
| StepReview | `components/workspace/campaigns/steps/step-review.tsx` |
| AddRecipientDialog | `components/workspace/campaigns/add-recipient-dialog.tsx` |
| ImportRecipientsDialog | `components/workspace/campaigns/import-recipients-dialog.tsx` |

### Hooks & Utils

| Module | File |
|--------|------|
| useCampaigns | `lib/hooks/use-campaigns.ts` |
| useCampaignDraft | `lib/hooks/use-campaign-draft.ts` |
| useRealtimeCampaignRecipients | `lib/hooks/use-realtime-campaign.ts` |
| CampaignProvider | `lib/integrations/campaign-provider.ts` |
| VAPIBatchCalls | `lib/integrations/vapi/batch-calls.ts` |
| BatchCaller | `lib/campaigns/batch-caller.ts` |
| StaleCallCleanup | `lib/campaigns/stale-call-cleanup.ts` |
| CleanupExpired | `lib/campaigns/cleanup-expired.ts` |
| CampaignWizardStore | `lib/stores/campaign-wizard-store.ts` |

### Cron Jobs

| Job | File |
|-----|------|
| Master Cron | `app/api/cron/master/route.ts` |

---

## Quick Reference Cheatsheet

### Creating a Campaign (Programmatic)

```typescript
// 1. Create draft
const { draft_id } = await fetch('/api/w/SLUG/campaigns/draft/create', {
  method: 'POST'
}).then(r => r.json())

// 2. Update with data
await fetch('/api/w/SLUG/campaigns/draft', {
  method: 'POST',
  body: JSON.stringify({
    draft_id,
    name: "My Campaign",
    agent_id: "AGENT_UUID",
    recipients: [{ phone_number: "+1234567890" }]
  })
})

// 3. Complete and create
const campaign = await fetch('/api/w/SLUG/campaigns', {
  method: 'POST',
  body: JSON.stringify({ draft_id, ...finalData })
}).then(r => r.json())

// 4. Start
await fetch(`/api/w/SLUG/campaigns/${campaign.id}/start`, {
  method: 'POST'
})
```

### Campaign Status Check

```typescript
const campaign = await fetch('/api/w/SLUG/campaigns/CAMPAIGN_ID')
  .then(r => r.json())

console.log({
  status: campaign.status,
  progress: `${campaign.completed_calls}/${campaign.total_recipients}`,
  success_rate: campaign.successful_calls / campaign.completed_calls
})
```

---

*Last Updated: January 15, 2026*
*Version: 1.1*


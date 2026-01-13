# Campaign Inspra API Testing Guide

> **Last Updated**: January 13, 2026  
> **Test Numbers**: +61370566663, +61370566664

This guide walks you through testing the campaign module with Inspra Outbound API integration using webhook.site for payload verification.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Setup for Testing](#setup-for-testing)
3. [Testing Flow](#testing-flow)
4. [Expected Payloads](#expected-payloads)
5. [API Reference](#api-reference)
6. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The campaign module now integrates with Inspra Outbound API:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Campaign Flow                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CREATE CAMPAIGN (POST /campaigns)                           │
│     └── Validates agent, phone number                            │
│     └── Creates campaign in DB (status: draft)                   │
│     └── Inserts recipients                                       │
│     └── Calls Inspra /load-json with batch data                  │
│         (NBF set to future - batch is "loaded" but not active)   │
│                                                                  │
│  2. START CAMPAIGN (POST /campaigns/{id}/start)                 │
│     └── Updates local status to "active"                         │
│     └── (Future: Update NBF in Inspra to "now")                  │
│                                                                  │
│  3. PAUSE CAMPAIGN (POST /campaigns/{id}/pause)                 │
│     └── Calls Inspra /pause-batch                                │
│     └── Updates local status to "paused"                         │
│                                                                  │
│  4. TERMINATE CAMPAIGN (POST /campaigns/{id}/terminate)         │
│     └── Calls Inspra /terminate-batch                            │
│     └── Updates local status to "cancelled"                      │
│     └── Marks pending recipients as "cancelled"                  │
│                                                                  │
│  5. TEST CALL (POST /campaigns/{id}/test-call)                  │
│     └── Calls Inspra /test-call with single recipient            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setup for Testing

### Step 1: Create a Webhook.site URL

1. Go to https://webhook.site
2. Copy your unique URL (e.g., `https://webhook.site/abc123-def456-...`)
3. Keep this tab open to see incoming requests

### Step 2: Configure Environment Variable

Add to your `.env.local`:

```env
# For testing - replace with your webhook.site URL
INSPRA_OUTBOUND_API_URL=https://webhook.site/YOUR-UUID-HERE

# Optional: API key (not needed for webhook.site testing)
# INSPRA_API_KEY=your-api-key
```

### Step 3: Restart Dev Server

```bash
npm run dev
```

### Step 4: Verify Prerequisites

Ensure you have:

- [ ] A VAPI agent that is synced (`external_agent_id` exists)
- [ ] A phone number assigned to the agent (or shared outbound configured)
- [ ] The agent is active

---

## Testing Flow

### Test 1: Create Campaign (triggers /load-json)

```bash
# Using curl or your API client
POST /api/w/{workspaceSlug}/campaigns
Content-Type: application/json

{
  "name": "Test Campaign - Inspra",
  "description": "Testing Inspra integration",
  "agent_id": "{your-agent-id}",
  "schedule_type": "immediate",
  "timezone": "Australia/Sydney",
  "wizard_flow": true,
  "recipients": [
    {
      "phone_number": "+61370566663",
      "first_name": "Test",
      "last_name": "User One",
      "company": "Test Company",
      "reason_for_call": "Follow up inquiry"
    },
    {
      "phone_number": "+61370566664",
      "first_name": "Test",
      "last_name": "User Two",
      "company": "Another Company",
      "state": "VIC",
      "suburb": "Melbourne"
    }
  ],
  "business_hours_config": {
    "enabled": true,
    "timezone": "Australia/Sydney",
    "schedule": {
      "monday": [{"start": "09:00", "end": "17:00"}],
      "tuesday": [{"start": "09:00", "end": "17:00"}],
      "wednesday": [{"start": "09:00", "end": "17:00"}],
      "thursday": [{"start": "09:00", "end": "17:00"}],
      "friday": [{"start": "09:00", "end": "17:00"}],
      "saturday": [],
      "sunday": []
    }
  }
}
```

**Check webhook.site for `/load-json` payload**

### Test 2: Test Call (triggers /test-call)

```bash
POST /api/w/{workspaceSlug}/campaigns/{campaignId}/test-call
Content-Type: application/json

{
  "phone_number": "+61370566663",
  "variables": {
    "FIRST_NAME": "Manual",
    "LAST_NAME": "Test"
  }
}
```

**Check webhook.site for `/test-call` payload**

### Test 3: Pause Campaign (triggers /pause-batch)

```bash
# First start the campaign
POST /api/w/{workspaceSlug}/campaigns/{campaignId}/start

# Then pause it
POST /api/w/{workspaceSlug}/campaigns/{campaignId}/pause
```

**Check webhook.site for `/pause-batch` payload**

### Test 4: Resume Campaign (triggers /load-json)

```bash
# Resume a paused campaign
POST /api/w/{workspaceSlug}/campaigns/{campaignId}/resume
```

**Check webhook.site for `/load-json` payload with updated NBF (set to now)**

### Test 5: Terminate Campaign (triggers /terminate-batch)

```bash
POST /api/w/{workspaceSlug}/campaigns/{campaignId}/terminate
```

**Check webhook.site for `/terminate-batch` payload**

---

## Expected Payloads

### /load-json Payload

```json
{
  "agentId": "vapi-assistant-id-here",
  "workspaceId": "workspace-uuid-here",
  "batchRef": "campaign-campaign-uuid-here",
  "cli": "+61387772586",
  "callList": [
    {
      "phone": "+61370566663",
      "variables": {
        "FIRST_NAME": "Test",
        "LAST_NAME": "User One",
        "EMAIL": "",
        "COMPANY_NAME": "Test Company",
        "REASON_FOR_CALL": "Follow up inquiry",
        "ADDRESS": "",
        "ADDRESS_LINE_2": "",
        "CITY": "",
        "STATE": "",
        "POST_CODE": "",
        "COUNTRY": ""
      }
    },
    {
      "phone": "+61370566664",
      "variables": {
        "FIRST_NAME": "Test",
        "LAST_NAME": "User Two",
        "EMAIL": "",
        "COMPANY_NAME": "Another Company",
        "REASON_FOR_CALL": "",
        "ADDRESS": "",
        "ADDRESS_LINE_2": "",
        "CITY": "Melbourne",
        "STATE": "VIC",
        "POST_CODE": "",
        "COUNTRY": ""
      }
    }
  ],
  "nbf": "2027-01-13T10:00:00.000Z",
  "exp": "2027-02-12T10:00:00.000Z",
  "blockRules": [
    "Mon|0000-0900",
    "Mon|1700-2359",
    "Tue|0000-0900",
    "Tue|1700-2359",
    "Wed|0000-0900",
    "Wed|1700-2359",
    "Thu|0000-0900",
    "Thu|1700-2359",
    "Fri|0000-0900",
    "Fri|1700-2359",
    "Sat|0000-2359",
    "Sun|0000-2359"
  ]
}
```

### /test-call Payload

```json
{
  "agentId": "vapi-assistant-id-here",
  "workspaceId": "workspace-uuid-here",
  "batchRef": "test-campaign-uuid-1705142400000",
  "cli": "+61387772586",
  "nbf": "2026-01-13T10:00:00.000Z",
  "exp": "2026-01-14T10:00:00.000Z",
  "blockRules": ["Mon|0000-0900", "Mon|1700-2359", ...],
  "phone": "+61370566663",
  "variables": {
    "FIRST_NAME": "Manual",
    "LAST_NAME": "Test",
    "EMAIL": "",
    "COMPANY_NAME": "",
    "REASON_FOR_CALL": "Test call",
    "ADDRESS": "",
    "ADDRESS_LINE_2": "",
    "CITY": "",
    "STATE": "",
    "POST_CODE": "",
    "COUNTRY": ""
  }
}
```

### /pause-batch Payload

```json
{
  "workspaceId": "workspace-uuid-here",
  "agentId": "vapi-assistant-id-here",
  "batchRef": "campaign-campaign-uuid-here"
}
```

### /terminate-batch Payload

```json
{
  "workspaceId": "workspace-uuid-here",
  "agentId": "vapi-assistant-id-here",
  "batchRef": "campaign-campaign-uuid-here"
}
```

### Resume /load-json Payload

When resuming a paused campaign, the `/load-json` endpoint is called again with:

- `nbf` set to current time (start immediately)
- `exp` extended to 30 days from now
- Only pending recipients included in `callList`

```json
{
  "agentId": "vapi-assistant-id-here",
  "workspaceId": "workspace-uuid-here",
  "batchRef": "campaign-campaign-uuid-here",
  "cli": "+61387772586",
  "callList": [
    {
      "phone": "+61370566663",
      "variables": { ... }
    }
  ],
  "nbf": "2026-01-13T10:00:00.000Z",
  "exp": "2026-02-12T10:00:00.000Z",
  "blockRules": ["Mon|0000-0900", ...]
}
```

---

## API Reference

### Campaign Endpoints

| Method | Endpoint                                 | Inspra Call        | Description                                    |
| ------ | ---------------------------------------- | ------------------ | ---------------------------------------------- |
| `POST` | `/api/w/{slug}/campaigns`                | `/load-json`       | Create campaign (sends batch to Inspra)        |
| `POST` | `/api/w/{slug}/campaigns/draft`          | -                  | Auto-save draft                                |
| `GET`  | `/api/w/{slug}/campaigns/draft`          | -                  | Get drafts                                     |
| `POST` | `/api/w/{slug}/campaigns/{id}/start`     | -                  | Start campaign (local status only)             |
| `POST` | `/api/w/{slug}/campaigns/{id}/pause`     | `/pause-batch`     | Pause campaign                                 |
| `POST` | `/api/w/{slug}/campaigns/{id}/resume`    | `/load-json`       | Resume paused campaign (re-sends with NBF=now) |
| `POST` | `/api/w/{slug}/campaigns/{id}/terminate` | `/terminate-batch` | Terminate campaign                             |
| `POST` | `/api/w/{slug}/campaigns/{id}/test-call` | `/test-call`       | Queue test call                                |

### Inspra Endpoints

| Endpoint           | Method | Description                          |
| ------------------ | ------ | ------------------------------------ |
| `/load-json`       | POST   | Load batch of outbound calls         |
| `/pause-batch`     | POST   | Pause an existing batch              |
| `/terminate-batch` | POST   | Terminate a running batch            |
| `/test-call`       | POST   | Queue single high-priority test call |

---

## Block Rules Format

Block rules define when calls **CANNOT** be made.

Format: `Day|HHMM-HHMM`

Examples:

- `Mon|0000-0900` - Block Monday midnight to 9 AM
- `Mon|1700-2359` - Block Monday 5 PM to midnight
- `Sat|0000-2359` - Block all day Saturday

If business hours are Mon-Fri 9 AM - 5 PM:

- Block before 9 AM each weekday
- Block after 5 PM each weekday
- Block all day Saturday and Sunday

---

## Draft Auto-Save

The wizard now supports automatic draft saving:

1. **New Hook**: `useCampaignDraft()` in `lib/hooks/use-campaign-draft.ts`
2. **API Endpoint**: `POST /api/w/{slug}/campaigns/draft`
3. **Behavior**:
   - Debounced saves (2 second delay)
   - Saves partial data as user progresses through wizard
   - Campaign saved with `status: "draft"` until final submission
   - Draft status indicator shown in wizard header
   - Drafts appear in campaign list with "Continue" button
   - Navigate to `/campaigns/new?draft={draftId}` to resume

### Draft Features

- **Auto-save**: Every form change triggers a debounced save (2 seconds)
- **Visual feedback**: "Saving..." and "Draft saved" badges in wizard
- **Resume drafts**: Click "Continue" on draft campaigns in the list
- **URL-based**: Drafts can be resumed via URL parameter

### Using the Hook

```tsx
import { useCampaignDraft } from "@/lib/hooks/use-campaign-draft"

function CampaignWizard() {
  const { draftId, isSaving, lastSavedAt, updateDraft, saveDraft, loadDraft } = useCampaignDraft({
    debounceMs: 2000,
    autoSave: true,
    onSaved: (id) => console.log("Draft saved:", id),
  })

  // Auto-save on field change
  const handleNameChange = (name: string) => {
    setFormData({ ...formData, name })
    updateDraft({ name })
  }

  // Manual save
  const handleSaveDraft = async () => {
    await saveDraft(formData)
  }
}
```

---

## Troubleshooting

### Issue: No request in webhook.site

**Check:**

1. Environment variable is set correctly
2. Dev server was restarted after setting env var
3. Check server logs for `[InspraClient]` messages

### Issue: "Agent must be synced"

**Solution:**

1. Edit the agent
2. Ensure API key is assigned
3. Save to trigger sync
4. Wait for `sync_status` to become `synced`

### Issue: "No outbound phone number configured"

**Solution:**

1. Assign a phone number to the agent
2. Or configure shared outbound in integration settings

### Issue: Block rules not generating correctly

**Check:**

1. `business_hours_config.enabled` is `true`
2. Schedule has valid time slots
3. Check server logs for block rules array

---

## Switching to Production Inspra

When ready to use the actual Inspra API:

1. Update `.env`:

```env
INSPRA_OUTBOUND_API_URL=https://api.inspra.io
INSPRA_API_KEY=your-production-api-key
```

2. Restart the server

3. Test with a small campaign first

---

## Response Fields

Campaign creation response includes:

```json
{
  "id": "campaign-uuid",
  "name": "Test Campaign",
  "status": "draft",
  ...
  "_import": {
    "imported": 2,
    "duplicates": 0,
    "total": 2
  },
  "_inspra": {
    "sent": true,
    "error": null,
    "batchRef": "campaign-campaign-uuid"
  }
}
```

- `_inspra.sent`: Whether Inspra API was called
- `_inspra.error`: Error message if call failed
- `_inspra.batchRef`: Batch reference for tracking

---

_Happy Testing! 🎉_

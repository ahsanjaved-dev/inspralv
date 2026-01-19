# Campaign Module - Complete Architecture & Flow Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Data Flow](#data-flow)
4. [Key Components](#key-components)
5. [Call Processing Flow](#call-processing-flow)
6. [Error Recovery Mechanisms](#error-recovery-mechanisms)
7. [Database Schema](#database-schema)
8. [API Endpoints](#api-endpoints)
9. [Frontend Components](#frontend-components)
10. [Configuration](#configuration)

---

## Overview

The Campaign Module enables bulk outbound calling via VAPI. It handles:
- Creating and managing call campaigns
- Importing recipients (CSV or manual)
- Starting and cancelling campaigns
- Real-time progress tracking
- Error recovery and webhook chain resilience

> **Note**: VAPI does not support pausing campaigns. Once a campaign starts, all calls are processed automatically. To stop a campaign, use the Cancel action which prevents any remaining calls from being initiated.

### Key Design Principles

1. **Webhook-Driven Processing**: Calls are processed in a self-regulating chain. When one call ends, the next starts automatically.
2. **Concurrency Respect**: System respects VAPI's concurrency limits by starting only 1 call per webhook (1-for-1 replacement).
3. **Resilient to Failures**: Transient errors (522, 503, timeouts) don't break the chain - recipients stay pending for retry.
4. **Polling Fallback**: If webhook chain breaks, frontend polling detects stuck campaigns and restarts processing.
5. **No Pause Support**: VAPI queues calls server-side, making pause impossible. Use Cancel to stop remaining calls.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAMPAIGN MODULE ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────┐ │
│  │   Frontend  │────▶│   API       │────▶│  Call Queue │────▶│   VAPI    │ │
│  │   (React)   │     │   Routes    │     │   Manager   │     │   API     │ │
│  └─────────────┘     └─────────────┘     └─────────────┘     └───────────┘ │
│        │                   │                   │                    │       │
│        │                   │                   │                    │       │
│        ▼                   ▼                   ▼                    ▼       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────┐ │
│  │  React      │     │  Supabase   │     │  Webhook    │◀────│   VAPI    │ │
│  │  Query      │◀────│  Realtime   │◀────│  Handler    │     │  Webhooks │ │
│  └─────────────┘     └─────────────┘     └─────────────┘     └───────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Campaign Creation Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    User      │     │  Campaign    │     │   Supabase   │     │   Campaign   │
│   Creates    │────▶│   Wizard     │────▶│   Database   │────▶│   "ready"    │
│   Campaign   │     │   Form       │     │   Insert     │     │   Status     │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 2. Recipient Import Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │    CSV       │     │   Validate   │     │   Supabase   │
│   Uploads    │────▶│   Parser     │────▶│   & Map      │────▶│   Bulk       │
│   CSV File   │     │              │     │   Fields     │     │   Insert     │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 3. Campaign Start Flow (Webhook-Driven)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CAMPAIGN START FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   User      │     │ /start-     │     │  Update     │                   │
│  │   Clicks    │────▶│ scalable    │────▶│  Campaign   │                   │
│  │   "Start"   │     │  API        │     │  to "active"│                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│                             │                                               │
│                             ▼                                               │
│                      ┌─────────────┐                                       │
│                      │ Start 3     │ ◀─── Initial seed to begin chain     │
│                      │ Initial     │                                       │
│                      │ Calls       │                                       │
│                      └─────────────┘                                       │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                          │
│         ▼                   ▼                   ▼                          │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │ Recipient 1 │     │ Recipient 2 │     │ Recipient 3 │                   │
│  │ → "calling" │     │ → "calling" │     │ → "calling" │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4. Webhook Chain Flow (Self-Regulating)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WEBHOOK CHAIN (SELF-REGULATING FLOW)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                         CONTINUOUS LOOP                               │ │
│   │                                                                       │ │
│   │  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             │ │
│   │  │   VAPI      │     │  Webhook    │     │  Update     │             │ │
│   │  │   Sends     │────▶│  Handler    │────▶│  Recipient  │             │ │
│   │  │   "end-of-  │     │  POST       │     │  Status     │             │ │
│   │  │   call"     │     │             │     │  →completed │             │ │
│   │  └─────────────┘     └─────────────┘     └─────────────┘             │ │
│   │                             │                   │                     │ │
│   │                             │                   ▼                     │ │
│   │                             │            ┌─────────────┐              │ │
│   │                             │            │  Update     │              │ │
│   │                             │            │  Campaign   │              │ │
│   │                             │            │  Stats      │              │ │
│   │                             │            └─────────────┘              │ │
│   │                             │                                         │ │
│   │                             ▼                                         │ │
│   │                      ┌─────────────┐                                  │ │
│   │                      │ Check: Has  │                                  │ │
│   │                      │ Pending?    │                                  │ │
│   │                      └─────────────┘                                  │ │
│   │                             │                                         │ │
│   │               ┌─────────────┴─────────────┐                          │ │
│   │               ▼                           ▼                          │ │
│   │        ┌─────────────┐             ┌─────────────┐                   │ │
│   │        │    YES      │             │     NO      │                   │ │
│   │        │ Start next  │             │   Campaign  │                   │ │
│   │        │ call (1)    │             │  COMPLETE   │                   │ │
│   │        └─────────────┘             └─────────────┘                   │ │
│   │              │                                                        │ │
│   │              │ ◀──────────── Loop continues ────────────┐            │ │
│   │              └──────────────────────────────────────────┘            │ │
│   │                                                                       │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Call Processing Flow

### State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RECIPIENT STATE MACHINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                              ┌─────────┐                                    │
│                              │ pending │ ◀── Initial state after import    │
│                              └────┬────┘                                    │
│                                   │                                         │
│                       startNextCalls()                                      │
│                                   │                                         │
│                                   ▼                                         │
│                              ┌─────────┐                                    │
│            ┌────────────────▶│ calling │                                    │
│            │                 └────┬────┘                                    │
│            │                      │                                         │
│            │          ┌───────────┴───────────┐                             │
│            │          ▼                       ▼                             │
│   Transient Error   ┌─────────┐          ┌─────────┐                        │
│   (522, 503, etc)   │completed│          │ failed  │                        │
│   Keep as pending   └─────────┘          └─────────┘                        │
│            │                                  ▲                              │
│            │                                  │                              │
│            │                       Permanent Error                          │
│            │                    (invalid number, etc)                       │
│            └──────────────────────────────────┘                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Concurrency Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONCURRENCY MANAGEMENT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  VAPI Concurrency Limit: ~10-50 active calls (subscription dependent)      │
│                                                                             │
│  Our Approach:                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  MAX_CONCURRENT_CALLS_PER_CAMPAIGN = 3                           │      │
│  │  MAX_CONCURRENT_CALLS_TOTAL = 5                                  │      │
│  │  INITIAL_CONCURRENT_CALLS = 3 (seed to start chain)              │      │
│  │  CALLS_TO_START_ON_WEBHOOK = 1 (1-for-1 replacement)             │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  Why 1-for-1 Replacement?                                                  │
│  ─────────────────────────                                                 │
│  • VAPI's "remainingConcurrentCalls" is unreliable (often returns -1)      │
│  • By starting exactly 1 call when 1 ends, we maintain stable concurrency  │
│  • Prevents "Over Concurrency Limit" errors                                │
│  • Creates predictable, sustainable throughput                             │
│                                                                             │
│  Flow:                                                                      │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐          │
│  │ Active: 3      │     │ Call ends      │     │ Start 1 new    │          │
│  │ calls running  │────▶│ Active: 2      │────▶│ Active: 3      │          │
│  └────────────────┘     └────────────────┘     └────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Error Recovery Mechanisms

### 1. Transient Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TRANSIENT ERROR HANDLING                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Transient Errors (RETRY):             Permanent Errors (FAIL):            │
│  ┌──────────────────────┐              ┌──────────────────────┐            │
│  │ • 429 Rate Limit     │              │ • Invalid phone #    │            │
│  │ • 500 Server Error   │              │ • Auth failed        │            │
│  │ • 502 Bad Gateway    │              │ • Invalid assistant  │            │
│  │ • 503 Service Unavail│              │ • Account suspended  │            │
│  │ • 522 Timeout        │              └──────────────────────┘            │
│  │ • Network errors     │                        │                         │
│  │ • Concurrency limit  │                        ▼                         │
│  └──────────────────────┘               Recipient → "failed"               │
│            │                                                                │
│            ▼                                                                │
│   Recipient stays "pending"                                                │
│   Will be picked up on next                                                │
│   webhook trigger or polling                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Polling Fallback (Stuck Campaign Detection)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       POLLING FALLBACK MECHANISM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PROBLEM: Webhook chain can break if:                                       │
│  • VAPI returns 522 and no webhook arrives                                 │
│  • Webhook gets lost/times out                                             │
│  • Server restarts during processing                                        │
│                                                                             │
│  SOLUTION: Frontend polls every 30 seconds                                  │
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │  Frontend   │     │  /process-  │     │  Check:     │                   │
│  │  Poll       │────▶│  stuck API  │────▶│  Pending>0? │                   │
│  │  (30s)      │     │             │     │  Calling=0? │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│                                                 │                           │
│                                    ┌────────────┴────────────┐             │
│                                    ▼                         ▼             │
│                             ┌─────────────┐          ┌─────────────┐       │
│                             │    YES      │          │     NO      │       │
│                             │  STUCK!     │          │  Chain OK   │       │
│                             │  Restart    │          │  Continue   │       │
│                             └─────────────┘          └─────────────┘       │
│                                    │                                        │
│                                    ▼                                        │
│                             ┌─────────────┐                                │
│                             │ 1. Cleanup  │                                │
│                             │    stale    │                                │
│                             │    calls    │                                │
│                             │             │                                │
│                             │ 2. Restart  │                                │
│                             │    chain    │                                │
│                             └─────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Stale Call Cleanup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STALE CALL CLEANUP                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  A "stale" call is one stuck in "calling" status without webhook           │
│                                                                             │
│  Detection Criteria:                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  call_status = "calling"                                         │      │
│  │  call_started_at < (NOW - 10 minutes)                            │      │
│  │  No call_ended_at                                                │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  Cleanup Action:                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  1. Mark stale recipients as "failed"                            │      │
│  │  2. Update last_error = "Call timed out..."                      │      │
│  │  3. Increment campaign.failed_calls counter                       │      │
│  │  4. Check if campaign should be completed                        │      │
│  └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### Backend Files

| File | Purpose |
|------|---------|
| `lib/campaigns/call-queue-manager.ts` | Core call queue logic, concurrency management |
| `lib/campaigns/stale-call-cleanup.ts` | Detects and cleans up stuck calls |
| `app/api/w/[slug]/campaigns/[id]/start-scalable/route.ts` | Start campaign API |
| `app/api/w/[slug]/campaigns/process-stuck/route.ts` | Polling fallback API |
| `app/api/webhooks/w/[workspaceId]/vapi/route.ts` | VAPI webhook handler |
| `lib/integrations/vapi/calls.ts` | VAPI API client |

### Frontend Files

| File | Purpose |
|------|---------|
| `app/w/[slug]/campaigns/page.tsx` | Campaign list page |
| `app/w/[slug]/campaigns/[id]/page.tsx` | Campaign detail page |
| `lib/hooks/use-campaigns.ts` | React Query hooks for campaigns |
| `components/workspace/campaigns/*` | UI components |

---

## Database Schema

### Core Tables

```sql
-- Campaigns
CREATE TABLE call_campaigns (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  name TEXT NOT NULL,
  status campaign_status NOT NULL DEFAULT 'draft',
  -- Stats (denormalized for performance)
  total_recipients INTEGER DEFAULT 0,
  pending_calls INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipients
CREATE TABLE call_recipients (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES call_campaigns(id),
  workspace_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  -- Call tracking
  call_status recipient_call_status DEFAULT 'pending',
  external_call_id TEXT,
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,
  call_outcome TEXT,
  call_duration_seconds INTEGER,
  call_cost DECIMAL(10,4),
  -- Error handling
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Status Enums

```sql
CREATE TYPE campaign_status AS ENUM (
  'draft',      -- Being configured
  'ready',      -- Ready to start
  'active',     -- Currently processing
  'paused',     -- Manually paused
  'completed',  -- All recipients processed
  'cancelled'   -- Manually cancelled
);

CREATE TYPE recipient_call_status AS ENUM (
  'pending',    -- Waiting to be called
  'calling',    -- Currently in progress
  'completed',  -- Successfully completed
  'failed'      -- Failed (permanent error)
);
```

---

## API Endpoints

### Campaign Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/w/{slug}/campaigns` | GET | List campaigns |
| `/api/w/{slug}/campaigns` | POST | Create campaign |
| `/api/w/{slug}/campaigns/{id}` | GET | Get campaign details |
| `/api/w/{slug}/campaigns/{id}` | PATCH | Update campaign |
| `/api/w/{slug}/campaigns/{id}` | DELETE | Delete campaign |

### Campaign Actions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/w/{slug}/campaigns/{id}/start-scalable` | POST | Start campaign (scalable) |
| `/api/w/{slug}/campaigns/{id}/pause` | POST | Pause active campaign |
| `/api/w/{slug}/campaigns/{id}/resume` | POST | Resume paused campaign |
| `/api/w/{slug}/campaigns/{id}/cleanup` | POST | Cleanup stale calls |

### Polling & Recovery

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/w/{slug}/campaigns/process-stuck` | POST | Continue stuck campaigns |
| `/api/w/{slug}/campaigns/process-stuck` | GET | Check campaign status |

### Recipients

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/w/{slug}/campaigns/{id}/recipients` | GET | List recipients |
| `/api/w/{slug}/campaigns/{id}/recipients` | POST | Add single recipient |
| `/api/w/{slug}/campaigns/{id}/recipients/import` | POST | Bulk import CSV |

### Webhooks

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/w/{workspaceId}/vapi` | POST | VAPI webhook handler |

---

## Configuration

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# VAPI (configured per workspace via integrations)
# API keys stored in partner_integrations.api_keys
```

### Call Queue Configuration

```typescript
// lib/campaigns/call-queue-manager.ts

// Initial calls to start when campaign begins
const INITIAL_CONCURRENT_CALLS = 3

// Calls to start per webhook (1-for-1 replacement)
const CALLS_TO_START_ON_WEBHOOK = 1

// Maximum concurrent calls per campaign
const MAX_CONCURRENT_CALLS_PER_CAMPAIGN = 3

// Maximum concurrent calls across all campaigns
const MAX_CONCURRENT_CALLS_TOTAL = 5

// Delay between calls in a batch
const DELAY_BETWEEN_CALLS_MS = 500

// Time before a "calling" status is considered stale
const STALE_CALL_THRESHOLD_MINUTES = 10

// Cooldown after hitting concurrency limit
const CONCURRENCY_COOLDOWN_MS = 10000

// Retries for concurrency errors
const MAX_CONCURRENCY_RETRIES = 3
```

---

## Frontend Hooks

### Available Hooks

```typescript
// Campaign operations
useCampaign(campaignId)              // Get single campaign
useCampaigns()                       // List campaigns
useCreateCampaign()                  // Create campaign
useUpdateCampaign()                  // Update campaign
useDeleteCampaign()                  // Delete campaign

// Campaign actions
useStartCampaign()                   // Start campaign (original)
useStartScalableCampaign()           // Start campaign (scalable)
usePauseCampaign()                   // Pause campaign
useResumeCampaign()                  // Resume campaign
useCleanupCampaign()                 // Cleanup stale calls

// Polling & recovery
useProcessStuckCampaigns()           // Continue stuck campaigns
useCampaignPollingFallback()         // Auto-polling hook

// Recipients
useCampaignRecipients(campaignId)    // List recipients
useAddRecipient()                    // Add single recipient
useDeleteRecipient()                 // Delete recipient
useImportRecipients()                // Bulk import CSV
```

---

## Performance Characteristics

### Throughput

| Configuration | Throughput | Notes |
|---------------|------------|-------|
| 3 concurrent calls | ~60 calls/hour | Conservative, stable |
| 5 concurrent calls | ~100 calls/hour | Higher throughput |
| 10 concurrent calls | ~200 calls/hour | Requires higher VAPI plan |

### Processing Time (Estimated)

| Recipients | Time | Notes |
|------------|------|-------|
| 60 | ~30-45 min | Tested successfully |
| 180 | ~1.5-2 hours | Linear scaling |
| 500 | ~4-5 hours | Consider business hours |
| 1000 | ~8-10 hours | Multi-day with business hours |

---

## Monitoring & Debugging

### Key Log Patterns

```
[CallQueue] startNextCalls: campaign=X, isInitial=Y, targetCalls=Z
[CallQueue] Call STARTED for {phone}: callId={id}
[CallQueue] Transient error for {phone} - keeping as pending
[CallQueue] Permanent error for {phone} - marking as failed
[CallQueue] Campaign X: started Y, failed Z, remaining N

[VAPI Webhook] End of call report: {callId}
[VAPI Webhook] Campaign recipient X updated: status=Y, outcome=Z
[VAPI Webhook] Remaining recipients to process: N
[VAPI Webhook] Campaign X completed - all recipients processed

[ProcessStuck] Campaign X is STUCK - restarting webhook chain
```

### Health Checks

1. **Active campaigns with no calling recipients** = Stuck (needs restart)
2. **Calling recipients older than 10 minutes** = Stale (needs cleanup)
3. **High failure rate** = Check VAPI logs for issues

---

## Summary

The Campaign Module uses a **webhook-driven, self-regulating architecture** that:

1. ✅ Respects VAPI concurrency limits
2. ✅ Handles transient errors gracefully
3. ✅ Auto-recovers from broken webhook chains
4. ✅ Scales to handle large recipient lists
5. ✅ Provides real-time progress tracking
6. ✅ Works reliably in serverless environments

The key innovation is the **1-for-1 replacement strategy**: when a call ends, exactly 1 new call starts. This creates a stable, predictable flow that never overwhelms VAPI's infrastructure.


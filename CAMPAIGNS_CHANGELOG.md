# Campaigns Module - Changelog & Implementation Guide

## Overview

This document outlines the changes made to the Campaigns module in Phase 1 (Simplifications) and Phase 2 (Expiry Feature).

---

## Phase 1: Simplifications ✅

### 1. Removed "Customize Agent Greeting" Section

**File**: `components/workspace/campaigns/steps/step-variables.tsx`

**Changes**:

- ❌ Removed agent greeting override toggle
- ❌ Removed greeting textarea input
- ❌ Removed system prompt additions input
- ❌ Removed live preview with variable substitution
- ✅ Kept available variables display (read-only badges)
- ✅ Kept agent greeting preview (from agent config)
- ✅ Simplified UI to show auto-mapped variables

**Rationale**:

- Most users don't need per-campaign greeting customization
- Greeting should be configured at the agent level for consistency
- Reduces complexity and cognitive load in the wizard

---

### 2. Simplified Variable Mapping (Auto-Mapping Only)

**File**: `components/workspace/campaigns/steps/step-variables.tsx`

**Changes**:

- ❌ Removed manual placeholder editing
- ❌ Removed default value configuration
- ❌ Removed "Add Custom Variable" button
- ✅ Variables are now auto-generated from CSV columns
- ✅ Display format: `csv_column` → `{{csv_column}}`
- ✅ Read-only badges show available variables

**Rationale**:

- Auto-mapping is intuitive and reduces user errors
- Manual configuration adds unnecessary friction
- CSV columns naturally map to variable names

---

### 3. Removed "Weekly Summary Card"

**File**: `components/workspace/campaigns/steps/step-schedule.tsx`

**Changes**:

- ❌ Removed weekly summary card with bar chart
- ❌ Removed total hours/week calculation
- ❌ Removed `useMemo` for hours calculation
- ✅ Kept business hours configuration (day/time selection)
- ✅ Kept timezone selector

**Rationale**:

- Nice-to-have visualization, not essential for MVP
- Users care more about setting hours than seeing summary
- Reduces visual clutter

---

### 4. Updated Wizard from 5 Steps to 4 Steps

**File**: `components/workspace/campaigns/campaign-wizard.tsx`

**Changes**:

- ❌ Removed Step 3 "Variable Mapping" as standalone step
- ✅ Variables are now auto-generated during CSV import (Step 2)
- ✅ New flow:
  1. Campaign Details
  2. Import Recipients (auto-generates variables)
  3. Schedule
  4. Review & Launch

**Rationale**:

- Variable mapping doesn't need a dedicated step
- Streamlines the wizard flow
- Reduces clicks to campaign creation

---

## Phase 2: Expiry Feature ✅

### 1. Database Schema Changes

**File**: `supabase/migrations/20260106_add_campaign_expiry.sql`

**Changes**:

```sql
-- New column
ALTER TABLE call_campaigns
ADD COLUMN scheduled_expires_at TIMESTAMPTZ NULL;

-- Index for efficient queries
CREATE INDEX idx_campaigns_expiry
ON call_campaigns(scheduled_expires_at)
WHERE scheduled_expires_at IS NOT NULL
  AND status = 'draft';

-- Constraint: expiry must be after start
ALTER TABLE call_campaigns
ADD CONSTRAINT chk_expiry_after_start
CHECK (scheduled_expires_at > scheduled_start_at);
```

**To Apply**:

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase Dashboard SQL Editor
```

---

### 2. TypeScript Types Updated

**File**: `types/database.types.ts`

**Changes**:

```typescript
export interface CallCampaign {
  // ... existing fields
  scheduled_expires_at: string | null // NEW
}

// Zod schemas updated
export const createCampaignWizardSchema = z
  .object({
    // ... existing fields
    scheduled_expires_at: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => {
      // Validation: expiry must be after start
      if (data.scheduled_expires_at && data.scheduled_start_at) {
        return new Date(data.scheduled_expires_at) > new Date(data.scheduled_start_at)
      }
      return true
    },
    { message: "Expiry date must be after start date" }
  )
```

---

### 3. UI Changes

**File**: `components/workspace/campaigns/steps/step-schedule.tsx`

**New UI Element**:

```tsx
<Input
  type="datetime-local"
  label="Expiry Date & Time (Optional)"
  helperText="Campaign will auto-cancel if not started by this time"
/>
```

**Features**:

- Optional field (only shown when "Schedule for Later" is selected)
- Validation: Must be after start date
- Helper text explains behavior
- Icon indicator when expiry is set

---

### 4. API Route Updates

**File**: `app/api/w/[workspaceSlug]/campaigns/route.ts`

**Changes**:

```typescript
const campaignData = {
  // ... existing fields
  scheduled_expires_at: rest.scheduled_expires_at || null,
}
```

---

### 5. Cleanup System

**New Files Created**:

#### A. Cleanup Logic

**File**: `lib/campaigns/cleanup-expired.ts`

**Functions**:

```typescript
// Cancel expired campaigns
export async function cleanupExpiredCampaigns(): Promise<CleanupResult>

// Get campaigns expiring soon (for notifications)
export async function getCampaignsExpiringSoon()
```

#### B. Cron API Endpoint

**File**: `app/api/cron/cleanup-expired-campaigns/route.ts`

**Endpoints**:

- `POST /api/cron/cleanup-expired-campaigns` - Trigger cleanup
- `GET /api/cron/cleanup-expired-campaigns` - Health check

**Security**:

- Requires `Authorization: Bearer <CRON_SECRET>` header
- Set `CRON_SECRET` or `VERCEL_CRON_SECRET` in environment variables

#### C. Vercel Cron Configuration

**File**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-expired-campaigns",
      "schedule": "0 * * * *" // Every hour
    }
  ]
}
```

---

## Setup Instructions

### 1. Database Migration

```bash
# Apply the migration
cd genius365
supabase db push

# Or manually run the SQL in Supabase Dashboard
```

### 2. Environment Variables

Add to `.env.local`:

```bash
# For cron job security
CRON_SECRET=your-secret-key-here

# Or use Vercel's built-in
VERCEL_CRON_SECRET=auto-generated-by-vercel
```

### 3. Vercel Cron Setup (if using Vercel)

The `vercel.json` file is already configured. Cron will automatically run every hour in production.

**Manual Testing**:

```bash
curl -X POST https://your-domain.com/api/cron/cleanup-expired-campaigns \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 4. Alternative Cron Solutions

If not using Vercel:

**GitHub Actions** (`.github/workflows/cleanup-campaigns.yml`):

```yaml
name: Cleanup Expired Campaigns
on:
  schedule:
    - cron: "0 * * * *" # Every hour
jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger cleanup
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/cron/cleanup-expired-campaigns \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

**External Cron Service** (cron-job.org, EasyCron, etc.):

- URL: `https://your-domain.com/api/cron/cleanup-expired-campaigns`
- Method: POST
- Header: `Authorization: Bearer YOUR_CRON_SECRET`
- Schedule: Every hour

---

## Testing Guide

### 1. Test Simplified Wizard

1. Navigate to `/w/your-workspace/campaigns/new`
2. Verify wizard shows 4 steps (not 5)
3. Complete Step 1: Campaign Details
4. Complete Step 2: Import CSV
   - Variables should auto-appear as badges
   - No manual editing UI
5. Complete Step 3: Schedule
   - No weekly summary card
   - Expiry field appears when "Schedule for Later" is selected
6. Complete Step 4: Review & Launch

### 2. Test Expiry Feature

**Create Campaign with Expiry**:

```typescript
// Set expiry 1 hour from now
const startDate = new Date()
startDate.setHours(startDate.getHours() + 1)

const expiryDate = new Date()
expiryDate.setHours(expiryDate.getHours() + 2)

// Create campaign via UI with these dates
```

**Verify Validation**:

- Try setting expiry before start date → Should show error
- Try setting expiry without start date → Should work (optional)

**Test Cleanup**:

```bash
# Manually trigger cleanup
curl -X POST http://localhost:3000/api/cron/cleanup-expired-campaigns \
  -H "Authorization: Bearer your-secret"

# Check response
{
  "success": true,
  "cancelledCount": 2,
  "message": "Successfully cancelled 2 expired campaigns"
}
```

### 3. Test Database Function (Optional)

```sql
-- In Supabase SQL Editor
SELECT * FROM cancel_expired_campaigns();

-- Returns cancelled campaigns
```

---

## Breaking Changes

### ⚠️ Data Migration Notes

**No breaking changes** for existing campaigns:

- `scheduled_expires_at` is nullable
- Existing campaigns continue to work
- No data migration required

### ⚠️ API Changes

**New optional field** in campaign creation:

```typescript
// Before
{
  scheduled_start_at: "2026-01-15T09:00:00Z"
}

// After (optional)
{
  scheduled_start_at: "2026-01-15T09:00:00Z",
  scheduled_expires_at: "2026-01-22T09:00:00Z"  // NEW
}
```

---

## Performance Considerations

### Database Index

- Index on `scheduled_expires_at` ensures fast cleanup queries
- Partial index (WHERE clause) reduces index size

### Cron Frequency

- Running every hour is recommended
- Adjust in `vercel.json` if needed:
  - `0 */2 * * *` - Every 2 hours
  - `0 0 * * *` - Daily at midnight

### Query Efficiency

```sql
-- Efficient query with index
SELECT * FROM call_campaigns
WHERE status = 'draft'
  AND scheduled_expires_at < NOW()
  AND deleted_at IS NULL;

-- Uses: idx_campaigns_expiry
```

---

## Future Enhancements

### Notification System (Phase 3 - Optional)

**Email Notifications**:

- Send email 24h before expiry
- Use `getCampaignsExpiringSoon()` function
- Integrate with existing email system (Resend)

**Implementation**:

```typescript
// lib/campaigns/notify-expiring.ts
export async function notifyExpiringCampaigns() {
  const campaigns = await getCampaignsExpiringSoon()

  for (const campaign of campaigns) {
    await sendEmail({
      to: campaign.created_by_email,
      subject: `Campaign "${campaign.name}" expires in 24 hours`,
      template: "campaign-expiring",
      data: { campaign },
    })
  }
}
```

---

## Rollback Plan

If issues arise, rollback steps:

### 1. Revert Database Changes

```sql
-- Remove constraint
ALTER TABLE call_campaigns
DROP CONSTRAINT IF EXISTS chk_expiry_after_start;

-- Remove index
DROP INDEX IF EXISTS idx_campaigns_expiry;

-- Remove column (if needed)
ALTER TABLE call_campaigns
DROP COLUMN IF EXISTS scheduled_expires_at;
```

### 2. Revert Code Changes

```bash
git revert <commit-hash>
```

### 3. Disable Cron

Remove or comment out in `vercel.json`:

```json
{
  "crons": []
}
```

---

## Support & Troubleshooting

### Common Issues

**Issue**: Cron not running

- **Solution**: Check `CRON_SECRET` is set in Vercel environment variables
- **Verify**: Check Vercel Cron logs in dashboard

**Issue**: Campaigns not cancelling

- **Solution**: Check database index exists: `\d call_campaigns` in psql
- **Verify**: Run cleanup manually via API endpoint

**Issue**: Validation errors in wizard

- **Solution**: Ensure expiry is after start date
- **Check**: Browser console for detailed error messages

---

## Summary

### Phase 1 Completed ✅

- ✅ Removed agent greeting customization
- ✅ Simplified variable mapping to auto-only
- ✅ Removed weekly summary card
- ✅ Updated wizard to 4 steps

### Phase 2 Completed ✅

- ✅ Added `scheduled_expires_at` field to database
- ✅ Updated TypeScript types and Zod schemas
- ✅ Added expiry input to schedule step UI
- ✅ Updated API routes to handle expiry
- ✅ Created cleanup system with cron job
- ✅ Added database migration file
- ✅ Configured Vercel cron

### Files Modified

- `components/workspace/campaigns/steps/step-variables.tsx`
- `components/workspace/campaigns/steps/step-schedule.tsx`
- `components/workspace/campaigns/campaign-wizard.tsx`
- `types/database.types.ts`
- `app/api/w/[workspaceSlug]/campaigns/route.ts`

### Files Created

- `lib/campaigns/cleanup-expired.ts`
- `app/api/cron/cleanup-expired-campaigns/route.ts`
- `vercel.json`
- `supabase/migrations/20260106_add_campaign_expiry.sql`
- `CAMPAIGNS_CHANGELOG.md` (this file)

---

**Last Updated**: January 6, 2026  
**Version**: 2.0.0  
**Status**: ✅ Production Ready

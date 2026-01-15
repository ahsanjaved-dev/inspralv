# Campaign Module End-to-End Testing Guide

This guide walks you through comprehensive testing of the Campaign Module using 500 fictional Australian phone numbers.

## Overview

The Campaign Module processes outbound calls through VAPI with the following characteristics:
- **Sequential Processing**: Calls are made one at a time with 1.5 second delays
- **Rate Limiting**: Automatic retry with 5-second wait on rate limits
- **Real-time Updates**: UI updates via Supabase Realtime subscriptions
- **Business Hours**: Optional scheduling with periodic re-checks

---

## Pre-Flight Checklist

### 1. Verify Development Server is Running

```bash
cd genius365
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Verify VAPI Configuration

Before testing campaigns, ensure your workspace has VAPI configured:

1. Go to **Settings** → **Integrations**
2. Verify VAPI API Key is configured
3. Verify you have at least one VAPI phone number for outbound calls

### 3. Verify Agent Configuration

1. Go to **Agents** section
2. Ensure you have an agent synced with VAPI (has `external_agent_id`)
3. The agent should have an assigned phone number for outbound calls

### 4. Open Developer Tools

Open browser DevTools (F12) to:
- Monitor **Console** for real-time subscription logs
- Monitor **Network** tab for API calls
- Check for any errors

---

## Milestone 1: Campaign Creation with CSV Import

### Test Steps

1. Navigate to **Campaigns** → **New Campaign**
2. Fill in campaign details:
   - **Name**: "Load Test - 500 Recipients"
   - **Agent**: Select your VAPI-synced agent
   - **Schedule Type**: "Immediate" or "Scheduled"

3. **Import CSV File**:
   - Click "Import CSV"
   - Select `docs/campaign-test-data-500.csv`
   - Map columns:
     - `phone_number` → Phone Number
     - `first_name` → First Name
     - `last_name` → Last Name
     - `email` → Email
     - `company` → Company
     - `reason_for_call` → Reason for Call

4. Click **Create Campaign** (but DON'T click "Start Now" yet)

### Expected Results

- [ ] Campaign is created in "Draft" or "Pending" status
- [ ] 500 recipients are imported and visible
- [ ] No calls are initiated yet (fixed duplicate call issue)
- [ ] Database shows recipients with status "pending"

### Verification Queries (Prisma Studio)

```bash
npm run db:studio
```

Check `call_campaigns` and `call_recipients` tables.

---

## Milestone 2: Real-Time Updates Testing

### 2.1 Prepare for Monitoring

Before starting the campaign, set up monitoring:

1. **Open Campaign Detail Page**
   - Navigate to the campaign you created
   - Look for the **"Live"** indicator (green pulsing dot) next to "Recipients"
   - If showing "Connecting...", wait for WebSocket connection

2. **Open Browser Console**
   - You should see logs like:
   ```
   [RealtimeCampaign] Subscribing to recipient channel: campaign-recipients-{id}
   [RealtimeCampaign] Subscribing to campaign channel: campaign-stats-{id}
   [RealtimeCampaign] Recipient subscription status: SUBSCRIBED
   [RealtimeCampaign] Campaign subscription status: SUBSCRIBED
   ```

### 2.2 Start the Campaign

1. Click **"Start Now"** button
2. Watch the console for batch processing logs:
   ```
   [VapiBatch] Starting batch: campaign-{id}
   [VapiBatch] Total recipients: 500
   [VapiBatch] Progress: 10/500 (X success, Y failed)
   ```

### 2.3 Observe Real-Time Updates

As calls are initiated, observe:

- [ ] **Recipient Status Changes**: Table rows update from "pending" → "in_progress" → "completed"/"failed"
- [ ] **Campaign Statistics**: Header stats update (Pending/Completed/Successful/Failed counts)
- [ ] **No Page Refresh Required**: Updates happen automatically
- [ ] **Console Logs**: `[RealtimeCampaign] Recipient update:` messages appear

### Expected Behavior

| Scenario | Expected Update |
|----------|-----------------|
| Call initiated | Status: pending → in_progress |
| Call completed successfully | Status: in_progress → completed |
| Call failed | Status: in_progress → failed |
| Campaign stats | Counts update in real-time |

---

## Milestone 3: Campaign Control Testing

### 3.1 Test Pause Functionality

1. While campaign is running (status: "active"), click **"Pause"**
2. Expected:
   - [ ] Campaign status changes to "paused"
   - [ ] No new calls are initiated
   - [ ] Existing in-progress calls continue to completion

### 3.2 Test Resume Functionality

1. While campaign is paused, click **"Resume"**
2. Expected:
   - [ ] Campaign status changes back to "active"
   - [ ] Remaining pending recipients start being called
   - [ ] Progress continues from where it left off

### 3.3 Test Terminate Functionality

1. Create a new small test campaign (10 recipients)
2. Start it and immediately click **"Terminate"**
3. Expected:
   - [ ] Campaign status changes to "terminated"
   - [ ] No new calls are initiated
   - [ ] Remaining recipients stay in "pending" status

---

## Milestone 4: Delete Campaign Testing

This tests the fix for the 500 error that was occurring.

### 4.1 Delete a Completed Campaign

1. Navigate to a completed/terminated campaign
2. Click **"Delete"** button
3. Expected:
   - [ ] Confirmation dialog appears
   - [ ] Campaign is deleted from UI
   - [ ] Campaign is deleted from database
   - [ ] Associated recipients are deleted
   - [ ] No 500 error

### 4.2 Delete an Active Campaign

1. Create and start a new campaign
2. While it's active, click **"Delete"**
3. Expected:
   - [ ] Campaign is terminated first (provider notified)
   - [ ] Then deleted from database
   - [ ] No errors in console

### Verification

```bash
# In Prisma Studio, verify campaign and recipients are gone
npm run db:studio
```

---

## Milestone 5: Concurrency & Load Testing

### 5.1 Sequential Processing Verification

The system processes calls sequentially with 1.5s delays. For 500 recipients:
- **Expected Time**: ~12-15 minutes (500 × 1.5s = 750 seconds + call setup time)

Monitor the console for progress:
```
[VapiBatch] Progress: 100/500 (95 success, 5 failed)
[VapiBatch] Progress: 200/500 (190 success, 10 failed)
...
```

### 5.2 Multiple Campaigns Test

Test running multiple campaigns simultaneously:

1. Create **Campaign A** with 50 recipients from the CSV
2. Create **Campaign B** with 50 different recipients
3. Start both campaigns nearly simultaneously
4. Observe:
   - [ ] Both campaigns process independently
   - [ ] Real-time updates work for both campaign detail pages
   - [ ] No interference between campaigns

### 5.3 Rate Limit Handling

If VAPI returns rate limits (429):
- [ ] System automatically waits 5 seconds
- [ ] Retries the call
- [ ] Logs show: `[VapiBatch] Rate limited, waiting before retry...`

### 5.4 Browser Performance

With 500 recipients updating in real-time:
- [ ] Page remains responsive
- [ ] No memory leaks (check DevTools → Memory)
- [ ] Events are capped at 50 recent events (implemented in hook)

---

## Milestone 6: Webhook & Status Tracking

### 6.1 Verify Webhook Processing

VAPI sends webhooks to `/api/webhooks/vapi` (or workspace-specific URL).

In server logs, look for:
```
[VAPIWebhook] Processing call status: ended
[VAPIWebhook] Updating campaign recipient status...
```

### 6.2 Call Status Flow

```
pending → in_progress → [completed | failed | no_answer | busy | cancelled]
```

Each status change should:
1. Update `call_recipients` table
2. Update `call_campaigns` stats (pending_calls, completed_calls, etc.)
3. Trigger Supabase Realtime event
4. Update UI automatically

---

## Test Data Reference

The test CSV (`docs/campaign-test-data-500.csv`) contains:

| Field | Description |
|-------|-------------|
| phone_number | Australian format (+61...) |
| first_name | Test first name |
| last_name | Test last name |
| email | test@testmail.com |
| company | Fictional company name |
| reason_for_call | Call purpose |
| priority | high/medium/low |
| region | NSW/VIC |

**Distribution**:
- 200 NSW numbers (+6125..., +6127...)
- 200 VIC numbers (+6135..., +6137...)
- 100 mixed additional

---

## Troubleshooting

### Real-Time Updates Not Working

1. Check browser console for WebSocket errors
2. Verify Supabase Realtime is enabled in your Supabase project
3. Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set

### Campaign Not Starting

1. Verify VAPI API key is valid
2. Check agent has `external_agent_id`
3. Verify phone number ID is configured
4. Check server logs for errors

### Calls Failing

1. Check VAPI dashboard for call logs
2. Verify phone numbers are in valid format
3. Check if you've hit VAPI rate limits
4. Review webhook logs for error details

### Delete Returns 500 Error

This should be fixed now. If it recurs:
1. Check server logs for the specific error
2. Verify `providerResult` is properly initialized in the DELETE route

---

## Performance Benchmarks

| Metric | Expected | Notes |
|--------|----------|-------|
| CSV Import (500 rows) | < 5 seconds | UI should show progress |
| Real-time latency | < 500ms | Status changes should appear quickly |
| Memory usage | < 100MB increase | Check DevTools Memory tab |
| Batch completion (500) | ~15 minutes | With 1.5s delay per call |

---

## Test Checklist Summary

- [ ] **Pre-flight**: Server running, VAPI configured, Agent ready
- [ ] **Creation**: CSV import works, no duplicate calls on create
- [ ] **Real-time**: Live indicator shows, status updates automatically
- [ ] **Controls**: Pause/Resume/Terminate work correctly
- [ ] **Delete**: No 500 error, data cleaned up
- [ ] **Concurrency**: Multiple campaigns work, rate limits handled
- [ ] **Webhooks**: Status updates flow through correctly

---

## Notes for Production Testing

⚠️ **Important**: The test data uses fictional Australian numbers (+6125550000x, etc.). These are reserved for testing and won't connect to real phones.

For production testing with real calls:
1. Use a small batch (5-10 numbers)
2. Use your own phone numbers
3. Monitor VAPI costs
4. Verify call recordings/transcripts are captured


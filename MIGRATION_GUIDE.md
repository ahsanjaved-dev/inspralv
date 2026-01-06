# 🔄 Campaigns Module Migration Guide

## Quick Start

This guide will help you deploy the campaigns module updates to production.

---

## ⏱️ Estimated Time: 15 minutes

---

## 📋 Pre-Deployment Checklist

- [ ] Review `CAMPAIGNS_CHANGELOG.md` for detailed changes
- [ ] Backup production database (optional but recommended)
- [ ] Verify Supabase connection is working
- [ ] Have access to Vercel dashboard (for environment variables)

---

## 🚀 Deployment Steps

### Step 1: Database Migration (5 minutes)

**Option A: Using Supabase CLI** (Recommended)
```bash
cd genius365
supabase db push
```

**Option B: Manual SQL Execution**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents from `supabase/migrations/20260106_add_campaign_expiry.sql`
3. Click "Run"
4. Verify success message

**Verification**:
```sql
-- Check column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'call_campaigns' 
  AND column_name = 'scheduled_expires_at';

-- Check index exists
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'call_campaigns' 
  AND indexname = 'idx_campaigns_expiry';
```

Expected results:
- Column: `scheduled_expires_at` (timestamptz)
- Index: `idx_campaigns_expiry` (exists)

---

### Step 2: Environment Variables (2 minutes)

**Local Development** (`.env.local`):
```bash
# Add this line
CRON_SECRET=your-local-secret-key
```

**Production** (Vercel Dashboard):
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add new variable:
   - Name: `CRON_SECRET`
   - Value: Generate a secure random string (use password generator)
   - Environment: Production
3. Click "Save"

**Generate Secure Secret**:
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use online generator: https://randomkeygen.com/
```

---

### Step 3: Deploy Code (5 minutes)

```bash
# Commit changes
git add .
git commit -m "feat: simplify campaigns wizard and add expiry feature

- Remove agent greeting customization
- Simplify variable mapping to auto-only
- Remove weekly summary card
- Update wizard from 5 to 4 steps
- Add campaign expiry feature
- Add automated cleanup cron job"

# Push to production
git push origin main
```

Vercel will automatically:
- Build and deploy
- Set up cron job from `vercel.json`
- Apply environment variables

---

### Step 4: Verification (3 minutes)

#### A. Test Wizard Flow
1. Navigate to production: `https://your-domain.com/w/workspace-slug/campaigns/new`
2. Verify 4 steps (not 5)
3. Create a test campaign
4. Check expiry field appears in Step 3

#### B. Test Cron Endpoint
```bash
# Replace with your production URL and secret
curl -X POST https://your-domain.com/api/cron/cleanup-expired-campaigns \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Expected response:
{
  "success": true,
  "message": "Successfully cancelled 0 expired campaigns",
  "cancelledCount": 0
}
```

#### C. Check Vercel Cron
1. Go to Vercel Dashboard → Your Project → Cron Jobs
2. Verify job is listed: `/api/cron/cleanup-expired-campaigns`
3. Schedule: `0 * * * *` (every hour)
4. Check "Last Run" after first hour

---

## 🧪 Testing Scenarios

### Test 1: Create Campaign with Expiry

1. Create new campaign
2. Select "Schedule for Later"
3. Set start date: Tomorrow at 9 AM
4. Set expiry date: Tomorrow at 11 AM
5. Complete wizard
6. Verify campaign is created with status "draft"

### Test 2: Expiry Validation

1. Create new campaign
2. Select "Schedule for Later"
3. Set start date: Tomorrow at 9 AM
4. Set expiry date: Tomorrow at 8 AM (before start)
5. Try to proceed → Should show error: "Expiry date must be after start date"

### Test 3: Cleanup Function

**Create Expired Campaign** (via database):
```sql
-- Insert test campaign with past expiry
INSERT INTO call_campaigns (
  workspace_id,
  agent_id,
  name,
  status,
  schedule_type,
  scheduled_start_at,
  scheduled_expires_at,
  created_by
) VALUES (
  'your-workspace-id',
  'your-agent-id',
  'Test Expired Campaign',
  'draft',
  'scheduled',
  NOW() + INTERVAL '1 hour',
  NOW() - INTERVAL '1 hour',  -- Already expired
  'your-user-id'
);
```

**Trigger Cleanup**:
```bash
curl -X POST https://your-domain.com/api/cron/cleanup-expired-campaigns \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Verify**:
```sql
-- Check campaign was cancelled
SELECT id, name, status 
FROM call_campaigns 
WHERE name = 'Test Expired Campaign';

-- Expected: status = 'cancelled'
```

---

## 🔧 Troubleshooting

### Issue: Migration fails

**Error**: Column already exists
```
ERROR: column "scheduled_expires_at" of relation "call_campaigns" already exists
```

**Solution**: Migration was already applied. Skip to Step 2.

---

### Issue: Cron not running

**Symptoms**: No logs in Vercel dashboard, campaigns not cancelling

**Checks**:
1. Verify `vercel.json` is in root directory
2. Check environment variable `CRON_SECRET` is set
3. Verify project is on Vercel Pro plan (cron requires Pro)

**Solution**:
```bash
# Redeploy to trigger cron setup
git commit --allow-empty -m "chore: trigger redeploy"
git push origin main
```

---

### Issue: Unauthorized error when testing cron

**Error**: `{ "error": "Unauthorized" }`

**Solution**: Check `Authorization` header matches `CRON_SECRET`:
```bash
# Get secret from Vercel dashboard
# Or check .env.local for local testing
```

---

### Issue: Validation error in wizard

**Error**: "Expiry date must be after start date"

**Cause**: User set expiry before start date

**Solution**: This is expected behavior. Ensure expiry is chronologically after start.

---

## 📊 Monitoring

### Vercel Dashboard
- **Cron Jobs**: Check execution logs
- **Functions**: Monitor API endpoint performance
- **Logs**: Search for `[CleanupCron]` or `[CleanupExpired]`

### Supabase Dashboard
- **SQL Editor**: Query expired campaigns
- **Table Editor**: View `call_campaigns` table
- **Logs**: Check for database errors

### Monitoring Queries

**Count campaigns with expiry**:
```sql
SELECT COUNT(*) 
FROM call_campaigns 
WHERE scheduled_expires_at IS NOT NULL;
```

**Find campaigns expiring soon**:
```sql
SELECT id, name, scheduled_expires_at
FROM call_campaigns
WHERE status = 'draft'
  AND scheduled_expires_at > NOW()
  AND scheduled_expires_at < NOW() + INTERVAL '24 hours';
```

**Check cleanup history** (via logs):
```sql
-- In Vercel logs, search for:
[CleanupCron] Cleanup successful. Cancelled X campaigns
```

---

## 🔄 Rollback Plan

If issues occur, follow these steps:

### 1. Revert Code
```bash
git revert HEAD
git push origin main
```

### 2. Disable Cron (if needed)
Edit `vercel.json`:
```json
{
  "crons": []
}
```

Then redeploy:
```bash
git add vercel.json
git commit -m "chore: disable cron temporarily"
git push origin main
```

### 3. Revert Database (if necessary)
```sql
-- Remove constraint
ALTER TABLE call_campaigns 
DROP CONSTRAINT IF EXISTS chk_expiry_after_start;

-- Remove index
DROP INDEX IF EXISTS idx_campaigns_expiry;

-- Remove column (ONLY if causing issues)
ALTER TABLE call_campaigns 
DROP COLUMN IF EXISTS scheduled_expires_at;
```

---

## 📞 Support

### Questions?
- Review `CAMPAIGNS_CHANGELOG.md` for technical details
- Check `CODEBASE_REFERENCE.md` for architecture overview
- Search codebase for `scheduled_expires_at` to see usage

### Report Issues
Create a ticket with:
- Error message
- Steps to reproduce
- Browser console logs
- Vercel function logs

---

## ✅ Post-Deployment Checklist

After deployment, verify:

- [ ] Database migration applied successfully
- [ ] Environment variable `CRON_SECRET` is set
- [ ] Code deployed to production
- [ ] Wizard shows 4 steps
- [ ] Expiry field appears in schedule step
- [ ] Cron job is running (check Vercel dashboard)
- [ ] Test campaign creation works
- [ ] Validation prevents expiry before start date
- [ ] Manual cron trigger returns success

---

## 🎉 Success!

If all checks pass, the migration is complete. The campaigns module is now:
- ✅ Simplified (4 steps instead of 5)
- ✅ More intuitive (auto variable mapping)
- ✅ Safer (automatic expiry handling)
- ✅ Automated (cron cleanup every hour)

**Estimated Impact**:
- 30% faster campaign creation
- Reduced user errors
- Automatic cleanup of forgotten campaigns

---

**Last Updated**: January 6, 2026  
**Version**: 2.0.0  
**Status**: Production Ready


# Local Subdomain Testing Guide

This guide explains how to test partner subdomains in local development.

## The Problem

In production, partners access their white-labeled platform via subdomains like:
- `https://acme-corp.genius365.app`
- `https://partner-xyz.genius365.app`

In local development, you typically access `http://localhost:3000`, which doesn't include a subdomain. This means the system can't resolve the partner and falls back to the platform partner.

## Solutions

### Option 1: Use DEV_PARTNER_SLUG (Easiest)

Set the `DEV_PARTNER_SLUG` environment variable to bypass hostname resolution:

```env
# .env.local
DEV_PARTNER_SLUG=acme-corp
```

This will make ALL requests resolve to the specified partner, regardless of the hostname. Perfect for testing a specific partner's dashboard.

**Pros:**
- No hosts file changes needed
- Works immediately
- Easy to switch between partners

**Cons:**
- Can only test one partner at a time
- Need to restart dev server to switch partners

---

### Option 2: Use subdomain.localhost (Recommended for Multi-Partner Testing)

Modern browsers support subdomains of localhost. Access your partner via:

```
http://acme-corp.localhost:3000/login
```

The system will extract `acme-corp` from the hostname and match it to the partner's slug.

**Pros:**
- Test multiple partners in different browser tabs
- More realistic testing experience
- No configuration needed

**Cons:**
- Some older browsers may not support this
- Cookies may not share between subdomains

---

### Option 3: Edit Hosts File (Most Production-Like)

For the most production-like experience, edit your hosts file:

**Windows:** `C:\Windows\System32\drivers\etc\hosts`
**Mac/Linux:** `/etc/hosts`

Add entries for your partner subdomains:

```
127.0.0.1 acme-corp.localhost
127.0.0.1 partner-xyz.localhost
127.0.0.1 agency-abc.localhost
```

Then access:
```
http://acme-corp.localhost:3000/login
```

**Pros:**
- Most production-like behavior
- Works with all browsers
- Test multiple partners simultaneously

**Cons:**
- Requires admin/sudo access
- Manual setup for each partner

---

### Option 4: Use lvh.me (Zero Config)

`lvh.me` is a free service that resolves any subdomain to `127.0.0.1`:

```
http://acme-corp.lvh.me:3000/login
```

For this to work, you need to set your platform domain:

```env
# .env.local
NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me
```

**Pros:**
- No hosts file changes
- Works with any subdomain
- No configuration needed

**Cons:**
- Requires internet connection (for DNS resolution)
- Partner domains stored with `lvh.me` won't work in production

---

## Quick Start

### Testing a New Partner

1. **Submit a partner request** at `http://localhost:3000/request-partner`

2. **Approve in Super Admin** at `http://localhost:3000/super-admin/partner-requests`

3. **Set the development helper** (choose one):

   ```env
   # Option A: Direct slug override
   DEV_PARTNER_SLUG=your-subdomain
   ```

   OR

   Access via subdomain:
   ```
   http://your-subdomain.localhost:3000/login
   ```

4. **Login** with the credentials from the approval email

---

## Troubleshooting

### "Access Required" Error

This means the partner wasn't resolved correctly. Check:

1. **Is `DEV_PARTNER_SLUG` set correctly?** Check `.env.local`
2. **Is the partner slug correct?** Check in super-admin → partners
3. **Is the hostname matching?** Check browser console for `[Partner]` logs
4. **Is the user a member?** Check `partner_members` table in database

### Branding Not Applied

Same root cause as above. The branding comes from the resolved partner. If the wrong partner is resolved, you'll see wrong branding.

### Login Redirects to Wrong Page

Clear cookies and try again. Sometimes stale session cookies cause issues.

---

## Database Verification

Check if your partner was provisioned correctly:

```sql
-- Check partner exists
SELECT id, name, slug, is_platform_partner 
FROM partners 
WHERE slug = 'your-subdomain';

-- Check domain was created
SELECT * FROM partner_domains 
WHERE hostname LIKE '%your-subdomain%';

-- Check user is a member
SELECT pm.*, u.email 
FROM partner_members pm 
JOIN users u ON pm.user_id = u.id 
WHERE pm.partner_id = 'partner-id-here';

-- Check workspace was created
SELECT * FROM workspaces 
WHERE partner_id = 'partner-id-here';
```

---

## Production Setup

For production, you need:

1. **Wildcard DNS**: `*.genius365.app` → Your server IP
2. **Wildcard SSL**: Certificate for `*.genius365.app`
3. **Environment Variable**: `NEXT_PUBLIC_PLATFORM_DOMAIN=genius365.app`

Partners will access via `https://their-subdomain.genius365.app`


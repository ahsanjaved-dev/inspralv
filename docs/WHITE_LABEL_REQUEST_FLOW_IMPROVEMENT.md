# White-Label Partnership Request Flow - Production Roadmap

> **Version**: 1.1  
> **Created**: January 7, 2026  
> **Last Updated**: January 7, 2026  
> **Status**: ✅ IMPLEMENTED

## Implementation Summary

The following changes have been implemented:

### Completed:
- ✅ Environment variable `NEXT_PUBLIC_PLATFORM_DOMAIN` added to `lib/env.ts`
- ✅ Subdomain utilities created at `lib/utils/subdomain.ts`
- ✅ Zod schema updated - `custom_domain` is now optional
- ✅ Partner request form simplified - removed custom domain input
- ✅ API routes updated for subdomain-first approach
- ✅ Provisioning flow uses platform subdomain
- ✅ Super admin views updated
- ✅ Email templates updated
- ✅ Organization settings page shows domain info
- ✅ SQL migration script created

### Pending (Future Enhancement):
- ⏳ Custom domain setup wizard (Milestone 6 in original plan)
- ⏳ DNS verification flow
- ⏳ Domain management APIs

---

## Executive Summary

This document outlines the production roadmap for improving the White-Label Partnership request flow. The key changes are:

1. **Remove custom domain requirement** from the initial request form
2. **Auto-generate unique platform subdomain** (e.g., `acme-agency.genius365.app`)
3. **Defer custom domain setup** to post-approval onboarding (based on plan tier)

---

## Current Flow Analysis

### Current User Journey
```
Step 1: Company & Contact Info
├── Company Name
├── Contact Name
├── Email
└── Phone (optional)

Step 2: Business Details
├── Business Description
├── Expected Users
└── Use Case

Step 3: Domain & Branding ← PROBLEM: Requires custom domain
├── Custom Domain (REQUIRED) ← User must have domain ready
├── Logo Upload
├── Primary Color
└── Secondary Color
```

### Current Issues
1. **High barrier to entry**: Users must have a domain configured before requesting
2. **DNS complexity**: Users asked about DNS setup before they're even approved
3. **Premature decision**: Forcing domain choice before understanding the platform
4. **Support overhead**: DNS issues become blockers during onboarding

---

## Proposed Flow

### New User Journey
```
Step 1: Company & Contact Info (unchanged)
├── Company Name
├── Contact Name
├── Email
└── Phone (optional)

Step 2: Business Details (unchanged)
├── Business Description
├── Expected Users
└── Use Case

Step 3: Branding (simplified) ← SIMPLIFIED
├── Logo Upload (optional)
├── Primary Color
└── Secondary Color
└── [Auto-generated subdomain preview: acme-corp.genius365.app]
```

### Post-Approval Flow (NEW)
```
Partner Onboarding (after approval)
├── Welcome Dashboard
├── Initial Setup Wizard
│   ├── Team Invitations
│   ├── First Workspace Creation
│   └── Custom Domain Setup (based on plan) ← MOVED HERE
└── Full Platform Access via subdomain
```

---

## Technical Architecture

### Domain Strategy

```
Platform Domain: genius365.app (or configured via env)
                    │
    ┌───────────────┼───────────────┐
    │               │               │
acme-corp     partner-xyz     agency-abc
.genius365.app  .genius365.app   .genius365.app
    │
    └── Later: DNS CNAME → app.acmecorp.com (custom domain)
```

### Database Changes

#### 1. Environment Configuration
```env
# New environment variable
NEXT_PUBLIC_PLATFORM_DOMAIN=genius365.app
```

#### 2. Schema Update (partner_requests)
The `custom_domain` field becomes optional and is used only after approval.

```prisma
model PartnerRequest {
  // ... existing fields
  desiredSubdomain    String    @map("desired_subdomain")  // Auto-generated from company name
  customDomain        String?   @map("custom_domain")       // NOW OPTIONAL - set during onboarding
  // Add new field for platform subdomain
  platformSubdomain   String?   @map("platform_subdomain")  // e.g., "acme-corp" (generated on approval)
}
```

#### 3. New fields on Partner model
```prisma
model Partner {
  // ... existing fields
  // Primary subdomain on platform domain
  platformSubdomain   String?   @unique @map("platform_subdomain")  // e.g., "acme-corp"
  // Custom domain is handled via partner_domains table (already exists)
  // Domain setup status
  domainSetupComplete Boolean   @default(false) @map("domain_setup_complete")
}
```

---

## Implementation Milestones

### Milestone 1: Environment & Schema Updates
**Duration**: 1 day  
**Priority**: High  
**Dependencies**: None

#### Tasks:
1. [ ] Add `NEXT_PUBLIC_PLATFORM_DOMAIN` to `.env.example` and Vercel
2. [ ] Update `lib/env.ts` to include new env var
3. [ ] Create SQL migration for schema changes:
   - Make `custom_domain` nullable in `partner_requests`
   - Add `platform_subdomain` to `partner_requests`
   - Add `platform_subdomain` and `domain_setup_complete` to `partners`
4. [ ] Update Prisma schema and regenerate client
5. [ ] Update TypeScript types in `types/database.types.ts`

#### SQL Migration:
```sql
-- Make custom_domain optional
ALTER TABLE partner_requests ALTER COLUMN custom_domain DROP NOT NULL;

-- Add platform subdomain fields
ALTER TABLE partner_requests ADD COLUMN platform_subdomain VARCHAR(100);
ALTER TABLE partners ADD COLUMN platform_subdomain VARCHAR(100) UNIQUE;
ALTER TABLE partners ADD COLUMN domain_setup_complete BOOLEAN DEFAULT FALSE;

-- Create index for faster lookups
CREATE INDEX idx_partners_platform_subdomain ON partners(platform_subdomain);
```

---

### Milestone 2: Update Zod Schemas & Types
**Duration**: 0.5 day  
**Priority**: High  
**Dependencies**: M1

#### Tasks:
1. [ ] Update `createPartnerRequestSchema` - make `custom_domain` optional
2. [ ] Add subdomain generation utility function
3. [ ] Add subdomain validation (alphanumeric, hyphens, 3-50 chars)
4. [ ] Update `PartnerRequest` type definitions

#### Schema Changes:
```typescript
// types/database.types.ts
export const createPartnerRequestSchema = z.object({
  company_name: z.string().min(1).max(255),
  contact_name: z.string().min(1).max(255),
  contact_email: z.string().email(),
  phone: z.string().optional(),
  business_description: z.string().min(10),
  use_case: z.string().min(10),
  // desired_subdomain is now the key field
  desired_subdomain: z.string()
    .min(3, "Subdomain must be at least 3 characters")
    .max(50, "Subdomain must be 50 characters or less")
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Subdomain must be lowercase alphanumeric with hyphens"),
  // custom_domain is now optional - will be set during onboarding
  custom_domain: z.string().optional().nullable(),
  selected_plan: z.enum(["starter", "professional", "enterprise"]).default("starter"),
  expected_users: z.number().optional(),
  branding_data: z.object({
    logo_url: z.string().optional(),
    primary_color: z.string().optional(),
    secondary_color: z.string().optional(),
    company_name: z.string().optional(),
  }).optional(),
})
```

---

### Milestone 3: Update Partner Request Form (Frontend)
**Duration**: 1 day  
**Priority**: High  
**Dependencies**: M2

#### Tasks:
1. [ ] Simplify Step 3 - remove custom domain input
2. [ ] Add subdomain preview component showing `{subdomain}.{platform_domain}`
3. [ ] Add subdomain availability check (repurpose existing domain check)
4. [ ] Update form validation
5. [ ] Update success message to show platform subdomain
6. [ ] Remove DNS setup info box (move to onboarding docs)

#### UI Changes:
```tsx
// Step 3: Branding (simplified)
<Card>
  <CardHeader>
    <CardTitle>Branding</CardTitle>
    <CardDescription>
      Customize your platform's look and feel
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Subdomain Preview - Auto-generated */}
    <div className="mb-6 p-4 bg-muted rounded-lg">
      <Label className="text-sm text-muted-foreground">Your Platform URL</Label>
      <div className="flex items-center gap-2 mt-2">
        <Badge variant="outline" className="font-mono text-lg">
          {subdomain}.{platformDomain}
        </Badge>
        {subdomainAvailable && <CheckCircle className="text-green-500" />}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        You can add a custom domain later from your dashboard settings.
      </p>
    </div>
    
    {/* Logo Upload */}
    <LogoUploader />
    
    {/* Color Pickers */}
    <ColorPickers />
  </CardContent>
</Card>
```

---

### Milestone 4: Update API Layer
**Duration**: 1 day  
**Priority**: High  
**Dependencies**: M2

#### Tasks:
1. [ ] Update `POST /api/partner-requests` to handle optional custom_domain
2. [ ] Update subdomain availability check endpoint
3. [ ] Add subdomain generation utility
4. [ ] Update email templates (remove custom domain references)
5. [ ] Update super admin review display

#### API Changes:

**Partner Requests API:**
```typescript
// app/api/partner-requests/route.ts
export async function POST(request: NextRequest) {
  // ... validation
  
  const subdomain = data.desired_subdomain || generateSlug(data.company_name)
  
  // Check subdomain availability (not custom domain)
  const { data: existingRequest } = await adminClient
    .from("partner_requests")
    .select("id")
    .eq("desired_subdomain", subdomain)
    .in("status", ["pending", "provisioning"])
    .maybeSingle()

  // Also check existing partners
  const { data: existingPartner } = await adminClient
    .from("partners")
    .select("id")
    .eq("platform_subdomain", subdomain)
    .maybeSingle()

  if (existingRequest || existingPartner) {
    return apiError("This subdomain is already taken", 409)
  }

  // Insert with generated subdomain
  const { data: partnerRequest } = await adminClient
    .from("partner_requests")
    .insert({
      // ... other fields
      desired_subdomain: subdomain,
      custom_domain: null, // Explicitly null for now
      platform_subdomain: subdomain,
    })
}
```

**Check Subdomain API (renamed):**
```typescript
// app/api/partner-requests/check-subdomain/route.ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const subdomain = searchParams.get("subdomain")?.toLowerCase()
  
  // Validate format
  if (!subdomain || subdomain.length < 3) {
    return apiResponse({ available: false, message: "Subdomain too short" })
  }
  
  // Check if taken
  const isTaken = await isSubdomainTaken(subdomain)
  
  return apiResponse({ 
    available: !isTaken,
    preview: `${subdomain}.${env.platformDomain}` 
  })
}
```

---

### Milestone 5: Update Provisioning Flow
**Duration**: 1.5 days  
**Priority**: High  
**Dependencies**: M4

#### Tasks:
1. [ ] Update `POST /api/partner-requests/[id]/provision` to use platform subdomain
2. [ ] Create partner domain entry with platform subdomain
3. [ ] Update welcome email with correct platform URL
4. [ ] Set `domain_setup_complete` to false initially
5. [ ] Update super admin approval dialog

#### Provisioning Changes:
```typescript
// app/api/partner-requests/[id]/provision/route.ts
export async function POST(request: NextRequest, { params }: RouteContext) {
  // ... existing validation
  
  const platformDomain = env.platformDomain || "genius365.app"
  const fullSubdomain = `${partnerRequest.desired_subdomain}.${platformDomain}`
  
  // Step 1: Create partner record with platform subdomain
  const { data: partner } = await adminClient
    .from("partners")
    .insert({
      name: partnerRequest.company_name,
      slug: partnerRequest.desired_subdomain,
      platform_subdomain: partnerRequest.desired_subdomain,
      domain_setup_complete: false,
      // ... other fields
    })
  
  // Step 2: Create partner domain for platform subdomain
  await adminClient.from("partner_domains").insert({
    partner_id: partner.id,
    hostname: fullSubdomain,
    is_primary: true,
    verified_at: new Date().toISOString(), // Pre-verified for platform subdomain
  })
  
  // Step 3: Send welcome email with platform URL
  const loginUrl = `https://${fullSubdomain}/login`
  await sendPartnerApprovalEmail(partnerRequest.contact_email, {
    company_name: partnerRequest.company_name,
    subdomain: fullSubdomain,
    login_url: loginUrl,
    temporary_password: temporaryPassword,
  })
  
  return apiResponse({
    success: true,
    partner: { id: partner.id, name: partner.name },
    login_url: loginUrl,
    // Note: No custom domain yet
  })
}
```

---

### Milestone 6: Custom Domain Setup (Onboarding Feature)
**Duration**: 2-3 days  
**Priority**: Medium  
**Dependencies**: M5

This milestone adds the ability for partners to configure custom domains from their dashboard after approval.

#### Tasks:
1. [ ] Create `app/org/settings/domain/page.tsx` - Custom domain management page
2. [ ] Create domain verification flow (CNAME/TXT record verification)
3. [ ] Add domain verification API endpoints
4. [ ] Add DNS instructions component
5. [ ] Implement plan-based domain limits (e.g., Enterprise = custom domain)
6. [ ] Add domain status indicators

#### New Pages:
```typescript
// app/org/settings/domain/page.tsx
export default function DomainSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Current Domain */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Domain</CardTitle>
          <CardDescription>Your platform is currently accessible at:</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge className="font-mono text-lg">
            {partner.platform_subdomain}.genius365.app
          </Badge>
        </CardContent>
      </Card>
      
      {/* Custom Domain Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Domain</CardTitle>
          <CardDescription>
            Connect your own domain for a fully branded experience
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plan.features.custom_domain ? (
            <CustomDomainSetup />
          ) : (
            <UpgradePlanPrompt feature="custom_domain" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

#### API Endpoints:
```
POST /api/partner/domain/add           - Add custom domain
POST /api/partner/domain/verify        - Verify DNS records
DELETE /api/partner/domain/[id]        - Remove custom domain
GET /api/partner/domain/status         - Check verification status
```

---

## File Changes Summary

### Files to Modify:
| File | Changes |
|------|---------|
| `lib/env.ts` | Add `platformDomain` variable |
| `prisma/schema.prisma` | Add `platform_subdomain` fields |
| `types/database.types.ts` | Update schemas and types |
| `components/marketing/partner-request-form.tsx` | Remove custom domain, add subdomain preview |
| `app/api/partner-requests/route.ts` | Update to use subdomain |
| `app/api/partner-requests/check-domain/route.ts` | Rename to check-subdomain |
| `app/api/partner-requests/[id]/provision/route.ts` | Use platform subdomain |
| `components/super-admin/approve-partner-dialog.tsx` | Update display |
| `app/super-admin/(dashboard)/partner-requests/[id]/page.tsx` | Update detail view |
| `lib/email/templates/partner-request-notification.tsx` | Remove custom domain |
| `lib/email/templates/partner-request-approved.tsx` | Update URL display |
| `lib/email/send.ts` | Update email function signatures |

### Files to Create:
| File | Purpose |
|------|---------|
| `lib/utils/subdomain.ts` | Subdomain generation and validation utilities |
| `app/api/partner-requests/check-subdomain/route.ts` | Subdomain availability check |
| `app/org/settings/domain/page.tsx` | Custom domain management (M6) |
| `components/org/custom-domain-setup.tsx` | Domain setup wizard (M6) |
| `app/api/partner/domain/` | Domain management APIs (M6) |
| `scripts/sql/20260107_platform_subdomain.sql` | Database migration |

---

## Testing Checklist

### Unit Tests:
- [ ] Subdomain generation from company name
- [ ] Subdomain validation (format, length)
- [ ] Subdomain availability check
- [ ] Partner provisioning with platform subdomain

### Integration Tests:
- [ ] Full partner request flow (submit → approve → provision)
- [ ] Email notifications contain correct URLs
- [ ] Partner login via platform subdomain
- [ ] Domain resolution for platform subdomains

### E2E Tests:
- [ ] Submit partner request without custom domain
- [ ] Super admin approval flow
- [ ] New partner first login experience
- [ ] Custom domain setup (M6)

---

## Rollout Plan

### Phase 1: Backend Ready (Days 1-3)
- Deploy database migrations
- Deploy API changes
- Test with feature flag disabled

### Phase 2: Frontend Update (Days 4-5)
- Update partner request form
- Update super admin views
- Deploy to staging

### Phase 3: Production Rollout (Day 6)
- Deploy to production
- Monitor for issues
- Update documentation

### Phase 4: Custom Domain Feature (Days 7-10)
- Build domain setup UI
- Implement DNS verification
- Deploy and monitor

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Existing partner requests with custom_domain | Migration script to preserve existing data |
| DNS propagation delays | Clear documentation, async verification |
| Subdomain collisions | Uniqueness constraint, availability check |
| Platform domain configuration | Default fallback, clear error messages |

---

## Success Metrics

1. **Reduced form abandonment**: Track completion rate improvement
2. **Faster time-to-approval**: Measure time from request to first login
3. **Support ticket reduction**: DNS-related tickets should decrease
4. **Custom domain adoption**: Track % of partners who add custom domain later

---

## Appendix: Environment Variables

```env
# Platform Configuration
NEXT_PUBLIC_PLATFORM_DOMAIN=genius365.app

# Existing variables (unchanged)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_APP_URL=https://genius365.app
```

---

*This document is a living specification. Update as implementation progresses.*


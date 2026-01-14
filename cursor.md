# Cursor Guide: Genius365 (AI Voice Agent Platform)
> Living architecture + onboarding + billing + telephony notes for working in this repo.

## What this app is
Genius365 is a **multi-tenant, white-label AI voice agent platform**:

- **Partner (Agency/Org)**: top-level tenant (“agency”).
- **Workspace**: projects under a partner (used by end customers / teams).
- **Users**: Supabase Auth users + profile in `public.users`.
- **Voice providers**: Vapi + Retell integrations (Synthflow enum exists but is not fully implemented in integrations).

## Tech stack (high signal)
- **Next.js 16 App Router** (routes in `app/`, edge/server middleware via `proxy.ts`)
- **Supabase**: Auth + Postgres (RLS on most product tables)
- **Prisma**: used for billing-heavy flows + some transactional paths (generated client in `lib/generated/prisma`)
- **Stripe**:
  - Platform Stripe account (partner billing + partner credits)
  - Stripe Connect (workspace billing + workspace credits + workspace subscriptions)
- **Tailwind + Radix (shadcn/ui)** UI components

## Runtime + request lifecycle (the “spine”)
### Multi-tenant routing / white-label gating
- Entry: `proxy.ts`
  - Refreshes Supabase session via `updateSession()` (`lib/supabase/middleware.ts`)
  - Resolves the current partner by hostname (for allow/deny behavior) using Supabase service key
  - Applies **white-label domain restrictions**: marketing pages are blocked on partner domains; only auth + app routes are allowed.

### Partner resolution (hostname → Partner)
- `lib/api/partner.ts` (`getPartnerFromHost()`):
  1. Dev override: `DEV_PARTNER_SLUG`
  2. Exact match in `partner_domains.hostname`
  3. Dev convenience: subdomain slug lookup (`acme.localhost`)
  4. Fallback to platform partner (`partners.is_platform_partner = true`)

### Auth context / tenancy context
- `lib/api/auth.ts` (`getPartnerAuthContext()`):
  - Gets current Supabase auth user
  - Resolves partner from host
  - Loads `partner_members` for role (`owner|admin|member`)
  - Loads `workspace_members` and builds “accessible workspaces”
  - If partner role is admin/owner: also adds partner-admin access to **all** workspaces under the partner

### Workspace context + paywall enforcement
- `lib/api/workspace-auth.ts`:
  - `getWorkspaceContext(workspaceSlug, requiredRoles?)`
  - `withWorkspace(handler, { requiredRoles?, skipPaywallCheck? })` for API routes
  - `checkWorkspacePaywall(workspaceId, workspaceSlug)` helper

Paywall source of truth:
- `lib/billing/workspace-paywall.ts` (`getWorkspacePaywallStatus()`)
  - Paywalled when:
    - workspace is **not** billing-exempt AND
    - no active workspace subscription AND
    - workspace credits balance <= 0

## Data model (tenancy)
### Key tables (Supabase `public` schema)
- `partners`, `partner_domains`, `partner_members`, `partner_invitations`
- `workspaces`, `workspace_members`, `workspace_invitations`
- `ai_agents`, `conversations`, `usage_tracking`
- Billing:
  - Partner: `billing_credits`, `credit_transactions`
  - Workspace: `workspace_credits`, `workspace_credit_transactions`, `workspace_subscription_plans`, `workspace_subscriptions`
- Telephony:
  - `sip_trunks`, `phone_numbers`

Authoritative model definitions (Prisma):
- `prisma/schema.prisma`

## Agency (Partner) onboarding flow (white-label)
There are two distinct concepts:
- **Partner request**: inbound application (“Become a White-Label Partner”)
- **Partner provisioning**: super-admin action that creates the actual Partner tenant + initial access

### 1) Partner request submission (marketing)
- UI: `app/(marketing)/request-partner/page.tsx` (only visible on platform partner)
- API: `POST /api/partner-requests` → `app/api/partner-requests/route.ts`
  - Validates with `createPartnerRequestSchema`
  - Ensures subdomain availability
  - Inserts into `partner_requests` with status `pending`
  - Emails super admin (`sendPartnerRequestNotification`)

Real-time checks:
- `GET /api/partner-requests/check-subdomain` → `app/api/partner-requests/check-subdomain/route.ts`
- `POST /api/partner-requests/check-domain` → `app/api/partner-requests/check-domain/route.ts`

### 2) Super-admin review → provisioning
Provisioning is gated by super-admin auth:
- `POST /api/super-admin/partner-requests/[id]/provision` → `app/api/super-admin/partner-requests/[id]/provision/route.ts`

What provisioning does (high-level):
- Requires request status `provisioning`
- Creates `partners` row:
  - `slug` = `desired_subdomain`
  - `white_label_variant_id` from `partner_requests.assigned_white_label_variant_id` (optional)
  - `subscription_status`:
    - `pending` if variant assigned (expects partner to complete platform billing checkout)
    - `active` if no variant assigned
- Creates primary domain record:
  - `partner_domains.hostname` = platform subdomain hostname (pre-verified)
- Creates/links the owner user:
  - Creates Supabase Auth user (or links existing)
  - Upserts `public.users`
  - Inserts `partner_members` with role `owner`
- Creates a default workspace:
  - `workspaces.slug = "default"`
  - sets `workspaces.is_billing_exempt = true` (important: see Billing section)
  - inserts `workspace_members` role `owner`
- Grants **initial partner credits** ($10):
  - inserts `billing_credits` + `credit_transactions` adjustment
- Marks request approved + links `provisioned_partner_id`
- Sends welcome email with login URL + temp password

Related: there is also a “non super-admin” provision route:
- `POST /api/partner-requests/[id]/provision` → `app/api/partner-requests/[id]/provision/route.ts`
  - This path includes **required `variant_id`** and creates the partner directly.
  - In practice, super-admin provisioning is the primary control plane.

### 3) Partner completes platform billing checkout (agency subscription)
- API: `POST /api/partner/billing/checkout` → `app/api/partner/billing/checkout/route.ts`
  - Uses **assigned WhiteLabelVariant** (`partners.white_label_variant_id`)
  - Creates Stripe Checkout Session (mode: subscription) on **platform Stripe**
  - Writes metadata so webhook can update subscription state

Stripe platform webhook:
- `POST /api/webhooks/stripe` → `app/api/webhooks/stripe/route.ts`
  - Updates `partners.subscription_status`, `partners.stripe_subscription_id`, `partners.plan_tier` (via price id mapping)
  - Applies partner credit topups when `payment_intent.succeeded` with `metadata.type = "credits_topup"`

## Workspace lifecycle (creation, access, integrations)
### Access control model
- Membership is resolved in `getPartnerAuthContext()` (`lib/api/auth.ts`)
- Workspace-scoped handlers should prefer:
  - `getWorkspaceContext()` (simple)
  - `withWorkspace()` (recommended for consistent paywall enforcement)

### “Org-level integrations” model (important)
This repo supports two patterns:
- **Legacy**: API keys stored on the agent (`ai_agents.agent_secret_api_key` / `agent_public_api_key`)
- **Current**: partner-level API keys + explicit assignment per workspace:
  - `partner_integrations` holds keys/config at the partner level
  - `workspace_integration_assignments` maps workspace → partner integration per provider

You can see the “org-level assignment” in action here:
- Agent auto-sync checks `workspaceIntegrationAssignment` via Prisma:
  - `app/api/w/[workspaceSlug]/agents/route.ts`
  - `app/api/w/[workspaceSlug]/agents/[id]/route.ts`
- Test calls auto-assign default integration if none exists:
  - `app/api/w/[workspaceSlug]/agents/[id]/test-call/route.ts`
- Outbound calls auto-assign default integration if none exists:
  - `app/api/w/[workspaceSlug]/agents/[id]/outbound-call/route.ts`

## Billing (current implementation)
There are **two layers** of billing:

### A) Partner billing (agency pays platform)
**What it covers**
- Partner subscription (platform plan) — priced by `white_label_variants.stripe_price_id`
- Partner-level credits — used by **billing-exempt workspaces** and some onboarding flows

**Key files**
- Checkout session: `app/api/partner/billing/checkout/route.ts`
- Partner credits:
  - `lib/stripe/credits.ts` (topup + deduct + low-balance alerts)
  - Storage tables: `billing_credits`, `credit_transactions`
- Platform Stripe webhook: `app/api/webhooks/stripe/route.ts`

### B) Workspace billing (end-customer pays the partner via Connect)
**What it covers**
- Workspace credits top-ups (prepaid usage wallet)
- Workspace subscriptions to partner-defined plans (prepaid or postpaid)

**Key files**
- Workspace credits & deductions: `lib/stripe/workspace-credits.ts`
  - Top-up PaymentIntent is created **on the partner’s Connect account** with `application_fee_amount` (platform fee)
  - Usage deduction prioritizes:
    1. Billing-exempt workspace → partner credits
    2. Postpaid subscription → track usage and invoice later
    3. Prepaid subscription → included minutes, then overage from workspace credits
    4. No subscription → workspace credits
- Stripe Connect webhook: `app/api/webhooks/stripe-connect/route.ts`
  - `payment_intent.succeeded` (metadata `type=workspace_credits_topup`) → applies workspace credit topup
  - `customer.subscription.*` → upserts `workspace_subscriptions`
  - `invoice.payment_succeeded` → resets subscription usage counters each period (and postpaid counters where applicable)

### Paywall behavior (read-only mode)
Source of truth:
- `lib/billing/workspace-paywall.ts`

Enforcement pattern:
- `lib/api/workspace-auth.ts`:
  - most mutation routes call `checkWorkspacePaywall()` explicitly, or
  - use `withWorkspace()` (which blocks POST/PUT/PATCH/DELETE unless `skipPaywallCheck` is set)

### Provider call billing (usage deduction)
Call completion billing happens after calls complete (typically from provider webhooks):
- `lib/billing/usage.ts` (`processCallCompletion()`):
  - calls `deductWorkspaceUsage()` (`lib/stripe/workspace-credits.ts`)
  - writes back:
    - `workspaces.current_month_minutes`, `workspaces.current_month_cost`
    - `conversations.total_cost` and `conversations.cost_breakdown`

Partner credit ledger (used when workspace is billing-exempt):
- `lib/stripe/credits.ts` (partner-level `billing_credits` ledger)

## Telephony (SIP trunks + phone numbers)
Telephony is managed at the **partner/org** level, not per-workspace.

### UI surface
- Org telephony page: `app/org/telephony/page.tsx`
- Dialogs:
  - `components/org/telephony/sip-trunk-dialog.tsx`
  - `components/org/telephony/phone-number-dialog.tsx`
- Data hooks: `lib/hooks/use-telephony.ts` (React Query wrappers over the APIs below)

### Data model
- `sip_trunks` (Prisma model `SipTrunk`):
  - stores SIP server/port/transport, username/password, default flag, sync state
  - **Note**: `sipPassword` is currently stored as plaintext (`// TODO: Encrypt this` in the API route)
- `phone_numbers` (Prisma model `PhoneNumber`):
  - inventory of numbers per partner
  - links to a SIP trunk via `sip_trunk_id_ref`
  - assignment fields: `assigned_agent_id`, `assigned_workspace_id`, `status`
  - provider + sync fields: `provider`, `external_id`, `sip_uri`

### Org APIs (partner-scoped)
#### SIP trunks
- List/create:
  - `GET /api/partner/telephony/sip-trunks`
  - `POST /api/partner/telephony/sip-trunks`
  - Implementation: `app/api/partner/telephony/sip-trunks/route.ts`
- Get/update/delete:
  - `GET|PATCH|DELETE /api/partner/telephony/sip-trunks/[id]`
  - Implementation: `app/api/partner/telephony/sip-trunks/[id]/route.ts`
- Sync/unsync to Vapi (creates/deletes Vapi “credential” for BYO SIP trunk):
  - `POST|DELETE /api/partner/telephony/sip-trunks/[id]/sync`
  - Implementation: `app/api/partner/telephony/sip-trunks/[id]/sync/route.ts`
  - Vapi client: `lib/integrations/vapi/sip-trunk.ts`
  - Requires partner integration key: `partner_integrations` where `provider="vapi"` and `api_keys.default_secret_key` is present

#### Phone numbers
- List/create:
  - `GET /api/partner/telephony/phone-numbers`
  - `POST /api/partner/telephony/phone-numbers`
  - Implementation: `app/api/partner/telephony/phone-numbers/route.ts`
  - Non-admin members only see numbers assigned to their accessible workspaces
- Get/update/delete:
  - `GET|PATCH|DELETE /api/partner/telephony/phone-numbers/[id]`
  - Implementation: `app/api/partner/telephony/phone-numbers/[id]/route.ts`
  - Assignment in DB happens here via `assigned_agent_id`:
    - also writes to the agent: `ai_agents.assigned_phone_number_id`
- Sync/unsync + “attach to assistant” in Vapi:
  - `POST /api/partner/telephony/phone-numbers/[id]/sync`:
    - creates a Vapi **BYO phone number** linked to a synced SIP trunk credential
    - writes `phone_numbers.external_id` (Vapi phone-number id)
    - Implementation: `app/api/partner/telephony/phone-numbers/[id]/sync/route.ts`
    - Vapi client: `lib/integrations/vapi/phone-numbers.ts`
  - `DELETE /api/partner/telephony/phone-numbers/[id]/sync`:
    - deletes the phone number in Vapi and clears `external_id`
  - `PATCH /api/partner/telephony/phone-numbers/[id]/sync`:
    - attaches/detaches the phone number to a Vapi assistant
    - updates agent fields (`assignedPhoneNumberId`, `externalPhoneNumber`)

### How telephony is used by agents (current)
Agents store telephony intent on the agent record:
- `ai_agents.assigned_phone_number_id` (DB id from `phone_numbers`)
- `config.telephony.vapi_phone_number_id` (optional direct Vapi phone-number id)

Outbound calls (Vapi only) pick the caller-id/phone number in this order:
1. Workspace-level shared outbound number from Vapi integration config (`shared_outbound_phone_number_id`)
2. Agent config `config.telephony.vapi_phone_number_id`
3. Agent `assigned_phone_number_id` → `phone_numbers.external_id` (must be synced to Vapi)

Implementation:
- `POST /api/w/[workspaceSlug]/agents/[id]/outbound-call` → `app/api/w/[workspaceSlug]/agents/[id]/outbound-call/route.ts`

## Notes / gotchas
- **Paywall depends on Prisma**: `lib/billing/workspace-paywall.ts` throws if Prisma/DB isn’t configured.
- **Telephony API stores SIP passwords in plaintext** today (see `app/api/partner/telephony/sip-trunks/route.ts`).
- **Some older docs may be stale**: if you see references to workspace-level telephony endpoints like `/api/w/.../sip-info`, they do not exist in the current repo—telephony is handled via `/api/partner/telephony/*` plus agent fields.


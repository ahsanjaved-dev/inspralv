# Genius365 Codebase Reference (Single-file, LLM-friendly, developer-friendly)

> **Last Updated**: January 16, 2026  
> **Audience**: Developers + AI assistants (LLM-friendly)  
> **Scope**: Repo at `genius365/` (Next.js App Router + Supabase + Prisma + Stripe + VAPI/Retell + optional Algolia)

---

## Table of Contents

1. [What This Repo Is](#what-this-repo-is)
2. [Fast "Where Do I Look?" Map (LLM-Friendly)](#fast-where-do-i-look-map-llm-friendly)
3. [High-Level Architecture](#high-level-architecture)
4. [Multi-Tenancy Model](#multi-tenancy-model)
5. [Directory Structure (Actual)](#directory-structure-actual)
6. [Frontend Architecture (Layouts + Navigation)](#frontend-architecture-layouts--navigation)
7. [API Routes Inventory (Actual)](#api-routes-inventory-actual)
8. [Runtime Entry Points](#runtime-entry-points)
9. [Auth + Route Protection](#auth--route-protection)
10. [Database: Prisma Schema & Key Models](#database-prisma-schema--key-models)
11. [API Layer Patterns](#api-layer-patterns)
12. [Billing System (Partner + Workspace)](#billing-system-partner--workspace)
13. [Workspaces: Paywall / Read-only Mode](#workspaces-paywall--read-only-mode)
14. [Voice Provider Integrations (VAPI + Retell)](#voice-provider-integrations-vapi--retell)
15. [Org-Level Integrations & API Key Management](#org-level-integrations--api-key-management)
16. [Telephony System (SIP Trunks + Phone Numbers)](#telephony-system-sip-trunks--phone-numbers)
17. [Calls: Storage, Search, Ingestion, Webhooks](#calls-storage-search-ingestion-webhooks)
18. [Agents: Creation, Sync, Test Calls, Tools](#agents-creation-sync-test-calls-tools)
19. [Campaigns Module](#campaigns-module)
20. [Knowledge Base Module](#knowledge-base-module)
21. [Leads Module](#leads-module)
22. [RBAC (Permissions)](#rbac-permissions)
23. [Observability (Sentry + Logging)](#observability-sentry--logging)
24. [Configuration & Environment Variables](#configuration--environment-variables)
25. [Docs & Guides in Repo](#docs--guides-in-repo)
26. [Common Dev Workflows](#common-dev-workflows)
27. [Gotchas / Non-obvious Details](#gotchas--non-obvious-details)

---

## What This Repo Is

**Genius365** is a multi-tenant, white-label **AI voice agent management platform**:

- **Tenant model**: Partner (agency/org) → Workspaces → Users/Memberships
- **Core product**: create/manage AI agents (VAPI + Retell), run/test calls, view call logs, manage campaigns, manage knowledge documents, manage billing/credits/subscriptions
- **Admin product**: super-admin dashboard for partner requests, partners, plan variants, billing overview
- **Org-level features**: Centralized integrations (API keys), telephony management (SIP trunks, phone numbers), client invitations

Tech stack (from `package.json`, `next.config.ts`, `prisma/schema.prisma`):

- **Next.js**: 16.0.8 (App Router)
- **React**: 19.2.1
- **TypeScript**: 5.x
- **DB/Auth**: Supabase Postgres + Supabase Auth
- **ORM**: Prisma 6.19.1 (client generated into `lib/generated/prisma`)
- **Billing**: Stripe (platform) + Stripe Connect (partner accounts)
- **Search (optional)**: Algolia (call logs)
- **UI**: Tailwind CSS 4 + Radix UI (shadcn/ui)
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod 4.x
- **State**: Zustand + TanStack React Query 5.x
- **Observability**: Sentry
- **Email**: Resend + React Email

---

## Fast "Where Do I Look?" Map (LLM-Friendly)

If you're trying to answer a question quickly, start here:

### Core Auth & Routing

- **Route protection / CSP / redirects / session refresh**: `proxy.ts` + `lib/supabase/middleware.ts`
- **Partner resolution (white-label hostnames)**: `lib/api/partner.ts`
- **Auth context** (partner + workspaces): `lib/api/auth.ts`
- **Workspace auth wrapper**: `lib/api/workspace-auth.ts`
- **Super admin auth**: `lib/api/super-admin-auth.ts`

### Calls & Conversations

- **Calls API** (list + search): `app/api/w/[workspaceSlug]/calls/route.ts`
- **Calls ingest** (poll provider → insert/update conversation): `app/api/w/[workspaceSlug]/calls/ingest/route.ts`
- **Calls stats**: `app/api/w/[workspaceSlug]/calls/stats/route.ts`
- **Dashboard charts**: `app/api/w/[workspaceSlug]/dashboard/charts/route.ts`
- **Algolia call log indexing/search**: `lib/algolia/call-logs.ts`, `lib/algolia/client.ts`

### Agents

- **Agents API** (create/update/delete + sync trigger): `app/api/w/[workspaceSlug]/agents/route.ts`, `app/api/w/[workspaceSlug]/agents/[id]/route.ts`
- **Provider sync (VAPI)**: `lib/integrations/vapi/agent/sync.ts`
- **Provider sync (Retell)**: `lib/integrations/retell/agent/sync.ts`
- **Test call sessions**: `app/api/w/[workspaceSlug]/agents/[id]/test-call/route.ts`
- **Outbound calls**: `app/api/w/[workspaceSlug]/agents/[id]/outbound-call/route.ts`
- **Webhook status** (check webhook URL configuration): `app/api/w/[workspaceSlug]/agents/webhook-status/route.ts`
- **Resync webhooks** (fix production webhook URLs): `app/api/w/[workspaceSlug]/agents/resync-webhooks/route.ts`

### Org-Level Integrations (NEW)

- **Partner integrations API**: `app/api/partner/integrations/route.ts`
- **Workspace assigned integrations**: `app/api/w/[workspaceSlug]/assigned-integrations/route.ts`
- **Per-provider assignment**: `app/api/w/[workspaceSlug]/assigned-integration/[provider]/route.ts`

### Telephony (NEW)

- **SIP trunks API**: `app/api/partner/telephony/sip-trunks/route.ts`
- **Phone numbers API**: `app/api/partner/telephony/phone-numbers/route.ts`
- **Phone number sync**: `app/api/partner/telephony/phone-numbers/[id]/sync/route.ts`

### Billing

- **Billing (partner platform subscription + credits)**: `app/api/partner/billing/*`, `app/api/webhooks/stripe/route.ts`, `lib/stripe/*`
- **Billing (workspace credits + subscriptions via Connect)**: `app/api/w/[workspaceSlug]/credits/*`, `app/api/w/[workspaceSlug]/subscription/*`, `app/api/webhooks/stripe-connect/route.ts`, `lib/stripe/workspace-credits.ts`
- **Paywall enforcement**: `lib/billing/workspace-paywall.ts` + `lib/api/workspace-auth.ts`

### Other Modules

- **Campaigns**: `app/api/w/[workspaceSlug]/campaigns/*`
  - Cron processing: `app/api/cron/process-campaigns/route.ts`, `app/api/cron/master/route.ts`
  - Queue-based processing: `lib/campaigns/queue-processor.ts`, `lib/campaigns/call-queue-manager.ts`
  - Batch calling: `lib/campaigns/batch-caller.ts` (optimized with chunking and progress tracking)
- **Knowledge base**: `app/api/w/[workspaceSlug]/knowledge-base/*`
- **Client invitations**: `app/api/partner/client-invitations/route.ts`
- **Function tools system (VAPI/Retell mapping)**: `lib/integrations/function_tools/*`, editor UI: `components/workspace/agents/function-tool-editor.tsx`

---

## High-Level Architecture

### Request lifecycle (simplified)

1. **Incoming request** hits Next.js middleware entry `proxy.ts`
2. Middleware:
   - Refreshes Supabase session via `lib/supabase/middleware.ts`
   - Enforces public/protected path rules for white-label partners
   - Applies **security headers** (X-Frame-Options, CSP, etc.)
   - Resolves partner from hostname
3. Page/API route uses:
   - `getPartnerAuthContext()` or cached variant (server components)
   - `getWorkspaceContext(workspaceSlug)` (workspace-scoped)
4. Data access is via:
   - Supabase client (SSR/browser) for PostgREST queries
   - Prisma client for transactional/billing-heavy flows and a subset of server routes/webhooks

### Major subsystems

- **Multi-tenancy & white-label**: partner_domains hostname mapping → partner context
- **Org-level integrations**: Centralized API key management at partner level with assignment to workspaces
- **Telephony**: Partner-level SIP trunk and phone number management
- **Agents**: internal agent config stored in DB → provider-specific mapper → sync to VAPI/Retell
- **Calls**: stored as `conversations` (not separate "calls" table) + optional Algolia index
- **Billing**:
  - Partner-level platform subscription + partner credits (Stripe platform account)
  - Workspace-level subscription + workspace credits (Stripe Connect accounts)
  - Paywall blocks write endpoints when workspace has no credits and no active subscription

---

## Multi-Tenancy Model

### Entities

- **Partner** (agency/org): top-level tenant
- **Workspace**: projects under a partner
- **User**: Supabase Auth user with profile in public `users`
- **Memberships**:
  - `partner_members` (role in partner: `owner` | `admin` | `member`)
  - `workspace_members` (role in workspace: `owner` | `admin` | `member` | `viewer`)

### White-label host resolution

- Hostnames are mapped via `partner_domains.hostname`
- `lib/api/partner.ts` resolves the current partner; `DEV_PARTNER_SLUG` can bypass in dev (see `lib/env.ts`)
- Platform partner (`is_platform_partner: true`) has full access to all routes
- White-label partners have restricted access (no marketing pages, blocked API routes)

---

## Directory Structure (Actual)

Top-level folders under `genius365/` (high-signal only):

```
genius365/
├── app/                         # Next.js App Router routes (pages + API)
│   ├── (auth)/                  # Login/signup/forgot/reset
│   ├── (marketing)/             # Pricing + request-partner
│   ├── accept-partner-invitation/
│   ├── accept-workspace-invitation/
│   ├── org/                     # Partner/org dashboard (billing/plans/settings/invitations/clients/integrations/telephony)
│   ├── super-admin/             # Super-admin login + dashboard
│   ├── w/[workspaceSlug]/       # Workspace pages (dashboard, agents, calls, campaigns, etc.)
│   └── api/                     # API route handlers
├── components/                  # UI components (shadcn + product components)
├── config/                      # Static config (plans.ts, site.ts)
├── context/                     # React contexts (branding, theme)
├── lib/                         # Core business logic, integrations, auth, billing, utils
├── prisma/schema.prisma         # Prisma schema (maps to Supabase public schema)
├── types/                       # Supabase types + API Zod schemas
├── docs/                        # Product/testing docs
├── scripts/                     # Database scripts and utilities
│   └── sql/                     # SQL migration/setup scripts
├── proxy.ts                     # Next.js middleware entry ("proxy" function)
├── next.config.ts               # Next config + Sentry webpack integration
├── instrumentation*.ts          # Sentry instrumentation hooks
└── sentry.*.config.ts           # Sentry configs (edge/server/client)
```

### Components (`components/`)

- `components/ui/*`: shadcn/ui primitives (29 components including Radix + Tailwind)
- `components/workspace/*`: workspace shell + feature components
  - `workspace-dashboard-layout.tsx` (shell layout)
  - `workspace-sidebar.tsx` (nav + workspace switcher)
  - `workspace-mobile-sidebar.tsx` (mobile nav)
  - `workspace-header.tsx`
  - `workspace-selector.tsx`
  - `paywall-banner.tsx`
  - `agents/*` (wizard + tool editor + agent cards)
  - `campaigns/*` (comprehensive campaign UI):
    - Wizards: `campaign-wizard-optimized.tsx` (main), `campaign-wizard-dynamic.tsx` (lazy loader)
    - Cards: `campaign-card.tsx`, `wizard-draft-card.tsx`
    - Dashboard: `campaign-live-dashboard.tsx`, `campaign-hero-stats.tsx`, `campaign-analytics.tsx`
    - Components: `campaign-status-badge.tsx`, `campaign-progress-ring.tsx`, `campaign-stats-card.tsx`
    - Dialogs: `add-recipient-dialog.tsx`, `import-recipients-dialog.tsx`
    - Feedback: `campaign-action-overlay.tsx`, `campaign-activity-feed.tsx`, `campaign-toast.tsx`
    - Alerts: `webhook-status-alert.tsx`
    - Steps: `steps/*.tsx` (step-details, step-import, step-review, step-schedule, step-variables)
  - `calls/*` (Algolia search panel, fallback search, transcript player)
  - `conversations/*` (detail modal with dynamic loading)
  - `billing/*` (workspace credits card)
  - `integrations/*` (connect dialogs)
  - `members/*` (invite dialog)
- `components/org/*`: org-level components
  - `org-dashboard-layout.tsx`
  - `assign-workspace-dialog.tsx`
  - `integrations/*` (add/manage integration dialogs, workspace integrations dialog)
  - `telephony/*` (phone number dialog, SIP trunk dialog)
- `components/super-admin/*`: super admin shell + dialogs
- `components/agents/*`: agent-specific components (card, test call, outbound test call, delete dialog)
- `components/auth/*`: auth layout + password strength
- `components/billing/*`: change plan dialog, credits card
- `components/marketing/*`: partner request form, pricing card
- `components/shared/*`: error boundary, loading spinners

### Core libraries (`lib/`)

- `lib/api/*`: auth contexts, helpers, caching, pagination, etag, error handler
- `lib/supabase/*`: SSR/browser/admin clients + session middleware
- `lib/prisma/*`: Prisma singleton wrapper + exports
- `lib/stripe/*`: Stripe platform + Connect logic (credits, subscriptions, invoices)
- `lib/billing/*`: usage + paywall checks
- `lib/integrations/*`: provider integrations (VAPI/Retell), function tools, retries, circuit breaker
- `lib/hooks/*`: 40+ React Query hooks for workspace/partner/super-admin data
  - Includes realtime hooks (`use-realtime-campaign.ts`, `use-realtime-call-status.ts`)
  - Dashboard/analytics hooks (`use-dashboard-charts.ts`, `use-dashboard-data.ts`)
  - Web call hooks (`use-web-call/vapi.ts`, `use-web-call/retell.ts`)
  - Campaign hooks (`use-campaign-polling.ts`, `use-campaign-progress.ts`, `use-campaign-draft.ts`)
  - Webhook hooks (`use-webhook-status.ts`)
  - Validation hooks (`use-test-call-validations.tsx`)
- `lib/stores/*`: Zustand stores for local state
  - `campaign-wizard-store.ts` - Campaign wizard local-first state management
- `lib/rbac/*`: permission matrix + wrappers
- `lib/algolia/*`: optional call logs index/search
- `lib/email/*`: Resend client + email templates
- `lib/utils/*`: format, subdomain, PDF export utilities

### Workspace pages (`app/w/[workspaceSlug]/...`)

Actual routes:

- `dashboard/`, `agents/`, `agents/new/`, `agents/[id]/`
- `calls/`, `calls/[callId]/`, `conversations/`
- `campaigns/`, `campaigns/new/`, `campaigns/[id]/`
- `knowledge-base/`
- `analytics/`
- `members/`
- `billing/`
- `settings/`

### Workspace API (`app/api/w/[workspaceSlug]/...`)

Actual route groups:

- `agents/*` (includes nested test-call/outbound-call/[...path])
- `calls/*` (list + ingest + stats)
- `campaigns/*` (includes start/pause/terminate/test-call/recipients)
- `conversations/*`
- `credits/*` (credits + topup)
- `subscription/*` (plans + preview + subscription management)
- `integrations/*` (legacy provider config + algolia config)
- `assigned-integrations/*` (NEW: org-level key assignments)
- `assigned-integration/[provider]/*` (NEW: per-provider assigned integration)
- `knowledge-base/*`
- `members/*`, `invitations/*`
- `analytics/*`, `settings/*`
- `dashboard/stats/*`, `dashboard/charts/*`
- `phone-numbers/available/*`

### Org (partner) pages (`app/org/...`)

Actual routes:

- `/org` (index page)
- `/org/billing`
- `/org/plans`
- `/org/settings`
- `/org/invitations`
- `/org/clients` (NEW)
- `/org/integrations` (NEW)
- `/org/telephony` (NEW)

### Super admin pages (`app/super-admin/(dashboard)/...`)

Actual routes:

- `/super-admin` (dashboard)
- `/super-admin/partner-requests` (+ detail)
- `/super-admin/partners` (+ detail)
- `/super-admin/plans` (workspace subscription plans management)
- `/super-admin/variants` (white-label variant management)
- `/super-admin/billing`

### Public pages (agency onboarding)

- `/agency-checkout` - Agency subscription checkout page
- `/agency-checkout/success` - Checkout success confirmation

---

## Frontend Architecture (Layouts + Navigation)

### Root layout

- `app/layout.tsx` wraps the entire app with:
  - `ThemeProvider` (`context/theme-context.tsx`)
  - `QueryProvider` (`lib/providers/query-provider.tsx`)
  - `SDKErrorSuppressionProvider` (`lib/providers/sdk-error-suppression-provider.tsx`)
  - `Toaster` (Sonner)
  - partner-aware metadata via `generatePartnerMetadata()` (`lib/metadata.ts`)

### Workspace layout

- `app/w/[workspaceSlug]/layout.tsx`:
  - loads cached auth (`lib/api/get-auth-cached.ts`)
  - resolves workspace access
  - renders `WorkspaceDashboardLayout` (`components/workspace/workspace-dashboard-layout.tsx`)

Workspace shell responsibilities:

- `BrandingProvider` applies partner branding CSS vars (`context/branding-context.tsx`)
- `PaywallBanner` shows read-only messaging when paywalled
- `WorkspaceSidebar` provides navigation and role-based links

### Super admin layout

- `app/super-admin/(dashboard)/layout.tsx`:
  - enforces `getSuperAdminContext()`
  - renders `SuperAdminLayoutClient` (`components/super-admin/super-admin-layout-client.tsx`)

### Org (partner) layout

- `app/org/layout.tsx` renders the organization dashboard shell (`components/org/org-dashboard-layout.tsx`)

---

## API Routes Inventory (Actual)

This section is intended as a **truthy map** of the API surface. Start here when adding endpoints.

### Health / utilities

- `GET /api/health` → `app/api/health/route.ts`
- `POST /api/cron/master` (+ `GET` for docs) → `app/api/cron/master/route.ts`
- `POST /api/cron/cleanup-expired-campaigns` (+ `GET` for docs) → `app/api/cron/cleanup-expired-campaigns/route.ts`
- `POST /api/cron/process-campaigns` (+ `GET` for status) → `app/api/cron/process-campaigns/route.ts` (NEW: Background campaign chunk processing)
- Dev-only utility: `POST /api/dev/reset-password` → `app/api/dev/reset-password/route.ts`
- Sentry test: `GET /api/sentry-example-api` → `app/api/sentry-example-api/route.ts`

### Auth

- `GET /api/auth/context` → `app/api/auth/context/route.ts`
- `POST /api/auth/signup` → `app/api/auth/signup/route.ts`
- `POST /api/auth/signout` → `app/api/auth/signout/route.ts`
- Invitation acceptance:
  - `POST /api/partner-invitations/accept` → `app/api/partner-invitations/accept/route.ts`
  - `POST /api/workspace-invitations/accept` → `app/api/workspace-invitations/accept/route.ts`

### Partner onboarding (white-label requests)

- `POST /api/partner-requests` → `app/api/partner-requests/route.ts`
- `GET /api/partner-requests/[id]` → `app/api/partner-requests/[id]/route.ts`
- `POST /api/partner-requests/[id]/provision` → `app/api/partner-requests/[id]/provision/route.ts`
- `POST /api/partner-requests/check-subdomain` → `app/api/partner-requests/check-subdomain/route.ts`
- `POST /api/partner-requests/check-domain` → `app/api/partner-requests/check-domain/route.ts`

### Partner (org) APIs

All under `app/api/partner/*`:

**Partner summary**

- `GET /api/partner` → `app/api/partner/route.ts`

**Dashboard**

- `GET /api/partner/dashboard/stats` → `app/api/partner/dashboard/stats/route.ts`

**Team + invitations**

- `GET|POST /api/partner/team` → `app/api/partner/team/route.ts`
- `PATCH|DELETE /api/partner/team/[memberId]` → `app/api/partner/team/[memberId]/route.ts`
- `GET|POST /api/partner/invitations` → `app/api/partner/invitations/route.ts`
- `DELETE /api/partner/invitations/[invitationId]` → `app/api/partner/invitations/[invitationId]/route.ts`

**Client invitations (NEW)**

- `GET|POST /api/partner/client-invitations` → `app/api/partner/client-invitations/route.ts`
- `DELETE /api/partner/client-invitations/[invitationId]` → `app/api/partner/client-invitations/[invitationId]/route.ts`

**Workspaces (partner-level management)**

- `GET|POST /api/partner/workspaces` → `app/api/partner/workspaces/route.ts`
- `GET|PATCH /api/partner/workspaces/[id]/members` → `app/api/partner/workspaces/[id]/members/route.ts`
- `GET /api/partner/workspaces/[id]/billing` → `app/api/partner/workspaces/[id]/billing/route.ts`
- `GET|POST /api/partner/workspaces/[id]/integrations` → `app/api/partner/workspaces/[id]/integrations/route.ts`
- `GET|DELETE /api/partner/workspaces/[id]/integrations/[provider]` → `app/api/partner/workspaces/[id]/integrations/[provider]/route.ts`

**Billing (platform, partner subscription)**

- `GET /api/partner/billing` → `app/api/partner/billing/route.ts`
- `POST /api/partner/billing/checkout` → `app/api/partner/billing/checkout/route.ts`
- `POST /api/partner/billing/change-plan` → `app/api/partner/billing/change-plan/route.ts`
- `POST /api/partner/billing/portal` → `app/api/partner/billing/portal/route.ts`

**Credits (partner-level)**

- `GET /api/partner/credits` → `app/api/partner/credits/route.ts`
- `POST /api/partner/credits/topup` → `app/api/partner/credits/topup/route.ts`

**Stripe Connect (partner onboarding)**

- `POST /api/partner/stripe/connect` → `app/api/partner/stripe/connect/route.ts`

**Workspace subscription plans (partner-defined catalog)**

- `GET|POST /api/partner/subscription-plans` → `app/api/partner/subscription-plans/route.ts`
- `GET|PATCH|DELETE /api/partner/subscription-plans/[planId]` → `app/api/partner/subscription-plans/[planId]/route.ts`

**Integrations (NEW - Org-level API keys)**

- `GET|POST /api/partner/integrations` → `app/api/partner/integrations/route.ts`
- `GET|PATCH|DELETE /api/partner/integrations/[id]` → `app/api/partner/integrations/[id]/route.ts`
- `POST /api/partner/integrations/[id]/set-default` → `app/api/partner/integrations/[id]/set-default/route.ts`

**Telephony (NEW - SIP Trunks + Phone Numbers)**

- `GET|POST /api/partner/telephony/sip-trunks` → `app/api/partner/telephony/sip-trunks/route.ts`
- `GET|PATCH|DELETE /api/partner/telephony/sip-trunks/[id]` → `app/api/partner/telephony/sip-trunks/[id]/route.ts`
- `POST /api/partner/telephony/sip-trunks/[id]/sync` → `app/api/partner/telephony/sip-trunks/[id]/sync/route.ts`
- `GET|POST /api/partner/telephony/phone-numbers` → `app/api/partner/telephony/phone-numbers/route.ts`
- `GET|PATCH|DELETE /api/partner/telephony/phone-numbers/[id]` → `app/api/partner/telephony/phone-numbers/[id]/route.ts`
- `POST /api/partner/telephony/phone-numbers/[id]/sync` → `app/api/partner/telephony/phone-numbers/[id]/sync/route.ts`

### Workspace APIs

All under: `app/api/w/[workspaceSlug]/*`

**Workspace core**

- `GET /api/w/[workspaceSlug]/dashboard/stats` → `app/api/w/[workspaceSlug]/dashboard/stats/route.ts`
- `GET /api/w/[workspaceSlug]/dashboard/charts` → `app/api/w/[workspaceSlug]/dashboard/charts/route.ts`
- `GET /api/w/[workspaceSlug]/settings` → `app/api/w/[workspaceSlug]/settings/route.ts`

**Agents**

- `GET|POST /api/w/[workspaceSlug]/agents` → `app/api/w/[workspaceSlug]/agents/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/agents/[id]` → `app/api/w/[workspaceSlug]/agents/[id]/route.ts`
- `POST /api/w/[workspaceSlug]/agents/[id]/test-call` → `app/api/w/[workspaceSlug]/agents/[id]/test-call/route.ts`
- `POST /api/w/[workspaceSlug]/agents/[id]/outbound-call` → `app/api/w/[workspaceSlug]/agents/[id]/outbound-call/route.ts`
- `GET /api/w/[workspaceSlug]/agents/webhook-status` → `app/api/w/[workspaceSlug]/agents/webhook-status/route.ts` (NEW: Check webhook URL configuration)
- `POST /api/w/[workspaceSlug]/agents/resync-webhooks` → `app/api/w/[workspaceSlug]/agents/resync-webhooks/route.ts` (NEW: Force resync webhook URLs)

**Calls / conversations**

- `GET /api/w/[workspaceSlug]/calls` → `app/api/w/[workspaceSlug]/calls/route.ts`
- `GET /api/w/[workspaceSlug]/calls/[callId]` → `app/api/w/[workspaceSlug]/calls/[callId]/route.ts` (individual call details)
- `POST /api/w/[workspaceSlug]/calls/ingest` → `app/api/w/[workspaceSlug]/calls/ingest/route.ts`
- `POST /api/w/[workspaceSlug]/calls/search` → `app/api/w/[workspaceSlug]/calls/search/route.ts` (Algolia-powered search)
- `GET /api/w/[workspaceSlug]/calls/stats` → `app/api/w/[workspaceSlug]/calls/stats/route.ts`
- `POST /api/w/[workspaceSlug]/calls/resync-algolia` → `app/api/w/[workspaceSlug]/calls/resync-algolia/route.ts` (resync calls to Algolia)
- `POST /api/w/[workspaceSlug]/calls/clear-algolia` → `app/api/w/[workspaceSlug]/calls/clear-algolia/route.ts` (clear Algolia index)
- `GET /api/w/[workspaceSlug]/conversations` → `app/api/w/[workspaceSlug]/conversations/route.ts`

**Campaigns**

- `GET|POST /api/w/[workspaceSlug]/campaigns` → `app/api/w/[workspaceSlug]/campaigns/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/campaigns/[id]` → `app/api/w/[workspaceSlug]/campaigns/[id]/route.ts`
- `GET|POST|DELETE /api/w/[workspaceSlug]/campaigns/[id]/recipients` → `app/api/w/[workspaceSlug]/campaigns/[id]/recipients/route.ts`
- `POST /api/w/[workspaceSlug]/campaigns/[id]/recipients/import-optimized` → `app/api/w/[workspaceSlug]/campaigns/[id]/recipients/import-optimized/route.ts` (NEW: Optimized bulk import)
- `POST /api/w/[workspaceSlug]/campaigns/[id]/start` → `app/api/w/[workspaceSlug]/campaigns/[id]/start/route.ts`
- `POST /api/w/[workspaceSlug]/campaigns/[id]/start-optimized` → `app/api/w/[workspaceSlug]/campaigns/[id]/start-optimized/route.ts` (NEW: Optimized start)
- `POST /api/w/[workspaceSlug]/campaigns/[id]/start-scalable` → `app/api/w/[workspaceSlug]/campaigns/[id]/start-scalable/route.ts` (NEW: Queue-based scalable start)
- `POST /api/w/[workspaceSlug]/campaigns/[id]/pause` → `app/api/w/[workspaceSlug]/campaigns/[id]/pause/route.ts`
- `POST /api/w/[workspaceSlug]/campaigns/[id]/resume` → `app/api/w/[workspaceSlug]/campaigns/[id]/resume/route.ts`
- `POST /api/w/[workspaceSlug]/campaigns/[id]/terminate` → `app/api/w/[workspaceSlug]/campaigns/[id]/terminate/route.ts`
- `POST /api/w/[workspaceSlug]/campaigns/[id]/test-call` → `app/api/w/[workspaceSlug]/campaigns/[id]/test-call/route.ts`
- `POST /api/w/[workspaceSlug]/campaigns/[id]/cleanup` → `app/api/w/[workspaceSlug]/campaigns/[id]/cleanup/route.ts` (cleanup stale calls)
- `POST /api/w/[workspaceSlug]/campaigns/[id]/process-calls` → `app/api/w/[workspaceSlug]/campaigns/[id]/process-calls/route.ts` (NEW: Process pending calls)
- `POST /api/w/[workspaceSlug]/campaigns/[id]/process-chunk` → `app/api/w/[workspaceSlug]/campaigns/[id]/process-chunk/route.ts` (NEW: Process campaign chunk)
- `GET /api/w/[workspaceSlug]/campaigns/draft` → `app/api/w/[workspaceSlug]/campaigns/draft/route.ts` (list drafts)
- `POST /api/w/[workspaceSlug]/campaigns/draft/create` → `app/api/w/[workspaceSlug]/campaigns/draft/create/route.ts` (create draft)
- `POST /api/w/[workspaceSlug]/campaigns/process-stuck` → `app/api/w/[workspaceSlug]/campaigns/process-stuck/route.ts` (NEW: Process stuck campaigns)

**Knowledge base**

- `GET|POST /api/w/[workspaceSlug]/knowledge-base` → `app/api/w/[workspaceSlug]/knowledge-base/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/knowledge-base/[id]` → `app/api/w/[workspaceSlug]/knowledge-base/[id]/route.ts`

**Integrations**

- `GET|POST /api/w/[workspaceSlug]/integrations` → `app/api/w/[workspaceSlug]/integrations/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/integrations/[provider]` → `app/api/w/[workspaceSlug]/integrations/[provider]/route.ts`
- `GET /api/w/[workspaceSlug]/integrations/algolia-search-config` → `app/api/w/[workspaceSlug]/integrations/algolia-search-config/route.ts`

**Assigned Integrations (NEW - Org-level key assignments)**

- `GET /api/w/[workspaceSlug]/assigned-integrations` → `app/api/w/[workspaceSlug]/assigned-integrations/route.ts`
- `GET /api/w/[workspaceSlug]/assigned-integration/[provider]` → `app/api/w/[workspaceSlug]/assigned-integration/[provider]/route.ts`

**Phone Numbers**

- `GET /api/w/[workspaceSlug]/phone-numbers/available` → `app/api/w/[workspaceSlug]/phone-numbers/available/route.ts`

**Members + invitations**

- `GET|POST /api/w/[workspaceSlug]/members` → `app/api/w/[workspaceSlug]/members/route.ts`
- `PATCH|DELETE /api/w/[workspaceSlug]/members/[memberId]` → `app/api/w/[workspaceSlug]/members/[memberId]/route.ts`
- `GET|POST /api/w/[workspaceSlug]/invitations` → `app/api/w/[workspaceSlug]/invitations/route.ts`
- `DELETE /api/w/[workspaceSlug]/invitations/[id]` → `app/api/w/[workspaceSlug]/invitations/[id]/route.ts`

**Billing (workspace credits + subscription)**

- `GET /api/w/[workspaceSlug]/credits` → `app/api/w/[workspaceSlug]/credits/route.ts`
- `POST /api/w/[workspaceSlug]/credits/topup` → `app/api/w/[workspaceSlug]/credits/topup/route.ts`
- `GET|POST|PATCH|DELETE /api/w/[workspaceSlug]/subscription` → `app/api/w/[workspaceSlug]/subscription/route.ts`
- `GET /api/w/[workspaceSlug]/subscription/plans` → `app/api/w/[workspaceSlug]/subscription/plans/route.ts`
- `POST /api/w/[workspaceSlug]/subscription/preview` → `app/api/w/[workspaceSlug]/subscription/preview/route.ts`

**Analytics**

- `GET /api/w/[workspaceSlug]/analytics` → `app/api/w/[workspaceSlug]/analytics/route.ts`

### External webhooks

- `POST /api/webhooks/vapi` → VAPI call events → billing + function calls forwarding
- `POST /api/webhooks/retell` → Retell call events → billing
- `POST /api/webhooks/w/[workspaceId]/vapi` → Workspace-level VAPI webhooks (per-workspace webhook URL)
- `POST /api/webhooks/w/[workspaceId]/retell` → Workspace-level Retell webhooks (per-workspace webhook URL)
- `POST /api/webhooks/stripe` → platform Stripe events (partner subscription + partner credits)
- `POST /api/webhooks/stripe-connect` → Connect events (workspace credits + workspace subscriptions)

### Public APIs (unauthenticated)

- `POST /api/public/agency-checkout` → `app/api/public/agency-checkout/route.ts` (agency checkout flow)
- `GET /api/public/white-label-plans` → `app/api/public/white-label-plans/route.ts` (public plans listing)

### Super admin APIs

All under `app/api/super-admin/*`:

**Partner requests**

- `GET /api/super-admin/partner-requests` → `app/api/super-admin/partner-requests/route.ts`
- `GET|PATCH /api/super-admin/partner-requests/[id]` → `app/api/super-admin/partner-requests/[id]/route.ts`
- `POST /api/super-admin/partner-requests/[id]/provision` → `app/api/super-admin/partner-requests/[id]/provision/route.ts`

**Partners**

- `GET /api/super-admin/partners` → `app/api/super-admin/partners/route.ts`
- `GET|PATCH /api/super-admin/partners/[id]` → `app/api/super-admin/partners/[id]/route.ts`
- `GET|POST /api/super-admin/partners/[id]/domains` → `app/api/super-admin/partners/[id]/domains/route.ts`
- `GET /api/super-admin/partners/[id]/workspaces` → `app/api/super-admin/partners/[id]/workspaces/route.ts`

**White-label variants**

- `GET|POST /api/super-admin/white-label-variants` → `app/api/super-admin/white-label-variants/route.ts`
- `GET|PATCH|DELETE /api/super-admin/white-label-variants/[id]` → `app/api/super-admin/white-label-variants/[id]/route.ts`

### Utility APIs

- `POST /api/upload/logo` → `app/api/upload/logo/route.ts`
- `POST /api/workspaces` → `app/api/workspaces/route.ts`

---

## Runtime Entry Points

### Next.js middleware

- `proxy.ts` exports `proxy(request)` and a `config.matcher` to apply to all routes except static assets.
- Applies:
  - Auth redirects
  - Partner domain access control (platform vs white-label restrictions)
  - Security headers

### Sentry instrumentation

- `instrumentation.ts`: runtime registration for server/edge
- `instrumentation-client.ts`: browser Sentry init (Replay enabled)
- `next.config.ts`: wraps config via `withSentryConfig`

---

## Auth + Route Protection

### Public vs protected routing

Defined in `proxy.ts`:

**Platform Partner (genius365.ai)**:

- Full access to all routes (marketing, auth, dashboard, etc.)

**White-Label Partners**:

- **Allowed**: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/accept-*-invitation`, `/select-workspace`, `/setup-profile`, `/workspace-onboarding`, `/w/*`, `/org/*`, `/api/partner/*`, `/api/w/*`, `/api/auth/*`, `/api/webhooks/*`, `/agency-checkout/*`
- **Blocked**: `/`, `/pricing`, `/request-partner`, `/api/partner-requests`, `/api/super-admin/*`

### Agency checkout flow (NEW)

Public checkout flow for agencies to subscribe:

- `/agency-checkout` - Checkout page with plan selection
- `/agency-checkout/success` - Post-checkout success page
- `POST /api/public/agency-checkout` - Create checkout session
- `GET /api/public/white-label-plans` - Get available plans
- Uses `lib/checkout-token.ts` for secure token generation

### Auth context primitives

- `lib/supabase/server.ts`: SSR Supabase client
- `lib/supabase/client.ts`: browser Supabase client
- `lib/supabase/admin.ts`: service-role client (bypasses RLS; used in API routes)

Primary context builder:

- `lib/api/auth.ts` → `getPartnerAuthContext()`
  - resolves user
  - resolves partner from host
  - loads partner membership + workspace memberships
  - for partner admins/owners: also adds "admin access" workspaces in that partner

Workspace context:

- `lib/api/workspace-auth.ts` → `getWorkspaceContext(workspaceSlug, requiredRoles?)`
- `withWorkspace(handler, options)` for API routes (auth + role check + paywall enforcement)

---

## Database: Prisma Schema & Key Models

Authoritative schema:

- `prisma/schema.prisma`
- Prisma client output: `lib/generated/prisma` (ignored by git; generated at install/build)

### Key enums

**Agent/Provider**:

- `AgentProvider`: `vapi` | `retell`
- `VoiceProvider`: `elevenlabs` | `deepgram` | `azure` | `openai` | `cartesia`
- `ModelProvider`: `openai` | `anthropic` | `google` | `groq`
- `TranscriberProvider`: `deepgram` | `assemblyai` | `openai`
- `AgentDirection`: `inbound` | `outbound`
- `SyncStatus`: `not_synced` | `pending` | `synced` | `error`

**Calls**:

- `CallDirection`: `inbound` | `outbound`
- `CallStatus`: `initiated` | `ringing` | `in_progress` | `completed` | `failed` | `no_answer` | `busy` | `canceled`

**Telephony (NEW)**:

- `PhoneNumberStatus`: `available` | `assigned` | `pending` | `inactive` | `error`
- `PhoneNumberProvider`: `sip` | `vapi` | `retell` | `twilio`

**Billing**:

- `WorkspaceSubscriptionStatus`: `active` | `past_due` | `canceled` | `incomplete` | `trialing` | `paused`
- `BillingType`: `prepaid` | `postpaid`
- `CreditTransactionType`: `topup` | `usage` | `refund` | `adjustment`

**Leads (NEW)**:

- `LeadStatus`: `new` | `contacted` | `qualified` | `converted` | `lost` | `nurturing`
- `LeadSource`: `voice_agent` | `manual` | `import` | `api` | `webhook`

**Knowledge**:

- `KnowledgeDocumentType`: `document` | `faq` | `product_info` | `policy` | `script` | `other`
- `KnowledgeDocumentStatus`: `draft` | `processing` | `active` | `archived` | `error`

### Key models (high signal)

#### White-label plans (super-admin managed)

- `WhiteLabelVariant`: plan variants with Stripe price ID, limits, isActive/sortOrder

#### Tenancy

- `Partner`: slug, branding/settings JSON, Stripe customer/subscription IDs, `isBillingExempt`, `whiteLabelVariantId`, `isPlatformPartner`
- `PartnerDomain`: hostname mapping, primary/verified
- `PartnerMember` / `PartnerInvitation`
- `PartnerRequest`: onboarding/provisioning pipeline

#### Workspaces

- `Workspace`: `resourceLimits`, monthly usage (`currentMonthMinutes`, `currentMonthCost`), billing flags (`isBillingExempt`, `perMinuteRateCents`)
- `WorkspaceMember` / `WorkspaceInvitation`
- `WorkspaceIntegration`: provider API keys JSON (legacy - being deprecated)

#### Org-Level Integrations (NEW)

- `PartnerIntegration`: Centralized API keys for VAPI/Retell/Algolia at partner level
  - `provider`: vapi | retell | algolia
  - `name`: Display name
  - `apiKeys`: JSON with `default_secret_key`, `default_public_key`, `additional_keys`
  - `isDefault`: Auto-assigned to new workspaces
- `WorkspaceIntegrationAssignment`: Maps which partner integration is assigned to which workspace
  - Links `Workspace` to `PartnerIntegration`
  - Unique per (workspace, provider)

#### Telephony (NEW)

- `SipTrunk`: Partner-level SIP trunk configuration
  - SIP server, port, transport, auth credentials
  - Registration settings, outbound proxy
  - `isDefault`, `isActive`, registration status
  - Provider integration (`externalCredentialId`)
- `PhoneNumber`: Partner-level phone number inventory
  - Phone number, E.164 format, friendly name
  - Provider (`sip`, `vapi`, `retell`, `twilio`)
  - SIP URI, SIP trunk reference
  - Assignment: `status`, `assignedAgentId`, `assignedWorkspaceId`
  - Capabilities: `supportsInbound`, `supportsOutbound`, `supportsSms`

#### Agents & Calls

- `AiAgent`: provider, external IDs, config JSON (tools, prompts, api key config), sync fields (`syncStatus`, `needsResync`, `lastSyncError`), direction/telephony fields (`agentDirection`, `allowOutbound`, `assignedPhoneNumberId`)
- `Conversation`: canonical "call log" record (`externalId`, `direction`, `status`, `durationSeconds`, `recordingUrl`, `transcript`, `summary`, `sentiment`, `totalCost`, `metadata`)
- `UsageTracking`: normalized usage rows (minutes/cost/etc.)

#### Billing & Subscriptions

- `BillingCredits` + `CreditTransaction`: partner-level credits (platform)
- `WorkspaceCredits` + `WorkspaceCreditTransaction`: workspace-level credits (via Connect)
- `WorkspaceSubscriptionPlan`: partner-defined plans for workspaces (prepaid/postpaid)
- `WorkspaceSubscription`: subscription state for workspace (Stripe IDs + usage counters + postpaid fields)

#### Product modules

- `KnowledgeDocument` + `AgentKnowledgeDocument` (link docs to agents)
- `Lead`: Lead management with status tracking, scoring, and assignment
- `AuditLog`: System-wide audit logging

#### Campaigns (via Supabase)

- `call_campaigns`: Campaign definitions with scheduling, business hours
- `call_recipients`: Recipients with call status tracking

---

## API Layer Patterns

### General conventions

- Workspace-scoped API routes live under: `app/api/w/[workspaceSlug]/...`
- Partner-scoped API routes live under: `app/api/partner/...`
- Most routes fetch context using:
  - `getWorkspaceContext(workspaceSlug, requiredRoles?)`
  - `getPartnerAuthContext()`
  - or `withWorkspace(handler, options)` (recommended for consistency)
- Responses use helpers: `lib/api/helpers.ts` (`apiResponse`, `apiError`, `unauthorized`, `forbidden`, `serverError`, `notFound`, etc.)

### Paywall pattern (mutation endpoints)

Many POST/PATCH/DELETE workspace routes call:

- `checkWorkspacePaywall(workspaceId, workspaceSlug)` and return a **402** paywall response if blocked

---

## Billing System (Partner + Workspace)

This repo supports **two billing layers**:

### 1) Partner billing (platform Stripe account)

- Partner subscription checkout: `app/api/partner/billing/checkout/route.ts`
- Partner subscription status updates: `app/api/webhooks/stripe/route.ts`
- Partner credits (top-ups + usage deductions):
  - `lib/stripe/credits.ts`
  - Webhook applies top-ups from `payment_intent.succeeded`

### 2) Workspace billing (Stripe Connect, per partner)

Workspaces can:

- Buy workspace credits via the partner's Connect account:
  - payment intent created in `lib/stripe/workspace-credits.ts`
  - applied by `app/api/webhooks/stripe-connect/route.ts`
- Subscribe to partner-defined workspace plans (prepaid/postpaid):
  - API: `app/api/w/[workspaceSlug]/subscription/route.ts`
  - Plan listing/preview: `app/api/w/[workspaceSlug]/subscription/plans/*`, `/preview/*`
  - Stripe Connect webhook updates subscription rows and resets usage at period boundaries

### Provider call billing

Provider webhooks (VAPI/Retell) call:

- `lib/billing/usage.ts` → `processCallCompletion()`

Which delegates to:

- `lib/stripe/workspace-credits.ts` → `deductWorkspaceUsage()`

Supporting:

- billing-exempt workspaces → partner credits
- postpaid subscriptions → track usage + invoice later
- prepaid subscriptions → included minutes then overage credits
- no subscription → workspace credits

---

## Workspaces: Paywall / Read-only Mode

Paywall logic:

- `lib/billing/workspace-paywall.ts` determines if a workspace is paywalled:
  - not billing-exempt
  - no active workspace subscription
  - credits balance <= 0

Enforcement:

- Most workspace mutation endpoints do an explicit `checkWorkspacePaywall(workspaceId, workspaceSlug)` at the start.
- There is also a higher-order helper `withWorkspace(handler, options)` that can enforce paywall automatically for mutation methods (and can skip it via `skipPaywallCheck` for billing recovery endpoints).

UI hook:

- `lib/hooks/use-workspace-paywall.ts`

---

## Voice Provider Integrations (VAPI + Retell)

Provider integrations live in `lib/integrations/`:

- `vapi/*`
  - agent mapping/sync: `lib/integrations/vapi/agent/*`
  - call retrieval/polling: `lib/integrations/vapi/calls.ts`
  - batch outbound calls: `lib/integrations/vapi/batch-calls.ts` (fallback for campaigns)
  - browser web call session: `lib/integrations/vapi/web-call.ts`
  - phone numbers: `lib/integrations/vapi/phone-numbers.ts`
  - SIP trunks: `lib/integrations/vapi/sip-trunk.ts`
- `retell/*`
  - agent mapping/sync (LLM first): `lib/integrations/retell/agent/*`
  - call retrieval/polling: `lib/integrations/retell/calls.ts`
  - browser web call session: `lib/integrations/retell/web-call.ts`
- `sentiment/*`
  - provider-specific sentiment extraction used during ingest
- `function_tools/*`
  - Provider-agnostic function tool definitions
  - VAPI tool mapping with full tool type support
  - Retell tool mapping (native tools only)
- `campaign-provider.ts` - Campaign provider abstraction (Inspra primary, VAPI fallback)
- `inspra/client.ts` - Inspra outbound API client

### Infrastructure patterns

- `lib/integrations/retry.ts`: Retry logic with exponential backoff
- `lib/integrations/circuit-breaker.ts`: Circuit breaker pattern for external APIs
- `lib/integrations/webhook.ts`: Webhook forwarding utilities

### Important Retell constraint: tools at LLM level

Retell requires **LLM creation before agent creation** and uses LLM `general_tools`.

- Sync orchestration: `lib/integrations/retell/agent/sync.ts`
- Tool mapping for Retell LLM: `lib/integrations/function_tools/retell/mapper.ts`

**Current behavior in this repo**:

- The Retell mapper only emits **Retell-native** tools into `general_tools` (no custom webhook tools are mapped here).
- Supported Retell-native tool types (as mapped): `end_call`, `transfer_call`, `press_digit`, `check_availability_cal`, `book_appointment_cal`, `send_sms`.

---

## Org-Level Integrations & API Key Management

**New architecture for centralized API key management:**

### Partner Integrations

- `PartnerIntegration` model stores API keys at the organization level
- Supports VAPI, Retell, and Algolia providers
- Each integration has:
  - Default secret and public keys
  - Optional additional keys for multi-key scenarios
  - `isDefault` flag for auto-assignment to new workspaces
  - `isActive` flag for enabling/disabling

### Workspace Assignments

- `WorkspaceIntegrationAssignment` links workspaces to partner integrations
- One assignment per provider per workspace
- Default integrations are automatically assigned to new workspaces

### Migration from legacy

- `WorkspaceIntegration` (legacy model) is being deprecated
- New flow: Partner creates integrations → assigns to workspaces
- Workspaces read keys from assigned `PartnerIntegration` via assignment

### API Endpoints

- Partner: `GET|POST /api/partner/integrations` - Manage integrations
- Partner: `POST /api/partner/integrations/[id]/set-default` - Set as default
- Workspace: `GET /api/w/[slug]/assigned-integrations` - View assignments
- Workspace: `GET /api/w/[slug]/assigned-integration/[provider]` - Get specific integration

---

## Telephony System (SIP Trunks + Phone Numbers)

**Partner-level telephony management:**

### SIP Trunks

- `SipTrunk` model stores SIP configuration per partner
- Supports:
  - SIP server connection (server, port, transport)
  - Authentication (username, password, realm)
  - Registration settings (register, expiry)
  - Outbound settings (proxy, caller ID)
  - Provider integration sync (external credential ID)

### Phone Numbers

- `PhoneNumber` model manages phone inventory per partner
- Features:
  - Multi-provider support (SIP, VAPI, Retell, Twilio)
  - E.164 normalization
  - SIP URI generation from trunk config
  - Assignment to workspaces and agents
  - Capability flags (inbound, outbound, SMS)
  - Status tracking (available, assigned, pending, inactive, error)

### Sync with Providers

- `/api/partner/telephony/sip-trunks/[id]/sync` - Sync trunk to provider
- `/api/partner/telephony/phone-numbers/[id]/sync` - Sync number to provider
- Creates external credentials/phone numbers in VAPI/Retell

### Agent Assignment

- Agents can have `assignedPhoneNumberId` for outbound calls
- Phone numbers track which agent they're assigned to

---

## Calls: Storage, Search, Ingestion, Webhooks

### Storage model

Calls are stored as **`conversations`** rows (Prisma `Conversation` model; Supabase table `conversations`).

### Listing + search

- API: `GET /api/w/[workspaceSlug]/calls` → `app/api/w/[workspaceSlug]/calls/route.ts`
- Supports filters: status, direction, agent, call type (via `metadata.call_type`), date range
- Search strategy:
  - If `search` query is present and Algolia is configured, use **Algolia-first** search
  - Otherwise fallback to DB `ilike` matching (transcript/caller/phone + agent name enrichment)
  - Includes rate-limited "warmup" indexing of recent calls when Algolia returns 0 hits

### Individual call detail

- API: `GET /api/w/[workspaceSlug]/calls/[callId]` → `app/api/w/[workspaceSlug]/calls/[callId]/route.ts`
- Page: `/w/[workspaceSlug]/calls/[callId]` - Dedicated call detail page
- Component: `components/workspace/calls/transcript-player.tsx` - Audio player with transcript sync

### Algolia search

- API: `POST /api/w/[workspaceSlug]/calls/search` → Dedicated search endpoint
- Management endpoints:
  - `POST /api/w/[workspaceSlug]/calls/resync-algolia` - Resync all calls to Algolia
  - `POST /api/w/[workspaceSlug]/calls/clear-algolia` - Clear Algolia index
- Library: `lib/algolia/call-logs.ts`, `lib/algolia/sync.ts` - Indexing and search utilities
- UI components:
  - `components/workspace/calls/algolia-search-panel.tsx` - Full search with autocomplete
  - `components/workspace/calls/algolia-search-box.tsx` - Search input component
  - `components/workspace/calls/fallback-search-panel.tsx` - DB fallback when Algolia unavailable
  - `components/workspace/calls/algolia-benefits-banner.tsx` - Promotion banner

### Dashboard charts

- API: `GET /api/w/[workspaceSlug]/dashboard/charts`
- Hook: `lib/hooks/use-dashboard-charts.ts`
- Returns:
  - Calls over time (with duration and cost)
  - Call outcomes distribution
  - Recent calls
  - Period summary stats

### Ingestion (poll provider → insert/update)

- API: `POST /api/w/[workspaceSlug]/calls/ingest`
- Validates agent/provider match
- Polls provider until ready:
  - Retell: `pollRetellCallUntilReady` in `lib/integrations/retell/calls.ts`
  - VAPI: `pollVapiCallUntilReady` in `lib/integrations/vapi/calls.ts`
- Maps provider response → `ConversationInsertData`
- Inserts (or backfills transcript if row exists)
- Updates:
  - agent totals
  - workspace monthly usage
  - `usage_tracking` row
- Indexes to Algolia async

### Realtime call status

- Hook: `lib/hooks/use-realtime-call-status.ts` - Live call status updates

### Provider webhooks (billing + transcript updates)

- VAPI webhook: `app/api/webhooks/vapi/route.ts`
  - Handles call events (call.started, call.ended)
  - Forwards function-call events to user's configured webhook URL
- Retell webhook: `app/api/webhooks/retell/route.ts`
- **Workspace-level webhooks** (NEW):
  - `POST /api/webhooks/w/[workspaceId]/vapi` - Per-workspace VAPI webhook URL
  - `POST /api/webhooks/w/[workspaceId]/retell` - Per-workspace Retell webhook URL

They:

- find conversation by `externalId` (provider call id)
- update conversation status/transcript/recording/metadata
- call `processCallCompletion()` for billing

---

## Agents: Creation, Sync, Test Calls, Tools

### Agent creation (no auto-sync)

- API: `POST /api/w/[workspaceSlug]/agents`
- Important behavior:
  - Agent is created with **no API key assigned** by default (`api_key_config.assigned_key_id = null`)
  - `sync_status = "not_synced"`
  - Knowledge documents can be linked at creation; content is injected into system prompt

### Agent update (sync triggers)

- API: `PATCH /api/w/[workspaceSlug]/agents/[id]`
- Detects API key assignment/change/removal in `config.api_key_config`
- If key is assigned/changed:
  - marks `sync_status = "pending"`, `needs_resync = true`
  - triggers provider sync:
    - VAPI: `safeVapiSync()`
    - Retell: `safeRetellSync()`
- If key removed:
  - marks `sync_status = "not_synced"`, `needs_resync = false`

### Test calls (browser sessions)

- API: `POST /api/w/[workspaceSlug]/agents/[id]/test-call`
- Requires agent to have `external_agent_id` (already synced)
- VAPI test calls require **public key**
- Retell test calls require **secret key**

### Outbound calls

- API: `POST /api/w/[workspaceSlug]/agents/[id]/outbound-call`
- Requires agent to be synced and have phone number assigned
- Creates call via provider API

### Function tools system (provider-agnostic authoring)

UI editor:

- `components/workspace/agents/function-tool-editor.tsx`

Provider mapping:

- **VAPI tool mapping**: `lib/integrations/function_tools/vapi/*`
  - Organized by category:
    - `tools/call-control/` - Native call control (end-call, transfer-call, dtmf, handoff)
    - `tools/api/` - API request tools and custom functions
    - `tools/code/` - Code execution tools (bash, custom code)
    - `tools/integrations/` - Third-party integrations (GHL, Google, MCP, Query, Communication)
  - Has a "tool sync" flow that creates VAPI tools via `/tool` API and persists `external_tool_id`
    - See `lib/integrations/function_tools/vapi/api/sync.ts` and `lib/integrations/vapi/agent/sync.ts`
  - Registry and mapper: `lib/integrations/function_tools/vapi/registry.ts`, `mapper.ts`
- **Retell tool mapping**: `lib/integrations/function_tools/retell/*`
  - Only maps native Retell tools currently (see Retell limitation above)
  - Registry and mapper: `lib/integrations/function_tools/retell/registry.ts`, `mapper.ts`

---

## Campaigns Module

Storage:

- Uses Supabase tables:
  - `call_campaigns` - Campaign definitions with scheduling, business hours
  - `call_recipients` - Recipients with call status tracking
  - `campaign_queue` (NEW) - Queue state for scalable processing

### Campaign Processing Architecture

The campaigns module supports **three processing approaches**:

1. **Legacy/Simple** (`/start`) - Fire-and-forget all calls via Inspra API
2. **Optimized** (`/start-optimized`) - Batched processing with better error handling
3. **Scalable Queue-based** (`/start-scalable`) - Self-regulating queue with concurrent limits

The **scalable approach** is recommended for large campaigns:
- Queues all recipients, starts only N calls at a time (respecting VAPI concurrency limits)
- Webhooks trigger subsequent calls when calls complete
- Background cron (`/api/cron/process-campaigns`) processes chunks periodically
- Supports pause/resume without losing progress

API:

- `app/api/w/[workspaceSlug]/campaigns/route.ts`
  - list campaigns + create campaign
  - supports "wizard flow" creation (recipients + variable mappings + overrides)
- `app/api/w/[workspaceSlug]/campaigns/[id]/route.ts`
  - get/update/delete (delete is blocked for active campaigns)
- `app/api/w/[workspaceSlug]/campaigns/draft/route.ts` - Draft campaign management
- `app/api/w/[workspaceSlug]/campaigns/draft/create/route.ts` - Create draft from wizard

Campaign actions:

- `POST .../campaigns/[id]/start` - Start campaign via Inspra API or VAPI batch fallback
- `POST .../campaigns/[id]/start-optimized` - Optimized start with batching
- `POST .../campaigns/[id]/start-scalable` - **Recommended**: Queue-based scalable start
- `POST .../campaigns/[id]/pause` - Pause active campaign
- `POST .../campaigns/[id]/resume` - Resume paused campaign
- `POST .../campaigns/[id]/terminate` - Cancel/terminate campaign
- `POST .../campaigns/[id]/test-call` - Make test call for campaign
- `POST .../campaigns/[id]/cleanup` - Clean up stale/orphaned calls
- `POST .../campaigns/[id]/process-calls` - Process pending calls in queue
- `POST .../campaigns/[id]/process-chunk` - Process a single chunk of recipients
- `POST .../campaigns/process-stuck` - Process stuck campaigns workspace-wide
- `POST .../campaigns/[id]/recipients/import-optimized` - Optimized bulk recipient import

Campaign infrastructure:

- `lib/campaigns/batch-caller.ts` - Batch calling with chunking, progress tracking, and serverless optimization
- `lib/campaigns/queue-processor.ts` - Queue-based campaign processing
- `lib/campaigns/call-queue-manager.ts` - Call queue management and concurrency control
- `lib/campaigns/batch-processor.ts` - Batch processing utilities
- `lib/campaigns/stale-call-cleanup.ts` - Stale call cleanup utilities
- `lib/campaigns/cleanup-expired.ts` - Expired campaign cleanup
- `lib/integrations/vapi/batch-calls.ts` - VAPI batch calls (fallback provider)

UI components:

- `components/workspace/campaigns/campaign-wizard-optimized.tsx` - Main campaign wizard (with Zustand state)
- `components/workspace/campaigns/campaign-wizard-dynamic.tsx` - Dynamic loading wrapper
- `components/workspace/campaigns/wizard-draft-card.tsx` - Draft campaign display card
- `components/workspace/campaigns/campaign-live-dashboard.tsx` - Live campaign monitoring dashboard
- `components/workspace/campaigns/campaign-analytics.tsx` - Campaign analytics display
- `components/workspace/campaigns/campaign-hero-stats.tsx` - Hero stats display
- `components/workspace/campaigns/campaign-card.tsx` - Campaign card with progress
- `components/workspace/campaigns/campaign-progress-ring.tsx` - Visual progress indicator
- `components/workspace/campaigns/campaign-activity-feed.tsx` - Activity feed component
- `components/workspace/campaigns/webhook-status-alert.tsx` - Webhook URL mismatch alert
- `components/workspace/campaigns/steps/` - Wizard step components

Realtime:

- `lib/hooks/use-realtime-campaign.ts` - Realtime campaign status updates
- `lib/hooks/use-campaign-draft.ts` - Campaign draft management hook
- `lib/hooks/use-campaign-polling.ts` - Polling-based campaign status (fallback)
- `lib/hooks/use-campaign-progress.ts` - Campaign progress tracking

Cron:

- `app/api/cron/master/route.ts` runs `cleanupExpiredCampaigns()` - **Vercel schedule**: daily at `0 0 * * *`
- `app/api/cron/process-campaigns/route.ts` - **NEW**: Processes active campaign queues
  - Should run every 1-5 minutes in production (NOT in `vercel.json` - use external cron service)
  - Processes chunks across multiple campaigns
  - Respects business hours and rate limits
  - For Vercel Hobby plans, use external service like cron-job.org
  - Requires `CRON_SECRET` or `VERCEL_CRON_SECRET` for authorization

---

## Knowledge Base Module

Storage:

- `knowledge_documents` table
- linked to agents via `agent_knowledge_documents`

API:

- `app/api/w/[workspaceSlug]/knowledge-base/route.ts` (list/create)
- `app/api/w/[workspaceSlug]/knowledge-base/[id]/route.ts` (update/delete)

Agent integration:

- On agent create/update, selected active knowledge docs are pulled and injected into the agent system prompt.

---

## Custom Variables Module

**Workspace-level custom variables for campaign personalization:**

Storage:

- `workspace.settings.custom_variables` (JSONB array in workspaces table)
- Each variable has: id, name, description, default_value, is_required, category, created_at

Types:

- `CustomVariableDefinition` interface in `types/database.types.ts`
- `STANDARD_CAMPAIGN_VARIABLES` constant for built-in variables (first_name, last_name, email, company, phone_number)
- `WorkspaceSettings` interface includes custom_variables array

API:

- `PATCH /api/w/[workspaceSlug]/settings` with `custom_variable_operation` for CRUD
  - Actions: `add`, `update`, `delete`
- Settings API handles variable validation, duplicate prevention, and standard variable protection

Hooks:

- `useWorkspaceCustomVariables()` - Fetch workspace custom variables
- `useAddCustomVariable()` - Add new variable
- `useUpdateCustomVariable()` - Update existing variable
- `useDeleteCustomVariable()` - Delete variable

UI Components:

- `components/workspace/settings/custom-variables-section.tsx` - Settings page section
- Agent Wizard shows available variables for insertion into prompts
- Campaign Wizard Step Variables shows standard + workspace + CSV variables

Variable Flow:

1. **Define**: Workspace Settings → Custom Variables → Add
2. **Use**: Agent prompts use `{{variable_name}}` syntax
3. **Provide**: Campaign CSV includes columns matching variable names
4. **Resolve**: During calls, variables are replaced with recipient data

Documentation:

- `docs/CUSTOM_VARIABLES_GUIDE.md` - Complete guide with flowcharts and testing
- `docs/campaign_custom_variables_test_data.csv` - Sample test data

---

## Leads Module

**New module for lead management:**

Storage:

- `leads` table with Prisma model `Lead`

Features:

- Contact information (name, email, phone, company)
- Lead status workflow: `new` → `contacted` → `qualified` → `converted` | `lost` | `nurturing`
- Lead source tracking: `voice_agent`, `manual`, `import`, `api`, `webhook`
- Priority and score (0-100)
- Assignment to users
- Engagement tracking (last contacted, next follow-up)
- Custom fields JSON support
- Tagging system

Relations:

- Linked to workspace, agent, and conversations
- Assigned to users for follow-up

---

## RBAC (Permissions)

RBAC is implemented as a permission matrix:

- `lib/rbac/permissions.ts`:
  - workspace roles: `viewer` < `member` < `admin` < `owner`
  - partner roles: `member` < `admin` < `owner`
  - helpers: `hasWorkspacePermission`, `hasPartnerPermission`, role hierarchy checks
- `lib/rbac/middleware.ts`:
  - wrappers `withWorkspacePermission()` and `withPartnerPermission()` for API routes

Note: many workspace routes currently enforce roles via `getWorkspaceContext(..., requiredRoles)` and paywall checks; RBAC middleware is available for more granular permission checks.

---

## Observability (Sentry + Logging)

Sentry:

- `next.config.ts` uses `withSentryConfig`
- `instrumentation.ts` registers server/edge configs
- `instrumentation-client.ts` initializes browser SDK (Replay enabled)
- `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts`
- Sentry tunnel route at `/monitoring` for ad-blocker bypass

Logging:

- `lib/logger.ts` (used by cron + infra code)
- Many API routes also log via `console.*` (provider integration and ingestion paths)

---

## Configuration & Environment Variables

Environment is validated centrally in:

- `lib/env.ts`

High-signal variables (non-exhaustive):

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Prisma**: `DATABASE_URL` (runtime, pooled), `DIRECT_URL` (migrations)
- **App**: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PLATFORM_DOMAIN`, `DEV_PARTNER_SLUG`
- **Stripe Platform**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs (`STRIPE_PRICE_*`)
- **Stripe Connect**: `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_CONNECT_PLATFORM_FEE_PERCENT`
- **Email**: `RESEND_API_KEY`, `FROM_EMAIL`, `SUPER_ADMIN_EMAIL`
- **Cron**: `CRON_SECRET` or `VERCEL_CRON_SECRET`
- **Supabase Storage**: `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` (used by `/api/upload/logo`)
- **Campaigns**: `INSPRA_OUTBOUND_API_URL`, `INSPRA_API_KEY`

---

## Docs & Guides in Repo

Living docs under `docs/` (useful for onboarding/testing):

- `docs/CAMPAIGN_MODULE_REFERENCE.md` - Campaign module architecture and implementation
- `docs/CAMPAIGN_MODULE_ARCHITECTURE.md` - Detailed campaign architecture documentation
- `docs/CAMPAIGN_TESTING_GUIDE.md` - Campaign feature testing procedures
- `docs/DEVELOPMENT_TESTING_GUIDE.md` - General development testing guide
- `docs/campaign-test-data-500.csv` - Sample CSV data for campaign testing
- `docs/inspra_outbound_api_docs.txt` - Inspra outbound API documentation

---

## Common Dev Workflows

### Install / run

```bash
npm install
npm run dev
```

### Prisma

```bash
npm run db:generate
npm run db:migrate
npm run db:studio    # Open Prisma Studio GUI
npm run db:pull      # Introspect DB and update schema
```

### Core debugging entrypoints

- "Why am I being redirected?" → `proxy.ts`
- "Why is this workspace read-only?" → `lib/billing/workspace-paywall.ts` + `lib/api/workspace-auth.ts`
- "Why isn't my agent syncing?" → `lib/integrations/{vapi|retell}/agent/sync.ts` + agent `sync_status` / `last_sync_error`
- "Why isn't call search working?" → `app/api/w/[workspaceSlug]/calls/route.ts` + `lib/algolia/*`
- "Why aren't integrations showing?" → `app/api/partner/integrations/*` + `app/api/w/[slug]/assigned-integrations/*`
- "Why aren't webhooks reaching production?" → `GET /api/w/[slug]/agents/webhook-status` to check URLs, `POST /api/w/[slug]/agents/resync-webhooks` to fix
- "Why is my campaign stuck?" → Check `campaign_queue` table status, use `POST .../campaigns/process-stuck` or check cron logs
- "Why aren't campaign calls progressing?" → Check `call_recipients` statuses, verify business hours, check VAPI concurrency limits

---

## Gotchas / Non-obvious Details

### Prisma is optional… but key subsystems require it

- `lib/prisma/client.ts` intentionally returns `null` if `DATABASE_URL` is not configured (to allow Supabase-only operation for basic CRUD).
- However, these subsystems **require Prisma** and will error/skip without it:
  - Paywall computation: `lib/billing/workspace-paywall.ts`
  - Provider webhooks billing + conversation updates: `app/api/webhooks/{vapi,retell}/route.ts`
  - Stripe webhooks: `app/api/webhooks/{stripe,stripe-connect}/route.ts`
  - Workspace subscription + plan flows: `app/api/w/[workspaceSlug]/subscription/*`
  - Partner integrations: `app/api/partner/integrations/*`
  - Telephony management: `app/api/partner/telephony/*`

### Paywall enforcement is not a single centralized allowlist (yet)

- There is an `isPaywallExemptPath()` helper in `lib/billing/workspace-paywall.ts`.
- In practice, most workspace routes enforce paywall by directly calling `checkWorkspacePaywall()` (or by using `withWorkspace(..., { skipPaywallCheck: true })` in endpoints that must be reachable during billing recovery).

### Retell "tools" in this codebase are Retell-native only

- Retell tool mapping (`lib/integrations/function_tools/retell/mapper.ts`) filters to Retell-native tool types only.
- If you add "custom function tools" in the agent UI, they will sync to VAPI (via VAPI tool API) but are not mapped to Retell `general_tools` in this implementation.

### Algolia integration is workspace-scoped, REST-only

- Keys live in `workspace_integrations` row with `provider="algolia"` under the `config` JSON.
- The integration uses `fetch` (REST) and intentionally avoids the Algolia JS client.
- Key files:
  - `lib/algolia/call-logs.ts` - Call log indexing and search
  - `lib/algolia/sync.ts` - Bulk sync utilities
  - `lib/algolia/client.ts` - REST client helpers
  - `lib/algolia/types.ts` - TypeScript types

### Org-level integrations vs legacy workspace integrations

- New flow uses `PartnerIntegration` + `WorkspaceIntegrationAssignment`
- Legacy `WorkspaceIntegration` model is still present but being deprecated
- When fetching keys, check assigned integrations first, fall back to legacy

### White-label partner restrictions

- Platform partner (`is_platform_partner: true`) has full access
- White-label partners:
  - Cannot access marketing pages (redirect to `/login`)
  - Cannot access `/api/partner-requests` (returns 404)
  - Cannot access super-admin routes
  - Root path `/` redirects to `/login`

### VAPI webhook URL configuration

- Agents can have custom webhook URLs for function execution
- VAPI webhook handler (`/api/webhooks/vapi`) forwards function-call events to user's configured URL
- Backward compatible - existing agents continue working with default behavior

### Webhook URL mismatch (common production issue)

- **Problem**: Agents synced in development (with ngrok/localhost webhook URLs) won't receive webhooks in production
- **Diagnosis**: Use `GET /api/w/[slug]/agents/webhook-status` to check all agents' webhook URLs
- **Fix**: Use `POST /api/w/[slug]/agents/resync-webhooks` to force resync all agents with correct production URLs
- **Prevention**: Ensure `NEXT_PUBLIC_APP_URL` is set correctly in all environments

### Campaign queue table

- The scalable campaign processing uses a `campaign_queue` Supabase table (not a Prisma model)
- Table stores: campaign_id, workspace_id, status, progress counters, config, timestamps
- Processed by the `/api/cron/process-campaigns` endpoint

---

## Notes / Non-goals of This Document

- This file is intended to be **accurate to the repository**, not an aspirational roadmap.
- If you add/rename routes, please update the "Directory Structure (Actual)" and "API Routes Inventory" sections first—LLMs rely on that for navigation.

---

_Last comprehensive update: January 16, 2026_

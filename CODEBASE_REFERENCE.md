# Genius365 Codebase Reference (Single-file, LLM-friendly, developer-friendly)

> **Last Updated**: January 10, 2026  
> **Audience**: Developers + AI assistants (LLM-friendly)  
> **Scope**: Repo at `genius365/` (Next.js App Router + Supabase + Prisma + Stripe + VAPI/Retell + optional Algolia)

---

## Table of Contents

1. [What This Repo Is](#what-this-repo-is)
2. [Fast “Where Do I Look?” Map (LLM-Friendly)](#fast-where-do-i-look-map-llm-friendly)
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
15. [Calls: Storage, Search, Ingestion, Webhooks](#calls-storage-search-ingestion-webhooks)
16. [Agents: Creation, Sync, Test Calls, Tools](#agents-creation-sync-test-calls-tools)
17. [Campaigns Module](#campaigns-module)
18. [Knowledge Base Module](#knowledge-base-module)
19. [RBAC (Permissions)](#rbac-permissions)
20. [Observability (Sentry + Logging)](#observability-sentry--logging)
21. [Configuration & Environment Variables](#configuration--environment-variables)
22. [Docs & Guides in Repo](#docs--guides-in-repo)
23. [Common Dev Workflows](#common-dev-workflows)
24. [Gotchas / Non-obvious Details](#gotchas--non-obvious-details)

---

## What This Repo Is

**Genius365** is a multi-tenant, white-label **AI voice agent management platform**:

- **Tenant model**: Partner (agency/org) → Workspaces → Users/Memberships
- **Core product**: create/manage AI agents (VAPI + Retell), run/test calls, view call logs, manage campaigns, manage knowledge documents, manage billing/credits/subscriptions
- **Admin product**: super-admin dashboard for partner requests, partners, plan variants, billing overview

Tech stack (from `package.json`, `next.config.ts`, `prisma/schema.prisma`):

- **Next.js**: 16.0.8 (App Router)
- **React**: 19.2.1
- **TypeScript**: 5.x
- **DB/Auth**: Supabase Postgres + Supabase Auth
- **ORM**: Prisma (client generated into `lib/generated/prisma`), **optional at runtime** (see `lib/prisma/client.ts`)
- **Billing**: Stripe (platform) + Stripe Connect (partner accounts)
- **Search (optional)**: Algolia (call logs)
- **UI**: Tailwind CSS 4 + Radix UI (shadcn/ui)
- **Observability**: Sentry

---

## Fast “Where Do I Look?” Map (LLM-Friendly)

If you’re trying to answer a question quickly, start here:

- **Route protection / CSP / redirects / session refresh**: `proxy.ts` + `lib/supabase/middleware.ts`
- **Partner resolution (white-label hostnames)**: `lib/api/partner.ts`
- **Auth context** (partner + workspaces): `lib/api/auth.ts`
- **Workspace auth wrapper**: `lib/api/workspace-auth.ts`
- **Super admin auth**: `lib/api/super-admin-auth.ts`

- **Calls API** (list + search): `app/api/w/[workspaceSlug]/calls/route.ts`
- **Calls ingest** (poll provider → insert/update conversation): `app/api/w/[workspaceSlug]/calls/ingest/route.ts`
- **Calls stats**: `app/api/w/[workspaceSlug]/calls/stats/route.ts`
- **Algolia call log indexing/search**: `lib/algolia/call-logs.ts`, `lib/algolia/client.ts`

- **Agents API** (create/update/delete + sync trigger): `app/api/w/[workspaceSlug]/agents/route.ts`, `app/api/w/[workspaceSlug]/agents/[id]/route.ts`
- **Provider sync (VAPI)**: `lib/integrations/vapi/agent/sync.ts`
- **Provider sync (Retell)**: `lib/integrations/retell/agent/sync.ts`
- **Test call sessions**: `app/api/w/[workspaceSlug]/agents/[id]/test-call/route.ts`

- **Billing (partner platform subscription + credits)**: `app/api/partner/billing/*`, `app/api/webhooks/stripe/route.ts`, `lib/stripe/*`
- **Billing (workspace credits + subscriptions via Connect)**: `app/api/w/[workspaceSlug]/credits/*`, `app/api/w/[workspaceSlug]/subscription/*`, `app/api/webhooks/stripe-connect/route.ts`, `lib/stripe/workspace-credits.ts`
- **Paywall enforcement**: `lib/billing/workspace-paywall.ts` + `lib/api/workspace-auth.ts`

- **Campaigns**: `app/api/w/[workspaceSlug]/campaigns/*`, cron: `app/api/cron/master/route.ts`, `lib/campaigns/cleanup-expired.ts`
- **Knowledge base**: `app/api/w/[workspaceSlug]/knowledge-base/*`

- **Function tools system (VAPI/Retell mapping)**: `lib/integrations/function_tools/*`, editor UI: `components/workspace/agents/function-tool-editor.tsx`

---

## High-Level Architecture

### Request lifecycle (simplified)

1. **Incoming request** hits Next.js middleware entry `proxy.ts`
2. Middleware:
   - Refreshes Supabase session via `lib/supabase/middleware.ts`
   - Enforces public/protected path rules and workspace “last visited” UX
   - Applies **security headers + CSP** (voice SDKs + Stripe + Sentry)
   - Stores last workspace slug in cookie for smart redirect
3. Page/API route uses:
   - `getPartnerAuthContext()` or cached variant (server components)
   - `getWorkspaceContext(workspaceSlug)` (workspace-scoped)
4. Data access is via:
   - Supabase client (SSR/browser) for PostgREST queries
   - Prisma client for transactional/billing-heavy flows and a subset of server routes/webhooks

### Major subsystems

- **Multi-tenancy & white-label**: partner_domains hostname mapping → partner context
- **Agents**: internal agent config stored in DB → provider-specific mapper → sync to VAPI/Retell
- **Calls**: stored as `conversations` (not separate “calls” table) + optional Algolia index
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

---

## Directory Structure (Actual)

Top-level folders under `genius365/` (high-signal only):

```
genius365/
├── app/                         # Next.js App Router routes (pages + API)
│   ├── (auth)/                  # Login/signup/forgot/reset
│   ├── (marketing)/             # Pricing + request-partner
│   ├── org/                     # Partner/org dashboard (billing/plans/settings/invitations)
│   ├── super-admin/             # Super-admin login + dashboard
│   ├── w/[workspaceSlug]/       # Workspace pages (dashboard, agents, calls, campaigns, etc.)
│   └── api/                     # API route handlers
├── components/                  # UI components (shadcn + product components)
├── lib/                         # Core business logic, integrations, auth, billing, utils
├── prisma/schema.prisma         # Prisma schema (maps to Supabase public schema)
├── types/                       # Supabase types + API Zod schemas
├── docs/                        # Product/testing docs
├── proxy.ts                     # Next.js middleware entry (“proxy” function)
├── next.config.ts               # Next config + Sentry webpack integration
├── instrumentation*.ts          # Sentry instrumentation hooks
└── sentry.*.config.ts           # Sentry configs (edge/server)
```

### Components (`components/`)

- `components/ui/*`: shadcn/ui primitives (Radix + Tailwind)
- `components/workspace/*`: workspace shell + feature components
  - `workspace-dashboard-layout.tsx` (shell layout)
  - `workspace-sidebar.tsx` (nav + workspace switcher)
  - `workspace-header.tsx`
  - `paywall-banner.tsx`
  - `agents/*` (wizard + tool editor)
  - `campaigns/*` (wizard + steps + dialogs)
  - `conversations/*` (detail modal)
- `components/super-admin/*`: super admin shell + dialogs
- `components/org/*`: org-level components

### Core libraries (`lib/`)

- `lib/api/*`: auth contexts, helpers, caching, pagination, etag, error handler
- `lib/supabase/*`: SSR/browser/admin clients + session middleware
- `lib/prisma/*`: Prisma singleton wrapper + exports
- `lib/stripe/*`: Stripe platform + Connect logic (credits, subscriptions, invoices)
- `lib/billing/*`: usage + paywall checks
- `lib/integrations/*`: provider integrations (VAPI/Retell), function tools, retries
- `lib/hooks/*`: React Query hooks for workspace/partner/super-admin data
- `lib/rbac/*`: permission matrix + wrappers
- `lib/algolia/*`: optional call logs index/search

### Workspace pages (`app/w/[workspaceSlug]/...`)

Actual routes:

- `dashboard/`, `agents/`, `calls/`, `conversations/`, `campaigns/`, `knowledge-base/`, `integrations/`, `members/`, `analytics/`, `billing/`, `settings/`

> **Note**: Telephony management (SIP trunks, phone numbers) is handled at the organization level (`/org/telephony`), not at the workspace level.

### Workspace API (`app/api/w/[workspaceSlug]/...`)

Actual route groups:

- `agents/*` (includes nested test-call/outbound-call/etc.)
- `calls/*` (list + ingest + stats)
- `campaigns/*`
- `conversations/*`
- `credits/*` (credits + topup)
- `subscription/*` (plans + preview + subscription management)
- `integrations/*` (provider config + algolia config)
- `knowledge-base/*`
- `members/*`, `invitations/*`
- `analytics/*`, `settings/*`, `dashboard/stats/*`

> **Note**: Phone number and SIP trunk management APIs are at the partner/org level (`/api/partner/telephony/*`), not workspace level.

### Super admin pages (`app/super-admin/(dashboard)/...`)

Actual routes (verified from `app/super-admin/`):

- `/super-admin` (dashboard)
- `/super-admin/partner-requests` (+ detail)
- `/super-admin/partners` (+ detail)
- `/super-admin/variants`
- `/super-admin/billing`

---

## Frontend Architecture (Layouts + Navigation)

### Root layout

- `app/layout.tsx` wraps the entire app with:
  - `ThemeProvider` (`context/theme-context.tsx`)
  - `QueryProvider` (`lib/providers/query-provider.tsx`)
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
- Org pages currently implemented under `app/org/`:
  - `billing/`, `plans/`, `settings/`, `invitations/`, plus index page

---

## API Routes Inventory (Actual)

This section is intended as a **truthy map** of the API surface. Start here when adding endpoints.

### Health / utilities

- `GET /api/health` → `app/api/health/route.ts`
- `POST /api/cron/master` (+ `GET` for docs) → `app/api/cron/master/route.ts`
- `POST /api/cron/cleanup-expired-campaigns` (+ `GET` for docs) → `app/api/cron/cleanup-expired-campaigns/route.ts`
- Dev-only utility: `POST /api/dev/reset-password` → `app/api/dev/reset-password/route.ts`

### Auth

- `GET /api/auth/context` → `app/api/auth/context/route.ts`
- `POST /api/auth/signup` → `app/api/auth/signup/route.ts`
- `POST /api/auth/signout` → `app/api/auth/signout/route.ts`
- Invitation acceptance:
  - `app/api/partner-invitations/accept/route.ts`
  - `app/api/workspace-invitations/accept/route.ts`

### Partner onboarding (white-label requests)

- `POST /api/partner-requests` → `app/api/partner-requests/route.ts`
- `GET /api/partner-requests/[id]` → `app/api/partner-requests/[id]/route.ts`
- `POST /api/partner-requests/[id]/provision` → `app/api/partner-requests/[id]/provision/route.ts`
- `POST /api/partner-requests/check-subdomain` → `app/api/partner-requests/check-subdomain/route.ts`
- `POST /api/partner-requests/check-domain` → `app/api/partner-requests/check-domain/route.ts`

### Partner (org) APIs

All under `app/api/partner/*`:

- **Partner summary**
  - `GET /api/partner` → `app/api/partner/route.ts`
- **Dashboard**
  - `GET /api/partner/dashboard/stats` → `app/api/partner/dashboard/stats/route.ts`
- **Team + invitations**
  - `GET|POST /api/partner/team` → `app/api/partner/team/route.ts`
  - `PATCH|DELETE /api/partner/team/[memberId]` → `app/api/partner/team/[memberId]/route.ts`
  - `GET|POST /api/partner/invitations` → `app/api/partner/invitations/route.ts`
  - `DELETE /api/partner/invitations/[invitationId]` → `app/api/partner/invitations/[invitationId]/route.ts`
- **Workspaces (partner-level management)**
  - `GET|POST /api/partner/workspaces` → `app/api/partner/workspaces/route.ts`
  - `GET|PATCH /api/partner/workspaces/[id]/members` → `app/api/partner/workspaces/[id]/members/route.ts`
  - `GET /api/partner/workspaces/[id]/billing` → `app/api/partner/workspaces/[id]/billing/route.ts`
- **Billing (platform, partner subscription)**
  - `GET /api/partner/billing` → `app/api/partner/billing/route.ts`
  - `POST /api/partner/billing/checkout` → `app/api/partner/billing/checkout/route.ts`
  - `POST /api/partner/billing/change-plan` → `app/api/partner/billing/change-plan/route.ts`
  - `POST /api/partner/billing/portal` → `app/api/partner/billing/portal/route.ts`
- **Credits (partner-level)**
  - `GET /api/partner/credits` → `app/api/partner/credits/route.ts`
  - `POST /api/partner/credits/topup` → `app/api/partner/credits/topup/route.ts`
- **Stripe Connect (partner onboarding)**
  - `POST /api/partner/stripe/connect` → `app/api/partner/stripe/connect/route.ts`
- **Workspace subscription plans (partner-defined catalog)**
  - `GET|POST /api/partner/subscription-plans` → `app/api/partner/subscription-plans/route.ts`
  - `GET|PATCH|DELETE /api/partner/subscription-plans/[planId]` → `app/api/partner/subscription-plans/[planId]/route.ts`

### Workspace APIs

All under: `app/api/w/[workspaceSlug]/*`

**Workspace core**

- `GET /api/w/[workspaceSlug]/dashboard/stats` → `app/api/w/[workspaceSlug]/dashboard/stats/route.ts`
- `GET /api/w/[workspaceSlug]/settings` → `app/api/w/[workspaceSlug]/settings/route.ts`

**Agents**

- `GET|POST /api/w/[workspaceSlug]/agents` → `app/api/w/[workspaceSlug]/agents/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/agents/[id]` → `app/api/w/[workspaceSlug]/agents/[id]/route.ts`
- `POST /api/w/[workspaceSlug]/agents/[id]/test-call` → `app/api/w/[workspaceSlug]/agents/[id]/test-call/route.ts`
- `POST /api/w/[workspaceSlug]/agents/[id]/outbound-call` → `app/api/w/[workspaceSlug]/agents/[id]/outbound-call/route.ts`
- `GET /api/w/[workspaceSlug]/agents/[id]/phone-number` → `app/api/w/[workspaceSlug]/agents/[id]/phone-number/route.ts`
- `GET /api/w/[workspaceSlug]/agents/[id]/sip-info` → `app/api/w/[workspaceSlug]/agents/[id]/sip-info/route.ts`
- `POST /api/w/[workspaceSlug]/agents/[id]/assign-sip-number` → `app/api/w/[workspaceSlug]/agents/[id]/assign-sip-number/route.ts`
- `ANY /api/w/[workspaceSlug]/agents/[id]/[...path]` → `app/api/w/[workspaceSlug]/agents/[id]/[...path]/route.ts` (passthrough for provider-specific endpoints)

**Calls / conversations**

- `GET /api/w/[workspaceSlug]/calls` → `app/api/w/[workspaceSlug]/calls/route.ts`
- `POST /api/w/[workspaceSlug]/calls/ingest` → `app/api/w/[workspaceSlug]/calls/ingest/route.ts`
- `GET /api/w/[workspaceSlug]/calls/stats` → `app/api/w/[workspaceSlug]/calls/stats/route.ts`
- `GET /api/w/[workspaceSlug]/conversations` → `app/api/w/[workspaceSlug]/conversations/route.ts`

**Campaigns**

- `GET|POST /api/w/[workspaceSlug]/campaigns` → `app/api/w/[workspaceSlug]/campaigns/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/campaigns/[id]` → `app/api/w/[workspaceSlug]/campaigns/[id]/route.ts`
- `GET|POST|DELETE /api/w/[workspaceSlug]/campaigns/[id]/recipients` → `app/api/w/[workspaceSlug]/campaigns/[id]/recipients/route.ts`

**Knowledge base**

- `GET|POST /api/w/[workspaceSlug]/knowledge-base` → `app/api/w/[workspaceSlug]/knowledge-base/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/knowledge-base/[id]` → `app/api/w/[workspaceSlug]/knowledge-base/[id]/route.ts`

**Integrations**

- `GET|POST /api/w/[workspaceSlug]/integrations` → `app/api/w/[workspaceSlug]/integrations/route.ts`
- `GET|PATCH|DELETE /api/w/[workspaceSlug]/integrations/[provider]` → `app/api/w/[workspaceSlug]/integrations/[provider]/route.ts`
- `GET /api/w/[workspaceSlug]/integrations/algolia-search-config` → `app/api/w/[workspaceSlug]/integrations/algolia-search-config/route.ts`

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

- `POST /api/webhooks/vapi` → VAPI call events → billing
- `POST /api/webhooks/retell` → Retell call events → billing
- `POST /api/webhooks/stripe` → platform Stripe events (partner subscription + partner credits)
- `POST /api/webhooks/stripe-connect` → Connect events (workspace credits + workspace subscriptions)

### Super admin APIs

All under `app/api/super-admin/*`:

- **Partner requests**
  - `GET /api/super-admin/partner-requests` → `app/api/super-admin/partner-requests/route.ts`
  - `GET|PATCH /api/super-admin/partner-requests/[id]` → `app/api/super-admin/partner-requests/[id]/route.ts`
  - `POST /api/super-admin/partner-requests/[id]/provision` → `app/api/super-admin/partner-requests/[id]/provision/route.ts`
- **Partners**
  - `GET /api/super-admin/partners` → `app/api/super-admin/partners/route.ts`
  - `GET|PATCH /api/super-admin/partners/[id]` → `app/api/super-admin/partners/[id]/route.ts`
  - `GET|POST /api/super-admin/partners/[id]/domains` → `app/api/super-admin/partners/[id]/domains/route.ts`
  - `GET /api/super-admin/partners/[id]/workspaces` → `app/api/super-admin/partners/[id]/workspaces/route.ts`
- **White-label variants**
  - `GET|POST /api/super-admin/white-label-variants` → `app/api/super-admin/white-label-variants/route.ts`
  - `GET|PATCH|DELETE /api/super-admin/white-label-variants/[id]` → `app/api/super-admin/white-label-variants/[id]/route.ts`

---

## Runtime Entry Points

### Next.js middleware

- `proxy.ts` exports `proxy(request)` and a `config.matcher` to apply to all routes except static assets.
- Applies:
  - Auth redirects
  - CSP + security headers
  - “last workspace” cookie for UX

### Sentry instrumentation

- `instrumentation.ts`: runtime registration for server/edge
- `instrumentation-client.ts`: browser Sentry init (Replay enabled)
- `next.config.ts`: wraps config via `withSentryConfig`

---

## Auth + Route Protection

### Public vs protected routing

Defined in `proxy.ts`:

- **Public**: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/pricing`, `/request-partner`, invitation acceptance pages, `/api/health`
- **Protected**: `/select-workspace`, `/workspace-onboarding`, `/w/*`, `/org/*`
- **Super admin**: `/super-admin/*` (protected at the layout/API level via `getSuperAdminContext()`)

> Note: `proxy.ts` computes `isSuperAdminPath` but (as of this snapshot) does not use it to redirect; the super-admin area is protected by server-side checks inside layouts and APIs.

### Auth context primitives

- `lib/supabase/server.ts`: SSR Supabase client
- `lib/supabase/client.ts`: browser Supabase client
- `lib/supabase/admin.ts`: service-role client (bypasses RLS; used in API routes)

Primary context builder:

- `lib/api/auth.ts` → `getPartnerAuthContext()`
  - resolves user
  - resolves partner from host
  - loads partner membership + workspace memberships
  - for partner admins/owners: also adds “admin access” workspaces in that partner

Workspace context:

- `lib/api/workspace-auth.ts` → `getWorkspaceContext(workspaceSlug, requiredRoles?)`
- `withWorkspace(handler, options)` for API routes (auth + role check + paywall enforcement)

---

## Database: Prisma Schema & Key Models

Authoritative schema:

- `prisma/schema.prisma`
- Prisma client output: `lib/generated/prisma` (ignored by git; generated at install/build)

### Live Supabase schema (public) — introspected snapshot (2026-01-10)

This repo uses Supabase Postgres as the backing DB. The Prisma schema is intended to match it, but **the live DB can drift** if migrations/types are out of date.

**Public tables (live DB)** (alphabetical):

- `agent_knowledge_documents`
- `ai_agents`
- `audit_log`
- `billing_credits`
- `call_campaigns`
- `call_recipients`
- `conversations`
- `credit_transactions`
- `knowledge_documents`
- `partner_domains`
- `partner_invitations`
- `partner_members`
- `partner_requests`
- `partners`
- `super_admin`
- `usage_tracking`
- `users`
- `white_label_variants`
- `workspace_credit_transactions`
- `workspace_credits`
- `workspace_integrations`
- `workspace_invitations`
- `workspace_members`
- `workspace_subscription_plans`
- `workspace_subscriptions`
- `workspaces`

**Key foreign keys (live DB)**:

- `partners` → `partner_requests` (`partners.request_id`)
- `partners` → `white_label_variants` (`partners.white_label_variant_id`)
- `partner_domains` → `partners`
- `partner_members` → `partners`, `users`
- `partner_invitations` → `partners`, `users`
- `workspaces` → `partners`, `workspace_subscriptions` (`workspaces.current_subscription_id`)
- `workspace_members` → `workspaces`
- `workspace_invitations` → `workspaces`
- `workspace_integrations` → `workspaces`
- `ai_agents` → `workspaces`, `users` (`created_by`)
- `conversations` → `workspaces`, `ai_agents`, `users` (`followed_up_by`)
- `knowledge_documents` → `workspaces`, `users` (`created_by`, `updated_by`)
- `agent_knowledge_documents` → `ai_agents`, `knowledge_documents`
- `call_campaigns` → `workspaces`, `ai_agents`, `users` (`created_by`)
- `call_recipients` → `workspaces`, `call_campaigns`, `conversations`
- `usage_tracking` → `workspaces`, `conversations`
- Partner credits: `billing_credits` → `partners`; `credit_transactions` → `billing_credits`
- Workspace credits: `workspace_credits` → `workspaces`; `workspace_credit_transactions` → `workspace_credits`
- Workspace subscriptions: `workspace_subscriptions` → `workspaces`, `workspace_subscription_plans`
- Workspace plans: `workspace_subscription_plans` → `partners`

**Enums (live DB)**:

- Agent: `agent_provider` (`vapi`, `retell`, `synthflow`), `voice_provider`, `model_provider`, `transcriber_provider`
- Calls: `call_direction`, `call_status`
- Billing: `credit_transaction_type`, `billing_type`, `workspace_subscription_status`, plus `partner_tier`, `plan_tier`, `subscription_status`
- Users: `user_role`, `user_status`
- Knowledge base: `knowledge_document_type`, `knowledge_document_status`
- Usage: `resource_type`

**RLS & security posture (live DB)**:

- Most product tables have **RLS enabled** (`users`, `partners`, `workspaces`, `ai_agents`, `conversations`, `knowledge_documents`, campaigns, etc.).
- Credits/transactions tables are **RLS disabled** (server/service-role only):
  - `billing_credits`, `credit_transactions`, `workspace_credits`, `workspace_credit_transactions`
- Important policy highlight: `partner_requests` allows **INSERT** from both `anon` and `authenticated` (used by the marketing “request partner” flow).

**DB functions present (live DB)**:

- Billing/postpaid helpers: `can_make_postpaid_call`, `record_postpaid_usage`, `reset_postpaid_period`
- Campaign cleanup: `cancel_expired_campaigns`
- Utility: `generate_slug`

**Drift note (important)**:

- The repo’s `types/database.types.ts` currently contains types for a `leads` table and lead enums, but the live DB `public` schema snapshot above **does not include a `leads` table**. Treat “Lead” as legacy/unfinished unless you confirm migrations.

### Key enums (high level)

- `AgentProvider`: `vapi` | `retell` | `synthflow` *(note: synthflow is present in schema, but provider integration folder is not currently in `lib/integrations/`)*
- `CallDirection`: `inbound` | `outbound`
- `CallStatus`: `initiated` | `ringing` | `in_progress` | `completed` | `failed` | `no_answer` | `busy` | `canceled`
- Billing-related: workspace subscription status + billing type, credit transaction types

### Key models (high signal)

#### White-label plans (super-admin managed)

- `WhiteLabelVariant`: plan variants with Stripe price ID, limits, isActive/sortOrder

#### Tenancy

- `Partner`: slug, branding/settings JSON, Stripe customer/subscription IDs, `isBillingExempt`, `whiteLabelVariantId`
- `PartnerDomain`: hostname mapping, primary/verified
- `PartnerMember` / `PartnerInvitation`
- `PartnerRequest`: onboarding/provisioning pipeline

#### Workspaces

- `Workspace`: `resourceLimits`, monthly usage (`currentMonthMinutes`, `currentMonthCost`), billing flags (`isBillingExempt`, `perMinuteRateCents`)
- `WorkspaceMember` / `WorkspaceInvitation`
- `WorkspaceIntegration`: provider API keys JSON (VAPI/Retell etc.)

#### Agents & Calls

- `AiAgent`: provider, external IDs, config JSON (tools, prompts, api key config), sync fields (`syncStatus`, `needsResync`, `lastSyncError`)
- `Conversation`: canonical “call log” record (`externalId`, `direction`, `status`, `durationSeconds`, `recordingUrl`, `transcript`, `summary`, `sentiment`, `totalCost`, `metadata`)
- `UsageTracking`: normalized usage rows (minutes/cost/etc.)

#### Billing & Subscriptions

- `BillingCredits` + `CreditTransaction`: partner-level credits (platform)
- `WorkspaceCredits` + `WorkspaceCreditTransaction`: workspace-level credits (via Connect)
- `WorkspaceSubscriptionPlan`: partner-defined plans for workspaces (prepaid/postpaid)
- `WorkspaceSubscription`: subscription state for workspace (Stripe IDs + usage counters)

#### Product modules

- `KnowledgeDocument` + `AgentKnowledgeDocument` (link docs to agents)
- `Lead` *(present in some repo types, but **not present in the live Supabase public schema snapshot** — verify migrations before building on it)*
- `AuditLog`
- Campaign models exist in DB and are used via Supabase routes:
  - `call_campaigns`, `call_recipients` (seen in API routes)

---

## API Layer Patterns

### General conventions

- Workspace-scoped API routes live under: `app/api/w/[workspaceSlug]/...`
- Most routes fetch context using:
  - `getWorkspaceContext(workspaceSlug, requiredRoles?)`
  - or `withWorkspace(handler, options)` (recommended for consistency)
- Responses use helpers: `lib/api/helpers.ts` (`apiResponse`, `apiError`, `unauthorized`, `forbidden`, `serverError`, etc.)

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

- Buy workspace credits via the partner’s Connect account:
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
  - browser web call session: `lib/integrations/vapi/web-call.ts`
- `retell/*`
  - agent mapping/sync (LLM first): `lib/integrations/retell/agent/*`
  - call retrieval/polling: `lib/integrations/retell/calls.ts`
  - browser web call session: `lib/integrations/retell/web-call.ts`
- `sentiment/*`
  - provider-specific sentiment extraction used during ingest

### Important Retell constraint: tools at LLM level

Retell requires **LLM creation before agent creation** and uses LLM `general_tools`.

- Sync orchestration: `lib/integrations/retell/agent/sync.ts`
- Tool mapping for Retell LLM: `lib/integrations/function_tools/retell/mapper.ts`

**Current behavior in this repo**:

- The Retell mapper only emits **Retell-native** tools into `general_tools` (no custom webhook tools are mapped here).
- Supported Retell-native tool types (as mapped): `end_call`, `transfer_call`, `press_digit`, `check_availability_cal`, `book_appointment_cal`, `send_sms`.
- Although `/api/webhooks/retell` contains a handler for function-call payloads, it currently returns a **mock response** and is not wired to a full custom-tool execution system.

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
  - Includes rate-limited “warmup” indexing of recent calls when Algolia returns 0 hits

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

### Provider webhooks (billing + transcript updates)

- VAPI webhook: `app/api/webhooks/vapi/route.ts`
- Retell webhook: `app/api/webhooks/retell/route.ts`

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

### Function tools system (provider-agnostic authoring)

UI editor:

- `components/workspace/agents/function-tool-editor.tsx`

Provider mapping:

- VAPI tool mapping: `lib/integrations/function_tools/vapi/*`
  - Supports native call control + custom functions + integrations + code tools
  - Has a “tool sync” flow that creates VAPI tools via `/tool` API and persists `external_tool_id`
    - See `lib/integrations/function_tools/vapi/api/sync.ts` and `lib/integrations/vapi/agent/sync.ts`
- Retell tool mapping: `lib/integrations/function_tools/retell/*`
  - Only maps native Retell tools currently (see Retell limitation above)

---

## Campaigns Module

Storage:

- Uses Supabase tables:
  - `call_campaigns`
  - `call_recipients`

API:

- `app/api/w/[workspaceSlug]/campaigns/route.ts`
  - list campaigns + create campaign
  - supports “wizard flow” creation (recipients + variable mappings + overrides)
- `app/api/w/[workspaceSlug]/campaigns/[id]/route.ts`
  - get/update/delete (delete is blocked for active campaigns)

Cron:

- `app/api/cron/master/route.ts` runs `cleanupExpiredCampaigns()`
  - **Vercel schedule**: `vercel.json` currently schedules `/api/cron/master` daily at `0 0 * * *`
  - **Endpoint self-doc**: `/api/cron/master` describes a 12-hour schedule (`0 0,12 * * *`) — this is a doc/comment mismatch to be aware of
- `lib/campaigns/cleanup-expired.ts`

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
- `sentry.server.config.ts`, `sentry.edge.config.ts`

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

---

## Docs & Guides in Repo

Living docs under `docs/` (useful for onboarding/testing):

- `docs/LOCAL_SUBDOMAIN_TESTING.md`
- `docs/RBAC_TESTING_GUIDE.md`
- `docs/STRIPE_BILLING_GUIDE.md`
- `docs/CAMPAIGNS_TESTING_GUIDE.md`
- `docs/CAMPAIGN_WIZARD_TESTING_PLAN.md`
- `docs/WHITE_LABEL_REQUEST_FLOW_IMPROVEMENT.md`

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
```

### Core debugging entrypoints

- “Why am I being redirected?” → `proxy.ts`
- “Why is this workspace read-only?” → `lib/billing/workspace-paywall.ts` + `lib/api/workspace-auth.ts`
- “Why isn’t my agent syncing?” → `lib/integrations/{vapi|retell}/agent/sync.ts` + agent `sync_status` / `last_sync_error`
- “Why isn’t call search working?” → `app/api/w/[workspaceSlug]/calls/route.ts` + `lib/algolia/*`

---

## Gotchas / Non-obvious Details

### Prisma is optional… but key subsystems require it

- `lib/prisma/client.ts` intentionally returns `null` if `DATABASE_URL` is not configured (to allow Supabase-only operation for basic CRUD).
- However, these subsystems **require Prisma** and will error/skip without it:
  - Paywall computation: `lib/billing/workspace-paywall.ts`
  - Provider webhooks billing + conversation updates: `app/api/webhooks/{vapi,retell}/route.ts`
  - Stripe webhooks: `app/api/webhooks/{stripe,stripe-connect}/route.ts`
  - Workspace subscription + plan flows: `app/api/w/[workspaceSlug]/subscription/*`

### Paywall enforcement is not a single centralized allowlist (yet)

- There is an `isPaywallExemptPath()` helper in `lib/billing/workspace-paywall.ts`.
- In practice, most workspace routes enforce paywall by directly calling `checkWorkspacePaywall()` (or by using `withWorkspace(..., { skipPaywallCheck: true })` in endpoints that must be reachable during billing recovery).

### Retell “tools” in this codebase are Retell-native only

- Retell tool mapping (`lib/integrations/function_tools/retell/mapper.ts`) filters to Retell-native tool types only.
- If you add “custom function tools” in the agent UI, they will sync to VAPI (via VAPI tool API) but are not mapped to Retell `general_tools` in this implementation.

### Algolia integration is workspace-scoped, REST-only

- Keys live in `workspace_integrations` row with `provider="algolia"` under the `config` JSON.
- The integration uses `fetch` (REST) and intentionally avoids the Algolia JS client (`lib/algolia/*`).

### Master cron schedule mismatch

- `vercel.json` schedules `/api/cron/master` daily (`0 0 * * *`).
- `app/api/cron/master/route.ts` documents an “every 12 hours” schedule (`0 0,12 * * *`).
- Treat `vercel.json` as the actual deployed schedule unless changed.

## Notes / Non-goals of This Document

- This file is intended to be **accurate to the repository**, not an aspirational roadmap.
- If you add/rename routes, please update the “Directory Structure (Actual)” section first—LLMs rely on that for navigation.



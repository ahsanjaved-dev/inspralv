# Genius365 Codebase Reference (Up-to-date)

> **Last Updated**: January 8, 2026  
> **Audience**: Developers + AI assistants (LLM-friendly)  
> **Scope**: Repo at `genius365/` (Next.js App Router + Supabase + Prisma + Stripe + VAPI/Retell)

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

---

## What This Repo Is

**Genius365** is a multi-tenant, white-label **AI voice agent management platform**:

- **Tenant model**: Partner (agency/org) → Workspaces → Users/Memberships
- **Core product**: create/manage AI agents (VAPI + Retell), run/test calls, view call logs, manage campaigns, manage knowledge documents, manage billing/credits/subscriptions
- **Admin product**: super-admin dashboard for partner requests, partners, plan variants, billing overview

Tech stack (from `package.json`):

- **Next.js**: 16.0.8 (App Router)
- **React**: 19.2.1
- **TypeScript**: 5.x
- **DB/Auth**: Supabase Postgres + Supabase Auth
- **ORM**: Prisma (client generated into `lib/generated/prisma`)
- **Billing**: Stripe (platform) + Stripe Connect (partner accounts)
- **Search (optional)**: Algolia (call logs)
- **UI**: Tailwind CSS 4 + Radix UI (shadcn/ui)
- **Observability**: Sentry

---

## Fast “Where Do I Look?” Map (LLM-Friendly)

If you’re trying to answer a question quickly, start here:

- **Route protection / CSP / redirects**: `proxy.ts`
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

- **Campaigns**: `app/api/w/[workspaceSlug]/campaigns/*`, UI in `components/workspace/campaigns/*`
- **Knowledge base**: `app/api/w/[workspaceSlug]/knowledge-base/*`, UI in `app/w/[workspaceSlug]/knowledge-base/page.tsx`

- **Function tools system (VAPI/Retell mapping)**: `lib/integrations/function_tools/*`, editor UI: `components/workspace/agents/function-tool-editor.tsx`

---

## High-Level Architecture

### Request lifecycle (simplified)

1. **Incoming request** hits Next.js middleware entry `proxy.ts`
2. Middleware:
   - Refreshes Supabase session via `lib/supabase/middleware.ts`
   - Enforces public/protected/super-admin path rules
   - Applies **security headers + CSP** (voice SDKs + Stripe + Sentry)
   - Stores last workspace slug in cookie for smart redirect
3. Page/API route uses:
   - `getPartnerAuthContext()` or cached variant (server components)
   - `getWorkspaceContext(workspaceSlug)` (workspace-scoped)
4. Data access is via:
   - Supabase client (SSR/browser) for PostgREST queries
   - Prisma client for transactional billing flows and complex joins

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

- `dashboard/`, `agents/`, `calls/`, `conversations/`, `campaigns/`, `knowledge-base/`, `integrations/`, `members/`, `analytics/`, `telephony/`, `billing/`, `settings/`

### Workspace API (`app/api/w/[workspaceSlug]/...`)

Actual route groups:

- `agents/*` (includes nested test-call/outbound-call/phone-number/etc.)
- `calls/*` (list + ingest + stats)
- `campaigns/*`
- `conversations/*`
- `credits/*` (credits + topup)
- `subscription/*` (plans + preview + subscription management)
- `integrations/*` (provider config + algolia config)
- `knowledge-base/*`
- `members/*`, `invitations/*`
- `analytics/*`, `settings/*`, `dashboard/stats/*`

### Super admin pages (`app/super-admin/(dashboard)/...`)

Actual routes:

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
- Dev-only utilities exist under `app/api/dev/*`

### Auth

- `app/api/auth/*` (context, signup, signout)
- Invitation acceptance:
  - `app/api/partner-invitations/accept/route.ts`
  - `app/api/workspace-invitations/accept/route.ts`

### Partner onboarding (white-label requests)

- `POST /api/partner-requests` → create request
- `GET /api/partner-requests/[id]` → request detail
- `POST /api/partner-requests/[id]/provision` → provision partner + domain + owner user
- `POST /api/partner-requests/check-domain` → subdomain/domain availability

### Partner (org) APIs

- `app/api/partner/*`:
  - dashboard stats
  - billing (checkout/change-plan/portal)
  - credits (topup + balance)
  - subscription plan listing
  - team + invitations
  - stripe connect onboarding

### Workspace APIs

All under: `app/api/w/[workspaceSlug]/*`

- **agents**: list/create, get/update/delete, test-call, phone-number, sip-info, outbound-call, assign-sip-number, and catch-all passthrough routes
- **calls**: list/search, ingest, stats
- **campaigns**: list/create, get/update/delete, recipients management
- **conversations**: list/detail APIs (used by calls UI)
- **integrations**: provider configs + Algolia config
- **knowledge-base**: docs CRUD
- **members** + **invitations**: membership management
- **subscription**: subscribe/change/cancel + plan listing/preview
- **credits**: workspace credits + topups
- **settings**, **analytics**, **dashboard stats**

### External webhooks

- `POST /api/webhooks/vapi` → VAPI call events → billing
- `POST /api/webhooks/retell` → Retell call events → billing
- `POST /api/webhooks/stripe` → platform Stripe events (partner subscription + partner credits)
- `POST /api/webhooks/stripe-connect` → Connect events (workspace credits + workspace subscriptions)

### Super admin APIs

- `app/api/super-admin/*`:
  - partner requests list/detail + approve/reject
  - partner CRUD + domain/workspace utilities
  - white-label plan variants CRUD/listing (`/super-admin/white-label-variants/*`)

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
- **Super admin**: `/super-admin/*`

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
- `Lead`
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

- `lib/api/workspace-auth.ts` blocks **mutation methods** (POST/PUT/PATCH/DELETE) unless:
  - path is allowlisted (credits/subscription recovery endpoints)
  - or the workspace is not paywalled

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

**Current limitation**:

- Retell’s API validation rejects `custom_function` inside `general_tools` for the endpoints this repo uses.
- Therefore, Retell mapping currently only supports native tools:
  - `end_call`, `transfer_call`, `book_appointment_cal`

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

- `app/api/cron/master/route.ts` runs `cleanupExpiredCampaigns()` (every 12h per `vercel.json`)
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

## Notes / Non-goals of This Document

- This file is intended to be **accurate to the repository**, not an aspirational roadmap.
- If you add/rename routes, please update the “Directory Structure (Actual)” section first—LLMs rely on that for navigation.



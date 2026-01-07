# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Genius365 is a multi-tenant, white-label AI voice agent management platform built with Next.js 16 (App Router), TypeScript, Supabase (Postgres + Auth), Prisma, Tailwind CSS 4, Radix/shadcn UI, React Query, and Zustand. Agencies (partners) manage voice agents across providers (VAPI, Retell, Synthflow) with strong isolation between partners and their workspaces.

For a deep, file-by-file walkthrough of the system, see `CODEBASE_REFERENCE.md` (source of truth for architecture, flows, and important files).

## Development Commands

Use `npm` or `pnpm` (both are supported; examples below use `npm`). All commands are defined in `package.json`.

### Core app lifecycle

- Start dev server (Next.js App Router):
  - `npm run dev`
- Build for production (runs `prisma generate` first):
  - `npm run build`
- Start production server (after `npm run build`):
  - `npm start`

### Linting, formatting, type checking

- Lint (Next + TypeScript rules):
  - `npm run lint`
- Format with Prettier (TS/TSX/MD):
  - `npm run format`
- Type-check TypeScript only (no emit):
  - `npm run type-check`

### Prisma / database workflow

These wrap Prisma CLI commands and assume `DATABASE_URL` / `DIRECT_URL` are configured as in `CODEBASE_REFERENCE.md` and `lib/env.ts`.

- Generate Prisma client after schema changes:
  - `npm run db:generate`
- Introspect the existing database into `prisma/schema.prisma`:
  - `npm run db:pull`
- Push local schema to the database (development only):
  - `npm run db:push`
- Create and apply a development migration:
  - `npm run db:migrate`
- Deploy migrations to production:
  - `npm run db:migrate:deploy`
- Open Prisma Studio (DB GUI):
  - `npm run db:studio`
- Reset database (DESTRUCTIVE; dev only):
  - `npm run db:reset`

### Tests

There is currently no test script or explicit test runner configured in `package.json`, and no `*.test.*` / `*.spec.*` files are present. If you introduce a test framework (Vitest/Jest/Playwright/etc.), also add appropriate `test` / `test:watch` scripts and update this section with commands (including how to run a single test file).

## High-Level Architecture

The system is organized around a three-level multi-tenancy model (Super Admin → Partner → Workspace) with host-based partner resolution, Supabase-authenticated users, and mixed Supabase/Prisma data access.

### Multi-tenancy & tenancy resolution

- **Tenancy hierarchy** (see `CODEBASE_REFERENCE.md` → Multi-Tenancy Model):
  - **Partner** (agency / white-label tenant): branding, domains, plan tier, resource limits.
  - **Workspace** (client project under a partner): agents, conversations, leads, members, integrations, usage tracking.
  - **User**: linked to partners/workspaces via membership tables (partner members, workspace members).
- **Host-based partner resolution**:
  - Implemented in `lib/api/partner.ts` (e.g., `getPartnerFromHost()`), driven by `partner_domains`.
  - Resolution order: exact hostname match in `partner_domains`, otherwise fall back to the platform partner (`is_platform_partner = true`).
- **Workspace selection**:
  - Users land on `/select-workspace` after authentication to choose a workspace within the resolved partner.

### Authentication, authorization, and middleware

Key pieces live under `lib/api/`, `lib/supabase/`, `lib/rbac/`, and the root `proxy.ts` file.

- **Supabase clients** (`lib/supabase/`):
  - `client.ts`: browser client for client components and hooks.
  - `server.ts`: server-side client for server components and API routes.
  - `admin.ts`: admin client that bypasses RLS; used carefully in privileged code paths.
- **Auth contexts** (`lib/api/`):
  - `auth.ts`: `getPartnerAuthContext()` builds the **partner-level** auth context (user, partner, partner role, accessible workspaces, Supabase clients).
  - `workspace-auth.ts`: `getWorkspaceContext()` extends the partner context with current workspace + workspace role, and is the primary entry point for workspace-scoped routes.
  - `get-auth-cached.ts` / `get-partner-server.ts`: helpers for reusing auth context in server components.
- **Middleware / proxy** (`proxy.ts`):
  - Acts as Next.js middleware responsible for:
    - Updating Supabase sessions.
    - Enforcing public vs protected vs super-admin routes.
    - Applying security headers (CSP, X-Frame-Options, HSTS, permissions policy, etc.).
  - Public paths include marketing/auth pages (`/`, `/login`, `/signup`, `/request-partner`, `/api/health`, etc.).
  - Protected paths include workspace and onboarding routes (`/select-workspace`, `/workspace-onboarding`, `/w/…`).
- **RBAC** (`lib/rbac/`):
  - `permissions.ts` defines partner/workspace permission matrices and helpers like `hasWorkspacePermission`, `hasPartnerPermission`, and role hierarchy checks.
  - `middleware.ts` exposes helpers (e.g. `withWorkspace`) that wrap API handlers with role checks.

### App Router & layout structure

Top-level routing is in `app/` using the App Router with several layout trees (see `CODEBASE_REFERENCE.md` → Frontend Architecture for the full diagram):

- **Root layout** (`app/layout.tsx`):
  - Sets up theme, React Query provider, and toasts; wraps all other segment layouts.
- **Auth segment** (`app/(auth)/`):
  - Auth pages (login, signup, password reset) and auth layout, using Branding and Supabase auth flows.
- **Marketing segment** (`app/(marketing)/`):
  - Public marketing pages (pricing, partner request) with their own layout.
- **Organization segment** (`app/org/`):
  - Partner-level management (settings, team, invitations) using `getPartnerAuthContext()`.
- **Workspace segment** (`app/w/[workspaceSlug]/`):
  - Workspace-scoped UI (dashboard, agents, leads, calls, conversations, analytics, members, settings, billing, integrations, knowledge base, telephony).
  - Layout composes `WorkspaceDashboardLayout`, `WorkspaceSidebar`, and `WorkspaceHeader` from `components/workspace/`.
- **Super admin segment** (`app/super-admin/`):
  - Super admin login and dashboard for managing partners, partner requests, and platform-level billing.

### API layer

Most server-side behavior is expressed as typed Next.js route handlers under `app/api/`, consistently layering auth, RBAC, and data access:

- **Workspace-scoped APIs** (`app/api/w/[workspaceSlug]/…`):
  - Use `getWorkspaceContext(workspaceSlug)` to resolve user + partner + workspace + role before performing operations on `ai_agents`, workspace members, invitations, conversations, analytics, settings, and integrations.
- **Partner-level APIs** (`app/api/partner/…`):
  - Use partner auth context for operations on partner dashboard stats, team, invitations, etc.
- **Super admin APIs** (`app/api/super-admin/…`):
  - For managing partners, partner domains, workspaces, and partner requests at the platform level.
- **Onboarding and invitations**:
  - `app/api/partner-requests/…`, `app/api/partner-invitations/accept/route.ts`, `app/api/workspace-invitations/accept/route.ts` implement partner/workspace onboarding and invitation acceptance flows.
- **Shared API helpers** (`lib/api/helpers.ts`, `lib/api/error-handler.ts`, `lib/api/etag.ts`, `lib/api/pagination.ts`, `lib/api/fetcher.ts`):
  - Centralize HTTP response shapes, error handling, caching/ETag headers, pagination, and fetch utilities.

### Data access: Supabase + Prisma

- **Supabase** is the system of record and handles authentication, RLS, and Postgres hosting.
- **Prisma** is used for type-safe, relational queries, transactions, and migrations against the same Postgres database.
- The authoritative schema is `prisma/schema.prisma`; generated Supabase types live in `types/database.types.ts`.
- `lib/prisma/` provides a singleton Prisma client (`client.ts`) and exports (`index.ts`); `lib/generated/prisma/` holds generated client code.
- `lib/audit.ts` implements an audit logging layer used by API routes and business logic to record actions across partners/workspaces.

### Voice agent integrations

Voice provider integrations are organized per provider under `lib/integrations/` with a shared pattern:

- **Per-provider modules** (e.g. `lib/integrations/vapi/agent/{config,mapper,sync,response}.ts`, similarly for Retell):
  - `config.ts`: low-level API calls.
  - `mapper.ts`: maps internal `ai_agents` records and config to provider-specific payloads.
  - `sync.ts`: orchestrates create/update/delete operations and coordinates with function tools where applicable.
  - `response.ts`: normalizes provider responses back into internal representations.
  - `web-call.ts`: browser-based calling helpers for test calls.
- **Custom function tools for Vapi**:
  - Stored on the `ai_agents.config.tools` field and synchronized via `lib/integrations/function_tools/vapi/api/sync.ts`.
  - Sync logic ensures Vapi tool IDs are persisted and attached to agents via `model.toolIds` when pushing agent payloads.
- **Resilience**:
  - `lib/integrations/circuit-breaker.ts` and `lib/integrations/retry.ts` implement circuit breaker and retry logic that integration clients can use around external API calls.

### State management & UI composition

- **React Query** is the primary server-state layer, with hooks under `lib/hooks/` (e.g. `use-workspace-agents`, `use-workspace-members`, `use-workspace-conversations`, `use-partner-*`, `use-super-admin-partners`).
- **Zustand** is available for local client state where necessary; check `lib/hooks` and context files for actual usages.
- **Contexts** under `context/` (e.g. branding and theme) provide cross-cutting concerns to both pages and components.
- **UI primitives** live in `components/ui/` (shadcn/Radix + Tailwind), while higher-level domain components are grouped by area:
  - `components/workspace/` for workspace dashboards and flows.
  - `components/agents/` for agent cards, dialogs, and test-call UI.
  - `components/super-admin/` for the super admin console.
  - `components/marketing/` and `components/shared/` for marketing and shared utilities.

### Caching and performance

- `lib/cache/index.ts` provides an in-memory cache (per Node.js process) used with a cache-aside pattern and TTL-based invalidation.
- Cache key and TTL helpers support partner, branding, auth context, workspace, and agent-level caching; invalidation helpers clear relevant keys on writes.
- `next.config.ts` configures security headers and disables caching for `/api/*` responses at the edge, while `proxy.ts` adds per-request headers and CSP.

## Where to Look First for New Work

When implementing new functionality, these are the main entry points to inspect before editing or adding files:

- **High-level reference:** `CODEBASE_REFERENCE.md` (authoritative for architecture, DB schema, and common patterns).
- **Routing & layouts:** `app/` (choose the correct segment: auth, marketing, org, workspace, super admin).
- **Auth & tenancy:** `proxy.ts`, `lib/api/{auth,workspace-auth,partner,super-admin-auth}.ts`, `lib/rbac/`.
- **Data access:** `prisma/schema.prisma`, `lib/prisma/`, `types/database.types.ts`.
- **Integrations:** `lib/integrations/` (per-provider agent sync and web-call behavior).
- **State & UI:** `lib/hooks/`, `context/`, `components/` grouped by domain.

For more detailed, task-specific patterns (adding workspace pages, new providers, onboarding flows, etc.), refer to the "Quick Reference: Common Tasks" and "Conventions" sections at the end of `CODEBASE_REFERENCE.md`.
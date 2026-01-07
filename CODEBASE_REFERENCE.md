# Genius365 Codebase Reference

> **Last Updated**: January 7, 2026  
> **Purpose**: Complete codebase analysis for AI assistants and developers

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [High-Level Architecture](#high-level-architecture)
3. [Multi-Tenancy Model](#multi-tenancy-model)
4. [Directory Structure](#directory-structure)
5. [Database Schema](#database-schema)
6. [Authentication System](#authentication-system)
7. [API Layer](#api-layer)
8. [Frontend Architecture](#frontend-architecture)
9. [Voice Agent Integrations](#voice-agent-integrations)
10. [Key Features & Modules](#key-features--modules)
11. [Key Files Reference](#key-files-reference)
12. [Development Patterns](#development-patterns)
13. [State Management](#state-management)
14. [Security Architecture](#security-architecture)
15. [Email System](#email-system)
16. [Caching Strategy](#caching-strategy)
17. [Prisma ORM](#prisma-orm)
18. [Environment Configuration](#environment-configuration)

---

## Executive Summary

**Genius365** is a Next.js 16 white-label AI Voice Agent Management Platform. It enables agencies (Partners) to manage AI voice agents across multiple providers (VAPI, Retell, Synthflow) with full multi-tenancy support, white-labeling, workspace isolation, and subscription billing.

### Core Technologies

| Category            | Technology                                  | Version                                                    |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| **Framework**       | Next.js (App Router)                        | 16.0.8                                                     |
| **Language**        | TypeScript                                  | 5.x                                                        |
| **UI**              | React, Tailwind CSS 4, Radix UI (shadcn/ui) | React 19.2.1, Tailwind 4                                   |
| **Database/Auth**   | Supabase (PostgreSQL + Auth + Storage)      | SSR 0.8.0                                                  |
| **ORM**             | Prisma                                      | 6.19.1                                                     |
| **State**           | React Query (TanStack Query 5), Zustand     | Query 5.90.12, Zustand 5.0.9                               |
| **Payments**        | Stripe                                      | 20.0.0                                                     |
| **Email**           | Resend                                      | 6.6.0                                                      |
| **Voice Providers** | VAPI, Retell AI, Synthflow                  | VAPI Web 2.5.2, Retell SDK 4.66.0, Retell Client SDK 2.0.7 |
| **Search**          | Algolia                                     | (optional, per-workspace)                                  |
| **Validation**      | Zod                                         | 4.2.1                                                      |
| **Forms**           | React Hook Form                             | 7.68.0                                                     |
| **Charts**          | Recharts                                    | 3.5.1                                                      |
| **Date Utils**      | date-fns                                    | 4.1.0                                                      |
| **CSV Parsing**     | PapaParse                                   | 5.5.3                                                      |
| **Notifications**   | Sonner                                      | 2.0.7                                                      |

### Key Capabilities

- **White-Label Platform**: Partners get custom branding, domains, and isolated workspaces
- **Multi-Tenant Architecture**: Partner → Workspace → User hierarchy
- **AI Voice Agent Management**: Create, sync, and manage agents across VAPI, Retell, Synthflow
- **Role-Based Access Control**: Comprehensive RBAC for partners and workspaces
- **Super Admin Console**: Platform-wide management for partner requests, partner CRUD, and billing overview
- **Organization Management**: Partner-level team and settings management
- **Subscription Billing**: Stripe integration for plan management and usage-based billing
- **Campaign Management**: Multi-step campaign wizard for managing outbound call campaigns
- **Call Tracking**: Ingestion of call logs from VAPI and Retell providers
- **Knowledge Base**: Document management for agent context
- **Algolia Search**: Full-text search for calls and agents (optional per-workspace)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SUPER ADMIN                               │
│     Platform administrators managing all partners & billing         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PARTNER (Agency Layer)                        │
│  - White-label branding        - Custom domains                     │
│  - Subscription management     - Partner members                    │
│  - Resource limits             - Plan tier                          │
│  - Organization settings       - Team invitations                   │
│  - Stripe billing             - Subscription plans                  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│     WORKSPACE 1     │ │     WORKSPACE 2     │ │     WORKSPACE 3     │
│   (Client Project)  │ │   (Client Project)  │ │   (Client Project)  │
├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤
│ • AI Agents         │ │ • AI Agents         │ │ • AI Agents         │
│ • Calls/Analytics   │ │ • Calls/Analytics   │ │ • Calls/Analytics   │
│ • Campaigns         │ │ • Campaigns         │ │ • Campaigns         │
│ • Leads             │ │ • Leads             │ │ • Leads             │
│ • Members           │ │ • Members           │ │ • Members           │
│ • Integrations      │ │ • Integrations      │ │ • Integrations      │
│ • Knowledge Base    │ │ • Knowledge Base    │ │ • Knowledge Base    │
│ • Credits/Billing   │ │ • Credits/Billing   │ │ • Credits/Billing   │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

### Request Flow

```
Client Request → Middleware (proxy.ts)
                      │
                      ├─► Hostname Resolution → Partner Context
                      │
                      ├─► Session Validation (Supabase)
                      │
                      └─► Route Handler
                              │
                              ├─► API Route: getWorkspaceContext() or getPartnerAuthContext()
                              │
                              └─► Page: getPartnerAuthCached() for server components
```

---

## Multi-Tenancy Model

### Three-Tier Hierarchy

```typescript
// 1. PARTNER (Top Level - Agency/Organization)
interface Partner {
  id: string
  name: string
  slug: string // e.g., "acme-agency"
  branding: PartnerBranding // Logo, colors, company name
  plan_tier: string // "free" | "starter" | "professional" | "enterprise"
  features: PartnerFeatures // Feature flags
  resource_limits: ResourceLimits // Max workspaces, users, agents
  is_platform_partner: boolean // True for the main platform
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string // "active" | "canceled" | etc.
}

// 2. WORKSPACE (Middle Level - Client Project)
interface Workspace {
  id: string
  partner_id: string // Belongs to a partner
  name: string
  slug: string // e.g., "client-alpha"
  resource_limits: ResourceLimits // Inherited/overridden from partner
  current_month_minutes: number // Usage tracking
  current_month_cost: number // Cost tracking
  per_minute_rate_cents: number // Billing rate
  is_billing_exempt: boolean
  status: string
}

// 3. USER (Bottom Level - Individual Access)
interface User {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  // Access via memberships:
  // - PartnerMember (role in partner)
  // - WorkspaceMember (role in workspace)
}
```

### Role Hierarchy

**Partner Roles** (organization-level):
| Role | Description |
|------|-------------|
| `owner` | Full partner control, billing, delete |
| `admin` | Manage workspaces, members, settings |
| `member` | View access, limited management |

**Workspace Roles** (project-level):
| Role | Description |
|------|-------------|
| `owner` | Full workspace control |
| `admin` | Manage agents, members, settings |
| `member` | Create/edit agents, leads |
| `viewer` | Read-only access |

### Partner Resolution (White-Label)

```typescript
// lib/api/partner.ts - getPartnerFromHost()

// Resolution order:
// 1. Exact hostname match in partner_domains table
// 2. Fallback to platform partner (is_platform_partner = true)

// Examples:
// app.acme.com → ACME Agency partner
// localhost:3000 → Platform partner (fallback)
// app.clientxyz.com → ClientXYZ partner
```

---

## Directory Structure

```
Genius365/
├── prisma/                       # Prisma ORM
│   └── schema.prisma             # Database schema definition
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth pages (login, signup, etc.)
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── layout.tsx
│   ├── (marketing)/              # Public pages
│   │   ├── layout.tsx
│   │   ├── pricing/page.tsx
│   │   └── request-partner/page.tsx
│   ├── org/                      # Organization/Partner management
│   │   ├── layout.tsx
│   │   ├── settings/page.tsx     # Partner settings
│   │   ├── team/page.tsx         # Partner team management
│   │   ├── invitations/page.tsx  # Partner invitations
│   │   ├── billing/page.tsx      # Partner billing & subscription
│   │   ├── plans/page.tsx        # Subscription plans
│   │   └── credits/page.tsx      # Credits management (future)
│   ├── w/[workspaceSlug]/        # Workspace-scoped pages
│   │   ├── layout.tsx            # Workspace layout with auth
│   │   ├── dashboard/page.tsx
│   │   ├── agents/
│   │   │   ├── page.tsx          # Agent list
│   │   │   ├── new/page.tsx      # Create agent (wizard)
│   │   │   └── [id]/page.tsx     # Agent detail
│   │   ├── campaigns/
│   │   │   ├── page.tsx          # Campaign list
│   │   │   ├── new/page.tsx      # Create campaign (wizard)
│   │   │   └── [id]/page.tsx     # Campaign detail
│   │   ├── calls/page.tsx        # Call logs with search
│   │   ├── conversations/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── members/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── billing/page.tsx      # Workspace billing
│   │   ├── integrations/page.tsx
│   │   ├── knowledge-base/page.tsx
│   │   ├── telephony/page.tsx
│   │   ├── subscription/page.tsx # Workspace subscription
│   │   └── credits/page.tsx      # Credit management
│   ├── super-admin/              # Platform admin console
│   │   ├── login/page.tsx
│   │   └── (dashboard)/
│   │       ├── layout.tsx
│   │       ├── page.tsx          # Dashboard
│   │       ├── partners/
│   │       │   ├── page.tsx      # Partner list
│   │       │   └── [id]/page.tsx # Partner detail
│   │       ├── partner-requests/
│   │       │   ├── page.tsx      # Request list
│   │       │   └── [id]/page.tsx # Request detail
│   │       └── billing/page.tsx  # Super admin billing (Total Orgs + table)
│   ├── api/                      # API routes (see API Layer section)
│   ├── accept-workspace-invitation/page.tsx
│   ├── accept-partner-invitation/page.tsx
│   ├── select-workspace/page.tsx
│   ├── setup-profile/page.tsx
│   ├── workspace-onboarding/page.tsx
│   ├── page.tsx                  # Landing page
│   ├── error.tsx                 # Error boundary
│   ├── global-error.tsx          # Global error handler
│   ├── layout.tsx                # Root layout
│   └── globals.css
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives
│   ├── workspace/                # Workspace components
│   │   ├── workspace-dashboard-layout.tsx
│   │   ├── workspace-sidebar.tsx
│   │   ├── workspace-header.tsx
│   │   ├── workspace-selector.tsx
│   │   ├── create-workspace-form.tsx
│   │   ├── integrations/
│   │   │   ├── connect-integartion-dialog.tsx
│   │   │   └── connect-algolia-dialog.tsx
│   │   ├── agents/
│   │   │   ├── workspace-agent-card.tsx
│   │   │   ├── workspace-agent-form.tsx
│   │   │   ├── agent-wizard.tsx
│   │   │   ├── agent-wizard-dynamic.tsx
│   │   │   └── function-tool-editor.tsx
│   │   ├── campaigns/
│   │   │   ├── campaign-wizard.tsx
│   │   │   ├── campaign-wizard-dynamic.tsx
│   │   │   ├── campaign-card.tsx
│   │   │   ├── campaign-status-badge.tsx
│   │   │   ├── import-recipients-dialog.tsx
│   │   │   ├── add-recipient-dialog.tsx
│   │   │   └── steps/
│   │   │       ├── step-details.tsx
│   │   │       ├── step-import.tsx
│   │   │       ├── step-variables.tsx
│   │   │       ├── step-schedule.tsx
│   │   │       └── step-review.tsx
│   │   ├── conversations/
│   │   │   ├── conversation-detail-modal.tsx
│   │   │   └── conversation-detail-dynamic.tsx
│   │   ├── members/
│   │   │   └── invite-member-dialog.tsx
│   │   └── billing/
│   │       └── workspace-credits-card.tsx
│   ├── agents/
│   │   ├── agent-card.tsx
│   │   ├── delete-agent-dialog.tsx
│   │   ├── test-call-button.tsx
│   │   └── test-call-modal.tsx
│   ├── billing/
│   │   ├── change-plan-dialog.tsx
│   │   └── credits-card.tsx
│   ├── org/
│   │   └── org-dashboard-layout.tsx
│   ├── super-admin/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── super-admin-header.tsx
│   │   ├── super-admin-layout-client.tsx
│   │   ├── partner-card.tsx
│   │   ├── approve-partner-dialog.tsx
│   │   ├── reject-partner-dialog.tsx
│   │   ├── create-partner-dialog.tsx
│   │   ├── edit-partner-request-dialog.tsx
│   │   └── delete-partner-request-dialog.tsx
│   ├── auth/
│   ├── marketing/
│   └── shared/
├── lib/                          # Core libraries
│   ├── api/                      # API utilities
│   │   ├── auth.ts               # getPartnerAuthContext()
│   │   ├── workspace-auth.ts     # getWorkspaceContext()
│   │   ├── partner.ts            # getPartnerFromHost()
│   │   ├── super-admin-auth.ts   # getSuperAdminContext()
│   │   ├── helpers.ts            # apiResponse(), unauthorized(), etc.
│   │   ├── get-auth-cached.ts    # Cached auth context for server components
│   │   ├── get-partner-server.ts # Server-side partner context
│   │   ├── error-handler.ts      # Error handling utilities
│   │   ├── fetcher.ts            # Fetch utilities
│   │   ├── etag.ts               # ETag/caching headers
│   │   └── pagination.ts         # Pagination helpers
│   ├── auth/
│   │   ├── index.ts              # Auth exports
│   │   └── password.ts           # Password utilities
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   ├── admin.ts              # Admin client (bypasses RLS)
│   │   └── middleware.ts         # Session middleware
│   ├── prisma/                   # Prisma ORM client
│   │   ├── client.ts             # Prisma singleton with connection pooling
│   │   └── index.ts              # Prisma exports
│   ├── generated/                # Auto-generated code
│   │   └── prisma/               # Generated Prisma client
│   ├── integrations/             # Voice provider integrations
│   │   ├── index.ts              # Integration exports
│   │   ├── vapi/
│   │   │   ├── agent/
│   │   │   │   ├── config.ts     # VAPI API calls
│   │   │   │   ├── mapper.ts     # Data mapping
│   │   │   │   ├── sync.ts       # Sync orchestration
│   │   │   │   └── response.ts   # Response processing
│   │   │   ├── web-call.ts       # Browser calling
│   │   │   ├── calls.ts          # Call retrieval
│   │   │   └── phone-numbers.ts  # Phone number management
│   │   ├── retell/
│   │   │   ├── agent/
│   │   │   │   ├── config.ts
│   │   │   │   ├── mapper.ts
│   │   │   │   ├── sync.ts
│   │   │   │   └── response.ts
│   │   │   ├── web-call.ts
│   │   │   └── calls.ts
│   │   ├── function_tools/       # Custom function tools
│   │   │   ├── vapi/
│   │   │   │   ├── api/sync.ts
│   │   │   │   ├── mapper.ts
│   │   │   │   ├── registry.ts
│   │   │   │   └── tools/        # Tool definitions
│   │   │   └── retell/
│   │   ├── circuit-breaker.ts    # Circuit breaker pattern
│   │   ├── retry.ts              # Retry logic
│   │   └── webhook.ts            # Webhook handling
│   ├── hooks/                    # React Query hooks (25+ files)
│   │   ├── use-workspace-agents.ts
│   │   ├── use-workspace-members.ts
│   │   ├── use-workspace-conversations.ts
│   │   ├── use-workspace-calls.ts
│   │   ├── use-workspace-settings.ts
│   │   ├── use-workspace-stats.ts
│   │   ├── use-workspace-subscription.ts
│   │   ├── use-workspace-credits.ts
│   │   ├── use-workspace-knowledge-base.ts
│   │   ├── use-campaigns.ts
│   │   ├── use-billing.ts
│   │   ├── use-subscription-plans.ts
│   │   ├── use-auth.ts
│   │   ├── use-partner.ts
│   │   ├── use-partner-auth.ts
│   │   ├── use-partner-team.ts
│   │   ├── use-partner-dashboard-stats.ts
│   │   ├── use-partner-requests.ts
│   │   ├── use-super-admin-partners.ts
│   │   ├── use-branding.ts
│   │   ├── use-optimistic.ts
│   │   ├── use-prefetch.ts
│   │   ├── use-toast.ts
│   │   ├── use-keyboard-shortcuts.ts
│   │   ├── use-algolia-search.ts
│   │   └── more...
│   ├── rbac/                     # Role-Based Access Control
│   │   ├── index.ts              # RBAC exports
│   │   ├── permissions.ts        # Permission matrix
│   │   └── middleware.ts         # RBAC middleware
│   ├── cache/                    # Caching layer
│   │   └── index.ts
│   ├── email/                    # Email service
│   │   ├── client.ts             # Email client config
│   │   ├── send.ts               # Send functions
│   │   └── templates/
│   │       ├── workspace-invitation.tsx
│   │       ├── partner-request-notification.tsx
│   │       ├── partner-request-approved.tsx
│   │       └── partner-request-rejected.tsx
│   ├── stripe/                   # Stripe integration
│   │   ├── client.ts
│   │   ├── webhooks.ts
│   │   ├── checkout.ts
│   │   └── connect.ts
│   ├── billing/                  # Billing utilities
│   │   └── usage.ts              # Usage tracking
│   ├── algolia/                  # Algolia search
│   │   ├── client.ts
│   │   └── call-logs.ts
│   ├── campaigns/                # Campaign utilities
│   │   └── cleanup-expired.ts
│   ├── errors/
│   │   └── index.ts
│   ├── providers/
│   │   └── query-provider.tsx    # React Query provider
│   ├── utils/
│   │   └── format.ts             # Formatting utilities
│   ├── audit.ts                  # Audit logging
│   ├── constrants.ts             # App constants
│   ├── env.ts                    # Environment validation
│   ├── logger.ts                 # Logging utilities
│   ├── metadata.ts               # Page metadata helpers
│   ├── rate-limit.ts             # Rate limiting
│   └── utils.ts                  # cn() utility
├── context/
│   ├── branding-context.tsx      # Partner branding
│   └── theme-context.tsx         # Dark/light theme
├── config/
│   ├── plans.ts                  # Plan tiers & features
│   └── site.ts                   # Site metadata
├── types/
│   ├── database.types.ts         # Supabase types + Zod schemas
│   ├── api.types.ts              # API-specific types
│   └── papaparse.d.ts            # CSV parsing types
├── scripts/
│   ├── sql/
│   │   └── (SQL migration files)
│   └── test-billing.ts
├── docs/
│   ├── CAMPAIGN_WIZARD_TESTING_PLAN.md
│   ├── CAMPAIGNS_TESTING_GUIDE.md
│   ├── STRIPE_BILLING_GUIDE.md
│   └── test-recipients.csv
├── proxy.ts                      # Next.js middleware
├── CODEBASE_REFERENCE.md         # This file
├── OPTIMIZATION_PLAN.md
├── README.md
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── components.json
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## Database Schema

### Source of Truth: Prisma Schema

The authoritative schema for this project is `prisma/schema.prisma` (it maps to the Supabase Postgres database). The generated Supabase types live in `types/database.types.ts`.

#### Key Tables / Models (high level)

- **Partners & White-labeling**
  - `partners`: `branding` (JSON), `plan_tier`, `features` (JSON), `resource_limits` (JSON), Stripe fields, `is_platform_partner`, `onboarding_status`, `request_id`
  - `partner_domains`: hostname mapping for white-label domains
  - `partner_members`: partner-level membership
  - `partner_invitations`: tokenized partner invites
  - `partner_requests`: onboarding pipeline (includes `desired_subdomain` + `custom_domain`)

- **Workspaces & Subscriptions**
  - `workspaces`: `resource_limits` (JSON), `current_month_minutes` + `current_month_cost` (numeric/decimal), `per_minute_rate_cents` for billing, `is_billing_exempt`, soft delete via `deleted_at`
  - `workspace_members`: workspace-level membership
  - `workspace_invitations`: tokenized workspace invites
  - `workspace_integrations`: provider integrations with `api_keys` (JSON) and per-workspace activation
  - `workspace_subscription_plan`: workspace subscription settings
  - `workspace_credits`: credit balance tracking
  - `billing_credits`: partner-level credit balance

- **Voice Agents & Calls**
  - `ai_agents`: provider enums, external IDs, sync fields (`needs_resync`, `sync_status`, `last_synced_at`, `last_sync_error`), metrics (`total_minutes`, `total_cost`, `total_conversations`), tags, versioning
  - `conversations`: `call_status` enum (e.g. `initiated`, `ringing`, `in_progress`, `completed`, `failed`, `no_answer`, `busy`, `canceled`), plus follow-up fields and `transcript_search` (tsvector)
  - `usage_tracking`: normalized per-resource usage rows (minutes, tokens, etc.) tied to conversations/workspaces
  - `calls`: call log storage (if separate from conversations)

- **Campaigns & Leads**
  - `campaigns`: multi-step outbound call campaigns with execution details
  - `campaign_recipients`: recipient management for campaigns (CSV import support)
  - `leads`: lead capture from agents and manual import
  - `lead_notes`: lead follow-up notes

- **Knowledge Base**
  - `knowledge_documents`: document storage for agent context
  - `agent_knowledge_documents`: junction table linking agents to knowledge docs

- **Users & Admin**
  - `users`: public profile linked to `auth.users`
  - `super_admin`: whitelist table for super admins
  - `audit_log`: tracks `user_id`, `partner_id`, `workspace_id`, `action`, `entity_type`, JSON old/new values

---

## Authentication System

### Authentication Flow

```
1. USER SIGN IN
   ├─► Supabase Auth (signInWithPassword)
   │
   ├─► Session Cookie Set
   │
   └─► Redirect to /select-workspace

2. PROTECTED ROUTE ACCESS
   ├─► Middleware (proxy.ts)
   │     ├─► updateSession() - Refresh Supabase session
   │     ├─► Check if protected path
   │     └─► Redirect to /login if no session
   │
   ├─► Layout/Page
   │     ├─► getPartnerAuthContext() or getPartnerAuthCached()
   │     │     ├─► Get auth user from Supabase
   │     │     ├─► Resolve partner from hostname
   │     │     ├─► Get partner membership
   │     │     └─► Get accessible workspaces
   │     │
   │     └─► Return PartnerAuthContext
   │
   └─► Render with auth data

3. WORKSPACE ACCESS
   ├─► getWorkspaceContext(workspaceSlug)
   │     ├─► Get PartnerAuthContext
   │     ├─► Find workspace by slug
   │     ├─► Verify user is member
   │     └─► Check required roles
   │
   └─► Return WorkspaceContext
```

### Auth Context Types

```typescript
// lib/api/auth.ts
interface PartnerAuthContext {
  user: PartnerAuthUser // Authenticated user
  partner: ResolvedPartner // Current partner (from hostname)
  partnerRole: PartnerMemberRole | null // User's role in partner
  partnerMembership: PartnerMembership | null
  workspaces: AccessibleWorkspace[] // User's workspaces in this partner
  supabase: Awaited<ReturnType<typeof createClient>>
  adminClient: ReturnType<typeof createAdminClient> // Bypasses RLS
}

// lib/api/workspace-auth.ts
interface WorkspaceContext extends PartnerAuthContext {
  workspace: AccessibleWorkspace // Current workspace with user's role
}
```

### Supabase Clients

```typescript
// 1. Browser Client (components/hooks)
import { createClient } from "@/lib/supabase/client"
const supabase = createClient()

// 2. Server Client (server components, API routes)
import { createClient } from "@/lib/supabase/server"
const supabase = await createClient()

// 3. Admin Client (bypasses RLS - use carefully!)
import { createAdminClient } from "@/lib/supabase/admin"
const adminClient = createAdminClient()
```

---

## API Layer

### API Route Patterns

#### Workspace-Scoped Routes

```typescript
// app/api/w/[workspaceSlug]/agents/route.ts

import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized } from "@/lib/api/helpers"

export async function GET(request, { params }) {
  const { workspaceSlug } = await params
  const ctx = await getWorkspaceContext(workspaceSlug)
  if (!ctx) return unauthorized()

  // ctx.workspace.id, ctx.workspace.role, ctx.adminClient available
  const { data } = await ctx.adminClient
    .from("ai_agents")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
  return apiResponse({ data })
}
```

#### API Response Helpers

```typescript
// lib/api/helpers.ts

apiResponse(data, (status = 200)) // Success response
apiError(message, (status = 400)) // Client error
serverError(message) // 500 error
unauthorized() // 401
forbidden(message) // 403
notFound(resource) // 404
getValidationError(zodError) // Get first Zod error message
```

### API Routes Overview

```
/api/
├── auth/
│   ├── context/route.ts      # Get auth context (client-side)
│   ├── signup/route.ts       # User registration
│   └── signout/route.ts      # User logout
│
├── w/[workspaceSlug]/        # Workspace-scoped APIs
│   ├── agents/
│   │   ├── route.ts          # GET (list), POST (create)
│   │   └── [id]/route.ts     # GET, PATCH, DELETE
│   │       ├── test-call/route.ts     # POST (initiate provider test call)
│   │       ├── phone-number/route.ts  # GET/PATCH phone assignment
│   │       ├── sip-info/route.ts      # GET SIP info
│   │       ├── outbound-call/route.ts # POST initiate outbound
│   │       ├── assign-sip-number/route.ts # POST assign SIP
│   │       └── [...path]/route.ts     # Catch-all for nested routes
│   ├── members/
│   │   ├── route.ts          # GET (list), POST
│   │   └── [memberId]/route.ts # PATCH, DELETE
│   ├── invitations/
│   │   ├── route.ts          # GET (list), POST (send)
│   │   └── [id]/route.ts     # DELETE (revoke)
│   ├── calls/
│   │   ├── route.ts          # GET (list with Algolia search)
│   │   ├── ingest/route.ts   # POST (ingest call logs from VAPI/Retell)
│   │   └── stats/route.ts    # GET call statistics
│   ├── campaigns/
│   │   ├── route.ts          # GET, POST
│   │   └── [id]/
│   │       ├── route.ts      # GET, PATCH, DELETE
│   │       └── recipients/route.ts # GET, POST (manage recipients)
│   ├── conversations/route.ts
│   ├── analytics/route.ts
│   ├── integrations/
│   │   ├── route.ts               # GET (list), POST (connect)
│   │   ├── algolia-search-config/route.ts
│   │   └── [provider]/route.ts    # PATCH/DELETE (provider-specific ops)
│   ├── settings/route.ts     # GET, PATCH
│   ├── knowledge-base/
│   │   ├── route.ts          # GET, POST
│   │   └── [id]/route.ts     # PATCH, DELETE
│   ├── subscription/
│   │   ├── route.ts          # GET/PATCH subscription
│   │   ├── plans/route.ts    # GET available plans
│   │   └── preview/route.ts  # POST get preview
│   ├── credits/
│   │   ├── route.ts          # GET credits
│   │   └── topup/route.ts    # POST topup credits
│   └── dashboard/stats/route.ts
│
├── partner/                  # Partner-level APIs
│   ├── route.ts              # GET partner info
│   ├── dashboard/stats/route.ts
│   ├── billing/
│   │   ├── route.ts          # GET billing info
│   │   ├── checkout/route.ts # POST start checkout
│   │   ├── change-plan/route.ts
│   │   ├── portal/route.ts   # POST get customer portal
│   │   └── [planId]/route.ts
│   ├── credits/
│   │   ├── route.ts          # GET credits
│   │   └── topup/route.ts    # POST topup
│   ├── subscription-plans/
│   │   ├── route.ts          # GET plans
│   │   └── [planId]/route.ts # GET plan details
│   ├── stripe/
│   │   └── connect/route.ts  # POST start Stripe Connect onboarding
│   ├── team/
│   │   ├── route.ts          # GET, POST
│   │   └── [memberId]/route.ts
│   └── invitations/
│       ├── route.ts          # GET, POST
│       └── [invitationId]/route.ts
│
├── partner-requests/         # Partner onboarding
│   ├── route.ts              # POST (submit request)
│   ├── check-domain/route.ts # Check domain availability
│   └── [id]/
│       ├── route.ts          # GET (detail)
│       └── provision/route.ts # POST (provision partner)
│
├── partner-invitations/
│   └── accept/route.ts       # Accept partner invitation
│
├── workspace-invitations/
│   └── accept/route.ts       # Accept workspace invitation
│
├── workspaces/route.ts       # POST (create workspace)
│
├── super-admin/              # Platform admin APIs
│   ├── partners/
│   │   ├── route.ts          # GET, POST
│   │   └── [id]/
│   │       ├── route.ts      # GET, PATCH, DELETE
│   │       ├── domains/route.ts
│   │       └── workspaces/route.ts
│   └── partner-requests/
│       ├── route.ts          # GET (list)
│       └── [id]/
│           ├── route.ts      # GET, PATCH
│           └── provision/route.ts
│
├── cron/                     # Cron job handlers
│   ├── master/route.ts       # Trigger cron jobs
│   └── cleanup-expired-campaigns/route.ts
│
├── webhooks/                 # External webhooks
│   ├── stripe/route.ts       # Stripe webhook
│   ├── stripe-connect/route.ts
│   ├── vapi/route.ts         # VAPI webhooks
│   └── retell/route.ts       # Retell webhooks
│
├── upload/logo/route.ts      # Logo upload
├── dev/reset-password/route.ts # Development utilities
└── health/route.ts           # Health check
```

---

## Frontend Architecture

### Layout Hierarchy

```
RootLayout (app/layout.tsx)
├── ThemeProvider
├── QueryProvider
└── Toaster
    │
    ├── AuthLayout (app/(auth)/layout.tsx)
    │   └── Auth Pages
    │
    ├── MarketingLayout (app/(marketing)/layout.tsx)
    │   └── Marketing Pages
    │
    ├── OrgLayout (app/org/layout.tsx)
    │   └── OrgDashboardLayout
    │       └── Partner Management Pages
    │
    ├── WorkspaceLayout (app/w/[workspaceSlug]/layout.tsx)
    │   └── WorkspaceDashboardLayout
    │       ├── BrandingProvider
    │       ├── WorkspaceSidebar
    │       ├── WorkspaceHeader
    │       └── {children}
    │
    └── SuperAdminLayout (app/super-admin/(dashboard)/layout.tsx)
        └── SuperAdminLayoutClient
            ├── Sidebar
            ├── Header
            └── {children}
```

### Component Categories

#### UI Components (`components/ui/`)

Primitives from shadcn/ui (Radix UI + Tailwind):

- `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`
- `input.tsx`, `select.tsx`, `table.tsx`, `tabs.tsx`, `pagination.tsx`
- `avatar.tsx`, `badge.tsx`, `skeleton.tsx`, `checkbox.tsx`
- `alert.tsx`, `alert-dialog.tsx`, `progress.tsx`
- `scroll-area.tsx`, `separator.tsx`, `sheet.tsx`
- `switch.tsx`, `textarea.tsx`, `label.tsx`, `collapsible.tsx`

#### Workspace Components (`components/workspace/`)

- `workspace-dashboard-layout.tsx` - Main dashboard layout
- `workspace-sidebar.tsx` - Navigation sidebar with workspace selector
- `workspace-header.tsx` - Top header with user menu
- `workspace-selector.tsx` - Workspace picker component
- `create-workspace-form.tsx` - Workspace creation flow UI
- `integrations/`
  - `connect-integartion-dialog.tsx` - Connect provider integration
  - `connect-algolia-dialog.tsx` - Algolia configuration
- `agents/` - Agent-related components
- `campaigns/` - Campaign management components
  - `campaign-wizard.tsx` - Multi-step campaign creation
  - `campaign-card.tsx`, `campaign-status-badge.tsx`
  - `import-recipients-dialog.tsx` - CSV import
  - `add-recipient-dialog.tsx` - Manual recipient addition
  - `steps/` - Step components for wizard
- `conversations/` - Conversation components
- `members/` - Member management
- `billing/` - Billing components
  - `workspace-credits-card.tsx` - Credits display/topup

---

## Key Features & Modules

### 1. **Subscription Billing System**

- **Stripe Integration**: Payment processing, subscription management
- **Partner-Level Subscriptions**: Stripe managed at partner level
- **Workspace-Level Billing**: Per-workspace usage tracking and billing
- **Credit System**: Partner and workspace credit balances
- **Usage Tracking**: Minutes, API calls, storage, etc.
- **Files**: `lib/billing/`, `lib/stripe/`, `lib/hooks/use-billing.ts`

### 2. **Campaign Management**

- **Campaign Wizard**: Multi-step form for creating outbound call campaigns
- **CSV Import**: Bulk recipient management via CSV
- **Campaign Scheduling**: Schedule campaigns for future execution
- **Recipient Management**: Add, edit, delete recipients
- **Campaign Status**: Track execution status and results
- **Cleanup**: Automatic cleanup of expired campaigns via cron
- **Files**: `components/workspace/campaigns/`, `lib/hooks/use-campaigns.ts`, `lib/campaigns/`

### 3. **Call Ingestion & Logging**

- **VAPI Ingestion**: Fetch call logs from VAPI's API
- **Retell Ingestion**: Fetch call logs from Retell's API
- **Algolia Integration**: Full-text search on calls
- **Call Analytics**: Call statistics and aggregation
- **Webhook Support**: Real-time call updates via webhooks
- **Files**: `app/api/w/[workspaceSlug]/calls/`, `lib/algolia/`, `lib/integrations/`

### 4. **Knowledge Base**

- **Document Management**: Upload and manage knowledge documents
- **Agent Linking**: Link documents to agents for context
- **Search**: Full-text search within knowledge base
- **Files**: `app/api/w/[workspaceSlug]/knowledge-base/`, `lib/hooks/use-workspace-knowledge-base.ts`

### 5. **Function Tools (VAPI)**

- **Custom Tools**: Create custom function-based tools for agents
- **Tool Registry**: Manage tool definitions and endpoints
- **Sync Management**: Sync tools to VAPI provider
- **Webhook Integration**: Tools call external webhooks during calls
- **Files**: `lib/integrations/function_tools/`

### 6. **Telephony Management**

- **Phone Numbers**: Assign and manage phone numbers per agent
- **SIP Configuration**: SIP/DID management
- **Outbound Calls**: Initiate outbound calls from agents
- **Files**: `lib/integrations/vapi/phone-numbers.ts`, agent routes

---

## Key Files Reference

### Authentication & Authorization

| File                            | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `lib/api/auth.ts`               | `getPartnerAuthContext()` - Main auth context      |
| `lib/api/workspace-auth.ts`     | `getWorkspaceContext()` + `withWorkspace()` helper |
| `lib/api/partner.ts`            | `getPartnerFromHost()` - Partner resolution        |
| `lib/api/super-admin-auth.ts`   | `getSuperAdminContext()`                           |
| `lib/api/get-auth-cached.ts`    | Cached auth context for server components          |
| `lib/api/get-partner-server.ts` | Server-side partner context                        |
| `lib/rbac/permissions.ts`       | RBAC permission matrix                             |
| `lib/rbac/middleware.ts`        | RBAC middleware                                    |
| `lib/auth/password.ts`          | Password utilities                                 |
| `proxy.ts`                      | Middleware - session, redirects, CSP               |

### Supabase

| File                         | Purpose                     |
| ---------------------------- | --------------------------- |
| `lib/supabase/client.ts`     | Browser client              |
| `lib/supabase/server.ts`     | Server client (SSR)         |
| `lib/supabase/admin.ts`      | Admin client (bypasses RLS) |
| `lib/supabase/middleware.ts` | Session refresh             |

### Prisma

| File                    | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `prisma/schema.prisma`  | Database schema definition                      |
| `lib/prisma/client.ts`  | Prisma client singleton with connection pooling |
| `lib/prisma/index.ts`   | Prisma module exports                           |
| `lib/generated/prisma/` | Generated Prisma client (auto-generated)        |

### API Helpers

| File                       | Purpose              |
| -------------------------- | -------------------- |
| `lib/api/helpers.ts`       | Response utilities   |
| `lib/api/pagination.ts`    | Pagination helpers   |
| `lib/api/etag.ts`          | ETag/caching headers |
| `lib/api/error-handler.ts` | Error handling       |
| `lib/api/fetcher.ts`       | Fetch utilities      |
| `lib/audit.ts`             | Audit logging        |
| `lib/rate-limit.ts`        | Rate limiting        |

### State Management & Hooks

| File                                       | Purpose                             |
| ------------------------------------------ | ----------------------------------- |
| `lib/hooks/use-workspace-agents.ts`        | Agent CRUD with React Query         |
| `lib/hooks/use-workspace-members.ts`       | Member management                   |
| `lib/hooks/use-workspace-conversations.ts` | Conversation data                   |
| `lib/hooks/use-workspace-calls.ts`         | Call logs with Algolia search       |
| `lib/hooks/use-workspace-settings.ts`      | Workspace settings                  |
| `lib/hooks/use-workspace-stats.ts`         | Dashboard statistics                |
| `lib/hooks/use-workspace-subscription.ts`  | Workspace subscription management   |
| `lib/hooks/use-workspace-credits.ts`       | Workspace credit balance            |
| `lib/hooks/use-campaigns.ts`               | Campaign CRUD                       |
| `lib/hooks/use-billing.ts`                 | Partner billing & Stripe operations |
| `lib/hooks/use-subscription-plans.ts`      | Subscription plan management        |
| `lib/hooks/use-auth.ts`                    | Auth actions (logout)               |
| `lib/hooks/use-partner.ts`                 | Partner data                        |
| `lib/hooks/use-partner-auth.ts`            | Partner auth context                |
| `lib/hooks/use-partner-team.ts`            | Partner team management             |
| `lib/hooks/use-partner-dashboard-stats.ts` | Partner dashboard data              |
| `lib/hooks/use-partner-requests.ts`        | Partner request management          |
| `lib/hooks/use-super-admin-partners.ts`    | Super admin partner data            |
| `lib/hooks/use-branding.ts`                | Partner branding                    |
| `lib/hooks/use-optimistic.ts`              | Optimistic updates                  |
| `lib/hooks/use-prefetch.ts`                | Data prefetching                    |
| `lib/hooks/use-toast.ts`                   | Toast notifications                 |
| `lib/hooks/use-algolia-search.ts`          | Algolia search integration          |
| `lib/providers/query-provider.tsx`         | React Query provider                |

### Types & Config

| File                      | Purpose                      |
| ------------------------- | ---------------------------- |
| `types/database.types.ts` | Supabase-generated types     |
| `types/api.types.ts`      | API-specific types & schemas |
| `types/papaparse.d.ts`    | CSV parsing type definitions |
| `config/plans.ts`         | Subscription plan tiers      |
| `config/site.ts`          | Site metadata                |
| `lib/env.ts`              | Environment validation       |
| `lib/constrants.ts`       | App constants                |
| `lib/metadata.ts`         | Page metadata helpers        |

### Integrations

| File                                     | Purpose                              |
| ---------------------------------------- | ------------------------------------ |
| `lib/integrations/vapi/agent/`           | VAPI agent sync & config             |
| `lib/integrations/vapi/web-call.ts`      | VAPI browser-based test calls        |
| `lib/integrations/vapi/calls.ts`         | VAPI call log retrieval              |
| `lib/integrations/vapi/phone-numbers.ts` | VAPI phone number management         |
| `lib/integrations/retell/agent/`         | Retell agent sync & config           |
| `lib/integrations/retell/web-call.ts`    | Retell browser-based test calls      |
| `lib/integrations/retell/calls.ts`       | Retell call log retrieval            |
| `lib/integrations/function_tools/`       | Custom function tool management      |
| `lib/integrations/circuit-breaker.ts`    | Circuit breaker for external APIs    |
| `lib/integrations/retry.ts`              | Retry logic with exponential backoff |
| `lib/integrations/webhook.ts`            | Webhook handling utilities           |

### Billing & Payments

| File                       | Purpose                           |
| -------------------------- | --------------------------------- |
| `lib/stripe/client.ts`     | Stripe client initialization      |
| `lib/stripe/checkout.ts`   | Stripe checkout session creation  |
| `lib/stripe/connect.ts`    | Stripe Connect express onboarding |
| `lib/stripe/webhooks.ts`   | Stripe webhook event handlers     |
| `lib/billing/usage.ts`     | Usage tracking and calculations   |
| `lib/algolia/client.ts`    | Algolia client initialization     |
| `lib/algolia/call-logs.ts` | Call log indexing for search      |

---

## Development Patterns

### Server Component (Default)

```typescript
// app/w/[workspaceSlug]/dashboard/page.tsx
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"

export default async function DashboardPage({ params }) {
  const { workspaceSlug } = await params
  const auth = await getPartnerAuthCached()

  if (!auth) redirect("/login")

  return <Dashboard />
}
```

### Client Component with React Query

```typescript
"use client"

import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"

export function AgentList() {
  const { data, isLoading, error } = useWorkspaceAgents()

  if (isLoading) return <Loading />
  if (error) return <Error />

  return <AgentGrid agents={data.data} />
}
```

### API Route with Auth

```typescript
// app/api/w/[workspaceSlug]/agents/route.ts
import { getWorkspaceContext } from "@/lib/api/workspace-auth"
import { apiResponse, unauthorized } from "@/lib/api/helpers"

export async function GET(req, { params }) {
  const { workspaceSlug } = await params
  const ctx = await getWorkspaceContext(workspaceSlug)
  if (!ctx) return unauthorized()

  const agents = await ctx.adminClient
    .from("ai_agents")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)

  return apiResponse({ data: agents.data })
}
```

### Adding Audit Logs

```typescript
import { createAuditLog, getRequestMetadata } from "@/lib/audit"

const { ipAddress, userAgent } = getRequestMetadata(request)

await createAuditLog({
  userId: user.id,
  workspaceId: workspace.id,
  action: "agent.created",
  entityType: "ai_agent",
  entityId: agent.id,
  newValues: { name: agent.name },
  ipAddress,
  userAgent,
})
```

---

## State Management

### React Query (Server State)

```typescript
// lib/hooks/use-workspace-agents.ts

export function useWorkspaceAgents(options) {
  return useQuery({
    queryKey: ["workspace-agents", workspaceSlug, options],
    queryFn: () => fetch(`/api/w/${workspaceSlug}/agents`),
    enabled: !!workspaceSlug,
  })
}

// Mutations with cache invalidation
export function useCreateWorkspaceAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data) =>
      fetch(`/api/w/${slug}/agents`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(["workspace-agents", slug])
    },
  })
}

// Optimistic updates for delete
export function useDeleteWorkspaceAgent() {
  return useMutation({
    onMutate: async (agentId) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, updatedData)
      return { previous }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })
}
```

### Context Providers

```typescript
// context/branding-context.tsx
// Provides partner branding (colors, logo) to all children

// context/theme-context.tsx
// Provides dark/light theme toggle

// lib/providers/query-provider.tsx
// React Query provider with devtools
```

---

## Security Architecture

### Middleware Security Headers

```typescript
// proxy.ts

// Applied to all responses:
response.headers.set("X-Content-Type-Options", "nosniff")
response.headers.set("X-Frame-Options", "DENY")
response.headers.set("X-XSS-Protection", "1; mode=block")
response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
response.headers.set("X-DNS-Prefetch-Control", "on")

// Production only:
response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")

// Permissions Policy:
response.headers.set(
  "Permissions-Policy",
  "camera=(), microphone=(self), geolocation=(), payment=()"
)

// Content Security Policy:
response.headers.set("Content-Security-Policy", buildCSP())
```

### Route Protection

```typescript
// proxy.ts

const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/accept-partner-invitation",
  "/accept-workspace-invitation",
  "/pricing",
  "/request-partner",
  "/api/health",
]
const protectedPaths = ["/select-workspace", "/workspace-onboarding", "/w/"]
const superAdminPaths = ["/super-admin"]

// Unauthenticated + protected → redirect to /login
// Authenticated + auth page → redirect to /select-workspace
```

### RBAC Enforcement

```typescript
// lib/rbac/permissions.ts

// Check workspace permission
hasWorkspacePermission("admin", "workspace.agents.delete") → true

// Check role hierarchy
isAtLeastWorkspaceRole("member", "viewer") → true

// Check partner permission
hasPartnerPermission("admin", "partner.workspaces.create") → true

// API route enforcement
withWorkspace(handler, { requiredRoles: ["owner", "admin"] })
```

---

## Email System

### Email Templates

```
lib/email/templates/
├── workspace-invitation.tsx      # Workspace invite email
├── partner-request-notification.tsx  # Admin notification
├── partner-request-approved.tsx  # Approval email
└── partner-request-rejected.tsx  # Rejection email
```

### Sending Emails

```typescript
// lib/email/send.ts

await sendWorkspaceInvitation(
  recipientEmail,
  workspaceName,
  inviterName,
  inviteLink,
  role,
  expiresAt,
  partnerName,
  message
)

await sendPartnerRequestNotification({ id, company_name, ... })
await sendPartnerApprovalEmail(email, { company_name, login_url, ... })
await sendPartnerRejectionEmail(email, { company_name, reason, ... })
```

---

## Caching Strategy

### Cache Layer

**Note**: `lib/cache/index.ts` is an in-memory `Map` cache (per Node process). For production, consider Redis/Upstash integration.

```typescript
// lib/cache/index.ts

// In-memory cache with TTL
await cacheGet<T>(key)
await cacheSet(key, value, ttlSeconds)
await cacheDelete(key)
await cacheDeletePattern(pattern)
await cacheClear()

// Cache-aside pattern
await cacheGetOrFetch(key, fetchFn, ttl)

// Cache warming
await warmCache(key, fetchFn, ttl)
```

### Cache Keys

```typescript
CacheKeys.partner(hostname) // Partner by hostname
CacheKeys.partnerBranding(partnerId) // Partner branding
CacheKeys.userWorkspaces(userId, partnerId)
CacheKeys.workspace(workspaceId)
CacheKeys.workspaceAgents(workspaceId)
CacheKeys.authContext(userId, partnerId)
```

### Cache TTLs

```typescript
CacheTTL.PARTNER = 10 * 60 // 10 minutes
CacheTTL.PARTNER_BRANDING = 60 * 60 // 1 hour
CacheTTL.USER_WORKSPACES = 5 * 60 // 5 minutes
CacheTTL.AUTH_CONTEXT = 2 * 60 // 2 minutes
CacheTTL.WORKSPACE = 5 * 60 // 5 minutes
CacheTTL.STATIC = 60 * 60 // 1 hour
CacheTTL.SHORT = 60 // 1 minute
```

### Cache Invalidation

```typescript
CacheInvalidation.invalidatePartner(partnerId)
CacheInvalidation.invalidateWorkspace(workspaceId)
CacheInvalidation.invalidateUserAuth(userId, partnerId)
CacheInvalidation.invalidateUserWorkspaces(userId)
CacheInvalidation.invalidateWorkspaceAgents(workspaceId)
```

---

## Prisma ORM

The codebase uses Prisma ORM alongside Supabase for type-safe database operations. Supabase Auth handles authentication while Prisma provides an enhanced developer experience for database queries.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE ACCESS LAYER                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐         ┌─────────────────┐                   │
│  │  SUPABASE AUTH  │         │    PRISMA ORM   │                   │
│  │                 │         │                 │                   │
│  │ • User Auth     │         │ • Type-safe     │                   │
│  │ • Session Mgmt  │         │   Queries       │                   │
│  │ • RLS Policies  │         │ • Transactions  │                   │
│  │ • Realtime      │         │ • Migrations    │                   │
│  └────────┬────────┘         └────────┬────────┘                   │
│           │                           │                             │
│           └───────────┬───────────────┘                             │
│                       │                                             │
│                       ▼                                             │
│            ┌─────────────────────┐                                  │
│            │   PostgreSQL DB     │                                  │
│            │   (Supabase)        │                                  │
│            └─────────────────────┘                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Basic Usage

```typescript
// Import the Prisma client
import { prisma } from "@/lib/prisma"

// Basic queries
const users = await prisma.user.findMany()
const agent = await prisma.aiAgent.findUnique({ where: { id } })

// With relations
const workspace = await prisma.workspace.findFirst({
  where: { slug: "my-workspace" },
  include: {
    members: true,
    agents: true,
  },
})

// Create with nested relations
const partner = await prisma.partner.create({
  data: {
    name: "Acme Agency",
    slug: "acme-agency",
    workspaces: {
      create: {
        name: "Default Workspace",
        slug: "default",
      },
    },
  },
})
```

### Prisma Commands

```bash
# Generate Prisma Client after schema changes
npm run db:generate

# Pull schema from database (introspection)
npm run db:pull

# Push schema to database (dev only)
npm run db:push

# Create and apply migrations
npm run db:migrate

# Deploy migrations to production
npm run db:migrate:deploy

# Open Prisma Studio (database GUI)
npm run db:studio

# Reset database (dev only - DESTRUCTIVE)
npm run db:reset
```

---

## Environment Configuration

### Required Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Database Connection (for Prisma)

```bash
# DATABASE_URL: Pooled connection (Transaction mode via Supavisor)
# Use for all Prisma queries at runtime
# Port 6543 for pgbouncer/Supavisor connection pooling
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10"

# DIRECT_URL: Direct connection (Session mode)
# Use for Prisma migrations only
# Port 5432 for direct PostgreSQL connection
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

> **Important**: Get connection strings from Supabase Dashboard → Settings → Database → Connection string

### Optional Variables

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Email
RESEND_API_KEY=re_xxx
FROM_EMAIL=noreply@example.com
SUPER_ADMIN_EMAIL=admin@example.com

# Storage
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=uploads

# Algolia (optional, per-workspace)
NEXT_PUBLIC_ALGOLIA_APP_ID=xxx
NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY=xxx
```

---

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Format with Prettier
npm run format

# Type check
npm run type-check

# Prisma commands
npm run db:generate     # Generate Prisma Client
npm run db:pull         # Introspect database
npm run db:push         # Push schema (dev)
npm run db:migrate      # Create migration
npm run db:migrate:deploy  # Deploy migrations
npm run db:studio       # Open database GUI
```

---

## Quick Reference: Common Tasks

### Add a New Workspace Page

1. Create `app/w/[workspaceSlug]/new-feature/page.tsx`
2. Add navigation link in `workspace-sidebar.tsx`
3. Create API route if needed: `app/api/w/[workspaceSlug]/new-feature/route.ts`
4. Create React Query hook: `lib/hooks/use-workspace-new-feature.ts`

### Add a New Agent Provider

1. Create folder: `lib/integrations/newprovider/`
2. Implement: `agent/config.ts`, `mapper.ts`, `sync.ts`, `response.ts`
3. Add provider to types: `AgentProvider = "vapi" | "retell" | "synthflow" | "newprovider"`
4. Update agent creation API to call sync
5. Add web-call support if applicable

### Create Partner Request Flow

1. User submits via `/request-partner` → `POST /api/partner-requests`
2. Email sent to super admin via `sendPartnerRequestNotification()`
3. Super admin reviews at `/super-admin/partner-requests`
4. Approve → Provision partner, create domain, send credentials
5. Reject → Send rejection email via `sendPartnerRejectionEmail()`

### Add Organization-Level Feature

1. Create page in `app/org/new-feature/page.tsx`
2. Add API route: `app/api/partner/new-feature/route.ts`
3. Use `getPartnerAuthContext()` for auth
4. Check partner role with `isPartnerAdmin()` or `hasPartnerRole()`

### Add Workspace-Level Subscription Feature

1. Create page in `app/w/[workspaceSlug]/subscription/page.tsx`
2. Add API routes under `app/api/w/[workspaceSlug]/subscription/`
3. Use `useWorkspaceSubscription()` hook for data
4. Integrate with Stripe billing (partner-level)
5. Track usage via `lib/billing/usage.ts`

---

## Conventions

- **Server Components**: Default for pages, use `"use client"` only when needed
- **API Errors**: Use helpers from `lib/api/helpers.ts`
- **Route Params**: Always `await params` in Next.js 15+
- **Styling**: Tailwind CSS with `cn()` utility for conditional classes
- **Forms**: React Hook Form + Zod validation
- **State**: React Query for server state, minimal client state
- **Optimistic Updates**: Implement for delete/update operations
- **Dynamic Imports**: Use for heavy components (wizards, modals)
- **Async Components**: Leverage server-side rendering for data fetching
- **Error Handling**: Use boundary components and try-catch in API routes
- **Never commit**: `.env*` files

---

_This reference file is maintained for AI assistant understanding and developer onboarding. Last updated: January 7, 2026._

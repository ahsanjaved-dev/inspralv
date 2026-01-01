# Genius365 Codebase Reference

> **Last Updated**: December 29, 2025  
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
10. [Key Files Reference](#key-files-reference)
11. [Development Patterns](#development-patterns)
12. [State Management](#state-management)
13. [Security Architecture](#security-architecture)
14. [Email System](#email-system)
15. [Caching Strategy](#caching-strategy)
16. [Environment Configuration](#environment-configuration)

---

## Executive Summary

**Genius365** is a Next.js 16 white-label AI Voice Agent Management Platform. It enables agencies (Partners) to manage AI voice agents across multiple providers (VAPI, Retell, Synthflow) with full multi-tenancy support, white-labeling, and workspace isolation.

### Core Technologies

| Category            | Technology                                  | Version                                                    |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| **Framework**       | Next.js (App Router)                        | 16.0.8                                                     |
| **Language**        | TypeScript                                  | 5.x                                                        |
| **UI**              | React, Tailwind CSS 4, Radix UI (shadcn/ui) | React 19.2.1                                               |
| **Backend**         | Supabase (PostgreSQL + Auth + Storage)      | SSR 0.8.0                                                  |
| **State**           | React Query (TanStack Query 5), Zustand     | Query 5.90.12, Zustand 5.0.9                               |
| **Payments**        | Stripe                                      | 20.0.0                                                     |
| **Email**           | Resend                                      | 6.6.0                                                      |
| **Voice Providers** | VAPI, Retell AI, Synthflow                  | VAPI Web 2.5.2, Retell SDK 4.66.0, Retell Client SDK 2.0.7 |
| **Validation**      | Zod                                         | 4.1.13                                                     |
| **Forms**           | React Hook Form                             | 7.68.0                                                     |
| **Charts**          | Recharts                                    | 3.5.1                                                      |
| **Date Utils**      | date-fns                                    | 4.1.0                                                      |

### Key Capabilities

- **White-Label Platform**: Partners get custom branding, domains, and isolated workspaces
- **Multi-Tenant Architecture**: Partner → Workspace → User hierarchy
- **AI Voice Agent Management**: Create, sync, and manage agents across VAPI, Retell, Synthflow
- **Role-Based Access Control**: Comprehensive RBAC for partners and workspaces
- **Super Admin Console**: Platform-wide management for partner requests, partner CRUD, and billing overview (Total Organizations + agencies table)
- **Organization Management**: Partner-level team and settings management

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
└─────────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│     WORKSPACE 1     │ │     WORKSPACE 2     │ │     WORKSPACE 3     │
│   (Client Project)  │ │   (Client Project)  │ │   (Client Project)  │
├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤
│ • AI Agents         │ │ • AI Agents         │ │ • AI Agents         │
│ • Conversations     │ │ • Conversations     │ │ • Conversations     │
│ • Leads             │ │ • Leads             │ │ • Leads             │
│ • Members           │ │ • Members           │ │ • Members           │
│ • Integrations      │ │ • Integrations      │ │ • Integrations      │
│ • Knowledge Base    │ │ • Knowledge Base    │ │ • Knowledge Base    │
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
                              ├─► API Route: getWorkspaceContext() (helper `withWorkspace()` is available but not widely used)
                              │
                              └─► Page: getPartnerAuthContext()
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
  plan_tier: string // "free" | "starter" | "pro" | "enterprise"
  features: PartnerFeatures // Feature flags
  resource_limits: ResourceLimits // Max workspaces, users, agents
  is_platform_partner: boolean // True for the main platform
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
│   ├── schema.prisma             # Database schema definition
│   └── (no migrations folder committed)
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
│   │   └── invitations/page.tsx  # Partner invitations
│   ├── w/[workspaceSlug]/        # Workspace-scoped pages
│   │   ├── layout.tsx            # Workspace layout with auth
│   │   ├── dashboard/page.tsx
│   │   ├── agents/
│   │   │   ├── page.tsx          # Agent list
│   │   │   ├── new/page.tsx      # Create agent (wizard)
│   │   │   └── [id]/page.tsx     # Agent detail
│   │   ├── leads/page.tsx
│   │   ├── calls/page.tsx
│   │   ├── conversations/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── members/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── billing/page.tsx
│   │   ├── integrations/page.tsx
│   │   ├── knowledge-base/page.tsx
│   │   └── telephony/page.tsx
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
│   │       └── billing/page.tsx
│   ├── api/                      # API routes
│   │   ├── auth/                 # Auth APIs
│   │   │   ├── context/route.ts
│   │   │   ├── signup/route.ts
│   │   │   └── signout/route.ts
│   │   ├── w/[workspaceSlug]/    # Workspace-scoped APIs
│   │   │   ├── agents/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── members/
│   │   │   │   ├── route.ts
│   │   │   │   └── [memberId]/route.ts
│   │   │   ├── invitations/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── conversations/route.ts
│   │   │   ├── analytics/route.ts
│   │   │   ├── settings/route.ts
│   │   │   └── dashboard/stats/route.ts
│   │   ├── partner/              # Partner-level APIs
│   │   │   ├── route.ts
│   │   │   ├── dashboard/stats/route.ts
│   │   │   ├── team/
│   │   │   │   ├── route.ts
│   │   │   │   └── [memberId]/route.ts
│   │   │   └── invitations/
│   │   │       ├── route.ts
│   │   │       └── [invitationId]/route.ts
│   │   ├── partner-requests/     # Partner request APIs
│   │   │   ├── route.ts
│   │   │   ├── check-domain/route.ts
│   │   │   └── [id]/
│   │   │       ├── route.ts
│   │   │       └── provision/route.ts
│   │   ├── partner-invitations/
│   │   │   └── accept/route.ts
│   │   ├── workspace-invitations/
│   │   │   └── accept/route.ts
│   │   ├── super-admin/          # Super admin APIs
│   │   │   ├── partners/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── domains/route.ts
│   │   │   │       └── workspaces/route.ts
│   │   │   └── partner-requests/
│   │   │       ├── route.ts
│   │   │       └── [id]/
│   │   │           ├── route.ts
│   │   │           └── provision/route.ts
│   │   ├── upload/logo/route.ts  # Logo upload
│   │   ├── workspaces/route.ts   # Workspace creation
│   │   ├── dev/reset-password/route.ts  # Dev utilities
│   │   └── health/route.ts       # Health check
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
│
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives
│   │   ├── alert-dialog.tsx
│   │   ├── alert.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── collapsible.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── progress.tsx
│   │   ├── scroll-area.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── skeleton.tsx
│   │   ├── switch.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── textarea.tsx
│   ├── workspace/                # Workspace components
│   │   ├── workspace-dashboard-layout.tsx
│   │   ├── workspace-sidebar.tsx
│   │   ├── workspace-header.tsx
│   │   ├── workspace-selector.tsx
│   │   ├── create-workspace-form.tsx
│   │   ├── integrations/
│   │   │   └── connect-integartion-dialog.tsx
│   │   ├── agents/
│   │   │   ├── workspace-agent-card.tsx
│   │   │   ├── workspace-agent-form.tsx
│   │   │   ├── agent-wizard.tsx
│   │   │   ├── agent-wizard-dynamic.tsx
│   │   │   └── function-tool-editor.tsx
│   │   ├── conversations/
│   │   │   ├── conversation-detail-modal.tsx
│   │   │   └── conversation-detail-dynamic.tsx
│   │   └── members/
│   │       └── invite-member-dialog.tsx
│   ├── agents/                   # Agent components
│   │   ├── agent-card.tsx
│   │   ├── delete-agent-dialog.tsx
│   │   ├── test-call-button.tsx
│   │   └── test-call-modal.tsx
│   ├── org/                      # Organization components
│   │   └── org-dashboard-layout.tsx
│   ├── super-admin/              # Super admin components
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── super-admin-layout-client.tsx
│   │   ├── partner-card.tsx
│   │   ├── approve-partner-dialog.tsx
│   │   ├── reject-partner-dialog.tsx
│   │   ├── create-partner-dialog.tsx
│   │   ├── edit-partner-request-dialog.tsx
│   │   └── delete-partner-request-dialog.tsx
│   ├── auth/
│   │   ├── auth-layout-client.tsx
│   │   └── password-strength.tsx
│   ├── marketing/
│   │   ├── partner-request-form.tsx
│   │   └── pricing-card.tsx
│   ├── shared/                   # Shared/common components
│   │   ├── error-boundary.tsx
│   │   ├── loading-spinner.tsx
│   │   └── loading.tsx
│   └── billing/                  # Billing components (placeholder)
│
├── lib/                          # Core libraries
│   ├── api/                      # API utilities
│   │   ├── auth.ts               # getPartnerAuthContext()
│   │   ├── workspace-auth.ts     # withWorkspace(), getWorkspaceContext()
│   │   ├── partner.ts            # getPartnerFromHost()
│   │   ├── super-admin-auth.ts   # getSuperAdminContext()
│   │   ├── helpers.ts            # apiResponse(), unauthorized(), etc.
│   │   ├── get-auth-cached.ts    # Cached auth context
│   │   ├── get-partner-server.ts # Server-side partner context
│   │   ├── error-handler.ts      # Error handling utilities
│   │   ├── fetcher.ts            # Fetch utilities
│   │   ├── etag.ts               # ETag/caching headers
│   │   └── pagination.ts         # Pagination helpers
│   ├── auth/                     # Auth utilities
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
│   │   │   │   ├── config.ts     # API calls
│   │   │   │   ├── mapper.ts     # Data mapping
│   │   │   │   ├── sync.ts       # Sync orchestration
│   │   │   │   └── response.ts   # Response processing
│   │   │   └── web-call.ts       # Browser calling
│   │   ├── retell/
│   │   │   ├── agent/
│   │   │   │   ├── config.ts
│   │   │   │   ├── mapper.ts
│   │   │   │   ├── sync.ts
│   │   │   │   └── response.ts
│   │   │   └── web-call.ts
│   │   ├── circuit-breaker.ts    # Circuit breaker pattern
│   │   ├── retry.ts              # Retry logic
│   │   └── webhook.ts            # Webhook handling
│   ├── hooks/                    # React Query hooks
│   │   ├── use-auth.ts           # Auth actions (logout)
│   │   ├── use-branding.ts       # Partner branding
│   │   ├── use-keyboard-shortcuts.ts
│   │   ├── use-optimistic.ts     # Optimistic updates
│   │   ├── use-partner.ts        # Partner data
│   │   ├── use-partner-auth.ts   # Partner auth context
│   │   ├── use-partner-dashboard-stats.ts
│   │   ├── use-partner-requests.ts
│   │   ├── use-partner-team.ts   # Partner team management
│   │   ├── use-prefetch.ts       # Data prefetching
│   │   ├── use-super-admin-partners.ts
│   │   ├── use-test-call-validations.tsx
│   │   ├── use-toast.ts          # Toast notifications
│   │   ├── use-web-calls.ts      # Voice calling
│   │   ├── use-workspace-agents.ts
│   │   ├── use-workspace-conversations.ts
│   │   ├── use-workspace-integrations.tsx
│   │   ├── use-workspace-members.ts
│   │   ├── use-workspace-settings.ts
│   │   └── use-workspace-stats.ts
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
│   ├── errors/                   # Error handling
│   │   └── index.ts
│   ├── providers/                # React providers
│   │   └── query-provider.tsx    # React Query provider
│   ├── utils/                    # Utility functions
│   │   └── format.ts             # Formatting utilities
│   ├── stripe/                   # Stripe integration (placeholder)
│   ├── audit.ts                  # Audit logging
│   ├── constrants.ts             # App constants
│   ├── env.ts                    # Environment validation
│   ├── logger.ts                 # Logging utilities
│   ├── metadata.ts               # Page metadata helpers
│   ├── rate-limit.ts             # Rate limiting
│   └── utils.ts                  # cn() utility
│
├── context/                      # React contexts
│   ├── branding-context.tsx      # Partner branding
│   └── theme-context.tsx         # Dark/light theme
│
├── config/                       # Configuration
│   ├── plans.ts                  # Plan tiers & features
│   └── site.ts                   # Site metadata
│
├── types/                        # TypeScript types
│   ├── database.types.ts         # Supabase + Zod schemas
│   └── api.types.ts              # API-specific types
│
├── proxy.ts                      # Next.js middleware
├── CODEBASE_REFERENCE.md         # This file
├── OPTIMIZATION_PLAN.md          # Performance optimization plan
├── README.md
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── components.json
├── package.json
├── package-lock.json
└── pnpm-lock.yaml
```

---

## Database Schema

### Source of Truth: Prisma Schema

The authoritative schema for this project is `prisma/schema.prisma` (it maps to the Supabase Postgres database). The generated Supabase types live in `types/database.types.ts`.

#### Key Tables / Models (high level)

- **Partners & White-labeling**
  - `partners`: `branding` (JSON), `plan_tier`, `features` (JSON), `resource_limits` (JSON), Stripe fields, `is_platform_partner`, `onboarding_status`, `request_id`
  - `partner_domains`: hostname mapping
  - `partner_members`: partner-level membership
  - `partner_invitations`: tokenized partner invites
  - `partner_requests`: onboarding pipeline (in Prisma these include required `desired_subdomain` + `custom_domain`)

- **Workspaces**
  - `workspaces`: `resource_limits` (JSON), `current_month_minutes` + `current_month_cost` (numeric/decimal), soft delete via `deleted_at`
  - `workspace_members`: workspace-level membership
  - `workspace_invitations`: tokenized workspace invites
  - `workspace_integrations`: provider integrations with `api_keys` (JSON) and per-workspace activation

- **Voice Agents & Calls**
  - `ai_agents`: provider enums, external IDs, sync fields (`needs_resync`, `sync_status`, `last_synced_at`, `last_sync_error`), metrics (`total_minutes`, `total_cost`, `total_conversations`), tags, versioning
  - `conversations`: `call_status` enum is richer than the old doc (e.g. `initiated`, `ringing`, `in_progress`, `completed`, `failed`, `no_answer`, `busy`, `canceled`), plus follow-up fields and `transcript_search` (tsvector)
  - `usage_tracking`: normalized per-resource usage rows (minutes, tokens, etc.) tied to conversations/workspaces

- **Users & Admin**
  - `users`: public profile linked to `auth.users`
  - `super_admin`: whitelist table for super admins
  - `audit_log`: tracks `user_id`, `partner_id`, `workspace_id`, `action`, `entity_type`, JSON old/new values (note: `types/database.types.ts` may lag behind DB schema changes and should be regenerated when schema changes)

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
   │     ├─► getPartnerAuthContext()
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

// Note: `withWorkspace()` exists in `lib/api/workspace-auth.ts`, but current route handlers primarily call
// `getWorkspaceContext()` directly inside each handler.
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
│   │       └── test-call/route.ts  # POST (initiate provider test call)
│   ├── members/
│   │   ├── route.ts          # GET (list), POST
│   │   └── [memberId]/route.ts # PATCH, DELETE
│   ├── invitations/
│   │   ├── route.ts          # GET (list), POST (send)
│   │   └── [id]/route.ts     # DELETE (revoke)
│   ├── conversations/route.ts
│   ├── analytics/route.ts
│   ├── integrations/
│   │   ├── route.ts               # GET (list), POST (connect)
│   │   └── [provider]/route.ts    # PATCH/DELETE (provider-specific ops)
│   ├── settings/route.ts     # GET, PATCH
│   └── dashboard/stats/route.ts
│
├── partner/                  # Partner-level APIs
│   ├── route.ts              # GET partner info
│   ├── dashboard/stats/route.ts
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
    │   └── BrandingProvider
    │       └── Auth Pages (login, signup, etc.)
    │
    ├── MarketingLayout (app/(marketing)/layout.tsx)
    │   └── Marketing Pages (pricing, request-partner)
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
- `input.tsx`, `select.tsx`, `table.tsx`, `tabs.tsx`
- `avatar.tsx`, `badge.tsx`, `skeleton.tsx`
- `alert.tsx`, `alert-dialog.tsx`, `progress.tsx`
- `scroll-area.tsx`, `separator.tsx`, `sheet.tsx`
- `switch.tsx`, `textarea.tsx`, `label.tsx`

#### Workspace Components (`components/workspace/`)

- `workspace-dashboard-layout.tsx` - Main dashboard layout
- `workspace-sidebar.tsx` - Navigation sidebar with workspace selector
- `workspace-header.tsx` - Top header with user menu
- `workspace-selector.tsx` - Workspace picker component
- `create-workspace-form.tsx` - Workspace creation flow UI
- `integrations/`
  - `connect-integartion-dialog.tsx` - Connect provider integration dialog
- `agents/` - Agent-related components
  - `workspace-agent-card.tsx` - Agent display card
  - `workspace-agent-form.tsx` - Agent form component
  - `agent-wizard.tsx` - Multi-step agent creation wizard
  - `agent-wizard-dynamic.tsx` - Dynamic import wrapper
- `conversations/` - Conversation components
  - `conversation-detail-modal.tsx` - Conversation detail view
  - `conversation-detail-dynamic.tsx` - Dynamic import wrapper
- `members/` - Member management
  - `invite-member-dialog.tsx` - Member invitation dialog

#### Agent Components (`components/agents/`)

- `agent-card.tsx` - Generic agent card
- `delete-agent-dialog.tsx` - Deletion confirmation
- `test-call-button.tsx` - Initiate test call
- `test-call-modal.tsx` - Test call interface

#### Super Admin Components (`components/super-admin/`)

- `sidebar.tsx` - Admin navigation
- `header.tsx` - Admin header
- `super-admin-layout-client.tsx` - Admin layout wrapper
- `partner-card.tsx` - Partner display card
- `approve-partner-dialog.tsx` - Approve partner request
- `reject-partner-dialog.tsx` - Reject partner request
- `create-partner-dialog.tsx` - Create new partner
- `edit-partner-request-dialog.tsx` - Edit partner request
- `delete-partner-request-dialog.tsx` - Delete partner request

#### Shared Components (`components/shared/`)

- `error-boundary.tsx` - Error boundary component
- `loading-spinner.tsx` - Loading spinner
- `loading.tsx` - Loading state component

#### Marketing Components (`components/marketing/`)

- `partner-request-form.tsx` - Partner request form
- `pricing-card.tsx` - Pricing plan cards

### Path Aliases (configured in `components.json`)

```typescript
import { Button } from "@/components/ui/button"
import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"
import type { AIAgent } from "@/types/database.types"
```

---

## Voice Agent Integrations

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI AGENT (Database)                        │
│  provider: "vapi" | "retell" | "synthflow"                     │
│  config: { system_prompt, voice_id, model_settings... }        │
│  agent_secret_api_key: [{ provider, key, is_active }]          │
│  external_agent_id: "provider-assigned-id"                     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│      VAPI       │ │     RETELL      │ │   SYNTHFLOW     │
│   Integration   │ │   Integration   │ │   Integration   │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ mapper.ts       │ │ mapper.ts       │ │ (future)        │
│ config.ts       │ │ config.ts       │ │                 │
│ sync.ts         │ │ sync.ts         │ │                 │
│ response.ts     │ │ response.ts     │ │                 │
│ web-call.ts     │ │ web-call.ts     │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Sync Flow

```typescript
// lib/integrations/vapi/agent/sync.ts

// 1. Check if sync is needed
shouldSyncToVapi(agent) → boolean

// 2. Map internal agent to provider format
mapToVapi(agent) → VapiAgentPayload

// 3. Call provider API
createVapiAgent(payload, apiKeys) → response

// 4. Process response & update database
processVapiResponse(response, agentId) → { success, agent }

// 5. Safe wrapper (catches errors)
safeVapiSync(agent, "create" | "update" | "delete") → VapiSyncResult
```

### Vapi Custom Tools (API Alternative: Tool API + `model.toolIds`)

Inspralv supports Vapi **custom function tools** via Vapi’s Tool API (`/tool`) and attaches them to assistants using `model.toolIds`.

- **Where tools are stored**: `ai_agents.config.tools` (array of `FunctionTool` in `types/database.types.ts`)
- **Webhook URL sources**:
  - per-tool: `tool.server_url`
  - fallback default: `ai_agents.config.tools_server_url`
- **Tool sync** (creates/updates tools in Vapi and persists tool IDs back to our DB):
  - `lib/integrations/function_tools/vapi/api/sync.ts` → `syncVapiFunctionTools()`
  - Persists Vapi tool id into `tool.external_tool_id`
- **Assistant sync** (attaches tool IDs to the assistant and keeps native tools inline):
  - `lib/integrations/vapi/agent/sync.ts` calls `syncVapiFunctionTools()` before pushing the assistant payload
  - `lib/integrations/vapi/agent/mapper.ts`:
    - sends Vapi-managed tools via `payload.model.toolIds`
    - sends other tools via `payload.model.tools` (endCall / transferCall / dtmf / etc.)

**Why webhook matters**: Vapi built-in tools run inside Vapi, but custom **function** tools call your configured `server.url` (webhook) during a call to execute business logic and return results.

### Retell Special Case

Retell requires creating an LLM first, then an Agent:

```typescript
// lib/integrations/retell/agent/sync.ts

// Create flow:
// 1. createRetellLLM() → llm_id
// 2. createRetellAgent({ response_engine: { llm_id } })
// 3. Store llm_id in agent.config.retell_llm_id

// Delete flow:
// 1. deleteRetellAgent()
// 2. deleteRetellLLM()
```

### Resilience Patterns

```typescript
// lib/integrations/circuit-breaker.ts
// Circuit breaker pattern for external API calls

// lib/integrations/retry.ts
// Retry logic with exponential backoff
```

### Web Calling

Both VAPI and Retell support browser-based test calls:

```typescript
// components/agents/test-call-button.tsx
// components/agents/test-call-modal.tsx

// Uses:
// - @vapi-ai/web for VAPI
// - retell-client-js-sdk for Retell
```

---

## Key Files Reference

### Authentication & Authorization

| File                            | Purpose                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `lib/api/auth.ts`               | `getPartnerAuthContext()` - Main auth context                                                                    |
| `lib/api/workspace-auth.ts`     | `getWorkspaceContext()` + `withWorkspace()` helper (most routes currently call `getWorkspaceContext()` directly) |
| `lib/api/partner.ts`            | `getPartnerFromHost()` - Partner resolution                                                                      |
| `lib/api/super-admin-auth.ts`   | `getSuperAdminContext()`                                                                                         |
| `lib/api/get-auth-cached.ts`    | Cached auth context for server components                                                                        |
| `lib/api/get-partner-server.ts` | Server-side partner context                                                                                      |
| `lib/rbac/permissions.ts`       | RBAC permission matrix                                                                                           |
| `lib/rbac/middleware.ts`        | RBAC middleware                                                                                                  |
| `lib/auth/password.ts`          | Password utilities                                                                                               |
| `proxy.ts`                      | Middleware - session, redirects, CSP                                                                             |

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

### State Management

| File                                       | Purpose                     |
| ------------------------------------------ | --------------------------- |
| `lib/hooks/use-workspace-agents.ts`        | Agent CRUD with React Query |
| `lib/hooks/use-workspace-members.ts`       | Member management           |
| `lib/hooks/use-workspace-conversations.ts` | Conversation data           |
| `lib/hooks/use-workspace-settings.ts`      | Workspace settings          |
| `lib/hooks/use-workspace-stats.ts`         | Dashboard statistics        |
| `lib/hooks/use-auth.ts`                    | Auth actions (logout)       |
| `lib/hooks/use-partner.ts`                 | Partner data                |
| `lib/hooks/use-partner-auth.ts`            | Partner auth context        |
| `lib/hooks/use-partner-team.ts`            | Partner team management     |
| `lib/hooks/use-partner-dashboard-stats.ts` | Partner dashboard data      |
| `lib/hooks/use-partner-requests.ts`        | Partner request management  |
| `lib/hooks/use-super-admin-partners.ts`    | Super admin partner data    |
| `lib/hooks/use-branding.ts`                | Partner branding            |
| `lib/hooks/use-web-calls.ts`               | Voice calling               |
| `lib/hooks/use-optimistic.ts`              | Optimistic updates          |
| `lib/hooks/use-prefetch.ts`                | Data prefetching            |
| `lib/hooks/use-toast.ts`                   | Toast notifications         |
| `lib/providers/query-provider.tsx`         | React Query provider        |

### Types

| File                      | Purpose                  |
| ------------------------- | ------------------------ |
| `types/database.types.ts` | Core types + Zod schemas |
| `types/api.types.ts`      | API-specific types       |

### Configuration

| File                | Purpose                |
| ------------------- | ---------------------- |
| `config/plans.ts`   | Plan tiers & features  |
| `config/site.ts`    | Site metadata          |
| `lib/env.ts`        | Environment validation |
| `lib/constrants.ts` | App constants          |
| `lib/metadata.ts`   | Page metadata helpers  |

---

## Development Patterns

### Server Component (Default)

```typescript
// app/w/[workspaceSlug]/page.tsx
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"

export default async function Page({ params }) {
  const { workspaceSlug } = await params
  const auth = await getPartnerAuthCached()

  if (!auth) redirect("/login")

  return <Dashboard />
}
```

### Client Component

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

// List agents with caching
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
      // Optimistically remove
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

> **Note**: `next.config.ts` also sets baseline security headers for all routes and applies `Cache-Control: no-store` to `/api/*`. `proxy.ts` is where the CSP (and other per-request headers) are enforced.

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

**Current implementation note**: `lib/cache/index.ts` is an in-memory `Map` cache (per Node process). There is no Redis/Upstash adapter in the repo yet.

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

### Prisma Files

| File                    | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `prisma/schema.prisma`  | Database schema definition               |
| `lib/prisma/client.ts`  | Prisma client singleton                  |
| `lib/prisma/index.ts`   | Prisma module exports                    |
| `lib/generated/prisma/` | Generated Prisma client (auto-generated) |

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

### Transactions

```typescript
import { withTransaction } from "@/lib/prisma"

// Execute multiple operations atomically
const [user, membership] = await withTransaction(async (tx) => {
  const user = await tx.user.create({ data: { ... } })
  const membership = await tx.workspaceMember.create({
    data: { userId: user.id, workspaceId, role: "member" }
  })
  return [user, membership]
})
```

### Prisma vs Supabase Client

| Use Prisma For                 | Use Supabase Client For |
| ------------------------------ | ----------------------- |
| Complex queries with relations | Real-time subscriptions |
| Transactions                   | Authentication          |
| Type-safe CRUD operations      | Storage (file uploads)  |
| Aggregations                   | RLS-dependent queries   |

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

# Email
RESEND_API_KEY=re_xxx
FROM_EMAIL=noreply@example.com
SUPER_ADMIN_EMAIL=admin@example.com

# Storage
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=uploads
```

### Environment Validation

```typescript
// lib/env.ts

export const env = {
  // Supabase
  supabaseUrl: getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: getEnvVar("SUPABASE_SERVICE_ROLE_KEY"),

  // Prisma Database
  databaseUrl: getEnvVar("DATABASE_URL", false),
  directUrl: getEnvVar("DIRECT_URL", false),

  // App
  appUrl: getEnvVar("NEXT_PUBLIC_APP_URL", false) || "http://localhost:3000",

  // Optional services...
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
}
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
- **Never commit**: `.env*` files

---

_This reference file is maintained for AI assistant understanding and developer onboarding._
